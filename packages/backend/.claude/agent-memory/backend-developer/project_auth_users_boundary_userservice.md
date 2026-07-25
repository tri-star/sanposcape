---
name: auth-users-boundary-userservice
description: authドメインからusersドメインへのアクセスは常にUserService経由に統一する（AuthServiceはUserRepositoryを直接持たない）
metadata:
  type: project
---

`src/sanposcape/auth/` から `src/sanposcape/users/` へアクセスする経路は、常に `UserService`
（`users/service.py`）を経由する、という単一境界を守る設計になっている。

**Why:** SS-10実装時、`AuthService` が `UserRepository` を直接コンストラクタに受け取り、
`refresh()` 内で `self._user_repository.get_by_id(...)` を直接呼んでいたことがあった（動作は正しい）。
これがローカルレビュー（A-3）で問題視された理由は SS-12 への波及リスク:
「退会済み/BAN済みユーザーを弾く」判定を将来 `get_current_user`
（`src/sanposcape/dependencies.py`）だけに足すと、`AuthService.refresh()` は `UserRepository` を
直接叩いているため素通りしてトークンを発行し続けてしまう認可漏れになり得る。

**How to apply:**
- `UserService` に `get_by_id(user_id: uuid.UUID) -> User | None` を追加済み。`auth` ドメインから
  ユーザーを引き当てたい場合は必ずこれを使う（`UserRepository` を `auth` 側で直接インスタンス化しない）。
- SS-12で「削除済み/BAN済みなら弾く」を実装する際は、`UserService.get_by_id()` の1箇所に判定を
  足すだけで `get_current_user` と `AuthService.refresh()` の双方に自動的に効く設計になっている
  （これが SS-10 backend-plan で意図されていた choke point）。
- 唯一の例外: `src/sanposcape/dependencies.py`（トップレベル、`auth/dependencies.py`とは別ファイル）の
  `get_current_user()` は現状 `UserRepository` を直接使っている。SS-10ローカルレビューではここは
  スコープ外（元々`UserService`を経由しない設計だった）だったため未変更。SS-12で choke point を
  検討する際はここも合わせて見直す必要がある可能性がある。
