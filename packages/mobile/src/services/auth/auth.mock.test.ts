import { describe, expect, it, vi } from "vitest";

import { createMockAuthService } from "@/services/auth/auth.mock";

describe("createMockAuthService", () => {
  it("未サインイン状態では getAccessToken/refreshAccessToken が null を返す", async () => {
    const service = createMockAuthService();

    expect(service.getCurrentUser()).toBeNull();
    expect(await service.getAccessToken()).toBeNull();
    expect(await service.refreshAccessToken()).toBeNull();
  });

  it("signIn 後は getAccessToken/refreshAccessToken がトークンを返す", async () => {
    const service = createMockAuthService();

    await service.signIn("google");

    expect(await service.getAccessToken()).toBe("mock-access-token");
    expect(await service.refreshAccessToken()).toBe("mock-access-token");
  });

  it('signIn("apple") も既定のダミーユーザーを返し、onSessionChange に通知する', async () => {
    const onSessionChange = vi.fn();
    const service = createMockAuthService({ onSessionChange });

    const user = await service.signIn("apple");

    expect(user.id).toBe("mock-user-1");
    expect(onSessionChange).toHaveBeenCalledWith(user);
  });

  it("signOut 後は再び null を返す", async () => {
    const service = createMockAuthService();
    await service.signIn("google");

    await service.signOut();

    expect(await service.getAccessToken()).toBeNull();
    expect(await service.refreshAccessToken()).toBeNull();
  });

  it("onSessionChange を渡すと signIn で user、signOut で null が通知される", async () => {
    const onSessionChange = vi.fn();
    const service = createMockAuthService({ onSessionChange });

    const user = await service.signIn("google");
    expect(onSessionChange).toHaveBeenCalledWith(user);

    await service.signOut();
    expect(onSessionChange).toHaveBeenLastCalledWith(null);
  });

  it("updateCurrentUser はサインイン中の同じユーザーだけを差し替えて通知する（SS-268）", async () => {
    const onSessionChange = vi.fn();
    const service = createMockAuthService({ onSessionChange });
    const user = await service.signIn("google");
    onSessionChange.mockClear();

    service.updateCurrentUser({ ...user, id: "other-user", displayName: "別人" });
    expect(onSessionChange).not.toHaveBeenCalled();

    const renamed = { ...user, displayName: "さんぽ太郎" };
    service.updateCurrentUser(renamed);
    expect(service.getCurrentUser()).toEqual(renamed);
    expect(onSessionChange).toHaveBeenCalledWith(renamed);
  });
});
