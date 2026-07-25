import { describe, expect, it, vi } from "vitest";

import { createTokenStore } from "@/services/auth/tokenStore";
import type { RefreshTokenPersistence } from "@/services/auth/types";

function createFakePersistence(initial: string | null = null): RefreshTokenPersistence & {
  loadCallCount: () => number;
} {
  let stored = initial;
  let loadCalls = 0;

  return {
    async load() {
      loadCalls += 1;
      return stored;
    },
    async save(token: string) {
      stored = token;
    },
    async remove() {
      stored = null;
    },
    loadCallCount: () => loadCalls,
  };
}

describe("createTokenStore", () => {
  it("setAccessToken → getAccessToken で同じ値、null で null", () => {
    const store = createTokenStore(createFakePersistence());

    store.setAccessToken({ value: "a1", expiresAt: 1000 });
    expect(store.getAccessToken()).toEqual({ value: "a1", expiresAt: 1000 });

    store.setAccessToken(null);
    expect(store.getAccessToken()).toBeNull();
  });

  it("setRefreshToken で persistence.save が呼ばれ、getRefreshToken に反映される", async () => {
    const persistence = createFakePersistence();
    const saveSpy = vi.spyOn(persistence, "save");
    const store = createTokenStore(persistence);

    await store.setRefreshToken("r1");

    expect(saveSpy).toHaveBeenCalledWith("r1");
    expect(await store.getRefreshToken()).toBe("r1");
  });

  it("2回目の getRefreshToken では persistence.load が再度呼ばれない（キャッシュ）", async () => {
    const persistence = createFakePersistence("r1");
    const store = createTokenStore(persistence);

    await store.getRefreshToken();
    await store.getRefreshToken();

    expect(persistence.loadCallCount()).toBe(1);
  });

  it("clear() 後は access が null、getRefreshToken が null、persistence.remove が呼ばれる", async () => {
    const persistence = createFakePersistence("r1");
    const removeSpy = vi.spyOn(persistence, "remove");
    const store = createTokenStore(persistence);

    store.setAccessToken({ value: "a1", expiresAt: 1000 });
    await store.setRefreshToken("r1");

    await store.clear();

    expect(store.getAccessToken()).toBeNull();
    expect(await store.getRefreshToken()).toBeNull();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it("persistence.remove が reject しても access token はクリアされる", async () => {
    const persistence: RefreshTokenPersistence = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockRejectedValue(new Error("remove failed")),
    };
    const store = createTokenStore(persistence);
    store.setAccessToken({ value: "a1", expiresAt: 1000 });

    await expect(store.clear()).rejects.toThrow("remove failed");

    expect(store.getAccessToken()).toBeNull();
  });

  it("setRefreshToken で persistence.save が reject してもメモリキャッシュは新しい値に更新される", async () => {
    const persistence: RefreshTokenPersistence = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockRejectedValue(new Error("save failed")),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const store = createTokenStore(persistence);

    await expect(store.setRefreshToken("new-token")).rejects.toThrow("save failed");

    expect(await store.getRefreshToken()).toBe("new-token");
  });

  it("setRefreshToken(null) で persistence.remove が reject してもメモリキャッシュは null になる", async () => {
    const persistence: RefreshTokenPersistence = {
      load: vi.fn().mockResolvedValue("r1"),
      save: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockRejectedValue(new Error("remove failed")),
    };
    const store = createTokenStore(persistence);

    await expect(store.setRefreshToken(null)).rejects.toThrow("remove failed");

    expect(await store.getRefreshToken()).toBeNull();
  });
});
