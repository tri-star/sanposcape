import { useCallback, useEffect, useRef, useReducer } from "react";

import { getApiBaseUrl } from "@/config/env";
import { transferPinPhoto } from "@/features/pin/api/pinPhotoTransfer";
import {
  nextPreuploadWork,
  photoDraftReducer,
  photoDraftSummary,
} from "@/features/pin/lib/photoDraft";
import type { PhotoDraftAction } from "@/features/pin/lib/photoDraft";
import {
  PIN_PHOTO_MAX_BYTES_FALLBACK,
  PIN_PHOTO_PREUPLOAD_MAX,
} from "@/features/pin/lib/pinLimits";
import {
  isWaitablePhotoUploadError,
  toPhotoUploadErrorCode,
} from "@/features/pin/lib/photoUploadError";
import type { PhotoDraftItem } from "@/features/pin/types";
import { randomUuidV4 } from "@/lib/uuid";
import { photoService } from "@/services/photo";
import { isPhotoError, photoErrorMessage } from "@/services/photo/photoError";
import type { PhotoSource } from "@/services/photo/types";

/** 1件の転送（枠発行 → 直送）に許すタイムアウト。expo の fetch は既定でタイムアウトしない。 */
const TRANSFER_TIMEOUT_MS = 60_000;

export type UsePinPhotosResult = {
  items: PhotoDraftItem[];
  summary: ReturnType<typeof photoDraftSummary>;
  addPhotos: (source: PhotoSource) => Promise<void>;
  removePhoto: (localId: string) => void;
  retryPhoto: (localId: string) => void;
  /** 保存フロー（runPinSave）に渡す部品。 */
  saveBridge: {
    getItems: () => readonly PhotoDraftItem[];
    dispatch: (action: PhotoDraftAction) => void;
    transferPhoto: (item: PhotoDraftItem) => Promise<string>;
    /** 先行アップロードを止め、進行中の1件が終わるまで待つ。 */
    pauseAndAwaitIdle: () => Promise<void>;
    /** 保存フローが終わった（成功・失敗とも）ら先行アップロードを再開してよい。 */
    resume: () => void;
  };
};

/**
 * `controller` の signal を渡した `factory` を実行し、`ms` 経過したら abort してタイムアウトにする。
 * タイムアウト時は `TypeError`（network 扱い。`toPhotoUploadErrorCode` が "network" に分類する）で
 * reject する。`factory` 自身の失敗（`ApiError` / `S3UploadError` 等）はそのまま伝播させる
 * （`Promise.race` でどちらが先に決着するかだけを見るため、エラーの中身をここで書き換えない）。
 *
 * 呼び出し元は `cancelled`（アンマウント・アイテム削除等での意図的な中断）をこの結果より
 * **先に**チェックすること（このタイムアウト機構はキャンセル理由を区別しない）。
 */
function withTimeout<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  controller: AbortController,
  ms: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TypeError("Pin photo transfer timed out"));
    }, ms);
  });
  // factory 側が abort で reject しても race の勝者（timeoutPromise）は既に決まっているため、
  // unhandled rejection にならないよう空の catch を付けておく。
  const factoryPromise = factory(controller.signal);
  factoryPromise.catch(() => {});
  return Promise.race([factoryPromise, timeoutPromise]).finally(() => clearTimeout(timer));
}

/**
 * 写真の選択・加工・先行アップロードを管理する hook。
 * `photoService` を呼ぶのはこの hook だけ（単体テストは `createMockPhotoService()` を直接
 * import し、`@/services/photo`（バレル）は `.test.ts` から import しない）。
 */
