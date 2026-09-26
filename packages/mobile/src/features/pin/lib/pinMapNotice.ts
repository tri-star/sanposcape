import { isRetriablePinReadError, type PinReadErrorCode } from "@/features/pin/lib/pinReadError";

/** `/pins/map` の下部カードに何を出すかの判定結果。 */
export type PinMapNotice =
  | { kind: "sign-in" }
  | { kind: "loading" }
  | { kind: "error"; code: PinReadErrorCode; retriable: boolean }
  | { kind: "truncated" }
  | { kind: "empty" }
  | { kind: "none" };

export type ResolvePinMapNoticeInput = {
  isSignedIn: boolean;
  status: "loading" | "ready" | "error";
  errorCode: PinReadErrorCode | null;
  truncated: boolean;
  pinCount: number;
};

/**
 * 判定順（この順序が仕様）: 未サインイン → sign-in / status error → error（errorCode が null
 * なら unknown）/ loading → loading / truncated → truncated / 0件 → empty / それ以外 → none。
 */
export function resolvePinMapNotice(input: ResolvePinMapNoticeInput): PinMapNotice {
  if (!input.isSignedIn) {
    return { kind: "sign-in" };
  }
  if (input.status === "error") {
    const code = input.errorCode ?? "unknown";
    return { kind: "error", code, retriable: isRetriablePinReadError(code) };
  }
  if (input.status === "loading") {
    return { kind: "loading" };
  }
  if (input.truncated) {
    return { kind: "truncated" };
  }
  if (input.pinCount === 0) {
    return { kind: "empty" };
  }
  return { kind: "none" };
}
