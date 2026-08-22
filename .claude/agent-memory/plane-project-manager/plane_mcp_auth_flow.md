---
name: plane-mcp-auth-flow
description: Plane MCPの認可フロー完了後もセッションによってはlist_work_items等のデータ系ツールが一切ツール一覧に現れないことがある観測
metadata:
  type: project
---

2026-08-21のトリアージ依頼時、ユーザーは事前に別セッション（または別画面）でPlane MCPのOAuth認可URLへリダイレクトされ、`http://localhost:xxxxx/callback?code=...`への実際の遷移を目視確認済みと報告した。しかし本セッションでは：

- 利用可能なツール一覧に `mcp__plane__authenticate` と `mcp__plane__complete_authentication` の2つしか存在せず、`list_work_items`/`retrieve_work_item`等のデータ操作系ツールはツールスキーマ自体に一切現れていなかった（呼び出しがエラーになるのではなく、そもそも選択肢として提示されない状態）。
- `mcp__plane__complete_authentication`をダミーのcallback_urlで試したところ「No OAuth flow is in progress for plane. Call `mcp__plane__authenticate` first」と返り、このセッション内では認可フローが開始されていない（＝別セッション/別画面で行われた認可のstateがこのセッションに引き継がれていない）ことが分かった。

**Why:** 認可（OAuth token取得）そのものはPlane側/ブラウザ側で成立していても、それがこのMCPクライアント・セッションのツール一覧に反映されるとは限らない。ツール一覧はセッション開始時点でネゴシエートされている可能性があり、認可完了後に動的更新されない、またはセッションをまたぐ認可状態の共有がない設計である可能性が高い（未確認・要検証）。

**How to apply:** 同様の状況（ユーザーが認可完了を目視確認したと言うのに `mcp__plane__list_work_items` 等のツールがそもそも一覧に存在しない）に遭遇したら、まず`complete_authentication`をダミー値で試して「No OAuth flow is in progress」が返るか確認する。それが返る＝このセッションでは認可フローが開始されていないことを意味する。指示にある通り、この状態から無理に`mcp__plane__authenticate`で新規URLを強制発行せず、「このセッションのツール一覧にデータ系ツールが存在しない」「認可はブラウザ側では完了しているようだが本セッションには反映されていない」という事実をそのまま利用者に報告し、セッションの再起動（新しい会話の開始）や接続の再確立を提案するのがよい。
