---
name: antipattern_plan_decision_refs
description: 実装コードのコメントに「D3」「Q3」「B-3」のような計画ドキュメントの決定コードだけを埋め込み、その定義がgitignore対象のtmp/にしかなく将来追跡不能になる、このコードベース横断の再発パターン。
metadata:
  type: feedback
---

SS-18 (`walks/` ドメイン) のレビューで発見。`walks/models.py` / `walks/schemas.py` / `walks/repository.py` / `walks/exceptions.py` / `walks/router.py` に `（D1）` `（D3）` `（D6）` `（Q3）` のような決定コードが多数埋め込まれているが、その定義は `tmp/SS-18/backend-plan.md` にしかない。`tmp/` はリポジトリの `.gitignore` に含まれており（`/home/tristar/projects/sanposcape/.gitignore` の3行目）、コミットされない。

同様のパターンが `auth/mappers.py` の `（B-3）` コメント（および `auth/tests/test_mappers.py`）にも既に存在する。SS-18 が最初の事例ではなく、既存の踏襲された書き方。

**Why:** コメント自体は「なぜ」を一応説明しているので単体では読めるが、コード末尾の decision code は将来のレビュアー・新メンバーには何の情報も持たない記号でしかなく、由来を追跡する手段がない（plan doc がリポジトリに存在しないため）。

**How to apply:** 新しいドメイン実装のレビューで `（D\d+）` `（Q\d+）` `（[A-Z]-\d+）` のような decision code を含むコメントを見たら、
- コメント本文だけで意図が自己完結しているか確認する（自己完結していれば decision code 自体は無害な飾りとして許容範囲、Low/Suggestion 止まり）。
- 自己完結していない場合や、参照先が ADR (`docs/adr/`) など**コミットされているドキュメント**であれば問題ない。gitignore 対象の `tmp/` にしかない場合は Medium 程度で指摘し、「重要な設計判断は ADR 化するか、コメントを自己完結させる」ことを提案する。
- 既存踏襲パターンなので「このPRのオリジナルの問題」として過度に厳しく扱わない一方、繰り返し発生しているなら次にコードベース全体のクリーンアップ提案をするタイミングかもしれない。
