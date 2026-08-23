# Git操作

- [Git コミットに関するガイドライン](./docs/git-commit-guideline.md)

# ローカル開発環境

- テスト実行や動作確認をしようとして `.env` が存在しないことに気づいた場合、`.env` を手動で作成したり `.env` なしのままテストを進めたりせず、`local-env-setup` skill を呼び出してセットアップを行うこと。

# 知識の置き場所

- [知識の置き場所ガイドライン](./docs/knowledge-management.md)
  - 決定事項は ADR、エージェントの作業記憶は `.claude/agent-memory/`、
    一時的な作業メモは `tmp/<issue-id>/` に置く（3層モデル）
  - **ADR・agent-memory から `tmp/` を参照しない**（`tmp/` は .gitignore 対象でリンク切れになる）
