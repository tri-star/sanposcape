---
name: adr-renumber-sed-pitfall
description: ADR の番号と置き場所を変えるとき、番号だけを一括置換すると、ファイル名（スラッグ）も変わった参照が実在しないパスに化ける。旧パス全体→新パス全体で置換し、置換後に grep で確かめる
metadata:
  type: feedback
  scope: durable
---

SS-141 で ADR-011（backend のテスト DB 分離）を `packages/backend/docs/adr/ADR-B-001-test-db-isolation-by-table-reset.md` へ移したとき、
移動先のファイル名から `backend-` が抜けた。agent-memory 内の参照を `sed -i 's/ADR-011/ADR-B-001/g'` で一括置換したため、旧ファイル名を含む参照が
`ADR-B-001-backend-test-db-…` という実在しない名前に化けた1件を見落としかけた。

**Why:** ADR の移動・改番では、番号の書式とファイル名（スラッグ）が同時に変わることがある。番号だけの置換は「番号以外は同じ」という前提に依存する。

**How to apply:**
- まず正しい新パスを1つ確定させ、「旧パス全体」→「新パス全体」で置換する（`sed 's|旧パス|新パス|g'`）。番号だけの置換は、ファイル名に
  番号以外の変更が無いことを確かめてから使う。
- 置換の後は `grep -rn "<新番号>-<旧ファイル名の一部>"`（例: `grep -rn "ADR-B-001-backend"`）で、誤った文字列が混ざっていないかを確かめる。
- メモリやドキュメントの参照の移し替え全般（メモリの統合・改名を含む）にも同じ手順が使える。
