export type PostSignInDestination = "/walk-start" | "/(tabs)";

/**
 * サインイン成功後の遷移先を、進行中の散歩の有無から決める（SS-57 ローカルレビュー対応）。
 *
 * SS-57 でゲスト散歩を解禁するまでは無条件に `/walk-start`（散歩開始前の計画画面）へ `replace`
 * していたが、guest が保護ルート全体（散歩中画面・設定画面を含む）に入れるようになった結果、
 * 「散歩中タブの歯車 → 設定 → guest向けサインイン導線 → Google サインイン成功」という経路が
 * 新たに生まれた。`WalkStartView.handleStartWalk` は既存の `activeWalk` の有無チェックや確認
 * ダイアログなしに `startWalk()` するため、無条件に `/walk-start` へ送ると、進行中の散歩が
 * 見えない画面に飛ばされ、気づかず「散歩を始める」を押すと**進行中の散歩が無警告で上書きされる**。
 *
 * 進行中の散歩があるときは `/(tabs)`（`WalkStartView.HOME_HREF` と同じ既定ホーム）へ戻す。
 * `WalkActiveView`（散歩中画面）がそのまま表示され、進行中の散歩を隠さない。
 */
export function getPostSignInDestination(hasActiveWalk: boolean): PostSignInDestination {
  return hasActiveWalk ? "/(tabs)" : "/walk-start";
}
