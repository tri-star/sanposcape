import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { ApiError } from "@/api/apiError";
import { saveWalk } from "@/features/walk/api/walkApi";
import { buildWalkCreateRequest } from "@/features/walk/lib/walkCreateRequest";
import { isRetriableWalkSaveError, toWalkSaveErrorCode } from "@/features/walk/lib/walkSaveError";
import type { WalkSaveErrorCode } from "@/features/walk/lib/walkSaveError";
import { nextWalkSaveFireKey } from "@/features/walk/lib/walkSaveTrigger";
import { useFinishedWalkStore } from "@/features/walk/store/useFinishedWalkStore";
import type { FinishedWalk, WalkSaveStatus } from "@/features/walk/types";

export type UseWalkSaveOptions = {
  /**
   * 認証済みか。`app/walk-summary.tsx` が `useAuthSessionStore` から読んで注入する。
   * `features/walk` は認証状態を直接見ない（ADR-009 決定8）。
   */
  isSignedIn: boolean;
};

export type UseWalkSaveResult = {
  status: WalkSaveStatus;
  errorCode: WalkSaveErrorCode | null;
  /** 手動再試行。error のときだけ意味を持つ。 */
  retry: () => void;
};

/** 自動再試行の最大回数（初回 + この回数まで）。 */
const MAX_RETRY_COUNT = 2;
const RETRY_DELAY_BASE_MS = 1000;
const RETRY_DELAY_MAX_MS = 8000;

/**
 * 散歩記録の保存（POST /walks）を実行し、状態と再試行手段を提供する hook。
 * `finishedWalk` が渡され、まだ保存済みでなければ**同じドラフト × 同じ認証状態につき1回だけ**
 * 自動発火する（`nextWalkSaveFireKey` が判定する。`useRef` に発火済みキーを記録して
 * StrictMode の二重実行を防ぐ。万一二重発火しても `client_walk_id` の冪等性で履歴は増えない）。
 * ゲストで 401 になった後にサインインすると、認証状態が変わるのでもう一度だけ発火する（SS-37）。
 * ただしこの再発火は、サマリ画面の CTA から明示的にサインインした場合（`signInForSaveRequested`）
 * に限る。無関係な導線（設定画面など）からのサインインでは再発火しない（共有端末での誤混入防止。
 * SS-37 ローカルレビュー Security High 対応）。
 *
 * `buildWalkCreateRequest` が null を返すケース（保存不能）は `ApiError(422)` を投げて
 * ネットワークに出さずに即エラーにする（既存の分類関数をそのまま使えるため）。
 *
 * 401 は `customFetch` 側で refresh → 1回だけ再送済みのため、ここでは再試行しない
 * （`isRetriableWalkSaveError` が false を返す）。ゲスト（トークン非保持）の場合は
 * `authTokenProvider.getAccessToken()` が null を返すため refresh 再送も走らず、
 * 素通しで 401 になる。
 */
export function useWalkSave(
  finishedWalk: FinishedWalk | null,
  { isSignedIn }: UseWalkSaveOptions,
): UseWalkSaveResult {
  const saved = useFinishedWalkStore((state) => state.saved);
  const markSaved = useFinishedWalkStore((state) => state.markSaved);
  // サマリの CTA から来たサインインかどうか（SS-37 ローカルレビュー対応）。
  // 認証状態の変化による自動再発火を許可するかどうかの唯一のゲートとして `nextWalkSaveFireKey` に渡す。
  const signInForSaveRequested = useFinishedWalkStore((state) => state.signInForSaveRequested);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (draft: FinishedWalk) => {
      const request = buildWalkCreateRequest(draft);
      if (request === null) {
        throw new ApiError(422);
      }
      return saveWalk(request);
    },
    onSuccess: (walk) => {
      markSaved(walk.id);
      void queryClient.invalidateQueries({ queryKey: ["walks"] });
    },
    retry: (failureCount, error) =>
      failureCount < MAX_RETRY_COUNT && isRetriableWalkSaveError(toWalkSaveErrorCode(error)),
    retryDelay: (attemptIndex) =>
      Math.min(RETRY_DELAY_BASE_MS * 2 ** attemptIndex, RETRY_DELAY_MAX_MS),
  });

  const { mutate } = mutation;
  const firedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (finishedWalk === null) return;
    const key = nextWalkSaveFireKey({
      clientWalkId: finishedWalk.clientWalkId,
      saved,
      isSignedIn,
      lastFiredKey: firedKeyRef.current,
      signInForSaveRequested,
    });
    if (key === null) return;
    firedKeyRef.current = key;
    mutate(finishedWalk);
  }, [finishedWalk, saved, isSignedIn, signInForSaveRequested, mutate]);

  const retry = () => {
    if (finishedWalk === null) return;
    mutate(finishedWalk);
  };

  const status: WalkSaveStatus = saved
    ? "saved"
    : mutation.isPending
      ? "saving"
      : mutation.isError
        ? "error"
        : "idle";

  return {
    status,
    errorCode: mutation.isError ? toWalkSaveErrorCode(mutation.error) : null,
    retry,
  };
}
