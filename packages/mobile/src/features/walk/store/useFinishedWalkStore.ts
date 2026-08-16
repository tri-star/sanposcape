import { create } from "zustand";

import type { FinishedWalk } from "@/features/walk/types";
import { registerSessionCleanup } from "@/lib/sessionCleanup";
import { registerWalkDeletionCleanup } from "@/lib/walkDeletionCleanup";

type FinishedWalkState = {
  finishedWalk: FinishedWalk | null;
  /**
   * 保存成功時のサーバー側 walk id。
   * backend の `POST /walks` は 200（冪等再送）/201（新規）のどちらでも `WalkRead` を返す契約になっており
   * （`packages/backend/src/sanposcape/walks/router.py`）、Orval が生成する
   * `createWalkWalksPostResponse200`/`201` もいずれも `data: WalkRead` を持つ。
   * `saveWalk()`（`api/walkApi.ts`）は常に非 null の `WalkRead` を返すため、
   * `markSaved` に渡る id が実質的に null になるケースは現状のコードパスには存在しない。
   * 型を `string | null` のまま維持しているのは、将来 backend の契約が変わった場合の防御のため。
   */
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
 *
 * サインアウト時は `clearFinishedWalk()` で必ずクリアする（`@/lib/sessionCleanup` に登録済み）。
 * 共有端末でアカウントを切り替えたとき、保存待ちの軌跡（機微な位置情報）が次のユーザーの
 * トークンで送信・上書きされる事故を防ぐため。
 * 削除時は `@/lib/walkDeletionCleanup` 経由で `savedWalkId` 一致時のみクリアする（下記参照）。
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

registerSessionCleanup(() => useFinishedWalkStore.getState().clearFinishedWalk());

// 保存済みの散歩がサーバーから削除されたら、同じ散歩のドラフト（= client_walk_id）を捨てる。
// 残したままだと再送で削除した散歩が復活しうる（ADR-003 決定13）。
// 比較対象は savedWalkId（サーバー採番 id）— DELETE のパスパラメータはサーバー id のため。
// savedWalkId が別の散歩の id、または null のときは何もしない
// （保存前の別ドラフトを巻き添えで消さない）。
registerWalkDeletionCleanup((walkId) => {
  const state = useFinishedWalkStore.getState();
  if (state.savedWalkId === walkId) {
    state.clearFinishedWalk();
  }
});
