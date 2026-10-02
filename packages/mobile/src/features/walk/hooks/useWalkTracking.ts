import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { describeError, logDiagnostic } from "@/lib/diagnosticLog";
import {
  INITIAL_WALK_TRACK_SYNC,
  foregroundPositionToSample,
  mergeWalkTrackSamples,
  resumeWalkTrackSync,
} from "@/features/walk/lib/walkTrackMerge";
import type { WalkTrackSync } from "@/features/walk/lib/walkTrackMerge";
import { resolveBackgroundTrackingFailure } from "@/features/walk/lib/walkTrackingFallback";
import type { WalkTrackingStatus } from "@/features/walk/lib/walkTrackingStatus";
import { locationService } from "@/services/location";
import { toLocationError } from "@/services/location/locationError";
import type {
  BackgroundTrackingSubscription,
  GeoCoordinates,
  LocationErrorCode,
  LocationSample,
} from "@/services/location/types";

export type UseWalkTrackingResult = {
  currentPosition: GeoCoordinates | null;
  distanceMeters: number;
  /** 実際に歩いた軌跡（表示・散歩記録の保存に使う）。 */
  points: GeoCoordinates[];
  status: WalkTrackingStatus;
  errorCode: LocationErrorCode | null;
  /**
   * バッファを同期で読んで最後の統合をし、その時点の軌跡を返す（散歩の終了時に呼ぶ）。
   * setState の反映を待たずに最新の値を返す。
   */
  flushTrack: () => { points: GeoCoordinates[]; distanceMeters: number };
  /** 記録を止めてバッファを消す（散歩の終了時に呼ぶ）。アンマウントでは呼ばれない。 */
  stopTracking: () => void;
};

/**
 * `locationService.startBackgroundTracking` で散歩の位置を記録し（背面・画面ロック中も継続。ADR-M-018）、
 * 現在地・実測距離・軌跡・トラッキング状態を返す。開始できなければ `watchPosition`（フォアグラウンドのみ）
 * に切り替えて散歩を続ける。
 * RN 依存の副作用層なので Vitest 対象外（ロジックは `lib/walkTrackMerge.ts` 等でテストする）。
 *
 * **hook のアンマウントでは記録を止めない**（`detach` だけ）。止めるのは散歩の終了（`stopTracking`）・
 * サインアウト・アプリ起動時の3箇所に限る。Android の戻るキーで画面だけ消えても散歩は続くため。
 *
 * `@/services/location` のバレルを import するのはこの hook だけにする
 * （`lib/` から import するとネイティブ依存に到達するため。architecture-guideline の単体テスト節。
 * 例外は起動時の副作用モジュール `src/lib/backgroundLocationCleanup.ts` のみ）。
 */