export function usePinPhotos(options: {
  enabled: boolean;
  onPickerError: (message: string) => void;
}): UsePinPhotosResult {
  const [items, dispatch] = useReducer(photoDraftReducer, [] as PhotoDraftItem[]);

  // runPinSave が await をまたいで最新の状態を読めるようにする（クロージャの陳腐化対策）。
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const pausedRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const getItems = useCallback((): readonly PhotoDraftItem[] => itemsRef.current, []);

  const transferPhotoForSave = useCallback(async (item: PhotoDraftItem): Promise<string> => {
    if (item.prepared === null) {
      throw new TypeError("Pin photo is not prepared yet");
    }
    const prepared = item.prepared;
    const controller = new AbortController();
    return withTimeout(
      (signal) =>
        transferPinPhoto(
          { localId: item.localId, prepared },
          { signal, apiBaseUrl: getApiBaseUrl() },
        ),
      controller,
      TRANSFER_TIMEOUT_MS,
    );
  }, []);

  // 先行アップロードのキュー（同時実行1）。`items` が変わるたびに次の仕事があるか確認する。
  useEffect(() => {
    if (!options.enabled) return;
    if (inFlightRef.current !== null) return;

    const work = nextPreuploadWork(items, {
      limit: PIN_PHOTO_PREUPLOAD_MAX,
      paused: pausedRef.current,
    });
    if (work === null) return;

    let cancelled = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const run = async () => {
      if (work.kind === "prepare") {
        try {
          const prepared = await photoService.prepareForUpload(work.item.picked);
          if (cancelled) return;
          if (prepared.byteSize > PIN_PHOTO_MAX_BYTES_FALLBACK) {
            dispatch({ type: "failed", localId: work.item.localId, errorCode: "too_large" });
          } else {
            dispatch({ type: "prepared", localId: work.item.localId, prepared });
          }
        } catch {
          if (cancelled) return;
          dispatch({ type: "failed", localId: work.item.localId, errorCode: "processing_failed" });
        }
        return;
      }

      // transfer
      dispatch({ type: "uploadStarted", localId: work.item.localId });
      try {
        const preparedPhoto = work.item.prepared;
        if (preparedPhoto === null) {
          throw new TypeError("Pin photo is not prepared yet");
        }
        const uploadId = await withTimeout(
          (signal) =>
            transferPinPhoto(
              { localId: work.item.localId, prepared: preparedPhoto },
              { signal, apiBaseUrl: getApiBaseUrl() },
            ),
          controller,
          TRANSFER_TIMEOUT_MS,
        );
        if (cancelled) return;
        dispatch({ type: "uploaded", localId: work.item.localId, uploadId });
      } catch (error) {
        // アンマウント・削除等での意図的な中断はここで無視する（cancelled のみで判定し、
        // abort の理由は問わない）。
        if (cancelled) return;
        const code = toPhotoUploadErrorCode(error);
        if (isWaitablePhotoUploadError(code)) {
          // 429: この画面では以後、先行アップロードの枠発行をしない（放棄された未使用枠が
          // 他所に残っている可能性が高く、粘っても空かない）。残りは保存フローが送る。
          dispatch({ type: "waited", localId: work.item.localId });
          pausedRef.current = true;
        } else {
          // isTransientPhotoUploadError も含め、再試行ボタンで拾う（`失敗` 表示にする）。
          dispatch({ type: "failed", localId: work.item.localId, errorCode: code });
        }
      }
    };

    const task = run().finally(() => {
      if (inFlightRef.current === task) {
        inFlightRef.current = null;
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    });
    inFlightRef.current = task;

    return () => {
      cancelled = true;
    };
  }, [items, options.enabled]);

  // アンマウント時: 進行中の fetch を中断する。
  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  const addPhotos = useCallback(
    async (source: PhotoSource) => {
      if (!options.enabled) return;
      try {
        const picked = await photoService.pickPhotos({ source, selectionLimit: 0 });
        if (picked.length === 0) return;
        dispatch({
          type: "added",
          items: picked.map((photo) => ({ localId: randomUuidV4(), picked: photo })),
        });
      } catch (error) {
        if (isPhotoError(error)) {
          options.onPickerError(photoErrorMessage(error.code));
        } else {
          options.onPickerError(photoErrorMessage("unknown"));
        }
      }
    },
    [options],
  );

  const removePhoto = useCallback((localId: string) => {
    dispatch({ type: "removed", localId });
  }, []);

  const retryPhoto = useCallback((localId: string) => {
    dispatch({ type: "retried", localId });
  }, []);

  const pauseAndAwaitIdle = useCallback(async () => {
    pausedRef.current = true;
    await inFlightRef.current;
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
  }, []);

  return {
    items,
    summary: photoDraftSummary(items),
    addPhotos,
    removePhoto,
    retryPhoto,
    saveBridge: {
      getItems,
      dispatch,
      transferPhoto: transferPhotoForSave,
      pauseAndAwaitIdle,
      resume,
    },
  };
}
