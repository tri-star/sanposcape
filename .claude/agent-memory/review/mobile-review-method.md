---
name: mobile-review-method
description: mobile レビューの進め方 — 一次情報で裏取りしてから指摘、一覧外ファイルの JSDoc の陳腐化、引き継ぎの未検証事項と知見の保存先、Maestro のコメントの裏取り、誤指摘しないパターン、テストの見方
metadata:
  type: feedback
  scope: durable
---

## 指摘する前に一次情報を読む

プランや既存コードの記述を信じると、解消済みの前提や元デザイン由来の値を「バグ」と誤って指摘する。
- プランが Orval 生成物や backend の型に触れていたら、生成物（`pnpm --filter mobile orval`）と `router.py` / `schemas.py` の現物を読む。
  プランの条件付きの記述（「〜までは〜する」）は条件が今も真か確かめる（SS-19 では「`data: void` なので narrowing」が既に解消済みだった）。
- スタブ値・既定値が別のデータと食い違って見えたら、`docs/mock/*.dc.html` を grep する。元モックの時点で同じなら既存仕様として扱う（SS-9 の `DEFAULT_WALK_GOAL`）。

## 編集対象外のファイルの JSDoc・コメントが古くなる

プランの「作成・編集・削除するファイル」に入っていないのに設計変更の影響を受けるファイルは、JSDoc・コメント・型の説明が古いまま残る。
特に「呼び出し元を A から B へ移す」リファクタでは、呼ばれる側（`src/lib/sessionCleanup.ts` のような基盤）の JSDoc に旧呼び出し元の名前が残る（SS-13）。

**How to apply:** 変更した関数・状態・遷移を参照している一覧外のファイルを grep し、JSDoc の主張が新しい実装と一致しているかを見る。食い違いは Warning。

## 引き継ぎの未検証事項と知見の保存先

- 地図・カメラ・センサーなどネイティブ依存の UI が中核のチケットでは、プラン・PR の「未実施の手動確認」「既知の限界」を読む。
  中核フローの実機検証が未了なら、実装の正しさとは別に Warning で報告する（SS-118 ではマーカータップ → 詳細が未検証のまま E2E からも外れていた）。
- プランの「実機で確認すべきこと」「既知の制約」「フォールバック案」が、コードのコメントか ADR に残っているか確かめる。どこにも無ければ Warning（プランはチケット完了時に消える）。
- 地図のタップで座標を選ぶ実装では、Marker の真上をタップしたとき（Android は MapView に伝わらない。ADR-M-011）を Android 実機で確かめたか問う。

## Maestro のフローは主張を実装まで追う

yaml のコメントの主張（「戻ると◯◯になる」「`canGoBack()` が true になる」）は、対象の `router.push` / `replace` を grep してスタックを手でたどって確かめる。
`openLink` を使うフローは `app/_layout.tsx` と `app/` のグループ構造も見る。`waitForAnimationToEnd` を時間稼ぎに使っていたら、非自明な依存として指摘する。

## 誤指摘しないもの

- **render 中の ref への代入**（`pausedRef.current = paused`、`useScreenBack` の `interceptRef`）は正当。依存配列から外したい理由がコードに書かれているかだけ見る。
- **render 中の条件付き setState**（派生 state）は規約どおり（`architecture-guideline.md`）。無限ループにならないか・同種のブロックが二重発火しないかを追ってから判断する。
- **hooks / components にテストが無いこと**は指摘しない（Vitest は node 環境）。ロジックが `lib/` に出て `.test.ts` があるかを見る。
- **操作ごとに別の `xxxError.ts`** は意図的（ADR-M-001 決定6）。統合を提案しない。逆に別の操作の分類を再利用していたら要注意。

## テストの見方

- 既知の定数（ハッシュ等）を実装と同じ定数を import して比べるだけのテストは指摘する。別ルートで計算した値と比べさせる
  （SS-70: 空文字列の SHA-256 の typo を検出できない形だった。`createHash("sha256").update("").digest("hex")`）。
- `*Copy.test.ts` の非空チェックは既存の慣習なので単発で Warning にしない。
- プランが模範に名指しした形式（`src/lib/backNavigation.test.ts` の `it.each` テーブル）に倣っていなくても Low の Suggestion に留める。
