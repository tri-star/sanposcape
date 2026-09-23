import { useCallback, useEffect, useRef, useReducer } from "react";

import { getApiBaseUrl } from "@/config/env";
import { deletePinPhotoUpload } from "@/features/pin/api/pinPhotoUploadApi";
import { transferPinPhoto } from "@/features/pin/api/pinPhotoTransfer";
import {
  nextPreuploadWork,
  photoDraftReducer,
  photoDraftSummary,
} from "@/features/pin/lib/photoDraft";
import type { PhotoDraftAction } from "@/features/pin/lib/photoDraft";
import {
  PIN_PHOTO_MAX_BYTES_HARD_CAP,
  PIN_PHOTO_PREUPLOAD_MAX,
} from "@/features/pin/lib/pinLimits";
import {
  isWaitablePhotoUploadError,
  toPhotoUploadErrorCode,
} from "@/features/pin/lib/photoUploadError";
import type { PhotoDraftItem } from "@/features/pin/types";
import { describeError, logDiagnostic } from "@/lib/diagnosticLog";
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
 *
 * ## 先行アップロードキューの設計（ローカルレビュー MR1/MR2 対応）
 *
 * 当初は `useEffect(() => {...}, [items, options.enabled])` で「`items` が変わるたびに
 * 次の仕事があるか確認する」実装だったが、これには **自己キャンセルのバグ** があった:
 * transfer 分岐は `await` に入る前に `dispatch({type:"uploadStarted"})` を呼ぶため、
 * その dispatch で `items` の参照が変わり、React が（ネットワーク応答より早く）
 * この effect 呼び出し自身の cleanup（`cancelled = true`）を実行してしまう。結果、
 * 転送が実際に成功/失敗しても `if (cancelled) return;` で握りつぶされ、写真が
 * `uploading`/`processing` のまま永久に止まっていた。
 *
 * この設計では、キューの進行を **React の effect 依存配列ではなく、明示的な `kick()` 呼び出し**
 * で駆動する。`kick()` は状態が変わりうるすべての操作（`dispatch` 経由のすべて）から呼ばれ、
 * 「今すぐ次の仕事を1つ処理する」ループ（`runLoop`）を起こす。ループはコンポーネントの
 * 再レンダーやエフェクトの再評価とは独立しており、**自分自身の dispatch で止まることがない**
 * （停止条件は `stoppedRef`＝アンマウントのみ）。
 *
 * また `dispatch` 自身が `itemsRef.current` を `photoDraftReducer` で同期的に進めてから
 * `reactDispatch`（`useReducer` 本来の dispatch。UI 再レンダー用）を呼ぶため、
 * `getItems()`（`runPinSave` が await をまたいで読む）は **dispatch 直後に必ず最新の状態を
 * 返す**（MR2: `useReducer` の state は React のバッチ処理に従うため、素の `itemsRef.current = items`
 * では dispatch 直後に古い配列が残ることがあった）。
 */
