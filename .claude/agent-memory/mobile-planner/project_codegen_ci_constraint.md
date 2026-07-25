---
name: mobile-codegen-ci-constraint
description: MCP ツール(DesignSync等)は CI から呼べないため codegen は fetch と transform を分離する
metadata:
  type: project
---

DesignSync のような MCP ツールは**エージェントの実行環境にしか存在せず、GitHub Actions のランナーからは呼べない**。
したがって「CI で再生成して差分検出(drift check)」を成立させるには、取得と変換を分離する必要がある。

- fetch: エージェントが手動で実行し、取得物を**生のままリポジトリにコミット**(例: `packages/mobile/design/tokens/*.css`)
- transform: ネットワーク非依存のスクリプト。コミット済み入力から生成物を作る
- drift check: CI で transform を再実行し `git diff --exit-code`

**Why:** 提案書段階では「CI で DesignSync から再取得して drift check」と書かれていたが、実行不能だった。
分離すると CI が完全再現可能になり、かつ生の diff と生成物の diff の両方がレビューに乗るという利点もある。

**How to apply:** MCP ツールを入力源とする自動化をプランに入れるときは、必ず CI で実行可能かを先に検討する。
同じ制約は Plane / Pencil など他の MCP ツールにも当てはまる。
