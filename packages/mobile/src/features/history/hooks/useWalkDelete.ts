import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { ApiError } from "@/api/apiError";
import { deleteWalk } from "@/features/history/api/walkDeleteApi";
import {
  toWalkDeleteErrorCode,
  type WalkDeleteErrorCode,
} from "@/features/history/lib/walkDeleteError";
import type { WalkDeleteStatus } from "@/features/history/lib/walkDetailBodyState";
import { runWalkDeletionCleanup } from "@/lib/walkDeletionCleanup";

export type UseWalkDeleteOptions = {
  /** 削除成功（404 = 既に存在しない を含む）後に呼ばれる。画面側で遷移する。 */
  onDeleted: () => void;
};

export type UseWalkDeleteResult = {
  status: WalkDeleteStatus;
  errorCode: WalkDeleteErrorCode | null;
  /** 削除を実行する。walkId が null のときは何もしない。 */
  deleteWalk: () => void;
  /** 失敗状態を解除する（ダイアログを閉じるときに呼ぶ）。 */
  reset: () => void;
};

/**
 * `DELETE /walks/{id}` の mutation と、成功時のキャッシュ更新・ローカル後始末の配線。
 * 判定・整形は一切書かない（`lib/` に出す。hooks は Vitest 対象外のため）。
 */
export function useWalkDelete(
  walkId: string | null,
  options: UseWalkDeleteOptions,
): UseWalkDeleteResult {
  const queryClient = useQueryClient();

  // `onDeleted` は呼び出し側（画面）に `useCallback` を強制しないよう、毎レンダー最新の
  // 関数を ref に載せてから `onSuccess` で読む（`useScreenBack` の `interceptRef` と同じ手法）。
  const onDeletedRef = useRef(options.onDeleted);
  onDeletedRef.current = options.onDeleted;

  const mutation = useMutation({
    mutationFn: async () => {
      if (walkId === null) throw new ApiError(422);
      return deleteWalk(walkId);
    },
    onSuccess: () => {
      if (walkId === null) return;
      // 1) ローカルの保存待ちドラフト（client_walk_id）を捨てる。受け入れ条件6。
      runWalkDeletionCleanup(walkId);
      // 2) 削除した散歩の詳細キャッシュを捨てる（staleTime 1h / gcTime 2h のため、
      //    残すと後から同じ id を開いたときに消したはずの内容が一瞬出る）。
      //    queryKey は useWalkDetail（["walks","detail",walkId]）と必ず一致させる。
      queryClient.removeQueries({ queryKey: ["walks", "detail", walkId], exact: true });
      // 3) 一覧・最近の散歩・集計を更新する。受け入れ条件4（キーはこの形で固定）。
      void queryClient.invalidateQueries({ queryKey: ["walks"] });
      // 4) 画面側の遷移。
      onDeletedRef.current();
    },
    // 自動再試行はしない（ユーザー操作 = 破壊的操作なので、失敗はダイアログで見せて手動再試行させる）。
    retry: false,
  });

  const { mutate, reset: mutationReset } = mutation;

  // 命名について: ここでの `deleteWalkFn`（戻り値の `deleteWalk`）は「削除を開始する」トリガーで、
  // API 層の `deleteWalk()`（実際に DELETE を投げる async 関数）とは別物。
  const { isPending } = mutation;
  const deleteWalkFn = useCallback(() => {
    if (walkId === null) return;
    // 実行中の再入を弾く。ボタンは `disabled` で塞いであるが、`isPending` の反映は再レンダーを
    // 挟むため、同一フレーム内の連打では理論上2回 mutate されうる（破壊的操作なので構造で止める）。
    if (isPending) return;
    mutate();
  }, [walkId, isPending, mutate]);

  const reset = useCallback(() => {
    mutationReset();
  }, [mutationReset]);

  const status: WalkDeleteStatus = mutation.isPending
    ? "deleting"
    : mutation.isSuccess
      ? "deleted"
      : mutation.isError
        ? "error"
        : "idle";

  return {
    status,
    errorCode: mutation.isError ? toWalkDeleteErrorCode(mutation.error) : null,
    deleteWalk: deleteWalkFn,
    reset,
  };
}
