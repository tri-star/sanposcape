import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/apiError";
import { createAppleSessionIssuer } from "@/services/auth/appleSession";
import type {
  AppleCredential,
  PendingAppleDisplayName,
  PendingAppleDisplayNameStore,
} from "@/services/auth/types";

const NONCE = { raw: "raw-nonce-0123456789", hashed: "hashed-nonce" };
const RAW_SESSION = { access_token: "a" };

function credential(overrides?: Partial<AppleCredential>): AppleCredential {
  return {
    user: "apple-user-1",
    identityToken: "id-token",
    authorizationCode: "code-1",
    displayName: "田中 太郎",
    ...overrides,
  };
}

function memoryStore(initial: PendingAppleDisplayName | null = null) {
  const state = { value: initial };
  const store: PendingAppleDisplayNameStore = {
    load: vi.fn(async () => state.value),
    save: vi.fn(async (v) => {
      state.value = v;
    }),
    clear: vi.fn(async () => {
      state.value = null;
    }),
  };
  return { state, store };
}

function setup(options?: {
  credentials?: Array<AppleCredential | Error>;
  pending?: PendingAppleDisplayName | null;
  createSession?: (...args: unknown[]) => Promise<unknown>;
  store?: PendingAppleDisplayNameStore;
}) {
  const memory = memoryStore(options?.pending ?? null);
  const store = options?.store ?? memory.store;
  const queue = [...(options?.credentials ?? [credential()])];
  const requestCredential = vi.fn(async (_hashed: string) => {
    const next = queue.length > 1 ? queue.shift()! : queue[0]!;
    if (next instanceof Error || !("user" in next)) throw next;
    return next;
  });
  const createSession = vi.fn(options?.createSession ?? (async () => RAW_SESSION));
  const issue = createAppleSessionIssuer({
    createNonce: async () => NONCE,
    requestCredential,
    pendingDisplayName: store,
    api: { createSession: createSession as never },
  });
  return { issue, memory, store, requestCredential, createSession };
}

