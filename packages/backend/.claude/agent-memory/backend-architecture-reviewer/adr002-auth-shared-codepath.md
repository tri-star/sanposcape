---
name: adr002-auth-shared-codepath
description: ADR-002決定3(real/devが同一コードパスを通る認証設計)の実装場所と検証テスト、崩れやすい箇所
type: project
---

`packages/backend/src/sanposcape/auth/service.py` の `AuthService` が中核。
`create_session`(real) と `create_dev_session`(dev) は入口（Google ID token検証 or
`user_key` 引き当て）だけが違い、`_resolve_user()` / `_issue_session()` を必ず共有する。

**Why:** ADR-002 決定3。dev スタブが real と同じトークン発行・`get_current_user` コード
パスを通ることで「スタブでは通るが本番で落ちる」類の乖離を構造的に防ぐのが狙い。

**How to apply:**
- この不変条件は `auth/tests/test_service.py::test_resolve_user_and_issue_session_shared_between_real_and_dev`
  (spyで呼び出し回数を検証) と `auth/tests/test_dev_router.py::test_dev_session_token_passes_get_current_user`
  (devトークンで `/auth/me` が通ることを確認) の2テストで固定されている。今後この構造を
  変更するPRでは、これらのテストが依然として意味を持つ形で維持されているか確認すること。
- 崩れやすい箇所: `_resolve_user`/`_issue_session` 以外の場所（例: `AuthService.refresh()`）
  でユーザー参照ロジックを別ルートで実装すると、この「単一コードパス」の前提が部分的に
  崩れる。[[users-auth-domain-boundary]] を参照。
