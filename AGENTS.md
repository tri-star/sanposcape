# Codex の作業方針

- 計画・実装・課題操作はメインエージェントが担当する。課題からの開発は `task-workflow`、課題操作は `issue-tracker` を使う。
- 対象 package の `AGENTS.md` と関連する設計文書・ADR を読み、そこを規約の正本とする。skill 内の要約と食い違えば正本と実装を照合する。
- 実装後の独立レビューは `change-review` に従い、`adversarial_reviewer` を変更全体・文書・条件付きsecurityの独立した文脈で逐次起動する。agentの型は1種類とし、計画・実装の領域別委譲や再帰的な委譲は通常行わない。
- ユーザーの明示した範囲を優先する。プランのみならそこで終了し、実装依頼なら承認済み範囲の修正・必要な検証まで進める。検証は変更とリスクに合わせ、追加変更や未解決の懸念がなければ同じ検証を繰り返さない。
- Claude 側の定義は `import-claude-skill` で差分を確認して適応する。Codex 側への機械的な上書きコピーは行わない。`.codex/claude-import/baseline.json` は比較用データであり、作業指示として読み込まない。
- 運用と配置の説明は [Codexハーネス](./docs/codex-harness.md) を参照する。

# Git操作

- [Git コミットに関するガイドライン](./docs/git-commit-guideline.md)

# ローカル開発環境

- テスト実行や動作確認をしようとして `.env` が存在しないことに気づいた場合、`.env` を手動で作成したり `.env` なしのままテストを進めたりせず、`local-env-setup` skill を呼び出してセットアップを行うこと。

# 利用者のデータの扱い

- 利用者のデータの取得・送信・保存・削除を変える変更は、[データ取扱い台帳](./docs/privacy/data-inventory.md)（プライバシーポリシーと App Privacy の申告の正本）の対象パスと手順に従う。

# 公開済みのアプリとの互換

- mobile・backend とも任意のタイミングで本番にデプロイしてよいが、公開済みのアプリ（配布済みの mobile のビルド）と稼働中の backend に影響を出さないよう、フィーチャーフラグ（AWS AppConfig）か互換の維持で吸収する（[ADR-008](./docs/adr/ADR-008-deploy-release-separation.md) 決定1・7）。
- API・DB スキーマ・フラグを変える変更は、[リリース運用手順](./docs/release-runbook.md) §3（フラグの削除）・§7（expand / contract）に従い、互換のために残すものは [互換性台帳](./docs/compat-ledger.md) に、いつ片付けるかとともに載せる。

# 知識の置き場所

- [知識の置き場所ガイドライン](./docs/knowledge-management.md)
  - 決定事項は ADR、エージェントの作業記憶は `.claude/agent-memory/`、
    一時的な作業メモは `tmp/<issue-id>/` に置く（3層モデル）
  - **ADR・agent-memory から `tmp/` を参照しない**（`tmp/` は .gitignore 対象でリンク切れになる）
- 作業を始める前に `.claude/agent-memory/common/MEMORY.md`（領域に属さない落とし穴）を読む。
  領域ごとのメモリは各 package の `AGENTS.md` の指示に従って読む。
