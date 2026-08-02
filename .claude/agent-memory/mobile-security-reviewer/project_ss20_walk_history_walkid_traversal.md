---
name: project_ss20_walk_history_walkid_traversal
description: SS-20 散歩履歴詳細画面で初めて動的ルート([walkId].tsx)が導入され、walkIdが未検証のままAPIパスに埋め込まれている（High指摘）
type: project
---

`packages/mobile/app/walk-history/[walkId].tsx` は **アプリ初の Expo Router 動的ルート**（`[param]` 形式）。
`useLocalSearchParams<{ walkId: string }>()` の値を非空文字列チェックのみで
`fetchWalkDetail(walkId)` → `getWalkWalksWalkIdGet(walkId)` → 生成コード
`getGetWalkWalksWalkIdGetUrl` (`src/api/generated/endpoints/walks/walks.ts:368-374`) の
テンプレートリテラル `` `/walks/${walkId}` `` にエンコードなしで渡している。UUID形式チェックも
`encodeURIComponent` も無い（`walkHistoryApi.test.ts` にも悪意ある walkId のテストなし）。

**Why:** React Navigation/expo-router のリンクパースは path をリテラル `/` で分割してから
`decodeURIComponent` をセグメント単位で適用するため、ディープリンク
`sanposcape://walk-history/..%2F..%2Fusers%2Fme` のようなパーセントエンコードされた `/` は
1つの `walkId` セグメント内で decode され、実際のスラッシュを含む文字列 `"../../users/me"` に
なり得る（普通のタップ内遷移では item.id しか渡らないので安全だが、ディープリンク経由は別）。
これが `/walks/${walkId}` に代入されると `/walks/../../users/me` となり、WHATWG URL の
dot-segment 正規化（Node で実証済み: `new URL('/api/walks/../users/me', base).href` →
`/api/users/me`）によって、customFetch が組み立てる最終URLが同一ホスト内の別エンドポイントに
差し替わる。`customFetch`（`src/api/client.ts`）は宛先パスに関わらず常に `Authorization: Bearer`
を付与する（`src/api/authHeaders.ts`）ため、被害者の有効なトークンで攻撃者が選んだ同一ホスト上の
任意パスへのリクエストが発生し得る（confused deputy / path traversal 相当）。

**How to apply:** 今後 `[param].tsx` 形式の動的ルートが追加されるたびに、ルートパラメータが
バリデーション（形式チェック、例えば UUID 正規表現）なしに API パス構築へ渡っていないか確認する。
`walkId==null` 相当の早期リターンパターンをバリデーション失敗時にも適用しているか確認する。
生成コード（`src/api/generated/`）は手編集禁止なので、修正は呼び出し側（`fetchWalkDetail` 等）での
事前バリデーションになる。関連: [[project_dev_only_routes_no_guard]]（同ルートに認証ガードも無い）。
