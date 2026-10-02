import { describeError, logDiagnostic } from "@/lib/diagnosticLog";
import {
  decodeLocationSamples,
  encodeLocationSamples,
  toLocationSamples,
} from "@/services/location/locationSample";
import type {
  LocationSample,
  LocationSampleListener,
  SampleBufferStorage,
} from "@/services/location/types";

export type BackgroundSampleHubEvent =
  | "location_sample_buffer_read_failed"
  | "location_sample_buffer_write_failed"
  | "location_sample_buffer_clear_failed"
  | "background_location_task_error"
  | "location_sample_listener_failed";

export type BackgroundSampleHubOptions = {
  /** 既定は logDiagnostic(event, detail)。detail に座標を入れない。 */
  onError?: (event: BackgroundSampleHubEvent, detail: Record<string, unknown>) => void;
  /** セッション開始時刻の取得元（既定 Date.now。OS の測位時刻と同じ端末時計）。テスト用に差し替えられる。 */
  now?: () => number;
};

export type BackgroundSampleHub = {
  /** 記録中のセッション。記録していなければ null。 */
  readonly activeSessionId: string | null;
  /**
   * バッファを空にし、sessionId を記録中にする。開始時刻を覚え、それより前の測位時刻の点は
   * 以後バッファからも配信からも捨てる（バッファの削除に失敗しても前の散歩の点が混ざらないため）。
   */
  beginSession(sessionId: string): void;
  /**
   * バッファを空にし、記録中を解除し、リスナーも全部外す。
   * リスナーが全部外れるので、呼び出し側（hook）はこの後の再購読を自分で行う前提になる。
   * 呼ぶのは散歩の終了・サインアウト・起動時だけで、いずれも hook 側も止まる（ADR-M-018）。
   */
  endSession(): void;
  /** TaskManager の executor 本体。throw しない。 */
  handleTaskData(data: unknown, error: unknown): void;
  /** リスナーを足す。戻り値で外す（何度呼んでも安全）。 */
  addListener(listener: LocationSampleListener): () => void;
  /** バッファの全サンプル。読めなければ []（onError に通知）。 */
  readSamples(): LocationSample[];
};

/**
 * TaskManager の executor 本体・記録中セッション・リスナー・バッファの読み書きを1つにまとめる。
 * ストレージを注入できるので、vitest ではメモリ実装でテストできる。
 * real は `backgroundLocationTask.ts` の singleton（ファイル実装）、mock は自前のインスタンス
 * （メモリ実装）を使い、同じ統合経路を mock でも通す（ADR-M-018）。
 *
 * `react-native` / `expo-*` を値 import しない。診断ログに座標を出さない。
 */
export function createBackgroundSampleHub(
  storage: SampleBufferStorage,
  options?: BackgroundSampleHubOptions,
): BackgroundSampleHub {
  const onError = options?.onError ?? ((event, detail) => logDiagnostic(event, detail));
  const now = options?.now ?? Date.now;
  let activeSessionId: string | null = null;
  /** 記録中セッションの開始時刻（ms）。これより前の測位時刻の点は前の散歩の残りとみなして捨てる。 */
  let sessionStartedAtMs = 0;
  const listeners = new Set<LocationSampleListener>();

  function clearBuffer(): void {
    try {
      storage.clear();
    } catch (error) {
      onError("location_sample_buffer_clear_failed", describeError(error));
    }
  }

  return {
    get activeSessionId() {
      return activeSessionId;
    },

    beginSession(sessionId) {
      clearBuffer();
      activeSessionId = sessionId;
      sessionStartedAtMs = now();
    },

    endSession() {
      clearBuffer();
      activeSessionId = null;
      listeners.clear();
    },

    handleTaskData(data, error) {
      if (error !== null && error !== undefined) {
        const code =
          typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
        onError("background_location_task_error", { code, ...describeError(error) });
        return;
      }
      // 記録中でなければ捨てる（アプリ起動直後に OS が前回のタスクを復元して届けた点など）。
      if (activeSessionId === null) return;

      const samples = toLocationSamples(data).filter(
        (sample) => sample.timestampMs >= sessionStartedAtMs,
      );
      if (samples.length === 0) return;

      try {
        storage.append(encodeLocationSamples(samples));
      } catch (e) {
        // 書けなくてもリスナーには配る（前面にいれば画面には反映される）。
        onError("location_sample_buffer_write_failed", describeError(e));
      }

      for (const listener of [...listeners]) {
        try {
          listener(samples);
        } catch (e) {
          onError("location_sample_listener_failed", describeError(e));
        }
      }
    },

    addListener(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    readSamples() {
      try {
        return decodeLocationSamples(storage.read()).filter(
          (sample) => sample.timestampMs >= sessionStartedAtMs,
        );
      } catch (error) {
        onError("location_sample_buffer_read_failed", describeError(error));
        return [];
      }
    },
  };
}
