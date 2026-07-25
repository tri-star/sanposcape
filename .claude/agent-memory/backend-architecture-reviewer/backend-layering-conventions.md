---
name: backend-layering-conventions
description: packages/backend のレイヤー規約・命名・テスト方針の要点（folder-structure.md/SS-10実装から）
type: project
---

`packages/backend/docs/folder-structure.md` が正典。要点:

- ドメイン単位（`users`/`walks`/`spots`/`maps`/`auth`）× `router → service →
  repository` の3層。router は薄く（HTTP入出力+依存解決のみ）、service がトランザ
  クション境界（`self._db.commit()`）を持つ、repository がSQLAlchemyクエリを隔離。
- router に `try/except` は書かない。ドメイン例外は `main.py` の
  `register_exception_handlers()` に一元化して HTTP レスポンスに変換する
  （`auth/exceptions.py` の `AuthenticationError` 系がお手本）。
- ドメインを跨いだ直接の repository 依存は避け、他ドメインの機能が必要なら相手の
  `service.py` 経由にするか `core/` へ昇格させる。→ 違反例: [[users-auth-domain-boundary]]
- `dependencies.py`（アプリ直下）は「複数ドメインで使う横断的依存」専用
  （DBセッション・`get_current_user` 等）。ここが唯一の意図的な「domain repository
  への直接アクセス」の許容箇所（SS-10では `get_current_user` がそれ）。
- 外部IdP検証(Google JWKS等)は `providers/` のような隔離層に置き、モジュールレベル
  `@lru_cache` シングルトンでクライアントを共有する（リクエスト毎生成はキャッシュ
  無効化のバグになるので要注意）。
- テストはDIで外部依存(JWKSクライアント・`now()`)を差し替え、ネットワークに出ない
  形にする。設計上の不変条件（例: ADR-002決定3、OpenAPI出力がAUTH_MODEに依存しない
  こと）はピンポイントで固定するテストを書く方針が定着している
  （`test_openapi_output_is_identical_regardless_of_auth_mode` 等）。
- pytestは `--import-mode=importlib` 設定済みなので同名 `test_*.py` の衝突は
  ドメイン間で起きない。
