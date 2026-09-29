---
name: feedback-local-pg-alpine-collation-is-bytewise
description: ローカル/テストDB(postgres:17-alpine, musl)は en_US.utf8 を名乗るが文字列ソートが実質バイト順。collation 依存の ORDER BY はテストで差を検出できないので COLLATE "C" を明示して決定性を担保する
metadata:
  type: feedback
  scope: durable
---

`packages/backend/compose.yaml` の db コンテナは `postgres:17-alpine`（musl libc）。DB の既定 collation は
`en_US.utf8` を名乗るが、musl のロケール実装では文字列比較が実質コードポイント（バイト）順になる。
glibc 系の PostgreSQL（Debian イメージや RDS 等）では `en_US.UTF-8` の ORDER BY が大文字小文字・記号・かなで異なる順序になる。

**Why:** SS-136（`GET /sanpo-maps/{id}/tags` の最終タイブレーク `label_key ASC`）で、`.collate("C")` を外しても
追加した並び順テスト（`1 < _x < y < z < あ`）がローカルで通ってしまい、テストが回帰を検出できないと判明した。
本番 DB が glibc 系なら同順位の並びが環境でずれる。

**How to apply:**
- API 契約として並び順を決定的にしたい文字列ソート（タイブレーク等）は `Column.collate("C")` を明示する。
  正しさはテストではなく COLLATE 指定そのもので担保し、ADR にも「バイト順（COLLATE "C"）」と書く。
- 「collation を外すと落ちる」ことを確かめる違反注入は、このローカル環境では成立しない前提で報告する
  （glibc 系 DB でのみ差を検出できるテスト、と明記する）。
- 人間向けの自然な並び（ロケール順）が必要な場合は、DB 任せにせず別途設計を検討する。

関連: [[feedback-verification-revert-without-git-checkout]]
