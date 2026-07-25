---
name: users-auth-domain-boundary
description: AuthServiceがUserServiceを経由せずUserRepositoryを直接持つ設計逸脱。SS-12着手前に要確認
type: project
---

SS-10 (feat/ss-10-backend-auth) のレビュー(2026-07-25時点)で発見した逸脱。

`packages/backend/src/sanposcape/auth/service.py` の `AuthService.__init__` は
`UserService` に加えて `user_repository: UserRepository` も直接受け取り、
`refresh()` 内で `self._user_repository.get_by_id(row.user_id)` を呼んでいる
(`packages/backend/src/sanposcape/auth/dependencies.py` の `get_auth_service` が
両方を組み立てて渡す)。

プラン(`tmp/SS-10/backend-plan.md` §5.2 D3)は「`UserService` は `find_or_create()`
のみ公開し、`AuthService` は `UserService` だけをDIで受け取る」という設計だった。
実装者はこの設計から逸脱したことを報告済み。

**Why:** `folder-structure.md` は「他ドメインから使う必要が出たものは `core/` へ
昇格させる（ドメイン間の直接依存を増やさない）」と明記しており、ドメインを跨いだ
repository への直接依存は方針違反。加えて `dependencies.py::get_current_user` も
`UserRepository.get_by_id()` を直接呼んでいるが、こちらは SS-10プラン §5.10で
「SS-12が論理削除等のポリシーを足す際、get_current_userの1箇所で完結する choke
point として意図的に設計されたもの」。AuthService.refresh() の直接参照は、この
「単一choke point」前提を暗黙に破っており、SS-12で状態チェック(論理削除/BAN等)を
足す際に2箇所を同時に直す必要が生じる（片方だけ直すと穴が残る）。

**How to apply:**
- SS-12着手時、またはこの逸脱を修正するPRでは `UserService.get_by_id(user_id) ->
  User | None` を追加し `AuthService` から `UserRepository` を取り除いて
  `UserService` 経由に一本化することを推奨。
- 今後同種のレビューで「サービス層が他ドメインのrepositoryを直接受け取っていないか」
  を確認ポイントとして持つ。
- 関連: [[adr002-auth-shared-codepath]]
