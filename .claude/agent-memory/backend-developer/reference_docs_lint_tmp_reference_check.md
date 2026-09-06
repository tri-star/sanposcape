---
name: reference-docs-lint-tmp-reference-check
description: docs-lint CI(scripts/knowledge/check-tmp-references.sh)がdocs/・packages/*/docs/・.claude/agent-memory/・ルート*.mdからのtmp/参照を検出しビルドを落とす
metadata:
  type: reference
  scope: durable
---

`.github/workflows/docs-lint.yml` が `docs/**` `packages/*/docs/**` `.claude/agent-memory/**`
`*.md`（ルート直下）の変更時に `scripts/knowledge/check-tmp-references.sh` を実行する。
このスクリプトは恒久ドキュメント層（ADR・`packages/*/docs/`・agent-memory・ルートの `*.md`）から
`tmp/<何か>` へのパターンで一致する参照を検出する（`/tmp/` や `$TMPDIR`、`foo.tmp/` は対象外）。
新規に見つかった違反（`scripts/knowledge/tmp-reference-baseline.txt` に未記載のファイル由来）は
CI を失敗させる。既存の未解消違反（2026-09-06 時点で29ファイル）はベースラインに載っているため
黙認されるが、**新規作成する ADR やデプロイ手順書などの恒久ドキュメントは `tmp/` を一切参照
してはいけない**（`tmp/` は `.gitignore` 対象でリンク切れになるため。AGENTS.md にも明記されている
プロジェクトルール）。

**Why:** `tmp/<issue-id>/` はセッション間の作業メモ置き場であり、決定事項そのものは ADR へ、
再利用ノウハウは agent-memory へ「昇格」させる 3 層モデル（知識の置き場所ガイドライン）を
CI で強制するための仕組み。

**How to apply:**
- ADR や `packages/*/docs/*.md` を新規作成・編集した後は、必ず
  `grep -n "tmp/" <対象ファイル>` で目視確認するか、
  `bash scripts/knowledge/check-tmp-references.sh` をローカルで実行してから commit する
  （SS-67 Phase6 の ADR-005 / deployment.md 作成時に実施し、green を確認した）。
- どうしても `tmp/` の運用ルール自体を説明する必要がある行には `tmp-ref-ok` というコメントを
  添えると例外扱いになる。
- `.claude/agents/` や `.claude/skills/` はワークフロー定義そのもの（「tmp/<issue-id>を使え」という
  指示）として意図的にスキャン対象外になっている。
