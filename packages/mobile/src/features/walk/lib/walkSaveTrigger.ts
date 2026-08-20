/**
 * 「保存（`POST /walks`）を自動発火すべきか」の判定（純粋関数）。
 *
 * `useWalkSave` の `useEffect` は「同じドラフト × 同じ認証状態につき1回だけ」自動発火する
 * （ADR-008 決定4 の SS-37 追補）。ゲストで 401 になったドラフトはサインイン後
 * （guest → signed-in）にもう一度だけ自動発火してほしいため、発火済みかどうかの
 * 判定キーに `clientWalkId` だけでなく `isSignedIn` を含める。
 *
 * **SS-37 ローカルレビュー Security High 対応**: 認証状態の変化による再発火は、
 * `signInForSaveRequested`（サマリ画面の CTA から明示的にサインインした意思表示。
 * `useFinishedWalkStore` 参照）が true のときだけ許可する。これが無いと、共有端末で
 * 「ゲストが保存に失敗して放置」→「別人が無関係な導線（設定画面など）からサインイン」
 * しただけで、放置されていた他人の軌跡が無確認でそのアカウントに保存されてしまう。
 */

/** 自動発火の重複判定キー。「どのドラフトを、どの認証状態で投げたか」を1つの文字列で表す。 */
export function walkSaveFireKey(clientWalkId: string, isSignedIn: boolean): string {
  return `${clientWalkId}:${isSignedIn ? "signed-in" : "guest"}`;
}

export type WalkSaveFireInput = {
  /**
   * 保存対象ドラフトの clientWalkId。ドラフトが無ければ null。
   * **不変条件**: `src/lib/uuid.ts` の `randomUuidV4()` 由来（16進とハイフンのみ）で `:` を
   * 含まないことを前提にしている。型では守れないため、`clientWalkId` の生成元を変える場合は
   * この不変条件が崩れないか確認すること（崩れるとキーの文字列連結が別の組と衝突しうる。
   * CQ Medium 対応）。
   */
  clientWalkId: string | null;
  /** 保存済み（`useFinishedWalkStore.saved`）。 */
  saved: boolean;
  /** 認証済みか。`app/walk-summary.tsx` が `useAuthSessionStore` から注入する。 */
  isSignedIn: boolean;
  /** 直近に発火したキー（未発火なら null）。 */
  lastFiredKey: string | null;
  /**
   * サマリ画面の CTA から「保存目的でサインインした」意思表示（`useFinishedWalkStore.signInForSaveRequested`）。
   * 同じドラフトへの認証状態変化による再発火（guest→signed-in 等）を許可するかどうかの唯一のゲート。
   * 初回発火・新しいドラフトへの切り替わりには影響しない（SS-37 ローカルレビュー対応）。
   */
  signInForSaveRequested: boolean;
};

/**
 * 自動発火すべきなら「今回のキー」を、不要なら null を返す（純粋）。
 *
 * ルールは非対称:
 * 1. **初回発火（`lastFiredKey === null`）は無条件で発火する**。サインイン済みユーザーが
 *    通常どおり散歩を終えた場合に保存が走らなくなると本末転倒なため、意思表示の有無を問わない。
 * 2. **同じドラフトへの認証状態の変化による再発火は `signInForSaveRequested === true` の
 *    ときだけ許可する**（SS-37 ローカルレビュー Security High 対応）。ゲストで 401 になった
 *    ドラフトは、サマリ画面の CTA から明示的にサインインした場合に限り、サインイン後
 *    （guest → signed-in）にもう一度だけ自動発火する。CTA を経由しない無関係なサインイン
 *    （設定画面など）では、共有端末で他人が残したドラフトが黙って保存されないよう発火しない。
 * 3. **別ドラフトへの切り替わりは無条件で発火する**（意思表示の対象外。新しいドラフトの
 *    初回発火に相当するため）。`lastFiredKey` が今回の `clientWalkId` に属するキーかどうかを
 *    `startsWith` で判定する（`clientWalkId` が `:` を含まない前提。上記 `WalkSaveFireInput`
 *    の不変条件を参照）。
 *
 * 逆向き（signed-in → guest）の再発火は、上記ルール2 によって `signInForSaveRequested` が
 * false のままなら発火しない。実際にはこの遷移は `useAuthSessionStore.setSession()` が
 * `runSessionCleanup()`（`useFinishedWalkStore.clearFinishedWalk()` を含む）を**同期的に
 * 先に**実行するため、`isSignedIn` が false に変わる時点で `finishedWalk` は既に null になっており、
 * `useWalkSave` の早期 return に阻まれてこの関数自体に到達しない（呼び出し側の実装に基づく事実。
 * CQ Low 対応で理由づけを実態に合わせた）。
 */
export function nextWalkSaveFireKey(input: WalkSaveFireInput): string | null {
  if (input.clientWalkId === null) return null;
  if (input.saved) return null;
  const key = walkSaveFireKey(input.clientWalkId, input.isSignedIn);
  if (key === input.lastFiredKey) return null;
  if (input.lastFiredKey === null) return key; // 初回発火は無条件（ルール1）
  const isSameDraftReFire = input.lastFiredKey.startsWith(`${input.clientWalkId}:`);
  if (isSameDraftReFire && !input.signInForSaveRequested) return null; // ルール2
  return key; // ルール3（別ドラフト）またはルール2で意思表示ありのケース
}
