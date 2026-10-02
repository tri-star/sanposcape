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

/**
 * 散歩の記録に使う1回分の測位。GeoCoordinates に測位時刻と精度を足したもの。
 * timestampMs は統合時の並べ替えと重複排除のキー（同じ点がリスナー経由とバッファ経由の両方で届くため）。
 */
export type LocationSample = {
  latitude: number;
  longitude: number;
  /** 測位時刻（Unix ミリ秒。OS の location.timestamp）。 */
  timestampMs: number;
  /** 水平精度（m）。取れない・不正なら null。今回は捨てる判定には使わない（記録・診断用）。 */
  accuracyMeters: number | null;
};

export type LocationSampleListener = (samples: readonly LocationSample[]) => void;

/** 背景記録の購読ハンドル。 */
export type BackgroundTrackingSubscription = {
  /**
   * このセッションで記録した全サンプル（端末のバッファから同期で読む）。順序は保証しない。
   * フォアグラウンド復帰時・再マウント時の統合に使う。読めなければ [] を返し、throw しない。
   */
  readRecordedSamples(): LocationSample[];
  /** リスナーを外す。記録は止めない（散歩が続いている間は裏で記録し続ける）。何度呼んでも安全。 */
  detach(): void;
};

export type StartBackgroundTrackingInput = {
  /** 散歩の識別子（ActiveWalk.clientWalkId）。同じ値で呼び直すとバッファを消さずに再開する。 */
  sessionId: string;
  listener: LocationSampleListener;
};

/** 背景記録のバッファの保存先（文字列の追記・全読み・削除だけを持つ最小の I/F）。 */
export type SampleBufferStorage = {
  /** 保存済みの全文。無ければ null。読めなければ throw してよい（hub 側で握る）。 */
  read(): string | null;
  /** 末尾へ追記する（無ければ作る）。失敗は throw してよい。 */
  append(raw: string): void;
  /** 削除する（無くても成功）。失敗は throw してよい。 */
  clear(): void;
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
   * 現在地の変化を購読する（フォアグラウンドのみ）。権限が無い場合は LocationError を reject する。
   * 呼び出し側は必ず戻り値の remove() を cleanup で呼ぶこと。
   * 散歩の記録では、背景記録（startBackgroundTracking）を開始できなかったときの fallback にだけ使う。
   */
  watchPosition(
    listener: PositionListener,
    options?: WatchPositionOptions,
  ): Promise<LocationSubscription>;
  /**
   * 散歩の位置記録を始める。アプリがバックグラウンド・画面ロック中でも記録を続ける（ADR-M-018）。
   * - 別の sessionId（または記録していない状態）からの呼び出し: バッファを空にして記録を始める。
   * - 同じ sessionId で記録中: バッファを消さずにリスナーだけ付け直す（画面の再マウント）。
   * - 権限が無い・開始できない場合は LocationError を reject（呼び出し側が watchPosition へ切り替えるか決める）。
   * 前面にいる間に呼ぶこと（Android はフォアグラウンドサービスを背面から開始できない）。
   */
  startBackgroundTracking(
    input: StartBackgroundTrackingInput,
  ): Promise<BackgroundTrackingSubscription>;
  /**
   * 記録を止め、バッファを消す。記録していなくても安全（冪等）。throw しない（失敗は診断ログ）。
   * 呼ぶのは散歩の終了・サインアウト・アプリ起動時の3箇所だけ（hook のアンマウントでは呼ばない）。
   */
  stopBackgroundTracking(): Promise<void>;
};

export type LocationErrorCode =
  | "permission_denied"
  | "services_disabled"
  | "timeout"
  | "unavailable"
  | "unknown";
