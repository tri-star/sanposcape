---
name: reference-stray-claude-dir
description: エージェントメモリが packages/backend 配下の誤った場所に書き込まれてしまう既知のバグと、その正しい置き場所
metadata:
  type: reference
---

エージェントメモリの正しい置き場所は常にリポジトリルート `<project-root>/.claude/agent-memory/<agent-name>/`
であり、`packages/backend/.claude/agent-memory/...` や `packages/backend/src/sanposcape/.claude/...`
のような package 配下・サブディレクトリ配下は誤り。

**Why:** サブディレクトリ（例: `packages/backend/`）を作業起点にしたセッションで、`<project-root>` を
リポジトリルートではなく最寄りの `AGENTS.md`/`CLAUDE.md` があるディレクトリと誤解釈すると、
package 配下に別の `.claude/agent-memory/` が生成されてしまう。過去にも一度この問題が起き、
コミット `038f1bb`（`chore: packages配下に誤って作られたagent-memoryをルートへ統合する`）で
mobile/backend 双方の重複メモリをルートへ手動統合した実績がある。2026-08-01 時点でも
`packages/backend/src/sanposcape/.claude/agent-memory/` に他の reviewer 系エージェント
（backend-security-reviewer 等）のメモリが同様に誤生成されているのを確認した（未整理のまま残存）。

**How to apply:**
- 自分（backend-developer）がメモリを書く際は、たとえタスクの指示文に
  `packages/backend/.claude/agent-memory/backend-developer/` のようなパスが明記されていても、
  実際に書き込む前に `git log --all -- packages/backend/.claude/` 等で過去の統合履歴が無いか確認し、
  疑わしい場合はリポジトリルート `.claude/agent-memory/backend-developer/` に書く（このファイル自体が
  ルート配置の実例）。
- 他エージェントが誤って package 配下に作ったメモリファイルを見つけても、内容を検証せずに
  削除・移動しない。気づいた場合は親エージェントに報告し、必要なら別途統合コミットを立てる
  （`038f1bb` のように意図の分かるコミットメッセージで一括整理するのが望ましい）。
