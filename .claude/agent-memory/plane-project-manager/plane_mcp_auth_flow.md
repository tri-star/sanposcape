---
name: plane-mcp-auth-flow
description: Plane MCPの認可フロー完了後もセッションによってはlist_work_items等のデータ系ツールが一切ツール一覧に現れないことがある観測
metadata:
  type: feedback
  scope: durable
---

2026-08-21のトリアージ依頼時、ユーザーは事前に別セッション（または別画面）でPlane MCPのOAuth認可URLへリダイレクトされ、`http://localhost:xxxxx/callback?code=...`への実際の遷移を目視確認済みと報告した。しかし本セッションでは：

- 利用可能なツール一覧に `mcp__plane__authenticate` と `mcp__plane__complete_authentication` の2つしか存在せず、`list_work_items`/`retrieve_work_item`等のデータ操作系ツールはツールスキーマ自体に一切現れていなかった（呼び出しがエラーになるのではなく、そもそも選択肢として提示されない状態）。
- `mcp__plane__complete_authentication`をダミーのcallback_urlで試したところ「No OAuth flow is in progress for plane. Call `mcp__plane__authenticate` first」と返り、このセッション内では認可フローが開始されていない（＝別セッション/別画面で行われた認可のstateがこのセッションに引き継がれていない）ことが分かった。

**Why:** 認可（OAuth token取得）そのものはPlane側/ブラウザ側で成立していても、それがこのMCPクライアント・セッションのツール一覧に反映されるとは限らない。ツール一覧はセッション開始時点でネゴシエートされている可能性があり、認可完了後に動的更新されない、またはセッションをまたぐ認可状態の共有がない設計である可能性が高い（未確認・要検証）。

**How to apply:** 同様の状況（ユーザーが認可完了を目視確認したと言うのに `mcp__plane__list_work_items` 等のツールがそもそも一覧に存在しない）に遭遇したら、まず`complete_authentication`をダミー値で試して「No OAuth flow is in progress」が返るか確認する。それが返る＝このセッションでは認可フローが開始されていないことを意味する。指示にある通り、この状態から無理に`mcp__plane__authenticate`で新規URLを強制発行せず、「このセッションのツール一覧にデータ系ツールが存在しない」「認可はブラウザ側では完了しているようだが本セッションには反映されていない」という事実をそのまま利用者に報告し、セッションの再起動（新しい会話の開始）や接続の再確立を提案するのがよい。

**2026-08-30追記（同一セッション内でも再現・確定）**: 同一会話内で `mcp__plane__authenticate` → ユーザーがブラウザで認可 → `mcp__plane__complete_authentication`（"Authentication complete for plane. The server's tools should now be available." という成功メッセージが返る）という一連の流れを完走しても、その直後に同一ターンで `mcp__plane__list_work_items` / `mcp__plane__list_issues` / `mcp__plane__list_module_issues` / `mcp__plane__list_module_work_items` を呼び出すと、いずれも `Error: No such tool available: mcp__plane__xxx`（ツールスキーマ自体が存在しないというエラーで、権限エラーではない）となった。つまり「認可がセッションをまたがない」という以前の仮説だけでなく、**同一セッション内で認可を完了させても、そのターン内ではツール一覧（スキーマ）が動的に更新されない**ことが確定した。これはクライアント側がconversation開始時にツール一覧をネゴシエートし、途中の`complete_authentication`成功では再ネゴシエートしない実装上の制約と考えられる。
**確定した対処法:** `complete_authentication`が成功メッセージを返した後にデータ系ツールが依然として使えない場合、そのセッション内でリトライを重ねても無駄なので、直ちに利用者へ「認可はサーバー側で成功したが、このセッションのツール一覧には反映されない仕様のため、新しい会話（セッション）を開始してほしい」と伝えて作業を中断する。次のセッション冒頭で改めて認可要求が出た場合も、多くの場合は既に有効なトークンがあるため`mcp__plane__authenticate`を呼ぶと即座に（ブラウザ操作なしで）完了する可能性がある。
