import type { LocationErrorCode } from "@/services/location/types";

export class LocationError extends Error {
  readonly isLocationError = true;

  constructor(
    readonly code: LocationErrorCode,
    message?: string,
    readonly cause?: unknown,
  ) {
    super(message ?? code);
    this.name = "LocationError";
  }
}

export function isLocationError(error: unknown): error is LocationError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isLocationError?: boolean }).isLocationError === true
  );
}

/**
 * expo-location のエラーコード → LocationErrorCode。
 *
 * expo-location は Expo Modules API の `CodedException` を使っており、コードは**例外クラス名から
 * 自動導出**される（`"ERR_" + クラス名から "Exception" を除いて UPPER_SNAKE` 化）。
 * 例: `CurrentLocationIsUnavailableException` → `ERR_CURRENT_LOCATION_IS_UNAVAILABLE`。
 * Android は `android/.../LocationExceptions.kt`、iOS は `ios/LocationExceptions.swift` が定義元。
 *
 * `E_` で始まるものは unimodules 時代の旧コード。現行版では飛んでこないが、
 * 古い環境との互換のために残している。
 */
const PERMISSION_DENIED_CODES = new Set([
  // Android
  "ERR_LOCATION_UNAUTHORIZED",
  "ERR_LOCATION_BACKGROUND_UNAUTHORIZED",
  "ERR_NO_PERMISSION_IN_MANIFEST",
  // iOS
  "ERR_DENIED_FOREGROUND_LOCATION_PERMISSION",
  "ERR_DENIED_BACKGROUND_LOCATION_PERMISSION",
  // 旧コード
  "E_NO_PERMISSIONS",
  "ERR_NO_PERMISSIONS",
]);
const SERVICES_DISABLED_CODES = new Set([
  // Android: 位置情報の端末設定が要件を満たしていない（位置情報オフ等）
  "ERR_LOCATION_SETTINGS_UNSATISFIED",
  // iOS
  "ERR_LOCATION_SERVICES_DISABLED",
  // 旧コード
  "E_LOCATION_SERVICES_DISABLED",
]);
const TIMEOUT_CODES = new Set(["E_LOCATION_TIMEOUT"]);
const UNAVAILABLE_CODES = new Set([
  // Android
  "ERR_CURRENT_LOCATION_IS_UNAVAILABLE",
  "ERR_LOCATION_UNAVAILABLE",
  "ERR_LOCATION_UNKNOWN",
  "ERR_LOCATION_REQUEST_REJECTED",
  "ERR_LOCATION_REQUEST_CANCELLED",
  "ERR_NO_PERMISSIONS_MODULE",
  // iOS
  "ERR_LOCATION_REQUEST_CANCELED",
  "ERR_LOCATION_UPDATES_UNAVAILABLE",
  // 旧コード
  "E_LOCATION_UNAVAILABLE",
  "E_LOCATION_SETTINGS_UNSATISFIED",
]);

/**
 * 任意の例外を LocationError へ正規化する（純粋。expo-location を import しない）。
 * `error.code` の文字列だけを見て分類する（純粋性を保ち vitest でテストするため）。
 */
export function toLocationError(error: unknown): LocationError {
  if (isLocationError(error)) {
    return error;
  }

  const code = extractErrorCode(error);
  if (code !== null) {
    if (PERMISSION_DENIED_CODES.has(code)) {
      return new LocationError("permission_denied", code, error);
    }
    if (SERVICES_DISABLED_CODES.has(code)) {
      return new LocationError("services_disabled", code, error);
    }
    if (TIMEOUT_CODES.has(code)) {
      return new LocationError("timeout", code, error);
    }
    if (UNAVAILABLE_CODES.has(code)) {
      return new LocationError("unavailable", code, error);
    }
  }

  return new LocationError("unknown", error instanceof Error ? error.message : undefined, error);
}

function extractErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

const MESSAGES: Record<LocationErrorCode, string> = {
  permission_denied: "現在地の利用が許可されていません。設定から位置情報を許可してください。",
  services_disabled: "端末の位置情報がオフになっています。オンにしてから再度お試しください。",
  timeout: "現在地を取得できませんでした。屋外など電波の良い場所で再度お試しください。",
  unavailable: "現在地を取得できませんでした。屋外など電波の良い場所で再度お試しください。",
  unknown: "現在地の取得に失敗しました。もう一度お試しください。",
};

/** ユーザー向け文言。 */
export function locationErrorMessage(code: LocationErrorCode): string {
  return MESSAGES[code];
}
