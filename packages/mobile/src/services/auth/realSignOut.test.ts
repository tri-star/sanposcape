import { describe, expect, it, vi } from "vitest";

import { createRealSignOutHandler } from "@/services/auth/realSignOut";

describe("createRealSignOutHandler", () => {
  it("Google のサインアウトと保留中の氏名の消去の両方を呼ぶ", async () => {
    const signOutFromGoogle = vi.fn(async () => {});
    const clearPendingAppleDisplayName = vi.fn(async () => {});

    await createRealSignOutHandler({ signOutFromGoogle, clearPendingAppleDisplayName })();

    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
    expect(clearPendingAppleDisplayName).toHaveBeenCalledTimes(1);
  });

  it("Google のサインアウトが失敗しても保留中の氏名は消され、reject しない", async () => {
    const clearPendingAppleDisplayName = vi.fn(async () => {});
    const handler = createRealSignOutHandler({
      signOutFromGoogle: async () => {
        throw new Error("google failed");
      },
      clearPendingAppleDisplayName,
    });

    await expect(handler()).resolves.toBeUndefined();
    expect(clearPendingAppleDisplayName).toHaveBeenCalledTimes(1);
  });

  it("保留中の氏名の消去が失敗しても Google のサインアウトは呼ばれ、reject しない", async () => {
    const signOutFromGoogle = vi.fn(async () => {});
    const handler = createRealSignOutHandler({
      signOutFromGoogle,
      clearPendingAppleDisplayName: async () => {
        throw new Error("keychain failed");
      },
    });

    await expect(handler()).resolves.toBeUndefined();
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
  });

  it("同期的に throw する実装でも他方を止めない", async () => {
    const clearPendingAppleDisplayName = vi.fn(async () => {});
    const handler = createRealSignOutHandler({
      signOutFromGoogle: () => {
        throw new Error("sync");
      },
      clearPendingAppleDisplayName,
    });

    await expect(handler()).resolves.toBeUndefined();
    expect(clearPendingAppleDisplayName).toHaveBeenCalledTimes(1);
  });
});
