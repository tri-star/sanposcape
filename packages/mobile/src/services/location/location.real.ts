import * as Location from "expo-location";

import { describeError, logDiagnostic } from "@/lib/diagnosticLog";
import {
  BACKGROUND_LOCATION_TASK_NAME,
  backgroundSampleHub,
} from "@/services/location/backgroundLocationTask";
import { toLocationError } from "@/services/location/locationError";
import { createSerialQueue } from "@/services/location/serialQueue";
import type {
  GeoCoordinates,
  LocationPermissionStatus,
  LocationService,
} from "@/services/location/types";

/** 直近の測位を「新しい」とみなす最大経過時間（ms）。起動時の初回描画を速くするため。 */
const LAST_KNOWN_MAX_AGE_MS = 60_000;

/**
 * 実測時の精度。`Balanced` にしてはいけない。
 * Android では `Balanced` → `PRIORITY_BALANCED_POWER_ACCURACY` になり、fused provider が
 * GPS を起動せずネットワーク測位に頼るため、屋内やエミュレータ（"Set Location" は GPS
 * プロバイダに fix を注入する）では fix が得られず、数十秒待った末に失敗する。
 * `High` なら `PRIORITY_HIGH_ACCURACY` になり GPS を使う。徒歩ナビ用途としても妥当。
 */
const CURRENT_POSITION_ACCURACY = Location.Accuracy.High;

/** watchPosition の既定の通知間隔（distanceInterval）。 */
const WATCH_DISTANCE_INTERVAL_METERS = 10;
/** watchPosition の既定の最短通知間隔（ms）。 */
const WATCH_TIME_INTERVAL_MS = 3000;

/** 散歩の記録中に Android のフォアグラウンドサービスが出す通知（文言は SS-157 で確定させる）。 */
export const BACKGROUND_TRACKING_NOTIFICATION = {
  title: "散歩を記録しています",
  body: "散歩のルートを記録中です。散歩を終了すると記録も止まります。",
} as const;

/** 散歩の背景記録（startLocationUpdatesAsync）のオプション。理由は ADR-M-018。 */
const BACKGROUND_TRACKING_OPTIONS: Location.LocationTaskOptions = {
  // iOS は kCLLocationAccuracyBest、Android は PRIORITY_HIGH_ACCURACY（High と同じ）。
  accuracy: Location.Accuracy.Highest,
  // 間隔は従来の watchPosition と同じ（10m / 3秒。timeInterval は Android のみ有効）。
  distanceInterval: WATCH_DISTANCE_INTERVAL_METERS,
  timeInterval: WATCH_TIME_INTERVAL_MS,
  activityType: Location.ActivityType.Fitness,
  // iOS のネイティブ既定は true（型定義の「既定 false」は誤り。EXLocationTaskConsumer.m）。
  // 止まると軌跡が欠けるので明示する。
  pausesUpdatesAutomatically: false,
  // iOS: 記録中であることを status bar で示す。
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: BACKGROUND_TRACKING_NOTIFICATION.title,
    notificationBody: BACKGROUND_TRACKING_NOTIFICATION.body,
    // 最近使ったアプリから消したら止める。進行中の散歩は永続化していない（ADR-M-008 決定5）ので、
    // 続けても誰も取り込めないうえ、「アプリを閉じたのに位置を取り続ける」ことになる。
    killServiceOnDestroy: true,
  },
};

async function hasStartedSafely(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  } catch (error) {
    // 「始まっていない」とみなして開始を試みる（開始が成功すれば問題ない）。原因調査用に残す。
    logDiagnostic("walk_background_tracking_has_started_failed", describeError(error));
    return false;
  }
}

/**
 * タスクが動いていれば止める。止まった・もともと動いていなかったなら true。
 * 確認や停止に失敗したら 1 回だけやり直し、それでも失敗したら false（診断ログを残す）。
 * throw しない。
 */
async function stopTaskWithRetry(): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME)) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
      }
      return true;
    } catch (error) {
      logDiagnostic("walk_background_tracking_stop_failed", { attempt, ...describeError(error) });
    }
  }
  return false;
}

