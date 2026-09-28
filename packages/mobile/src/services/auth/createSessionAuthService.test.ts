import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/apiError";
import { createSessionAuthService } from "@/services/auth/createSessionAuthService";
import { createMemoryRefreshTokenPersistence } from "@/services/auth/tokenStore.memory";
import { createTokenStore } from "@/services/auth/tokenStore";
import type { RefreshTokenPersistence } from "@/services/auth/types";

/**
 * `persistence.remove()` が reject する（例: SecureStore の削除失敗）フェイク。
 * `tokenStore.clear()` はこれを re-throw する契約（tokenStore.test.ts で固定）だが、
 * `createSessionAuthService` はそれを catch して握りつぶす必要がある（H2 回帰テスト用）。
 */
function createRejectingPersistence(initial: string | null): RefreshTokenPersistence {
  let stored: string | null = initial;
  return {
    async load() {
      return stored;
    },
    async save(token: string) {
      stored = token;
    },
    async remove() {
      throw new Error("SecureStore remove failed");
    },
  };
}

function rawSession(overrides?: {
  accessToken?: string;
  expiresIn?: number;
  refreshToken?: string;
  userId?: string;
}) {
  return {
    access_token: overrides?.accessToken ?? "access-1",
    expires_in: overrides?.expiresIn ?? 900,
    refresh_token: overrides?.refreshToken ?? "refresh-1",
    user: {
      id: overrides?.userId ?? "user-1",
      email: "user@example.com",
      display_name: "Taro",
      photo_url: null,
    },
  };
}

function setup(options?: {
  persistence?: RefreshTokenPersistence;
  initialTime?: number;
  restoreTimeoutMs?: number;
}) {
  const persistence = options?.persistence ?? createMemoryRefreshTokenPersistence();
  const tokenStore = createTokenStore(persistence);
  let currentTime = options?.initialTime ?? 0;

  const issueSession = vi.fn();
  const api = { refresh: vi.fn(), logout: vi.fn() };
  const onSignOut = vi.fn().mockResolvedValue(undefined);
  const onSessionChange = vi.fn();

  const service = createSessionAuthService({
    issueSession,
    api,
    tokenStore,
    now: () => currentTime,
    onSignOut,
    onSessionChange,
    restoreTimeoutMs: options?.restoreTimeoutMs,
  });

  return {
    service,
    persistence,
    issueSession,
    api,
    onSignOut,
    onSessionChange,
    advanceTime: (ms: number) => {
      currentTime += ms;
    },
  };
}

