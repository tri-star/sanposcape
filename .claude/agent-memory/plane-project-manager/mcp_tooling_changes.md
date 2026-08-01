---
name: mcp-tooling-changes
description: 2026-08-01のあるセッションで一時的にissue系ツール名・HTTP 403が観測されたが、同日後続セッションでは再現せず解消済み（一過性の認証エラーだった可能性が高い）
metadata:
  type: project
---

**2026-08-01追記（解消確認）**: 下記の状況は同日後続のトリアージセッションでは再現しなかった。`retrieve_work_item`/`list_work_items`/`create_work_item_link`等の従来のwork_item系ツールが正常に動作した。一時的な認証エラーだった可能性が高く、本メモリの内容を前提に代替手段を探る必要はない。まず通常通り試し、実際に失敗した場合のみ以下を参考にする。

2026-08-01のトリアージ依頼時、実際に呼び出し可能だったPlane MCPツール一覧が、これまでのメモリに記録された名称（`list_work_items` / `create_work_item_link` / `list_work_item_comments` / `retrieve_work_item` / `list_work_item_relation_definitions` / `create_work_item_relation` 等）と異なっていた。代わりに `mcp__plane__get_issue_using_readable_identifier` / `list_module_issues` / `add_module_issues` / `update_issue` / `create_issue` / `add_issue_comment` / `get_issue_comments` など、`issue` を冠した名称のツールセットが提供されていた。

さらに、プロジェクト全体のWorkItem/Issueを横断的に一覧取得できる汎用ツール（旧`list_work_items`相当）が見当たらなかった（`list_module_issues`はモジュール単位、`list_cycle_issues`はサイクル単位のみ）。モジュール未所属のタスクを拾う手段が変わっている可能性がある。

**Why:** 2026-08-01のトリアージで全ツール呼び出しがHTTP 403で失敗し実際の動作検証はできなかったが、少なくともツール名のシグネチャ自体が変化していることは確認できた（存在しないはずの旧ツール名を呼ばずに済んだ＝現行スキーマとして`issue`系が提供されていた）。
**How to apply:** 次回接続できた際は、まず `list_module_issues` 等の新ツールセットで全件横断集計の代替手段（例: 各Moduleごとの集計を合算し、`get_projects`等で総数と突き合わせる）を確立し、このメモリを実際の検証結果で更新すること。もし旧ツール名（`list_work_items`等）が復活していたら、本メモリは陳腐化しているので削除・修正する。
