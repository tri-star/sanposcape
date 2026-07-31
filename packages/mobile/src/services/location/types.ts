/** 緯度経度。react-native-maps / expo-location のどちらの型にも依存しない自前表現。 */
export type GeoCoordinates = {
  latitude: number;
  longitude: number;
};

export type LocationPermissionStatus = "granted" | "denied" | "undetermined";

/** watchPosition の購読ハンドル。remove() は多重呼び出しされても安全にする。 */
export type LocationSubscription = {
  remove(): void;
};

export type PositionListener = (position: GeoCoordinates) => void;

export type WatchPositionOptions = {
  /** 何m移動したら通知するか（既定 10）。 */
  distanceIntervalMeters?: number;
  /** 最短通知間隔（ms。既定 3000）。 */
  timeIntervalMs?: number;
};

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
  /**
   * 現在地の変化を購読する。権限が無い場合は LocationError を reject する。
   * 呼び出し側は必ず戻り値の remove() を cleanup で呼ぶこと。
   */
  watchPosition(
    listener: PositionListener,
    options?: WatchPositionOptions,
  ): Promise<LocationSubscription>;
};

export type LocationErrorCode =
  | "permission_denied"
  | "services_disabled"
  | "timeout"
  | "unavailable"
  | "unknown";
