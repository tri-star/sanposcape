---
name: planning-inputs
description: プラン作成の入力の所在と読む順序 — SS-xx 課題は Plane、ADR は mobile adr/ と横断 docs/adr/（番号の採り方・追補の書式）、設計資料、プランの出力先
metadata:
  type: reference
  scope: durable
---

## 課題

- Plane の課題 ID は **`SS-xx`**（汎用プロンプト例の `MOB-xx` ではない）。backend と mobile で同じ連番を共有する。
- 残作業は **Plane だけ**で管理（プロジェクト識別子 `SS`）。`docs/milestones.md` は 2026-08-22 に削除済みなので探さない。
  周辺文脈は Plane の課題 + 関連 ADR から読む。

## 読む順序

`packages/mobile/AGENTS.md`（ADR 一覧つき）→ 該当 ADR → `packages/mobile/docs/`（architecture-guideline / folder-structure /
naming-conventions / pages-components-guideline / toolsets-libraries / build-profiles）→ 実コード。
ガイドラインが「何をするか」、ADR が「なぜそうなっているか」を持つ。

## ADR の使い分けと書き方

- **mobile 固有**: `packages/mobile/adr/ADR-M-0XX-*.md`（SS-132 で改名）。本文中でも `ADR-M-0XX` と書く。番号だけの `ADR-0XX` は
  ルートの `docs/adr/`（frontend/backend 横断・ドメイン知識）を指す。
- 使用済みの番号は `packages/mobile/adr/` の現物で確かめる。並行チケットが同じ番号を取り合うことがあるので、
  プランには「着手時に main の `adr/` を見て番号を決める」と書く。**main だけでは足りない**: 未マージの兄弟 worktree
  （`/home/tristar/orca/workspaces/sanposcape/*/packages/mobile/adr/`）を Glob で見る（SS-173 では 019 を2つの worktree が既に使っていた）。
  埋まっていればプラン中は `ADR-M-0XX`（見込み番号を併記）と仮置きする。ルート ADR-009 の決定番号も同じ問題がある（backend 側が採番）。
- ADR を覆す/追補する場合は `adr-writing` skill を使う。ADR を追加したら `packages/mobile/AGENTS.md` の ADR 一覧表にも行を足す
  （ルートの `README.md` / `docs/project-overview.md` の一覧も確認）。
- 章立ては既存に揃える（日付 / ステータス / コンテキスト / 決定 / 検討した選択肢 / 決定理由 / 影響 / 関連情報）。
  追補は日付行に「YYYY-MM-DD 追補（SS-XX）」、本文の該当箇所に `（SS-XX 追補）`。解決済みの「移行・対応が必要な事項」は
  消さずに取り消し線 + `→ SS-xx で決着`（ADR-M-008 が実例）。
- プランに ADR の本文を指示するとき「理由は本プラン §X」と書かない（実装者がそのまま ADR に書き写すと、ADR からプラン置き場への
  リンク切れ参照になる。docs/knowledge-management.md の禁止事項）。理由は ADR 本文に書き写すよう指示する（SS-175 で自分のプランに混入していた）。

## 出力先

- プラン: リポジトリルートの `tmp/<issue-id>/mobile-plan.md`。 <!-- tmp-ref-ok: 参照先ではなくプランの出力先の指示（.claude/agents/ と同じ性質） -->
- 判断の記録の扱いは [[workflow-preferences]]。

Related: [[planning-constraints]], [[reference-remote-branch-access]]
