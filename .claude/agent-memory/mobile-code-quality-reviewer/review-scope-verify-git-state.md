---
name: review-scope-verify-git-state
description: レビュー依頼で指定されたブランチ名/コミットハッシュ/「未コミット」という前提は、実際の git 状態と食い違うことがある
metadata:
  type: feedback
---

SS-8（MVP主要画面の静的実装）のレビュー依頼では「ブランチ `feat/ss-8-mvp-screens` の
コミット `a04ddee` 以降の未コミット変更」を対象にするよう指示されたが、実際の
`git status` を見ると該当ブランチ名は `feat/ss-8-mvp-screens-routing` で、対象ファイル
（`app/`・`src/features/{auth,walk,history,navigation,search}/` 等）はすべて
`aa38c98`（初回実装）と `28111d5`（"SS-8ローカルレビューのP1/P2指摘を修正する"）で
既にコミット済みだった（作業ツリーは空、agent-memory 等の無関係ファイルのみ untracked）。

**Why:** この開発フローでは「ローカルレビュー→指摘修正→即コミット」のサイクルが速く、
レビュー依頼のテキストが書かれた時点と実際にレビューを行う時点で git の状態がずれることが
ある。指示文の「未コミット」を鵜呑みにすると、存在しない diff を探して迷子になる。

**How to apply:** レビュー開始時は必ず `git status` / `git log` 相当の情報
（このエージェントに Bash が無い場合は `Glob`/`Read` で該当ディレクトリの現状を確認）で
実際の状態を確認し、指示と食い違う場合はサマリー冒頭で一言触れた上で、
「現在のコード state」を実質的な diff とみなしてレビューを進めてよい
（ユーザーに都度確認を求めて止まる必要はない）。
