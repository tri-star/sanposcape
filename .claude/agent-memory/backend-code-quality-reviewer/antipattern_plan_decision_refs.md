---
name: antipattern_plan_decision_refs
description: 実装コードのコメントに「D3」「Q3」「B-D5」のような計画ドキュメントの決定コードだけを埋め込み、その定義がgitignore対象の作業ディレクトリにしかなく将来追跡不能になる、このコードベース横断の再発パターン。
metadata:
  type: feedback
  scope: durable
---

コードコメント末尾の `（D6）` `（Q3）` `（B-3）` `（B-D5）` のような決定コードは、その定義が
backend-planner の計画書（gitignore 対象の作業ディレクトリに置かれ、チケット完了時に破棄される）
にしか無い。将来のレビュアー・新メンバーには由来を追えない記号になる。

再発の履歴（いずれもレビューで指摘済み）: `auth/`（`B-3`）→ SS-18 `walks/`（`D1`〜`D11`/`Q1`〜`Q5`）→
SS-44 `integrations/google_maps/tests/test_fake.py`（`D-6`）→ SS-111 `pins/`（`SS-111 D4` 等。ADR-009 に
決定14〜18として正式記録があるのに、コメントは計画書側のラベルを指したまま）→ SS-131 `api_docs/`
（「プランの注意事項参照」）→ SS-113 `sanpo_maps/`（計画書で「ADR の決定番号で参照する」と自己規定して
いたのに `B-D1`/`B-D2` を新規追加。同 PR 内で ADR-009 の決定番号に修正済み）。

2026-10-04 時点で `packages/backend/src/sanposcape/` 配下に `B-D\d+` が13箇所
（`sanpo_maps/`・`main.py`・`integrations/aws/s3.py`。SS-88 当時の初期ナンバリングの生き残り）、
`D\d+`/`Q\d+` が16箇所（主に `walks/`。ほか `main.py`・`auth/`・`core/middleware.py`）残っている。
`B-D*` の決定は `docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md`、
walks の `D*` は `docs/adr/ADR-003-walk-record-persistence-and-history-api.md` に対応する記述がある。

`scripts/knowledge/check-tmp-references.sh` は `docs/`・`packages/*/docs`・`.claude/agent-memory/`
の `*.md` だけを走査し、`src/**/*.py` のコメントは検査しないため、この種の参照は CI で検知されない。

**Why:** コメント本文が「なぜ」を一応説明していれば単体では読めるが、決定コードは追跡手段の無い
飾りになり、本文が自己完結していない場合は意図が失われる。

**How to apply:** 新しいコードで決定コードを含むコメントを見たら、
- コメント本文だけで意図が自己完結しているか確認する（自己完結していれば Low/Suggestion 止まり）。
- 参照先がコミット済みの ADR（決定番号）なら問題ない。計画書ラベルしか無く自己完結もしていなければ
  Medium 程度で指摘し、「ADR の決定番号で参照するか、コメントを自己完結させる」ことを提案する。
- 既存踏襲パターンなので、そのPR固有の問題として過度に厳しく扱わない。まとめて置き換える
  クリーンアップ提案は別チケットとして出すのがよい。
