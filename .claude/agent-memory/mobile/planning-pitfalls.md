---
name: planning-pitfalls
description: mobile の計画時に効く確認事項 — 「別課題で削除」の予告を拾う、新しいドメイン語の衝突、未使用の既存 Expo 依存は安い、サーバーの制約をユーザー操作で回避させない、リリース順序
metadata:
  type: feedback
  scope: durable
---

読む順序・ADR・規約は `packages/mobile/AGENTS.md` から辿る。ここには正本に無い、計画で踏みやすい点だけを置く。

## 「別課題で削除」の予告を拾う

過去の計画が ADR 追補・JSDoc・Maestro のコメントに「◯◯の別課題で削除」と残していることがある
（例: SS-146 が予告した `/pins/map`・`/pins/pick-location` は SS-147 で削除）。

**Why:** チケット本文に書かれていなくても、今回の課題がその予告に当たることがある。予告の文言を放置すると陳腐化する。

**How to apply:** 計画の前に `rg '別課題'` で拾う。今回がその課題なら、分離できるフェーズとしてスコープに入れるか決めて handover に残す。
入れない場合も予告の文言を更新する。

## 新しいドメイン語は既存の語と衝突しないか先に確かめる

SS-88 の初版プランは「コードは Spot / UI はピン」としたが、ユーザーに上書きされた。スポットは `SpotCandidate`（ゴール候補）に限定されている（ADR-009 決定1）。

**How to apply:** 新しい語を作るときは、既存の UI・コードで同じ語が別の意味に使われていないかを `rg` で確かめる。
衝突するなら、全レイヤーで別の語に統一する案を第一候補にする。

## サーバーの制約をユーザー操作で回避させない

写真枚数の上限をユーザーに意識させる案は却下され、先行アップロード + 分割紐付けでクライアント側に吸収した（ADR-M-010）。

**How to apply:** サーバーの制約がユーザーの明示した要件と衝突するなら、まずクライアント側で吸収できないかを考える。

## 未使用の既存 Expo 依存は新しいネイティブ依存より安い

`expo-web-browser` は SS-158 以前から dependencies にあり、autolinking で既存のビルドに入っていた。
使い始めても development build の作り直し・fingerprint の変化は起きなかった（ADR-M-020）。

**How to apply:** 依存の追加を計画する前に、`package.json` にあるが未使用の Expo モジュールを `rg` で探す。
新しいネイティブ依存のコストは development build の作り直し（ADR-M-003）と `minimumReleaseAge`（2日）。

## 本番に出るまで壊れる変更はリリース順序を書く

法的文書の URL は全ビルドで本番 LP に固定している（ADR-M-020）。LP の本番デプロイが先でないと、全ビルドでリンク切れになる
（アプリ内ブラウザ上のエラーになるだけで、アプリの失敗案内は出ない）。

**How to apply:** mobile・LP・backend にまたがる変更では、デプロイの順序をプランと handover に書く。

Related: [[testing-and-e2e]], [[pins-and-photos]]
