/**
 * 「戻る」操作を受けたときに何をするかの判定を、`react-native` / `expo-router` に依存しない
 * 純粋関数へ切り出したもの。`src/hooks/useScreenBack.ts` から呼ばれる。
 *
 * このファイルは `react-native` / `expo-router` / `react` を値としても型としても import しない。
 * node 環境の Vitest から素直に読める唯一の層にするため（`docs/pages-components-guideline.md`
 * の「RN の render テストは書けない」制約に対応する）。
 */

/**
 * 戻る操作に対して実際に行うこと。
 * - intercepted     : 画面側が消費した（開いているシートを閉じた等）。遷移しない。
 * - ignored         : すでに遷移を発行済み（連打・二重入力）。何もしない。
 * - pop             : スタックを1段戻る（router.back()）。
 * - replace-fallback: 戻り先が無いので画面ごとの既定遷移先へ replace する。
 */
export type BackAction = "intercepted" | "ignored" | "pop" | "replace-fallback";

export type ResolveBackActionInput = {
  /** 画面側が「戻る」を消費した（例: BottomSheet が開いている）。 */
  intercepted: boolean;
  /** すでにこの画面からの遷移を発行済み。 */
  navigating: boolean;
  /** ナビゲーションスタックに戻れる画面がある（router.canGoBack()）。 */
  canGoBack: boolean;
};

/**
 * 判定の優先順位（この順で早期 return する。順序自体がテスト対象）:
 * 1. `intercepted === true` → `"intercepted"`
 *    （`navigating` より先に見る。遷移ラッチが立っていてもシートは閉じられなければならない。
 *    ここを逆にすると「戻るを押したのにシートが閉じない」詰みが起きる）
 * 2. `navigating === true` → `"ignored"`（連打の2回目以降）
 * 3. `canGoBack === true` → `"pop"`
 * 4. それ以外 → `"replace-fallback"`
 */
export function resolveBackAction({
  intercepted,
  navigating,
  canGoBack,
}: ResolveBackActionInput): BackAction {
  if (intercepted) return "intercepted";
  if (navigating) return "ignored";
  if (canGoBack) return "pop";
  return "replace-fallback";
}
