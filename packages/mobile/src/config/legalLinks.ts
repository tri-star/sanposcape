/**
 * プライバシーポリシーの公開 URL（LP の /privacy/。SS-158）。
 * ビルドの種類（development / preview / staging / production）や OTA で切り替えない定数にする。理由は ADR-M-019:
 * - 効力のある規約は本番 LP に出ている1つだけ。dev LP は main への push で自動デプロイされ、未公開の改訂を含みうる
 * - ビルドの種類での分岐は開発ツールの表示可否だけに使う（docs/build-profiles.md「実行時のビルド variant 判定」）
 * - EXPO_PUBLIC_* / extra は eas update で eas.json の env が効かず、OTA で値が抜ける
 * 末尾スラッシュ付き: LP は trailingSlash: "always"（packages/lp/AGENTS.md）。付けないとリダイレクトや 404 の原因になる。
 */
export const PRIVACY_POLICY_URL = "https://sanposcape.com/privacy/";

/** リンクの表示名。画面ごとに言い換えない（ストア審査・利用者の検索の目印になる）。 */
export const PRIVACY_POLICY_LABEL = "プライバシーポリシー";
