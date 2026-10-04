---
name: feedback-adr-renumber-sed-pitfall
description: ADRの番号を一括置換（ADR-011→ADR-B-001等）でagent-memory内の参照を直すとき、ファイル名文字列に旧番号+旧名の断片が二重に残る事故が起きうる
metadata:
  type: feedback
  scope: durable
---

SS-141のローカルレビュー対応（2026-09-29）で、ADR-011（backend のテストDB隔離）を
`packages/backend/docs/adr/ADR-B-001-test-db-isolation-by-table-reset.md` へ移動した。移動元のファイル名は
「ADR-011-backend-test-db-isolation-…」で、移動先ではファイル名から「backend-」が抜けた。
このとき `.claude/agent-memory/` 内の参照を `sed -i 's/ADR-011/ADR-B-001/g'` で一括置換したため、
旧ファイル名を含む参照が「ADR-B-001-backend-test-db-isolation-…」という実在しないファイル名に化けた
1件を見落としかけた（この置換は「番号だけが変わり、ファイル名の残りは同じ」という前提で書いていた）。

**Why:** ADRの移動・改番では「番号の書式」と「ファイル名（スラッグ）」が同時に変わることがある
（今回は backend 配下への移動でファイル名から `backend-` が落ちた）。番号だけを機械的に置換すると、
ファイル名を含む文字列参照はその前提が崩れて壊れる。

**How to apply:**
- ADRの番号とファイル名を同時に一括置換するときは、まず正しい新パス／新ファイル名を1つ確定させ、
  「旧パス全体」→「新パス全体」の置換（`sed 's|旧パス|新パス|g'`）にする。番号だけの置換
  （`s/ADR-011/ADR-B-001/g`）は、ファイル名にADR番号以外の変更（プレフィックスの追加・削除等）が
  無いことを確認してから使う。
- 一括置換後は `grep -rn "<新番号>-<旧ファイル名の一部>"` のような形で、誤った文字列の混入が
  無いか必ず確認する（例: `grep -rn "ADR-B-001-backend"`）。
