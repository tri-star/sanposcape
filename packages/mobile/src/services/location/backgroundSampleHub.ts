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
};

export type BackgroundSampleHub = {
  /** 記録中のセッション。記録していなければ null。 */
  readonly activeSessionId: string | null;
  /** バッファを空にし、sessionId を記録中にする。 */
  beginSession(sessionId: string): void;
  /** バッファを空にし、記録中を解除し、リスナーも全部外す。 */
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
  let activeSessionId: string | null = null;
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
    },

    endSession() {
      clearBuffer();
      activeSessionId = null;
      listeners.clear();
    },

    handleTaskData(data, error) {
      if (error !== null && error !== undefined) {
        const code =
          typeof error === "object" && "code" in error
            ? (error as { code: unknown }).code
            : undefined;
        onError("background_location_task_error", { code, ...describeError(error) });
        return;
      }
      // 記録中でなければ捨てる（アプリ起動直後に OS が前回のタスクを復元して届けた点など）。
      if (activeSessionId === null) return;

      const samples = toLocationSamples(data);
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
        return decodeLocationSamples(storage.read());
      } catch (error) {
        onError("location_sample_buffer_read_failed", describeError(error));
        return [];
      }
    },
  };
}
