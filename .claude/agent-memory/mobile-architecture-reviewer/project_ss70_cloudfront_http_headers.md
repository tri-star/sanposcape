---
name: project_ss70_cloudfront_http_headers
description: SS-70 (CloudFront/SigV4対応, x-amz-content-sha256 + X-App-Authorization) のレビューで得た、mobileのHTTP出口2箇所パターンとapi/層へのネイティブ依存混入に関する確認事項
metadata:
  type: feedback
  scope: durable
---

## 背景

SS-70 で mobile の HTTP 送出側に `x-amz-content-sha256`（`src/api/contentHash.ts`、`expo-crypto` 使用）
と `X-App-Authorization`（`src/api/authHeaders.ts`）を追加した。決定事項そのものは
`docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md`（SS-70 追補）に記録済み。
このメモリは ADR に書くほどではない「次に同種の差分をレビューするときに確認すべきこと」を残す。

## mobile の HTTP 出口は2箇所ある（1箇所ではない）

`src/api/client.ts` の `customFetch`（Orval mutator）と `src/services/auth/authApi.ts` の
`post()`（401→refresh の再帰を避けるため意図的に `customFetch` を経由しない）。
横断的な変更（認証ヘッダー・署名ヘッダー等）は**両方**に入っているか必ず確認する
（`.claude/agent-memory/mobile-developer/mobile-two-http-exits.md` にも同じ内容の記録あり）。
共有ロジックは `src/api/` の独立モジュール（`contentHash.ts` 等）に切り出し、両方から import する
のが SS-70 で確立したパターン。

**How to apply**: 3つ目の HTTP 出口が生えていないか（`grep -rn "await fetch(\|= fetch\b" src/`）を
毎回確認する。oxlint に「生の `fetch` を `client.ts`/`authApi.ts` 以外で禁止する」ルールは無く、
機械的な検知手段が無い。付け忘れはローカルでは絶対に発覚せず、CloudFront 経由に切り替えた瞬間だけ
403/401 になる failure mode を持つ。

## api/ 層への初のネイティブ依存混入

`contentHash.ts` は `expo-crypto`（ネイティブモジュール）を直接 import する。
`client.ts` の JSDoc は「`services/auth` を直接 import しない（循環参照とネイティブ依存混入を
避けるため）」と書いており、この一文の精神からすると `api/` 層に生のネイティブモジュールが
直接入ること自体は本来避けたい対象だが、`contentHash.ts` は例外として通っている
（UTF-8エンコード事故のリスクを避けるため純JS実装を却下した判断とセット。妥当ではあるが
「behaviorally-divergent な依存(services)は避けるが、universal で mock 不要な暗号計算は
api/ に直接置いてよい」という区別はどこにも明文化されていない）。

**How to apply**: 次に `src/api/` 配下へネイティブモジュール import が追加される差分を見たら、
この区別が明文化されたか（または今回同様、暗黙のまま繰り返されているか）を確認する。
Vitest 側は `vitest.config.ts` の `resolve.alias` に `expo-crypto` を追加し、
`src/test/mocks/expo-crypto.ts`（`node:crypto` で実際に正しい SHA-256 を返す）で対応済み。
既存の `expo-secure-store`/`expo-location` モックは「安全弁」（バレル経由の事故防止。実際のテストは
個別モジュールへの直接フェイク注入で行う）だが、`expo-crypto` モックは唯一「テストの主張の正しさが
このモックの実装に懸かっている」点で性質が異なる（`contentHash.test.ts` 冒頭コメントに明記あり）。

## ADR参照時の曖昧さに注意

mobile には `packages/mobile/adr/ADR-005-styling-without-unistyles.md`（スタイル）と
リポジトリルートの `docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md`
（CloudFront/SigV4）という**同じ番号のADRが2種類**存在する。mobile のコード中で
「（ADR-005 決定4）」のようにパスを省略した参照を見たら、どちらを指すか必ずファイルパスで確認する
（SS-70 では `src/api/authHeaders.ts`・`src/services/auth/authApi.ts` がパス省略、
`src/api/contentHash.ts` はフルパス記載、と同一PR内でも表記が割れていた）。
