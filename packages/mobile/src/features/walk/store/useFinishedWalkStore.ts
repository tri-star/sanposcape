import { create } from "zustand";

import type { FinishedWalk } from "@/features/walk/types";

type FinishedWalkState = {
  finishedWalk: FinishedWalk | null;
  /** 保存成功時のサーバー側 walk id。200 replay で本文が取れなければ null のまま。 */
  savedWalkId: string | null;
  /** 保存済みかどうか（savedWalkId が取れないケースがあるので独立させる）。 */
  saved: boolean;
  finishWalk: (walk: FinishedWalk) => void;
  markSaved: (walkId: string | null) => void;
  clearFinishedWalk: () => void;
};

/**
 * 「終了したが保存が確定していない散歩」を画面（散歩中 → サマリ）をまたいで保持するストア。
 * `useActiveWalkStore` とは責務が異なるためファイルを分ける
 * （こちらはサーバーへの保存対象そのものを一時的に持つ）。
 *
 * `docs/folder-structure.md` の「サーバー由来データは置かない」規律に対する例外は
 * `savedWalkId` のみ（識別子1つ。SS-20 の詳細遷移で使えるようにするため）。
 * 散歩の内容そのもの（`WalkRead`）は入れない。
 *
 * **永続化しない**（AsyncStorage / SecureStore を使わない）。ADR-008 の「永続化しない」判断を踏襲する。
 * そのため、保存前にアプリを強制終了する／サマリ画面に到達する前にクラッシュすると、
 * この散歩の記録は失われる（永続化は SS-19 のスコープ外。フォローアップとして
 * 「進行中の散歩と未送信の散歩記録をローカル永続化する」課題を別途起票する想定。
 * 着手時は ADR-008 の追補が必要）。
 *
 * 画面外（`ScreenCatalog` のような非 React コンテキスト）からは
 * `useFinishedWalkStore.getState().finishWalk(...)` を使える。
 */
export const useFinishedWalkStore = create<FinishedWalkState>((set) => ({
  finishedWalk: null,
  savedWalkId: null,
  saved: false,
  // 前回の保存結果を持ち越さない（新しい散歩を積んだら常にリセットする）。
  finishWalk: (walk) => set({ finishedWalk: walk, savedWalkId: null, saved: false }),
  markSaved: (walkId) => set({ saved: true, savedWalkId: walkId }),
  clearFinishedWalk: () => set({ finishedWalk: null, savedWalkId: null, saved: false }),
}));
