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

function setup(options?: { persistence?: RefreshTokenPersistence; initialTime?: number }) {
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
