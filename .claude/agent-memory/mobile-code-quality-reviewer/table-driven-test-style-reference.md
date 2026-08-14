---
name: table-driven-test-style-reference
description: mobileのテーブル駆動テストは src/lib/backNavigation.test.ts の it.each 形式が模範。個別 it() の羅列との乖離をレビューで拾う。
type: project
---

`src/lib/backNavigation.test.ts` は `it.each([...] as const)("... → $expected", (...) => {...})`
という単一テーブル + テンプレート文字列タイトルの形式で、mobile-plan.md 等の実装プランが
繰り返し「テーブル駆動テストの参考」として名指しする、事実上の模範実装になっている。

**Why:** SS-37 の `walkSaveTrigger.test.ts` / `postSignInDestination.test.ts` は
プランが `backNavigation.test.ts` を参考にするよう明記していたにもかかわらず、
実装では個別の `it()` を9件・4件並べる形になっていた（機能的には問題ないが一覧性が落ちる）。

**How to apply:**
- プランや既存テストが「参考にせよ」と名指ししているファイルがある場合、実装がその形式に
  実際に倣っているかを diff で確認する。倣っていなくても Critical/High ではなく
  Low suggestion 相当（プロジェクト規約からの軽微な逸脱）として指摘する。
- 新規テストファイルをレビューするときは `src/lib/backNavigation.test.ts` を一度読んで
  スタイルの基準にする。
