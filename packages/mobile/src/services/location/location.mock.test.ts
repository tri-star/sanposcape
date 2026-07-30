import { describe, expect, it } from "vitest";

import { isLocationError } from "@/services/location/locationError";
import { MOCK_ORIGIN, createMockLocationService } from "@/services/location/location.mock";

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
