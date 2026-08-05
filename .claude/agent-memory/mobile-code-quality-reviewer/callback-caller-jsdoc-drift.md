---
name: callback-caller-jsdoc-drift
description: 「実行側（呼び出し元）」を移すリファクタで、呼ばれる側の関数のJSDocに残った旧呼び出し元の記述が更新されず取りこぼされやすい
metadata:
  type: project
---

SS-13（`packages/mobile/src/lib/sessionCleanup.ts`）で見つかったパターン。
`runSessionCleanup()` の実行側を `SettingsView`（サインアウト導線）から
`useAuthSessionStore.setSession()`（`authenticated → guest` 遷移時）へ移す変更だったが、
実装プランのファイルツリーに `sessionCleanup.ts` 自体は編集対象として載っておらず
（呼び出し元だけが変わり、`registerSessionCleanup`/`runSessionCleanup` のシグネチャは不変のため）、
`runSessionCleanup()` のJSDoc内の「呼び出し側はサインアウトを実行するレイヤのみ（現状は
`SettingsView` のサインアウト導線）。」という一文だけが更新されずに残っていた。
一方 `docs/folder-structure.md` 側は同じ変更を正しく反映済みだった（ドキュメントと
コード内JSDocの間で記述が食い違った状態）。

**Why:** 「呼び出し元を差し替える」リファクタは、差し替え先（新しい呼び出し元）のファイルは
プランやdiffに載るが、呼ばれる側（コールバック登録・実行の基盤関数）のJSDocに「現状の呼び出し元」を
名指しで書いてあるコメントは、シグネチャが変わらないためレビュー対象からも実装対象からも
漏れやすい。特に `src/lib/` のような横断ユーティリティは、機能追加のたびに「今のところ呼んでいるのは
どこか」という具体例コメントが古びていく傾向がある。

**How to apply:** 「実行側（呼び出し元）を A から B に移す」系のタスクをレビューするときは、
新しい呼び出し元（B）のコードだけでなく、呼ばれる側の関数定義のJSDoc/コメントで
旧呼び出し元（A）を名指ししている箇所が無いか `Grep` で該当関数名を検索し、横断的に確認する。
実装プランのファイルツリーに載っていないファイルでも、コールバック登録・実行系の
基盤モジュール（`src/lib/sessionCleanup.ts` のような）は要チェック対象に加える。
