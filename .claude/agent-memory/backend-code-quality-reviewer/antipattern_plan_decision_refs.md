---
name: antipattern_plan_decision_refs
description: 実装コードのコメントに「D3」「Q3」「B-3」のような計画ドキュメントの決定コードだけを埋め込み、その定義がgitignore対象のtmp/にしかなく将来追跡不能になる、このコードベース横断の再発パターン。
metadata:
  type: feedback
  scope: durable
---

SS-18 (`walks/` ドメイン) のレビューで発見。`walks/models.py` / `walks/schemas.py` / `walks/repository.py` / `walks/exceptions.py` / `walks/router.py` に `（D1）` `（D3）` `（D6）` `（Q3）` のような決定コードが多数埋め込まれているが、その定義は `tmp/SS-18/backend-plan.md` にしかない。`tmp/` はリポジトリの `.gitignore` に含まれており、コミットされない。 <!-- tmp-ref-ok: tmp/ 参照そのものを説明している箇所 -->

同様のパターンが `auth/mappers.py` の `（B-3）` コメント（および `auth/tests/test_mappers.py`）にも既に存在する。SS-18 が最初の事例ではなく、既存の踏襲された書き方。

SS-44（`integrations/google_maps/fake.py` 関連）でも再発を確認: `integrations/google_maps/tests/test_fake.py` の `# categories が1種類でも name は連番のおかげで衝突しない（D-6）。` というコメントが `tmp/SS-44/backend-plan.md`（同じく gitignore 対象）の決定コードを参照している。 <!-- tmp-ref-ok: tmp/ 参照そのものを説明している箇所 -->このコメントはコメント本文だけで意図が自己完結しているため実害は小さく Low 止まりで指摘した。

**Why:** コメント自体は「なぜ」を一応説明しているので単体では読めるが、コード末尾の decision code は将来のレビュアー・新メンバーには何の情報も持たない記号でしかなく、由来を追跡する手段がない（plan doc がリポジトリに存在しないため）。

SS-111（`pins/` の閲覧API追加, PR: `tri-star/ss-111-pin-read-api`）でも再発を確認: `pins/schemas.py`
`pins/repository.py` `pins/mappers.py` `pins/router.py` `pins/service.py` とそのテストに
`SS-111 D4`〜`D8`・`D11` や `backend-plan.md 5.x/8章` への参照が多数追加された（例:
`schemas.py` の `# position が最小の写真(無ければ null, SS-111 D4)。`）。このチケットでは
`docs/adr/ADR-009-...md` に「追補（2026-09-24, SS-111 閲覧API）」として決定14〜18が正式に
記録されており、内容自体は committed な一次記録を持つが、コード中のコメントは ADR の
決定番号（決定14〜18）ではなく tmp 側の `D4`/`D6`/`D7`/`D8`/`D11` を指したままになっている。
3ドメイン目（walks → google_maps/fake → pins）での再発であり、ADR 追補という「正しい記録先」
が存在するようになった後もコードコメントが追従していない点が新しい観察。

SS-131（`api_docs/` Scalar導入）でも再発を確認: `api_docs/tests/test_router.py` の `test_scalar_docs_disables_telemetry_and_agent` docstring に「（プランの注意事項参照）」とあり、gitignore対象の計画ドキュメントの注意書きを指している。 <!-- tmp-ref-ok: tmp/ 参照そのものを説明している箇所 --> ただしdocstring本文自体がすでに同じ趣旨（実際のHTMLを出力し直して区切りを確認すること）を書いており自己完結していたため、Low/Suggestion止まりで指摘した（本文だけで意味が通り、tmp参照は装飾的）。

SS-113（`sanpo_maps/` 地図の作成・管理API追加）でも再発を確認: `sanpo_maps/mappers.py`（新規ファイル）
と `sanpo_maps/service.py` の docstring に `（B-D2）`/`（B-D1）` という、ADR-009本文のどこにも定義のない
ラベルが新規に追加された（既存の `sanpo_maps/repository.py::list_for_member` や `pins/repository.py`・
`pins/models.py`・`pins/thumbnails.py`・`integrations/aws/s3.py` 等にも `B-D5`/`B-D7`〜`B-D20` が
既に広範囲に存在しており、`B-D` は SS-88 当時の初期ナンバリングの生き残りと見られる）。
このチケットの実装計画は「実装ステップ」冒頭で明示的に
「コードのコメントは ADR-009 の決定番号（決定25〜29）で参照し、計画書内のラベル・節番号・
揮発性の作業メモ置き場を書かない（docs-lint と SS-111 のレビュー指摘）」と自己規定していたにも
かかわらず、新規コードの一部がそれに従わず `B-D*` を引き続き使ってしまった。`scripts/knowledge/check-tmp-references.sh` は
`docs/`・`.claude/agent-memory/`・トップレベル `*.md` のみを走査し `src/**/*.py` を検査しないため、
この種のコード内コメント参照はCIで検知されない（4ドメイン目以降でも継続する抜け穴）。

**How to apply:** 新しいドメイン実装のレビューで `（D\d+）` `（Q\d+）` `（[A-Z]-\d+）` のような decision code を含むコメントを見たら、
- コメント本文だけで意図が自己完結しているか確認する（自己完結していれば decision code 自体は無害な飾りとして許容範囲、Low/Suggestion 止まり）。
- 自己完結していない場合や、参照先が ADR (`docs/adr/`) など**コミットされているドキュメント**であれば問題ない。gitignore 対象の `tmp/` にしかない場合は Medium 程度で指摘し、「重要な設計判断は ADR 化するか、コメントを自己完結させる」ことを提案する。
- 既存踏襲パターンなので「このPRのオリジナルの問題」として過度に厳しく扱わない一方、繰り返し発生しているなら次にコードベース全体のクリーンアップ提案をするタイミングかもしれない。