function toCoordinates(position: Location.LocationObject): GeoCoordinates {
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

function toPermissionStatus(result: {
  status: Location.PermissionStatus;
  canAskAgain: boolean;
}): LocationPermissionStatus {
  if (result.status === Location.PermissionStatus.GRANTED) {
    return "granted";
  }
  return result.canAskAgain ? "undetermined" : "denied";
}

/**
 * real: `expo-location` を import してよい唯一のファイル。
 * 呼び出し側（`services/location/index.ts` 経由）はこの実装の詳細を知らない。
 */
export function createRealLocationService(): LocationService {
  // 背景記録の開始と停止は到着順に1つずつ実行する（起動時の停止が遅れて散歩の記録を止める競合を防ぐ）。
  const enqueue = createSerialQueue();
  // 直近の停止に失敗してタスクが動いたままかもしれない（OS の測位・通知・インジケータが残る）。
  // 次の新規セッション開始・停止呼び出し（起動時の後始末を含む）で止め直す。
  let stopPending = false;

  return {
    async getPermissionStatus() {
      const result = await Location.getForegroundPermissionsAsync();
      return toPermissionStatus(result);
    },

    async requestPermission() {
      const result = await Location.requestForegroundPermissionsAsync();
      return toPermissionStatus(result);
    },

    async getCurrentPosition(): Promise<GeoCoordinates> {
      try {
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: LAST_KNOWN_MAX_AGE_MS,
        });
        if (lastKnown) {
          return toCoordinates(lastKnown);
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: CURRENT_POSITION_ACCURACY,
        });
        return toCoordinates(current);
      } catch (error) {
        // 実測に失敗しても、古くてよいので直近の測位が残っていればそれで代替する。
        // getCurrentPositionAsync は fused provider が fix を得られないと数十秒待った末に
        // CurrentLocationIsUnavailable で失敗する（屋内やエミュレータで起こりやすい）。
        // その場合でも「少し前の現在地」が取れるなら探索は始められる。
        const stale = await Location.getLastKnownPositionAsync().catch(() => null);
        if (stale) {
          return toCoordinates(stale);
        }
        throw toLocationError(error);
      }
    },

    async watchPosition(listener, options) {
      try {
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: CURRENT_POSITION_ACCURACY,
            distanceInterval: options?.distanceIntervalMeters ?? WATCH_DISTANCE_INTERVAL_METERS,
            timeInterval: options?.timeIntervalMs ?? WATCH_TIME_INTERVAL_MS,
          },
          (position) => listener(toCoordinates(position)),
        );
        return { remove: () => subscription.remove() };
      } catch (error) {
        throw toLocationError(error);
      }
    },

    // 権限はリクエストしない（`requestBackgroundPermissionsAsync` はどこからも呼ばない。ADR-M-018）。
    // フォアグラウンド権限は散歩開始画面（useCurrentLocation）で取得済みの前提。
    async startBackgroundTracking({ sessionId, listener }) {
      return enqueue(async () => {
        const hub = backgroundSampleHub;
        const isNewSession = hub.activeSessionId !== sessionId;
        if (isNewSession) {
          // 前回の停止が未了なら止め直す。止まらなくても開始へ進む（動いているタスクは開始で置き換わる）。
          if (stopPending) stopPending = !(await stopTaskWithRetry());
          hub.beginSession(sessionId);
        }
        const removeListener = hub.addListener(listener);
        try {
          if (isNewSession || !(await hasStartedSafely())) {
            await Location.startLocationUpdatesAsync(
              BACKGROUND_LOCATION_TASK_NAME,
              BACKGROUND_TRACKING_OPTIONS,
            );
          }
        } catch (error) {
          removeListener();
          if (isNewSession) hub.endSession();
          throw toLocationError(error);
        }
        let detached = false;
        return {
          readRecordedSamples: () => hub.readSamples(),
          detach: () => {
            if (detached) return;
            detached = true;
            removeListener();
          },
        };
      });
    },

    async stopBackgroundTracking() {
      return enqueue(async () => {
        // 止まらなかったら「停止未了」を覚えて、次の新規セッション開始・停止呼び出しで止め直す。
        // 失敗しても記録（バッファ・リスナー）は先に畳む（点はタスクが動いていても捨てられる）。
        stopPending = !(await stopTaskWithRetry());
        // 先に止めてから消す（逆だと、止まる前に届いた点でファイルが作り直される）。
        backgroundSampleHub.endSession();
      });
    },
  };
}
