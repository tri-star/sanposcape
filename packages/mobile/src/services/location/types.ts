/** 緯度経度。react-native-maps / expo-location のどちらの型にも依存しない自前表現。 */
export type GeoCoordinates = {
  latitude: number;
  longitude: number;
};

export type LocationPermissionStatus = "granted" | "denied" | "undetermined";

/**
 * 位置情報サービスのインターフェース。
 * 呼び出し側（features/walk）はこれのみを参照し、real/mock の実体を知らない。
 */
export type LocationService = {
  /** 現在の権限状態を返す（ダイアログを出さない）。 */
  getPermissionStatus(): Promise<LocationPermissionStatus>;
  /** 権限をリクエストする（必要ならOSダイアログを出す）。 */
  requestPermission(): Promise<LocationPermissionStatus>;
  /**
   * 現在地を取得する。権限が無い / 取得できない場合は LocationError を throw する。
   * 直近の測位があればそれを優先し、無ければ実測する（起動を速くするため）。
   */
  getCurrentPosition(): Promise<GeoCoordinates>;
};

export type LocationErrorCode =
  | "permission_denied"
  | "services_disabled"
  | "timeout"
  | "unavailable"
  | "unknown";
