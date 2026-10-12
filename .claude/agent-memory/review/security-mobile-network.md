---
name: security-mobile-network
description: mobile の通信とデータのセキュリティレビュー観点 — HTTP 出口と CloudFront ヘッダー、動的ルートのパラメータ検証、写真の直送と閲覧、散歩・位置情報、散歩記録の保存
metadata:
  type: feedback
  scope: durable
  adr: docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md
---

設計の正本は ADR-005 決定4・棚卸し追補（ヘッダーと再送）、ADR-M-010〜M-012（写真・地点選択・閲覧）、ADR-M-006 / M-008（位置情報・散歩）、ADR-003（保存）。
HTTP 出口の構成は `architecture-guideline.md`「送信側のヘッダー契約」。

## HTTP 出口とヘッダー

ヘッダーの付け忘れはローカルでは発覚せず、CloudFront に向けた瞬間に 401/403 になる。生の `fetch` を禁止する lint も無い。
1. 横断ヘッダーの変更が backend 向けの2出口（`client.ts` / `authApi.ts`）の両方に入り、S3 直送には入っていないか。共有ロジックは `src/api/` の独立モジュールか。
2. 毎回 `grep -rn "await fetch(\|= fetch\b" src/` で想定外の出口が増えていないか。
3. 401 → refresh → 再送で、ハッシュ計算済みの options を使い回していないか（ボディとハッシュの不整合）。
4. `redirect: "error"` を外していないか。ただし RN 実機では効かないので、リダイレクトを返しうる backend の変更が無いかの方が重要。
5. ロギング・クラッシュレポートを導入する PR では `X-App-Authorization` / `x-amz-content-sha256` をマスク対象に明示しているか（非標準ヘッダーは自動マスクされない）。
6. `src/api/` にネイティブモジュールを足す差分は、例外の条件（real/mock の分岐を持たない環境非依存の計算）に当たるか、`vitest.config.ts` の `resolve.alias` にモックがあるか。

## 動的ルートとパラメータ

- `[param].tsx` の ID は route 側と API fetcher 側の2層で `isUuid()` を通しているか。Orval の URL ビルダーはエスケープしないので、未検証だとディープリンクの `../` でトークン付きリクエストを別エンドポイントへ送らせうる（SS-20 で解消済み。再指摘しない）。
- 座標は送る側（`toPickedCoordinate`）と受ける側（`parsePinLocationParams` / `isValidCoordinate`）の両方で検証しているか。生の座標・`place_id` を router params に載せていないか（散歩は store 経由）。
- `/pins/[pinId]` のメンバーシップは backend（非メンバーに 404）が唯一の防衛線。mobile は応答に従うだけで妥当。

## 写真の直送と閲覧

backend 以外への直送経路が増えたら:
1. 認証ヘッダーや `x-amz-content-sha256` を付けていないか（`customFetch` を通さない）。
2. 送信先がホワイトリスト方式か（`isAllowedUploadUrl`: https は許可、http は backend と同一 origin のみ。origin は `URL.origin` ではなく protocol/hostname/port を個別比較）。
3. `redirect` だけで守られているという主張は通さない。
- 閲覧の presigned GET にも `isAllowedUploadUrl` を通しているか。画像キャッシュのキーは URL を含まない `pin-photo:<photo.id>:<variant>` か。
- サインアウト時のキャッシュ消去は、起動時に必ず読み込まれるモジュール（`imageCacheCleanup.ts`）で登録しているか。
- EXIF は撮影日時だけを取り出して捨てているか（GPS を外へ出さない・保存しない・ログに出さない）。
- UI の disabled（`canAdjustPinLocation` 等）だけに頼っていないか。`client_pin_id` の冪等再送で実害が無いかを確かめる。

## 散歩・位置情報

1. `watchPosition` の購読がリークしないか（resolve 前にアンマウントされたら即 `remove()`。`useWalkTracking.ts` の `cancelled` が模範）。
2. 目的地名は呼び出し側の表示名を優先し、backend の `destination.name`（place_id のフォールバックあり）を直接出していないか。
3. 外部 API の応答は型ではなく値で検証しているか（`pickLegs()` の `leg.kind` の値マッチ + 件数。座標は `isValidCoordinate`、数値は `toNonNegative`）。
4. 撤去系の PR では旧関数・旧ファイル名の参照が grep で0件か。
5. `console.*` に座標・トークンを出していないか（出力口は `diagnosticLog.ts`）。エラーはステータスで分類し固定文言か。

## 散歩記録の保存（POST /walks）

- 冪等キーの暗号強度は不要という主張は、一意制約のスコープ（`UNIQUE(user_id, client_walk_id)`）と repository が全メソッドで `user_id` を要求することを実コードで確かめてから判定する。スコープがグローバルなら判定は変わる。
- 軌跡の送信整形（小数6桁・連続重複の除去・10,000点超のダウンサンプリング。`walkTrackPayload.ts`）が backend の `schemas.py` の定数と一致しているか。
- `saveWalk()` は意図的に `signal` を渡さない。後始末の順序を変える差分では、前のユーザーのドラフトが次のユーザーのトークンで送られないか確かめる。
- 書き込みを伴う開発用ショートカット（`ScreenCatalog` の散歩サマリ）は `isDevToolsEnabled()` でガードされているか（staging では開く。ADR-M-007 SS-148 追補で許容）。
