---
name: project-ss111-review-followup
description: SS-111ローカルレビューの推奨事項R1〜R10対応（ADR番号置換・ストレージ未構成テスト追加・docs更新等）の実装場所と判断ログ
metadata:
  type: reference
  scope: durable
---

## 経緯

SS-111（ピンの閲覧API）のローカルレビュー結果（当時の作業ディレクトリのレビューメモ、
gitignore対象で既に消失）の「対応推奨」R1〜R10すべてに対応した（N1〜N8はユーザー指示
により対応不要のまま据え置き）。

## 対応した項目と判断

- **R1（tmp/ 参照の一掃）**: `pins/repository.py`・`mappers.py`・`schemas.py`・
  `service.py`・`router.py` 等のコメント/docstringが `SS-111 D4〜D11` /
  `backend-plan.md`（tmp/ 配下、破棄済みのプラン文書の通し番号）を参照していたものを
  ADR-009 の決定番号（決定14〜18）に置換した。
  - `pins/exceptions.py`・`photo_attacher.py`・`tag_labels.py`・`photo_keys.py`・
    `sanpo_maps/*` に残る `backend-plan.md` 参照は **SS-88 の別プラン文書**のもので、
    SS-111 のブランチ差分（`git diff main...HEAD --stat`）に含まれないファイル。
    対象外と判断し、意図的に触らなかった。
  - **教訓**: 同種の「tmp/ 参照の一掃」レビュー対応をする際は、まず
    `git diff <base>...HEAD --stat` で自分のブランチの差分ファイルに絞ってから
    grep すること（無関係な既存コードまで巻き込まないため）。
- **R2**: `unconfigured_storage_client` を使ったテストが `GET /pins` にしかなく、
  `GET /pins/{pin_id}`・`GET /pins/{pin_id}/photos` に無かった（プランの完了条件
  「ストレージ未構成でも200+URL null」を一部のエンドポイントでしか検証していなかった）。
  既存の `TestListPins` のテストをそのまま雛形にして追加すれば済む。
- **R8**: `PinBoundingBox`（内部dataclass、OpenAPIには現れない）のフィールド順を
  `PinListQuery`（min_lat, min_lng, max_lat, max_lng）に揃えた。呼び出し側は
  全てキーワード引数だったため、フィールド順の変更は実害なしで安全に行えた
  （位置引数を使っている箇所が無いか `grep "PinBoundingBox("` で確認してから変更するとよい）。
- **コミット分割**: `pins/repository.py` の `PinBoundingBox` docstring 変更（R1）と
  フィールド順変更（R8）は同一hunk内で不可分だったため1コミットにまとめた。
  `pins/tests/test_repository.py` は R8（呼び出し側の引数順）と R9（並び順アサート追加）が
  別hunkだったため `git add -p` で分離できた（[[feedback-commit-splitting]] 参照）。
- **openapi.yaml**: コメント/docstring変更後に
  `docker compose -f packages/backend/compose.yaml exec api uv run python scripts/export_openapi.py`
  で再生成する必要がある（手編集しない。生成元はコードのdocstring）。

関連: [[project-ss111-pins-read-api-complete]]（実装完了の記録）
