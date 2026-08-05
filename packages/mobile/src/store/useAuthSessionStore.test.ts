import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerSessionCleanup, resetSessionCleanupForTest } from "@/lib/sessionCleanup";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";
import type { AuthUser } from "@/services/auth/types";

const USER: AuthUser = {
  id: "user-1",
  email: "user@example.com",
  displayName: "散歩ユーザー",
  photoUrl: null,
};

const USER_B: AuthUser = {
  id: "user-2",
  email: "user2@example.com",
  displayName: "別の散歩ユーザー",
  photoUrl: null,
};

describe("useAuthSessionStore", () => {
  beforeEach(() => {
    useAuthSessionStore.setState({ status: "loading", user: null });
    resetSessionCleanupForTest();
  });

  it("初期状態は loading / user null", () => {
    const state = useAuthSessionStore.getState();
    expect(state.status).toBe("loading");
    expect(state.user).toBeNull();
  });

  it("setSession(user) で authenticated になり user が保持される", () => {
    useAuthSessionStore.getState().setSession(USER);

    const state = useAuthSessionStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.user).toEqual(USER);
  });

  it("loading から setSession(null) で guest になる", () => {
    useAuthSessionStore.getState().setSession(null);

    const state = useAuthSessionStore.getState();
    expect(state.status).toBe("guest");
    expect(state.user).toBeNull();
  });

  it("authenticated から setSession(null) で guest になり、登録済み cleanup が1回呼ばれる", () => {
    const cleanup = vi.fn();
    registerSessionCleanup(cleanup);
    useAuthSessionStore.getState().setSession(USER);

    useAuthSessionStore.getState().setSession(null);

    const state = useAuthSessionStore.getState();
    expect(state.status).toBe("guest");
    expect(state.user).toBeNull();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("loading から setSession(null) では cleanup は呼ばれない", () => {
    const cleanup = vi.fn();
    registerSessionCleanup(cleanup);

    useAuthSessionStore.getState().setSession(null);

    expect(cleanup).not.toHaveBeenCalled();
  });

  it("setSession(userA) → setSession(userB) は後勝ちで userB になり、cleanup は呼ばれない", () => {
    const cleanup = vi.fn();
    registerSessionCleanup(cleanup);
    useAuthSessionStore.getState().setSession(USER);

    useAuthSessionStore.getState().setSession(USER_B);

    const state = useAuthSessionStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.user).toEqual(USER_B);
    expect(cleanup).not.toHaveBeenCalled();
  });
});
