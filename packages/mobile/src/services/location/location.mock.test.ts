import { describe, expect, it } from "vitest";

import { createMockLocationService } from "@/services/location/location.mock";

describe("createMockLocationService", () => {
  it("returns injected coordinates without native location access", async () => {
    const service = createMockLocationService({ latitude: 1, longitude: 2 });

    await expect(service.getCurrentLocation()).resolves.toEqual({ latitude: 1, longitude: 2 });
  });
});
