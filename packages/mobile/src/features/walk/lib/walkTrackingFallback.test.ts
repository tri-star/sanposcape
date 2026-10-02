import { describe, expect, it } from "vitest";

import {
  resolveBackgroundTrackingFailure,
  type BackgroundTrackingFailureAction,
} from "@/features/walk/lib/walkTrackingFallback";
import type { LocationErrorCode } from "@/services/location/types";

describe("resolveBackgroundTrackingFailure", () => {
  // Record にして、LocationErrorCode が増えたらここで型エラーになるようにする。
  const expected: Record<LocationErrorCode, BackgroundTrackingFailureAction> = {
    permission_denied: "show_error",
    services_disabled: "show_error",
    timeout: "fallback_to_foreground",
    unavailable: "fallback_to_foreground",
    unknown: "fallback_to_foreground",
  };

  it.each(Object.entries(expected) as Array<[LocationErrorCode, BackgroundTrackingFailureAction]>)(
    "%s は %s",
    (code, action) => {
      expect(resolveBackgroundTrackingFailure(code)).toBe(action);
    },
  );
});