export function useWalkTracking(input: {
  /** 散歩中のみ true。false のときは購読しない。 */
  enabled: boolean;
  /** 進行中の散歩の clientWalkId（記録セッションの識別子）。null なら記録しない。 */
  walkId: string | null;
  paused: boolean;
  /** 最初の fix が来るまでの表示に使う（= ActiveWalk.origin）。 */
  initialPosition: GeoCoordinates | null;
  /**
   * 再購読のトリガ。インクリメントされるたびに記録を貼り直す。
   * 権限エラー後にユーザーが設定アプリで許可して戻ってきたケースを救うためのもの。
   */
  attempt: number;
}): UseWalkTrackingResult {
  const { enabled, walkId, paused, initialPosition, attempt } = input;

  // ref が正で、state は再レンダー用の写し。flushTrack が setState の反映を待たずに最新値を返すため。
  const syncRef = useRef<WalkTrackSync>(INITIAL_WALK_TRACK_SYNC);
  // 写しには散歩の ID を付ける。別の散歩に切り替わった直後に前の散歩の軌跡を出さないため
  // （effect 内で setState せず、描画時に ID の一致で導出する）。
  const [mirror, setMirror] = useState<{ walkId: string | null; sync: WalkTrackSync }>({
    walkId: null,
    sync: INITIAL_WALK_TRACK_SYNC,
  });
  const sync = mirror.walkId === walkId ? mirror.sync : INITIAL_WALK_TRACK_SYNC;
  const [errorCode, setErrorCode] = useState<LocationErrorCode | null>(null);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const subscriptionRef = useRef<BackgroundTrackingSubscription | null>(null);
  const trackedWalkIdRef = useRef<string | null>(null);

  const commit = useCallback((next: WalkTrackSync) => {
    if (next === syncRef.current) return;
    syncRef.current = next;
    setMirror({ walkId: trackedWalkIdRef.current, sync: next });
  }, []);

  const apply = useCallback(
    (samples: readonly LocationSample[]) => {
      commit(mergeWalkTrackSamples(syncRef.current, samples, { paused: pausedRef.current }));
    },
    [commit],
  );

  const syncFromRecorded = useCallback(() => {
    const subscription = subscriptionRef.current;
    if (subscription !== null) apply(subscription.readRecordedSamples());
  }, [apply]);

  // `paused` は依存配列に含めない（＝一時停止しても記録は止めない）。
  // 一時停止中も現在地マーカーは更新し続けたい（自分の位置が止まって見えると「アプリが固まった」と
  // 誤解されやすい）ので、記録自体は維持し、`pausedRef` で軌跡への追加だけを止める。
  // トレードオフとして、一時停止中も GPS 受信（バッテリー消費）は止まらない。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 再購読のたびにエラー表示を消す（従来どおり）
    setErrorCode(null);
    if (!enabled || walkId === null) return;

    // 別の散歩の軌跡を持ち越さない。
    if (trackedWalkIdRef.current !== walkId) {
      syncRef.current = INITIAL_WALK_TRACK_SYNC;
      trackedWalkIdRef.current = walkId;
    }

    let cancelled = false;
    // 背景記録を開始できず、前面だけの記録（watchPosition）で続けている間 true。
    let isForegroundOnly = false;
    let isRetrying = false;

    // 背景記録の開始に失敗したときの処理。エラー表示にするか、前面だけの記録に切り替える。
    async function handleBackgroundStartFailure(error: unknown) {
      const code = toLocationError(error).code;
      if (resolveBackgroundTrackingFailure(code) === "show_error") {
        setErrorCode(code);
        return;
      }
      // 古い development build・FGS 権限欠落・背面からの開始など。フォアグラウンドだけの記録で続ける。
      // 座標は診断ログに出さない。
      logDiagnostic("walk_background_tracking_unavailable", { code, ...describeError(error) });
      try {
        const watchSub = await locationService.watchPosition((position) =>
          apply([foregroundPositionToSample(position, Date.now())]),
        );
        if (cancelled) {
          watchSub.remove();
          return;
        }
        isForegroundOnly = true;
        subscriptionRef.current = {
          readRecordedSamples: () => [],
          detach: () => watchSub.remove(),
        };
      } catch (fallbackError) {
        if (cancelled) return;
        setErrorCode(toLocationError(fallbackError).code);
      }
    }

    async function start(id: string) {
      let sub: BackgroundTrackingSubscription;
      // try は開始の呼び出しだけに絞る（成功後の処理の例外を「開始失敗」と誤分類しない）。
      try {
        sub = await locationService.startBackgroundTracking({ sessionId: id, listener: apply });
      } catch (error) {
        if (cancelled) return;
        await handleBackgroundStartFailure(error);
        return;
      }
      if (cancelled) {
        sub.detach();
        return;
      }
      subscriptionRef.current = sub;
      // 再マウント時は、ここでバッファから軌跡を組み直す。
      syncFromRecorded();
    }

    // 前面へ戻ったとき、前面だけの記録に落ちていたら背景記録の開始をもう一度試す
    // （背面から開始できなかった等の一時的な失敗を救う）。成功したら前面の購読を止めて切り替える。
    async function retryBackgroundTracking(id: string) {
      if (!isForegroundOnly || isRetrying) return;
      isRetrying = true;
      try {
        const sub = await locationService.startBackgroundTracking({
          sessionId: id,
          listener: apply,
        });
        if (cancelled) {
          sub.detach();
          return;
        }
        const foregroundSub = subscriptionRef.current;
        subscriptionRef.current = sub;
        foregroundSub?.detach();
        isForegroundOnly = false;
        syncFromRecorded();
      } catch {
        // 引き続き前面だけの記録で続ける（次に前面へ戻ったときにまた試す）。
      } finally {
        isRetrying = false;
      }
    }

    void start(walkId);

    const appStateSubscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      syncFromRecorded();
      void retryBackgroundTracking(walkId);
    });

    return () => {
      cancelled = true;
      appStateSubscription.remove();
      // ここで stopBackgroundTracking は呼ばない（アンマウントでは止めない。上の JSDoc 参照）。
      subscriptionRef.current?.detach();
      subscriptionRef.current = null;
    };
  }, [enabled, walkId, attempt, apply, syncFromRecorded]);

  useEffect(() => {
    if (!paused) commit(resumeWalkTrackSync(syncRef.current));
  }, [paused, commit]);

  const flushTrack = useCallback(() => {
    syncFromRecorded();
    const { track } = syncRef.current;
    return { points: track.points, distanceMeters: track.distanceMeters };
  }, [syncFromRecorded]);

  const stopTracking = useCallback(() => {
    subscriptionRef.current?.detach();
    subscriptionRef.current = null;
    void locationService.stopBackgroundTracking();
  }, []);

  const status: WalkTrackingStatus = !enabled
    ? "idle"
    : errorCode !== null
      ? "error"
      : sync.track.points.length === 0
        ? "acquiring"
        : "tracking";

  return {
    currentPosition: sync.latestPosition ?? initialPosition,
    distanceMeters: sync.track.distanceMeters,
    points: sync.track.points,
    status,
    errorCode,
    flushTrack,
    stopTracking,
  };
}
