# backendに関する開発ドキュメント

- 利用するべきライブラリ、Linter/Formatterなどのツールセットは [ツール・ライブラリ] (./docs/toolsets-libraries.md) を参照
- backendに関するフォルダ構造はプロジェクト毎に異なるため、`./docs/folder-structure.md` を参照
- ファイル/フォルダ・シンボル・テスト関数の命名規則と、テストに書く docstring（検証意図）は `./docs/naming-convention.md` を参照
- ローカル環境構築の方法は [ローカル環境構築] (./docs/local-env.md) を参照
- ローカル開発時のコマンド実行方法は [ローカル開発ガイド] (./docs/local-development.md) を参照
- AWS SAM によるデプロイ手順は [デプロイ手順] (./docs/deployment.md) を参照
- backend 固有の設計判断は `./docs/adr/ADR-B-{番号}-{タイトル}.md` に置く（frontend/backend にまたがる判断・ドメイン知識はリポジトリルートの `docs/adr/`（`ADR-{番号}`）。書き方は adr-writing skill）

## 作業の前に

- `.claude/agent-memory/backend/MEMORY.md` を読み、作業に関係する話題ファイルを開く（計画時の確認事項・テスト・SQLAlchemy・AWS・可観測性・ファイル移動などの落とし穴）。

## 計画・実装の約束事

- 確定済みの ADR・API 契約は前提として扱い、設計を蒸し返さない。プランには、まだ決まっていない事項だけを理由付きで書き、迷うものは確認事項に回す。
- `openapi.yaml` の変更は、backend だけの PR でも mobile CI（Orval の再生成 → typecheck → test）を起動する。壊れやすい変更は [ローカル環境構築](./docs/local-env.md) の「OpenAPI 定義」にまとめてある。mobile が壊れるときは、mobile の最小限の修正を同じ PR に入れ、`pnpm --filter mobile orval` と mobile の typecheck・test を通す（新しい worktree での手順は [mobile の作業の進め方](../mobile/AGENTS.md) を参照）。
- 完了前の確認は `ruff check`・`ruff format --check`・`pytest`（いずれもコンテナ内）。mypy は導入していないので、型チェックを求められてもこの3つで足りる。