describe("createSessionAuthService", () => {
  describe("signIn", () => {
    it("issueSession が1回呼ばれ、user/refreshToken/currentUser が更新される", async () => {
      const { service, issueSession, persistence } = setup();
      issueSession.mockResolvedValue(rawSession());

      const user = await service.signIn("google");

      expect(issueSession).toHaveBeenCalledTimes(1);
      expect(issueSession).toHaveBeenCalledWith("google");
      expect(user).toEqual({
        id: "user-1",
        email: "user@example.com",
        displayName: "Taro",
        photoUrl: null,
      });
      expect(service.getCurrentUser()).toEqual(user);
      expect(await persistence.load()).toBe("refresh-1");
    });

    it("issueSession が失敗すると AuthError として throw され、getCurrentUser は null のまま", async () => {
      const { service, issueSession } = setup();
      issueSession.mockRejectedValue(new TypeError("network down"));

      await expect(service.signIn("google")).rejects.toMatchObject({ isAuthError: true });
      expect(service.getCurrentUser()).toBeNull();
    });
  });

  describe("getAccessToken", () => {
    it("有効なトークンがあれば api.refresh は呼ばれない", async () => {
      const { service, issueSession, api } = setup();
      issueSession.mockResolvedValue(rawSession({ expiresIn: 900 }));
      await service.signIn("google");

      const token = await service.getAccessToken();

      expect(token).toBe("access-1");
      expect(api.refresh).not.toHaveBeenCalled();
    });

    it("期限切れなら api.refresh が1回呼ばれ、新しいトークンが返る", async () => {
      const { service, issueSession, api, advanceTime } = setup();
      issueSession.mockResolvedValue(rawSession({ expiresIn: 60 }));
      await service.signIn("google");

      advanceTime(100_000); // skew(30s) 込みで期限切れにする
      api.refresh.mockResolvedValue(
        rawSession({ accessToken: "access-2", refreshToken: "refresh-2" }),
      );

      const token = await service.getAccessToken();

      expect(token).toBe("access-2");
      expect(api.refresh).toHaveBeenCalledTimes(1);
    });

    it("未認証（refresh token 不在）なら null で、api.refresh は呼ばれない", async () => {
      const { service, api } = setup();

      const token = await service.getAccessToken();

      expect(token).toBeNull();
      expect(api.refresh).not.toHaveBeenCalled();
    });

    it("single-flight: 同時に3回呼んでも api.refresh は1回だけ", async () => {
      const { service, issueSession, api, advanceTime } = setup();
      issueSession.mockResolvedValue(rawSession({ expiresIn: 60 }));
      await service.signIn("google");
      advanceTime(100_000);

      let resolveRefresh: (value: unknown) => void = () => {};
      api.refresh.mockReturnValue(
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
      );

      const calls = Promise.all([
        service.getAccessToken(),
        service.getAccessToken(),
        service.getAccessToken(),
      ]);

      resolveRefresh(rawSession({ accessToken: "access-2", refreshToken: "refresh-2" }));
      const results = await calls;

      expect(api.refresh).toHaveBeenCalledTimes(1);
      expect(results).toEqual(["access-2", "access-2", "access-2"]);
    });
  });

  describe("refresh のローテーション・失敗時の扱い", () => {
    it("api.refresh が返した新しい refresh token が保存される（古いものは残らない）", async () => {
      const { service, issueSession, api, persistence, advanceTime } = setup();
      issueSession.mockResolvedValue(rawSession({ expiresIn: 60, refreshToken: "refresh-old" }));
      await service.signIn("google");
      advanceTime(100_000);
      api.refresh.mockResolvedValue(rawSession({ refreshToken: "refresh-new" }));

      await service.getAccessToken();

      expect(await persistence.load()).toBe("refresh-new");
    });

    it("refresh が 401 ならセッション破棄・refresh token 破棄で null を返す", async () => {
      const { service, issueSession, api, persistence, onSessionChange } = setup();
      issueSession.mockResolvedValue(rawSession());
      await service.signIn("google");
      onSessionChange.mockClear();
      api.refresh.mockRejectedValue(new ApiError(401));

      const result = await service.refreshAccessToken();

      expect(result).toBeNull();
      expect(service.getCurrentUser()).toBeNull();
      expect(await persistence.load()).toBeNull();
      expect(onSessionChange).toHaveBeenCalledWith(null);
    });

    it("refresh がネットワークエラーなら null を返すが refresh token は保持される", async () => {
      const { service, issueSession, api, persistence } = setup();
      issueSession.mockResolvedValue(rawSession({ refreshToken: "refresh-1" }));
      const user = await service.signIn("google");
      api.refresh.mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await service.refreshAccessToken();

      expect(result).toBeNull();
      expect(await persistence.load()).toBe("refresh-1");
      expect(service.getCurrentUser()).toEqual(user);
    });

    it("401 かつ persistence.remove が reject しても throw せず null を返し、getCurrentUser は null になる（H2回帰）", async () => {
      const persistence = createRejectingPersistence(null);
      const { service, issueSession, api } = setup({ persistence });
      issueSession.mockResolvedValue(rawSession());
      await service.signIn("google");
      api.refresh.mockRejectedValue(new ApiError(401));

      await expect(service.refreshAccessToken()).resolves.toBeNull();
      expect(service.getCurrentUser()).toBeNull();
    });
  });

  describe("restoreSession", () => {
    it("時間超過後もトークン保存が完了するまで次のrefreshを開始しない", async () => {
      vi.useFakeTimers();
      try {
        let stored = "refresh-1";
        let releaseSave: () => void = () => {};
        const save = vi.fn(async (token: string) => {
          await new Promise<void>((resolve) => {
            releaseSave = resolve;
          });
          stored = token;
        });
        const persistence: RefreshTokenPersistence = {
          load: async () => stored,
          save,
          remove: async () => {},
        };
        const { service, api } = setup({ persistence, restoreTimeoutMs: 1_000 });
        api.refresh.mockResolvedValue(rawSession({ refreshToken: "refresh-2" }));
        const restored = service.restoreSession();
        await vi.advanceTimersByTimeAsync(0);
        expect(save).toHaveBeenCalledWith("refresh-2");
        await vi.advanceTimersByTimeAsync(1_000);
        await expect(restored).resolves.toBeNull();

        await expect(service.refreshAccessToken()).resolves.toBeNull();
        expect(api.refresh).toHaveBeenCalledTimes(1);
        expect(await persistence.load()).toBe("refresh-1");

        releaseSave();
        await vi.advanceTimersByTimeAsync(0);
        expect(await persistence.load()).toBe("refresh-2");
        api.refresh.mockRejectedValue(new TypeError("network down"));
        await expect(service.refreshAccessToken()).resolves.toBeNull();
        expect(api.refresh).toHaveBeenCalledTimes(2);
        expect(api.refresh.mock.calls[1]?.[0]).toBe("refresh-2");
      } finally {
        vi.useRealTimers();
      }
    });

    it("サインイン後にサービスを再生成しても、保存済みトークンで連続して復元できる", async () => {
      const persistence = createMemoryRefreshTokenPersistence();
      const original = setup({ persistence });
      original.issueSession.mockResolvedValue(rawSession());
      const user = await original.service.signIn("google");

      for (const [previous, next] of [
        ["refresh-1", "refresh-2"],
        ["refresh-2", "refresh-3"],
      ]) {
        const restarted = setup({ persistence });
        restarted.api.refresh.mockResolvedValue(rawSession({ refreshToken: next }));
        expect(restarted.service.getCurrentUser()).toBeNull();
        await expect(restarted.service.restoreSession()).resolves.toEqual(user);
        expect(restarted.api.refresh.mock.calls[0]?.[0]).toBe(previous);
        expect(await persistence.load()).toBe(next);
      }
    });

    it("APIが先に開始した更新も復元の上限時間で中断され、遅い応答は無視される", async () => {
      vi.useFakeTimers();
      try {
        const persistence = createMemoryRefreshTokenPersistence("refresh-1");
        const { service, api, onSessionChange } = setup({ persistence, restoreTimeoutMs: 1_000 });
        let release: (value: unknown) => void = () => {};
        api.refresh.mockImplementation(
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        );
        const token = service.getAccessToken();
        const restored = service.restoreSession();
        await vi.advanceTimersByTimeAsync(1_000);
        await expect(token).resolves.toBeNull();
        await expect(restored).resolves.toBeNull();
        release(rawSession({ refreshToken: "refresh-2" }));
        await vi.advanceTimersByTimeAsync(0);
        expect(onSessionChange).not.toHaveBeenCalled();
        expect(await persistence.load()).toBe("refresh-1");
        expect(api.refresh).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("中断後に遅れて返った401が、再サインインしたセッションを消さない", async () => {
      const { service, api, issueSession, persistence } = setup({
        persistence: createMemoryRefreshTokenPersistence("refresh-1"),
      });
      let reject: (error: unknown) => void = () => {};
      api.refresh.mockImplementation(
        () =>
          new Promise((_resolve, rejectRefresh) => {
            reject = rejectRefresh;
          }),
      );
      const controller = new AbortController();
      const restored = service.restoreSession({ signal: controller.signal });
      await vi.waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
      controller.abort();
      await expect(restored).resolves.toBeNull();
      issueSession.mockResolvedValue(rawSession({ refreshToken: "refresh-new" }));
      const user = await service.signIn("google");
      reject(new ApiError(401));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(service.getCurrentUser()).toEqual(user);
      expect(await persistence.load()).toBe("refresh-new");
    });

    it.each(["restore-first", "api-first"] as const)(
      "%s: 起動時復元とAPIのトークン取得が同じrefreshを共有する",
      async (order) => {
        const persistence = createMemoryRefreshTokenPersistence("refresh-1");
        const { service, api, onSessionChange } = setup({ persistence });
        let release: (value: unknown) => void = () => {};
        api.refresh
          .mockImplementationOnce(
            () =>
              new Promise((resolve) => {
                release = resolve;
              }),
          )
          .mockRejectedValue(new ApiError(401));

        const first =
          order === "restore-first" ? service.restoreSession() : service.getAccessToken();
        await vi.waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
        const second =
          order === "restore-first" ? service.getAccessToken() : service.restoreSession();
        // 専用復元経路と通常経路が同じトークンを別々に送るとbackendはfamilyを失効する。
        await new Promise((resolve) => setTimeout(resolve, 0));
        release(rawSession({ refreshToken: "refresh-2" }));
        const results = await Promise.all([first, second]);

        expect(api.refresh).toHaveBeenCalledTimes(1);
        expect(results[order === "restore-first" ? 0 : 1]).toMatchObject({ id: "user-1" });
        expect(results[order === "restore-first" ? 1 : 0]).toBe("access-1");
        expect(await persistence.load()).toBe("refresh-2");
        expect(onSessionChange).toHaveBeenCalledTimes(1);
      },
    );

    it("保存済み refresh token から user を復元する", async () => {
      const persistence = createMemoryRefreshTokenPersistence("refresh-1");
      const { service, api } = setup({ persistence });
      api.refresh.mockResolvedValue(rawSession());

      const user = await service.restoreSession();

      expect(user).toEqual({
        id: "user-1",
        email: "user@example.com",
        displayName: "Taro",
        photoUrl: null,
      });
    });

    it("refresh token が不在なら null", async () => {
      const { service } = setup();

      const user = await service.restoreSession();

      expect(user).toBeNull();
    });

    it("成功すると onSessionChange(user) が呼ばれる（起動時復元 → ストア更新の経路）", async () => {
      const persistence = createMemoryRefreshTokenPersistence("refresh-1");
      const { service, api, onSessionChange } = setup({ persistence });
      api.refresh.mockResolvedValue(rawSession());

      const user = await service.restoreSession();

      expect(onSessionChange).toHaveBeenCalledWith(user);
    });

    it("上限時間を超えた通信を abort し、認証状態を更新せず null を返す", async () => {
      vi.useFakeTimers();
      const persistence = createMemoryRefreshTokenPersistence("refresh-1");
      const { service, api } = setup({ persistence, restoreTimeoutMs: 1_000 });
      let signal: AbortSignal | undefined;
      api.refresh.mockImplementation((_refreshToken, options) => {
        signal = options?.signal;
        return new Promise(() => {});
      });

      const restored = service.restoreSession();
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(restored).resolves.toBeNull();
      expect(signal?.aborted).toBe(true);
      expect(service.getCurrentUser()).toBeNull();
      vi.useRealTimers();
    });

    it("呼び出し元の abort 後に遅れて返った結果で認証状態を更新しない", async () => {
      const persistence = createMemoryRefreshTokenPersistence("refresh-1");
      const { service, api } = setup({ persistence });
      let resolveRefresh: (value: unknown) => void = () => {};
      api.refresh.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
      );
      const controller = new AbortController();

      const restored = service.restoreSession({ signal: controller.signal });
      controller.abort();
      resolveRefresh(rawSession());

      await expect(restored).resolves.toBeNull();
      expect(service.getCurrentUser()).toBeNull();
      expect(await persistence.load()).toBe("refresh-1");
    });
  });

  describe("signOut", () => {
    it("api.logout が refresh token 付きで呼ばれ、onSignOut が呼ばれ、tokenStore が空になる", async () => {
      const { service, issueSession, api, onSignOut, persistence, onSessionChange } = setup();
      issueSession.mockResolvedValue(rawSession({ refreshToken: "refresh-1" }));
      await service.signIn("google");

      await service.signOut();

      expect(api.logout).toHaveBeenCalledWith("refresh-1");
      expect(onSignOut).toHaveBeenCalledTimes(1);
      expect(await persistence.load()).toBeNull();
      expect(service.getCurrentUser()).toBeNull();
      expect(onSessionChange).toHaveBeenCalledWith(null);
    });

    it("api.logout が throw してもローカルは必ずクリアされる", async () => {
      const { service, issueSession, api, persistence } = setup();
      issueSession.mockResolvedValue(rawSession());
      await service.signIn("google");
      api.logout.mockRejectedValue(new Error("logout failed"));

      await expect(service.signOut()).resolves.toBeUndefined();

      expect(await persistence.load()).toBeNull();
      expect(service.getCurrentUser()).toBeNull();
    });

    it("persistence.remove が reject しても signOut() は resolve し、getCurrentUser は null になる（H2回帰）", async () => {
      const persistence = createRejectingPersistence(null);
      const { service, issueSession } = setup({ persistence });
      issueSession.mockResolvedValue(rawSession());
      await service.signIn("google");

      await expect(service.signOut()).resolves.toBeUndefined();

      expect(service.getCurrentUser()).toBeNull();
    });
  });

  describe("onSessionChange", () => {
    it("signIn で user、signOut で null が通知される", async () => {
      const { service, issueSession, onSessionChange } = setup();
      issueSession.mockResolvedValue(rawSession());

      const user = await service.signIn("google");
      expect(onSessionChange).toHaveBeenCalledWith(user);

      await service.signOut();
      expect(onSessionChange).toHaveBeenLastCalledWith(null);
    });
  });
});
