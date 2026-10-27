import { describe, expect, it } from "vitest";

import {
  GOOGLE_PROVIDER_FAILED_MESSAGE,
  GOOGLE_REPEATED_CANCEL_MESSAGE,
  getSignInFailureFeedback,
  SIGN_IN_CONFIGURATION_MESSAGE,
  SIGN_IN_FAILED_MESSAGE,
} from "@/features/auth/lib/signInFailureFeedback";

describe("getSignInFailureFeedback", () => {
  it("Google の1回目のキャンセルは無反応にし、回数を数える", () => {
    expect(
      getSignInFailureFeedback({
        provider: "google",
        code: "cancelled",
        consecutiveGoogleCancels: 0,
      }),
    ).toEqual({ message: null, consecutiveGoogleCancels: 1 });
  });

  it("Google のキャンセルが続いたら案内を出す（設定不備もキャンセルで返るため）", () => {
    expect(
      getSignInFailureFeedback({
        provider: "google",
        code: "cancelled",
        consecutiveGoogleCancels: 1,
      }),
    ).toEqual({ message: GOOGLE_REPEATED_CANCEL_MESSAGE, consecutiveGoogleCancels: 2 });
    expect(
      getSignInFailureFeedback({
        provider: "google",
        code: "cancelled",
        consecutiveGoogleCancels: 2,
      }).message,
    ).toBe(GOOGLE_REPEATED_CANCEL_MESSAGE);
  });

  it("Apple のキャンセルは数えず、無反応のまま", () => {
    expect(
      getSignInFailureFeedback({
        provider: "apple",
        code: "cancelled",
        consecutiveGoogleCancels: 1,
      }),
    ).toEqual({ message: null, consecutiveGoogleCancels: 0 });
  });

  it("Google の provider_failed は汎用の失敗と区別できる文言にし、回数を戻す", () => {
    expect(
      getSignInFailureFeedback({
        provider: "google",
        code: "provider_failed",
        consecutiveGoogleCancels: 1,
      }),
    ).toEqual({ message: GOOGLE_PROVIDER_FAILED_MESSAGE, consecutiveGoogleCancels: 0 });
  });

  it("configuration は設定未完了の文言", () => {
    expect(
      getSignInFailureFeedback({
        provider: "apple",
        code: "configuration",
        consecutiveGoogleCancels: 0,
      }).message,
    ).toBe(SIGN_IN_CONFIGURATION_MESSAGE);
  });

  it.each(["unknown", "network", "unauthorized", null] as const)(
    "%s は汎用の失敗の文言",
    (code) => {
      expect(
        getSignInFailureFeedback({ provider: "google", code, consecutiveGoogleCancels: 0 }).message,
      ).toBe(SIGN_IN_FAILED_MESSAGE);
    },
  );
});
