# Web

現在のWebはAstroの静的LP。[lp規約](../../../../packages/lp/AGENTS.md)とADR-012を読み、実在するpackage scriptsで検証する。以下のAPI/状態管理の観点は、それらを導入する変更の場合だけ使う。未作成のReactアプリや旧テンプレートをlpの規約にしない。

- 画面遷移・データ取得・UI状態の所有者、古いレスポンスの競合。
- loading/error/empty、再試行、二重送信、アンマウント。
- API側の認可との一致、XSS、bundleへの秘密混入、外部リダイレクト。
- ラベル、キーボード、フォーカス、読み上げ、操作可能性。
- 責任・配置・命名、関連テストと画面での確認。

## LP

- 静的出力・S3/OAC/CloudFront・CSPの契約。ビルド出力のインライン検査とinfra設定の対応は [security](security.md) も参照する。
- 新しい外部オリジン・解析・フォームが、公開範囲、プライバシーの説明、配信設定と整合するか。
- ページ・リンク・画像のパスとpublicの公開物、恒久URL、noindex、開発/本番の切替を確認する。
- `pnpm --filter lp check`・`pnpm --filter lp format:check`・`pnpm --filter lp build` とビルド後の検査は自動検証、レスポンシブ表示・キーボード/フォーカス・実配信のCSPは別の確認として扱う。
- React導入時はルーティングとAPI認可、サーバー状態/UI状態の重複、生成APIの利用側、キャッシュ更新、非同期競合、テストの意味を実際の規約から確認する。