export function usePinPhotos(options: {
  enabled: boolean;
  onPickerError: (message: string) => void;
}): UsePinPhotosResult {
  const [items, reactDispatch] = useReducer(photoDraftReducer, [] as PhotoDraftItem[]);

  // dispatch のたびに photoDraftReducer をここでも適用し、useReducer の内部状態と
  // 常に同じ結果になるよう同期させる「真実の最新値」。runPinSave が await をまたいで
  // 読む getItems() はこの ref を返す。
  const itemsRef = useRef<PhotoDraftItem[]>(items);

  const enabledRef = useRef(options.enabled);
  enabledRef.current = options.enabled;

  const pausedRef = useRef(false);
  const stoppedRef = useRef(false);
  const busyRef = useRef(false);
  const pendingKickRef = useRef(false);
  const loopPromiseRef = useRef<Promise<void>>(Promise.resolve());
  /** 先行アップロードのキューが今まさに転送中のアイテム（MR5: 削除時に abort するため）。 */
  const activeTransferRef = useRef<{ localId: string; controller: AbortController } | null>(null);
  /**
   * PR #93 T11: `uploaded` の写真を削除したとき、`deletePinPhotoUpload` が成功するまで
   * （または失敗して諦めるまで）backend の枠がまだ残っているとみなして数え続ける「幽霊枠」の
   * 個数。`removed` で state からは消えるため `heldUploadSlots(items)` はこの分を数えなく
   * なるが、backend 側は削除が確定するまで未使用枠を占有し続ける。この差分を
   * `nextPreuploadWork` の `extraHeldSlots` に渡すことで、削除が失敗し続けても先行
   * アップロードがローカルの上限（`PIN_PHOTO_PREUPLOAD_MAX`）を超えて枠を発行しないようにする。
   */
  const heldGhostSlotsRef = useRef(0);

  const getItems = useCallback((): readonly PhotoDraftItem[] => itemsRef.current, []);

  const dispatch = useCallback((action: PhotoDraftAction) => {
    // PR #93 T10: アンマウント後（stoppedRef）に await から戻ってきた processWork が
    // dispatch を呼ぶと、破棄済みコンポーネントの reactDispatch（useReducer 本来の dispatch）を
    // 呼ぶことになる。React 18 では警告も実害も無いが、意図しない状態更新を避けるため抑止する。
    if (stoppedRef.current) return;
    itemsRef.current = photoDraftReducer(itemsRef.current, action);
    reactDispatch(action);
    kick();
    // kick/runLoop/processWork は ref だけを参照する関数宣言（hoisting により参照可能）。
    // この useCallback は初回レンダーで一度だけ作られ、以後もその時点の kick を呼び続けるが、
    // kick 自身は毎回 ref の最新値を読むため動作は変わらない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** キューに「今すぐ次の仕事を確認して」と伝える。処理中なら完了後に再確認する。 */
  function kick(): void {
    if (stoppedRef.current) return;
    if (busyRef.current) {
      pendingKickRef.current = true;
      return;
    }
    busyRef.current = true;
    loopPromiseRef.current = runLoop().finally(() => {
      busyRef.current = false;
      if (pendingKickRef.current) {
        pendingKickRef.current = false;
        kick();
      }
    });
  }

  /** 次の仕事が無くなるまで、または停止/一時停止に達するまで1件ずつ直列に処理する。 */
  async function runLoop(): Promise<void> {
    for (;;) {
      if (stoppedRef.current || !enabledRef.current) return;
      const work = nextPreuploadWork(itemsRef.current, {
        limit: PIN_PHOTO_PREUPLOAD_MAX,
        paused: pausedRef.current,
        extraHeldSlots: heldGhostSlotsRef.current,
      });
      if (work === null) return;
      await processWork(work);
    }
  }

  async function processWork(work: {
    kind: "prepare" | "transfer";
    item: PhotoDraftItem;
  }): Promise<void> {
    if (work.kind === "prepare") {
      // NOTE: expo-image-manipulator は現状キャンセルをサポートしないため、prepare には
      // AbortSignal を渡さない（意図的な非対称性。アンマウント後の dispatch は itemsRef から
      // 消えた localId に対して no-op になるので実害は無い）。
      try {
        const prepared = await photoService.prepareForUpload(work.item.picked);
        // PR #93 T9: 「上限の正は枠発行応答の max_byte_size」という設計（ADR-010 決定3）に
        // 反して、ここで固定 10 MiB 判定をしていたため、backend の上限を引き上げても枠発行前に
        // 失敗していた。ここでは極端な値だけを足切りし、通常の上限判定は枠発行後
        // （`pinPhotoTransfer.ts`）に委ねる。
        if (prepared.byteSize > PIN_PHOTO_MAX_BYTES_HARD_CAP) {
          dispatch({ type: "failed", localId: work.item.localId, errorCode: "too_large" });
        } else {
          dispatch({ type: "prepared", localId: work.item.localId, prepared });
        }
      } catch (error) {
        logDiagnostic("pin-photo.prepare.failed", {
          localId: work.item.localId,
          ...describeError(error),
        });
        dispatch({ type: "failed", localId: work.item.localId, errorCode: "processing_failed" });
      }
      return;
    }

    // transfer
    const preparedPhoto = work.item.prepared;
    if (preparedPhoto === null) {
      // 起こらないはず（waiting は必ず prepared を伴う）。型の防波堤。
      dispatch({ type: "failed", localId: work.item.localId, errorCode: "processing_failed" });
      return;
    }

    dispatch({ type: "uploadStarted", localId: work.item.localId });
    const controller = new AbortController();
    activeTransferRef.current = { localId: work.item.localId, controller };
    try {
      const uploadId = await withTimeout(
        (signal) =>
          transferPinPhoto(
            { localId: work.item.localId, prepared: preparedPhoto },
            { signal, apiBaseUrl: getApiBaseUrl() },
          ),
        controller,
        TRANSFER_TIMEOUT_MS,
      );
      dispatch({ type: "uploaded", localId: work.item.localId, uploadId });
    } catch (error) {
      const code = toPhotoUploadErrorCode(error);
      // 分類結果（UI の文言はここから決まる）と生の例外を1行で対応付ける。`withTimeout` の
      // タイムアウトと RN の通信失敗はどちらも "network" になるため、`errorMessage`
      // （"Pin photo transfer timed out" か否か）が唯一の見分け方になる。
      logDiagnostic("pin-photo.upload.failed", {
        localId: work.item.localId,
        code,
        ...describeError(error),
      });
      if (isWaitablePhotoUploadError(code)) {
        // 429: この画面では以後、先行アップロードの枠発行をしない（放棄された未使用枠が
        // 他所に残っている可能性が高く、粘っても空かない）。残りは保存フローが送る。
        dispatch({ type: "waited", localId: work.item.localId });
        pausedRef.current = true;
      } else {
        // 意図的な abort（MR5 の削除・アンマウント）も含めここに来るが、対象の localId は
        // 既に itemsRef から消えているため reducer が no-op にする（実害は無い）。
        dispatch({ type: "failed", localId: work.item.localId, errorCode: code });
      }
    } finally {
      if (activeTransferRef.current?.localId === work.item.localId) {
        activeTransferRef.current = null;
      }
    }
  }

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

  // enabled が false → true になったとき（通常は起きないが念のため）にもキューを起こす。
  useEffect(() => {
    if (options.enabled) kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kick は ref だけを参照する安定した関数
  }, [options.enabled]);

  // アンマウント時: キューを完全に停止し、進行中の fetch を中断する。
  useEffect(
    () => () => {
      stoppedRef.current = true;
      activeTransferRef.current?.controller.abort();
    },
    [],
  );

  const addPhotos = useCallback(
    async (source: PhotoSource) => {
      if (!enabledRef.current) return;
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
    [dispatch, options],
  );

  const removePhoto = useCallback(
    (localId: string) => {
      const removedItem = itemsRef.current.find((item) => item.localId === localId);
      dispatch({ type: "removed", localId });
      // MR5: 削除した写真がまさに転送中なら fetch を中断する（通信量・バッテリーの節約。
      // reducer は既に存在しない localId への dispatch を no-op にするため、結果自体には
      // 影響しない）。
      if (activeTransferRef.current?.localId === localId) {
        activeTransferRef.current.controller.abort();
      }
      // PR #93 T11: `uploaded`（未紐付け）の写真を削除したら backend の枠も best-effort で
      // 解放する。呼んでおかないと backend 側は紐付け期限（6時間）まで枠を占有し続け、
      // 追加・削除を繰り返すと実際にはどれも使っていないのに未使用枠の上限（429）に
      // 達してしまう（handover-notes.md T11）。
      if (removedItem?.status === "uploaded" && removedItem.uploadId !== null) {
        const uploadId = removedItem.uploadId;
        heldGhostSlotsRef.current += 1;
        deletePinPhotoUpload(uploadId)
          .then(() => {
            // 解放できた分は幽霊枠から外し、先行アップロードのキューに再確認させる
            // （直前まで上限で止まっていた場合、これで次の1件が動き出せる）。
            heldGhostSlotsRef.current = Math.max(0, heldGhostSlotsRef.current - 1);
            kick();
          })
          .catch(() => {
            // 失敗時は諦めて幽霊枠のまま数え続ける（backend の紐付け期限＝6時間が
            // 実質的な上限。この hook のライフサイクル中は楽観的に解放しない＝安全側）。
          });
      }
    },
    // kick は ref だけを参照する安定した関数（上の dispatch と同じ理由）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch],
  );

  const retryPhoto = useCallback(
    (localId: string) => {
      dispatch({ type: "retried", localId });
    },
    [dispatch],
  );

  const pauseAndAwaitIdle = useCallback(async () => {
    pausedRef.current = true;
    // busyRef が false になるまで、その時点の loopPromiseRef を待ち続ける（kick が完了直後に
    // 自分自身を再起動する可能性があるため、単発の await では不十分）。
    while (busyRef.current) {
      await loopPromiseRef.current;
    }
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    kick();
    // kick は ref だけを参照する（上の dispatch と同じ理由）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
