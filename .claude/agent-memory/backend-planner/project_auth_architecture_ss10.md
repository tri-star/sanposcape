---
name: project-auth-architecture-ss10
description: 認証アーキテクチャは ADR-002 で確定済み（Google 直結 + backend 自前セッショントークン）。SS-10〜SS-13 の分担と SS-10/SS-12 の線引き。
metadata:
  type: project
---

sanposcape の認証は **ADR-002（`docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md`）で確定済み**。モバイルは Google に対する public client として ID token を取得し、それを1回だけ backend に渡して **backend が自前のセッショントークン（access=短命 HS256 JWT / refresh=opaque + ローテーション + 再利用検知）を発行**する。以降の全 API は自前トークンの Bearer。

**Why:** IdP を Auth0 から Google 直結に変更した結果、Google は自社 API 向けの JWT アクセストークンを発行しないため、失効制御（ログアウト・アカウント削除）を得るには自前トークン発行が避けられないコストと判断された。加えて `AUTH_MODE=dev` のスタブが real と同一のトークン発行・`get_current_user` コードパスを通ることが、スタブのテスト忠実度の決め手になった。

**How to apply:** 認証関連のプランを作るときは ADR-002 の決定（特に「dev モードでも real と完全に同一のコードパスを通す」「抽象化点は `provider` フィールド1箇所」「`ENV=production` かつ `AUTH_MODE != real` なら起動失敗」）を前提として扱い、設計の再検討はしない。

### M3 のタスク分担

| Issue | 範囲 |
| --- | --- |
| SS-10 | backend の `auth/` 一式（4エンドポイント）+ `users`/`refresh_tokens` テーブル + `get_current_user`。モバイル側は `services/auth/` の real/dev/mock 3実装 |
| SS-11 | 認証画面（サインイン/サインアップ、スプラッシュのセッション復元、ルートガード、Maestro フロー） |
| SS-12 | backend のユーザーモデル拡張・`GET/DELETE /users/me`（アカウント削除 API） |
| SS-13 | 認証状態と探索ロジックの分離（ゲスト = トークン非保持状態として表現） |

### SS-10 / SS-12 の線引き（SS-10 のプランで合意した内容）

- SS-10 が作る: `users` テーブル + `User` モデル + `UserRepository` + `UserService.find_or_create()`、`refresh_tokens` テーブル、`get_current_user`
- SS-12 に残す: `users/router.py` / `users/schemas.py`、`GET /users/me` / `DELETE /users/me`、削除ポリシー（物理 vs 論理）、関連データの削除範囲
- 論理削除（`deleted_at`）は SS-10 では導入しない。`get_current_user` が single choke point なので SS-12 で1行足せば済む

関連: [[feedback-settled-design-and-api-conventions]]
