import { create } from "zustand";

import type { FinishedWalk } from "@/features/walk/types";
import { registerSessionCleanup } from "@/lib/sessionCleanup";

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
  /**
   * サマリ画面の CTA（`walk-summary-save-sign-in`）から「保存目的でサインインした」という
   * 明示的な意思表示。初期値 false。
   *
   * なぜこのフラグが要るか: `runSignIn` はどこから来たサインインかを直接は知らないため、
   * 何もガードが無いと「共有端末でゲストが散歩を保存できず放置 → 全く別の人物が無関係な導線
   * （設定画面など）からサインイン」しただけで、放置されていた他人の軌跡（機微な位置情報）が
   * そのサインインしたユーザーのアカウントへ無確認で保存されてしまう
   * （SS-37 ローカルレビュー Security High 対応）。このフラグは「サマリの CTA を押した」という
   * 事実だけを記録し、`nextWalkSaveFireKey`（`lib/walkSaveTrigger.ts`）・
   * `getPostSignInDestination`（`features/auth/lib/postSignInDestination.ts`）が
   * 「認証状態の変化による自動再送・サマリへの強制復帰」を許可するかどうかの唯一のゲートに使う。
   */
  signInForSaveRequested: boolean;
  finishWalk: (walk: FinishedWalk) => void;
  markSaved: (walkId: string | null) => void;
  clearFinishedWalk: () => void;
  /** サマリ画面の CTA から呼ぶ。保存目的のサインインであることを記録する（SS-37）。 */
  requestSignInForSave: () => void;
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
 */
export const useFinishedWalkStore = create<FinishedWalkState>((set) => ({
  finishedWalk: null,
  savedWalkId: null,
  saved: false,
  signInForSaveRequested: false,
  // 前回の保存結果・意思表示を持ち越さない（新しい散歩を積んだら常にリセットする）。
  finishWalk: (walk) =>
    set({ finishedWalk: walk, savedWalkId: null, saved: false, signInForSaveRequested: false }),
  // 保存が完了したら意思表示も役目を終えるのでリセットする（次にドラフトが積まれるまで再送は起きない）。
  markSaved: (walkId) => set({ saved: true, savedWalkId: walkId, signInForSaveRequested: false }),
  clearFinishedWalk: () =>
    set({ finishedWalk: null, savedWalkId: null, saved: false, signInForSaveRequested: false }),
  requestSignInForSave: () => set({ signInForSaveRequested: true }),
}));

registerSessionCleanup(() => useFinishedWalkStore.getState().clearFinishedWalk());
