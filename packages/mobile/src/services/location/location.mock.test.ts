import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isLocationError } from "@/services/location/locationError";
import {
  MOCK_ORIGIN,
  MOCK_TRACK,
  createMockLocationService,
} from "@/services/location/location.mock";
import type { GeoCoordinates } from "@/services/location/types";

describe("createMockLocationService", () => {
  it("既定では MOCK_ORIGIN（東京駅）を返す", async () => {
    const service = createMockLocationService();
    await expect(service.getCurrentPosition()).resolves.toEqual(MOCK_ORIGIN);
  });

  it("既定の権限状態は granted", async () => {
    const service = createMockLocationService();
    await expect(service.getPermissionStatus()).resolves.toBe("granted");
    await expect(service.requestPermission()).resolves.toBe("granted");
  });

  it("coordinates を上書きできる", async () => {
    const custom = { latitude: 1, longitude: 2 };
    const service = createMockLocationService({ coordinates: custom });
    await expect(service.getCurrentPosition()).resolves.toEqual(custom);
  });

  it("permission: 'denied' のときは permission_denied を throw する", async () => {
    const service = createMockLocationService({ permission: "denied" });
    await expect(service.getPermissionStatus()).resolves.toBe("denied");

    try {
      await service.getCurrentPosition();
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(isLocationError(error)).toBe(true);
      if (isLocationError(error)) {
        expect(error.code).toBe("permission_denied");
      }
    }
  });

  it("failWith を指定するとその code で throw する", async () => {
    const service = createMockLocationService({ failWith: "timeout" });

    try {
      await service.getCurrentPosition();
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(isLocationError(error)).toBe(true);
      if (isLocationError(error)) {
        expect(error.code).toBe("timeout");
      }
    }
  });
});

describe("createMockLocationService().watchPosition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("MOCK_TRACK を既定間隔(1000ms)で順に通知する", async () => {
    const service = createMockLocationService();
    const received: GeoCoordinates[] = [];

    await service.watchPosition((position) => received.push(position));

    await vi.advanceTimersByTimeAsync(1000 * 3);
    expect(received).toEqual(MOCK_TRACK.slice(0, 3));
  });

  it("末尾に到達したら通知を止める（ループしない）", async () => {
    const service = createMockLocationService();
    const received: GeoCoordinates[] = [];

    await service.watchPosition((position) => received.push(position));

    await vi.advanceTimersByTimeAsync(1000 * (MOCK_TRACK.length + 5));
    expect(received).toEqual(MOCK_TRACK);
  });

  it("remove() を呼ぶとそれ以降通知が来ない", async () => {
    const service = createMockLocationService();
    const received: GeoCoordinates[] = [];

    const subscription = await service.watchPosition((position) => received.push(position));
    await vi.advanceTimersByTimeAsync(1000 * 2);
    subscription.remove();
    await vi.advanceTimersByTimeAsync(1000 * 5);

    expect(received).toEqual(MOCK_TRACK.slice(0, 2));
  });

  it("remove() を複数回呼んでも安全", async () => {
    const service = createMockLocationService();
    const subscription = await service.watchPosition(() => {});

    expect(() => {
      subscription.remove();
      subscription.remove();
    }).not.toThrow();
  });

  it("permission: 'denied' のときは reject する", async () => {
    const service = createMockLocationService({ permission: "denied" });

    try {
      await service.watchPosition(() => {});
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(isLocationError(error)).toBe(true);
      if (isLocationError(error)) {
        expect(error.code).toBe("permission_denied");
      }
    }
  });

  it("failWith を指定するとその code で reject する", async () => {
    const service = createMockLocationService({ failWith: "unavailable" });

    try {
      await service.watchPosition(() => {});
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(isLocationError(error)).toBe(true);
      if (isLocationError(error)) {
        expect(error.code).toBe("unavailable");
      }
    }
  });

  it("track オプションで座標列を差し替えられる", async () => {
    const customTrack: GeoCoordinates[] = [
      { latitude: 1, longitude: 2 },
      { latitude: 3, longitude: 4 },
    ];
    const service = createMockLocationService({ track: customTrack, trackIntervalMs: 500 });
    const received: GeoCoordinates[] = [];

    await service.watchPosition((position) => received.push(position));
    await vi.advanceTimersByTimeAsync(500 * 5);

    expect(received).toEqual(customTrack);
  });
});