describe("createAppleSessionIssuer", () => {
  it("初回: createSession に必要な値が渡り、Apple には hashed が渡り、成功後に保留中の氏名が消える", async () => {
    const { issue, memory, requestCredential, createSession } = setup();

    const result = await issue();

    expect(result).toBe(RAW_SESSION);
    expect(requestCredential).toHaveBeenCalledWith("hashed-nonce");
    expect(createSession).toHaveBeenCalledWith({
      provider: "apple",
      idToken: "id-token",
      nonce: "raw-nonce-0123456789",
      authorizationCode: "code-1",
      displayName: "田中 太郎",
    });
    expect(memory.state.value).toBeNull();
  });

  it.each([
    ["TypeError", new TypeError("Failed to fetch")],
    ["ApiError(503)", new ApiError(503)],
    ["ApiError(401)", new ApiError(401)],
  ])("氏名ありで createSession が %s: 例外がそのまま投げられ、氏名は残る", async (_l, error) => {
    const { issue, memory } = setup({
      createSession: async () => {
        throw error;
      },
    });

    await expect(issue()).rejects.toBe(error);
    expect(memory.state.value).toEqual({ appleUserId: "apple-user-1", displayName: "田中 太郎" });
  });

  it("失敗後の2回目（氏名なし・同じ user）: 保留中の氏名が再送され、成功後に消える", async () => {
    let calls = 0;
    const { issue, memory, createSession } = setup({
      credentials: [credential(), credential({ displayName: null, authorizationCode: "code-2" })],
      createSession: async () => {
        calls += 1;
        if (calls === 1) throw new ApiError(503);
        return RAW_SESSION;
      },
    });

    await expect(issue()).rejects.toBeInstanceOf(ApiError);
    await issue();

    expect(createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ displayName: "田中 太郎", authorizationCode: "code-2" }),
    );
    expect(memory.state.value).toBeNull();
  });

  it("別の Apple user の保留中の氏名: 送らず、成功しても消さない", async () => {
    const other = { appleUserId: "someone-else", displayName: "他人" };
    const { issue, memory, createSession } = setup({
      credentials: [credential({ displayName: null })],
      pending: other,
    });

    await issue();

    expect(createSession.mock.calls[0]![0]).toMatchObject({ displayName: undefined });
    expect(memory.state.value).toEqual(other);
  });

  it("氏名が無く保留も無い: displayName は渡さない", async () => {
    const { issue, createSession } = setup({ credentials: [credential({ displayName: null })] });

    await issue();

    expect(
      (createSession.mock.calls[0]![0] as { displayName?: string }).displayName,
    ).toBeUndefined();
  });

  it("authorizationCode は毎回渡る", async () => {
    const { issue, createSession } = setup({
      credentials: [
        credential({ authorizationCode: "c1" }),
        credential({ displayName: null, authorizationCode: "c2" }),
      ],
    });

    await issue();
    await issue();

    expect(
      createSession.mock.calls.map(
        (c) => (c[0] as { authorizationCode: string }).authorizationCode,
      ),
    ).toEqual(["c1", "c2"]);
  });

  it("キャンセル: そのまま投げ、createSession を呼ばず、保留中の氏名に触らない", async () => {
    const pending = { appleUserId: "apple-user-1", displayName: "田中" };
    const cancel = Object.assign(new Error("cancel"), { code: "ERR_REQUEST_CANCELED" });
    const { issue, memory, createSession, store } = setup({ credentials: [cancel], pending });

    await expect(issue()).rejects.toBe(cancel);

    expect(createSession).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
    expect(memory.state.value).toEqual(pending);
  });

  it("422 かつ氏名を送った: 保留中の氏名を消し、氏名なしで1回だけ再送し、その結果を返す", async () => {
    let calls = 0;
    const { issue, memory, createSession } = setup({
      createSession: async () => {
        calls += 1;
        if (calls === 1) throw new ApiError(422);
        return { retried: true };
      },
    });

    const result = await issue();

    expect(result).toEqual({ retried: true });
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(createSession.mock.calls[1]![0]).toEqual({
      provider: "apple",
      idToken: "id-token",
      nonce: "raw-nonce-0123456789",
      authorizationCode: "code-1",
      displayName: undefined,
    });
    expect(memory.state.value).toBeNull();
  });

  it("422 で氏名を送っていない: 再送しない", async () => {
    const { issue, createSession } = setup({
      credentials: [credential({ displayName: null })],
      createSession: async () => {
        throw new ApiError(422);
      },
    });

    await expect(issue()).rejects.toBeInstanceOf(ApiError);
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it("再送も 422: 例外が投げられ、再送は1回だけ", async () => {
    const { issue, createSession } = setup({
      createSession: async () => {
        throw new ApiError(422);
      },
    });

    await expect(issue()).rejects.toMatchObject({ status: 422 });
    expect(createSession).toHaveBeenCalledTimes(2);
  });

  it("save が reject してもサインインは続き、氏名はそのリクエストで送られる", async () => {
    const memory = memoryStore();
    memory.store.save = vi.fn(async () => {
      throw new Error("keychain");
    });
    const { issue, createSession } = setup({ store: memory.store });

    await expect(issue()).resolves.toBe(RAW_SESSION);
    expect(createSession.mock.calls[0]![0]).toMatchObject({ displayName: "田中 太郎" });
  });

  it("load / clear が reject しても成功の結果は変わらない", async () => {
    const memory = memoryStore();
    memory.store.load = vi.fn(async () => {
      throw new Error("keychain");
    });
    memory.store.clear = vi.fn(async () => {
      throw new Error("keychain");
    });
    const { issue } = setup({ store: memory.store });

    await expect(issue()).resolves.toBe(RAW_SESSION);
  });

  it("サニタイズで空になる氏名（空白だけ）は保存も送信もしない", async () => {
    const { issue, createSession, store } = setup({
      credentials: [credential({ displayName: " 　 " })],
    });

    await issue();

    expect(store.save).not.toHaveBeenCalled();
    expect(
      (createSession.mock.calls[0]![0] as { displayName?: string }).displayName,
    ).toBeUndefined();
  });
});
