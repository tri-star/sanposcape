---
name: conventions_reference
description: backend の命名規則・フォルダ構造ドキュメントの場所と要点。レビュー時に毎回参照する。
metadata:
  type: reference
---

- 命名規則: `packages/backend/docs/naming-convention.md`
  - ドメイン内ファイル名は役割固定（`router.py` / `service.py` / `repository.py` / `schemas.py` / `models.py` / `dependencies.py` / `exceptions.py`）。ドメイン名はフォルダで表現し、ファイル名に重ねない。
  - Pydantic スキーマ接尾辞: `...Create` / `...Update` / `...Read`。
  - 「散歩ルート」は `walk_route` / `walking_route` 系語彙で Web の `router` と混同しないよう明記されている。
- フォルダ構造: `packages/backend/docs/folder-structure.md`
  - `router → service → repository` の一方向レイヤー。`core/` はどのドメインにも属さない横断関心事のみ（認証は `auth/` domain 扱いで `core/` に置かない）。
  - 他ドメインから使う必要が出たものは `core/` へ昇格させる（例: `GeoPoint` が `maps/schemas.py` → `core/geo.py` に昇格し、`maps/schemas.py` は再エクスポートのみ残す形。SS-18 で実施）。
  - テストは `<domain>/tests/test_*.py` に併置。`pytest` は `--import-mode=importlib`（同名テストファイルの衝突を避けるため）。
- コミット規約: `docs/git-commit-guideline.md` — 1ステップごとにコミット、メッセージは日本語で「なぜ」を含める。
