---
name: maestro-e2e-review-approach
description: Maestro E2E フロー（.maestro/*.yaml）と testID 追加のレビューでは、コメントの前提（画面遷移・canGoBack 挙動）を実際の router.push/replace 呼び出しまで追跡して裏取りする
metadata:
  type: project
---

SS-21（`.maestro/` の MVP フロー追加・testID 追加）のレビューで有効だった手順。

**Why:** Maestro の yaml コメントは「なぜこのステップが安全か」を主張するが（例: 「戻ると
idle 表示になる」「openLink 後は canGoBack() が true になる」）、これは Expo Router の
`router.push` / `router.replace` の使い分けと Stack 構成に依存する実装詳細であり、yaml だけを
読んでも真偽が判断できない。SS-21 では `app/_layout.tsx` が単一の `<Stack>` であること、
`WalkSummaryView` → `WalkDetailView` が `replace`、`WalkActiveView` → `WalkSummaryView` が
`push` であることを Grep/Read でたどることで、フローのコメントの主張が実装と一致していると
確認できた。

**How to apply:**
1. yaml 内で「戻ると◯◯画面になる」「◯◯は true/false になる」と主張するコメントを見つけたら、
   対象コンポーネントの `router.push` / `router.replace` 呼び出しを Grep し、実際のスタック構成を
   手でトレースする。
2. `openLink`（ディープリンク）を使うフローは、既存のルーティング構成（root が単一 Stack か、
   ネストした Navigator か）によって「push」か「reset」かの挙動が変わるため、`app/_layout.tsx`
   と対象ルートファイルの配置（`app/` 配下のグループ構造）を必ず確認する。
3. `waitForAnimationToEnd` を「時間稼ぎ」目的で使っている箇所（アニメーションではなくポーリング
   間隔のあるデータ更新に依存させるトリック）を見つけたら、その UI が本当に継続的に変化し続けるか
   （タイマー表示など）を確認し、非自明な依存であることをレビューコメントで指摘する。
4. `docs/milestones.md` 等の完了条件チェックリストが「ローカル実機検証は未実施」と自己申告している
   場合、それは Warning 相当（プラン自身の完了条件を満たしていない可能性）として扱ってよい。
   静的なコードトレースで整合性が取れていても、実機での検証未了は指摘に値する。
