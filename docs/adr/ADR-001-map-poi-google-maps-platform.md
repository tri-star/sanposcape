# ADR-001: 地図・POI・ルーティング基盤に Google Maps Platform を採用し backend 経由で利用する

## 現在有効な決定（要約）

> 最終更新: 2026-10-14（SS-138）。本節は本文（追補を含む）を要約したもので、一次記録は本文。
> 本文と食い違う場合は本節の誤りとして本節を直す。

### 決定

- **地図・POI・ルーティング・住所の基盤は Google Maps Platform（Maps / Places / Routes / Geocoding）**。（本文: 決定、SS-138 追補）
- **Places / Routes / Geocoding のデータ API は backend 経由で呼び、クライアントから直接叩かない**。backend にメモリの TTL キャッシュと
  レート制限を置き、DB・ログには残さない。（本文: 決定）
- **地図の描画は mobile の `react-native-maps`。mobile の SDK key と backend の server key は別のキーにする**。server key には
  Places API (New)・Routes API・Geocoding API を許可する。詳細は [ADR-M-007](../../packages/mobile/adr/ADR-M-007-expo-config-and-maps-key-injection.md)。
  （本文: 決定、SS-138 追補）
- **スポットの表示名は Places に日本語を優先指定し、日本語が無ければ provider の別言語名をそのまま使う**。backend は空・不正な表示名の
  候補だけを除き、mobile は空・不正な名前を「目的地」に置き換えて 256 code point に制限する。（本文: SS-43 追補）
- **往復の時間範囲の絞り込みは、徒歩片道×2の近似**。選択後のルートは周回全体の実測値（[ADR-007](./ADR-007-loop-route-generation.md)）。
  （本文: 移行・対応事項、SS-33 追補）
- **ピン登録時のピン名の初期値は、ピンの位置の住所**。backend の `POST /explore/reverse-geocode`（サインイン必須）が Geocoding API v4
  で住所と建物名を返し、mobile が `{住所} {建物名}付近` を組み立てて、未編集の名前欄にだけ入れる。ピン名の上限（50）は変えず、超えたら
  建物名を落とし、さらに住所を切り詰める。（本文: SS-138 追補）
- **位置データは緯度経度の列 + 単純検索**。PostGIS 等への移行余地を残す。（本文: 決定）

### 未解決・持ち越し

- server key への Geocoding API の許可と、実キーでの建物名の返り方の確認（本文: 移行・対応事項、SS-138 追補）
- 地理検索の要件が育った段階での PostGIS 等への移行（本文: 移行・対応事項）

### 変更・撤回された決定

- 基盤は Maps / Places / Routes → Geocoding API を追加（SS-138 追補）


## 日付

2026-07-19（初版）、2026-08-09 追補（SS-43）、2026-09-15 追補（SS-33）、2026-10-14 追補（SS-138）

## コンテキスト

sanposcape の中核体験は「現在地から指定時間で往復できる範囲のスポット候補を提示し、徒歩ルートを決めて散歩する」こと。これを実現するには次が必要になる。

- 地図表示（現在地・スポット・ルートの可視化）
- POI（スポット）データの取得（店・景色・史跡など）
- 徒歩の所要時間/距離の算出（「往復◯分で行ける範囲」の判定）

これらのデータソース・API を決める必要がある。制約・要件は以下。

- MVP を最短で通したい。データ品質が高く、単一ベンダーで揃うと開発が速い。
- 外部 API はコスト・レート制限があるため、無秩序な呼び出しを避けたい。
- backend(FastAPI) と mobile(Expo) のモノレポ構成。API キーの秘匿・課金管理が必要。

SS-43 では、Google Places 由来のスポット名が英語等のまま表示される問題に対応するため、
日本語を優先しつつ、日本語名が提供されない候補も利用できる表示名の扱いを決める必要が生じた。

## 決定

- **地図・POI・ルーティングの基盤に Google Maps Platform を採用する**（Maps / Places / Routes）。（**SS-138 追補**: ピンの位置の住所を引くため Geocoding API も使う。下記「SS-138 追補」の決定。）
- **Places / Routes のデータ API 呼び出しは backend 経由（キャッシュ/プロキシ層）で行い、クライアントから直接叩かない**。
  - mobile は backend の API を叩き、backend が Google Maps Platform を呼ぶ。
  - backend 側にキャッシュを差し込み、コスト・レート制限を制御する。
- 地図の**描画**は mobile 側の `react-native-maps` で行う（[ADR-M-002](../../packages/mobile/adr/ADR-M-002-mobile-tech-stack.md)）。タイル／SDK 通信と mobile 用に制限した SDK key は mobile 側で管理し、Places / Routes 用 server key（**SS-138 追補**: Geocoding API も許可する）と混在させない（SS-15 で実装。`packages/mobile/app.config.ts` が `GOOGLE_MAPS_ANDROID_SDK_KEY` を注入し、backend の `GOOGLE_MAPS_SERVER_API_KEY` とは別キーにする。詳細は [ADR-M-007](../../packages/mobile/adr/ADR-M-007-expo-config-and-maps-key-injection.md)）。
- スポット/記録の位置データは MVP では緯度経度カラム + 単純検索とし、将来の地理検索に備え PostGIS 等への移行余地を残す。
- （SS-43 追補）スポットの表示名は backend が Google Places Nearby Search に
  `languageCode: "ja"` と `regionCode: "JP"` を指定して日本語を優先する。日本語名が提供されない場合は、
  Google が返した別言語名をそのまま利用し、追加の翻訳処理は行わない。
- （SS-43 追補）backend は provider の表示名を trim し、空・不正な表示名の候補だけを除外する。
  Place ID を表示名の代わりには使わない。mobile は旧 backend や実行時の契約逸脱に備える最終防衛として、
  空・不正な表示名を「目的地」へ置き換え、表示用文字列を最大256 Unicode code pointに制限する。

- （SS-138 追補）**ピン登録時のピン名の初期値を、ピンの位置の住所にする**。backend の
  `POST /explore/reverse-geocode`（サインイン必須。`/explore` 配下でボディ上限・レート制限・例外の変換を共有）が
  Google Geocoding API v4（`GET /v4/geocode/location`）で逆ジオコーディングする。アプリから backend へは座標を GET のクエリに載せない
  （CloudFront のログに残るため）。
  - 応答は `address`（国名・郵便番号を落とし、全角の数字・記号を半角に揃えた住所）と `building_name`（`premise` のうち
    番地ではないもの。best-effort）の構造化した値。住所が無い場所は 200 + `null`。
  - 「付近」を付けた表示用のラベルと、ピン名の上限（50 code point）に合わせた切り詰め（建物名を落とし、それでも超えたら
    住所を切り詰める）は mobile が行う。UI の文言をアプリ側に置き、backend の契約を表示に依存させないため。
  - **ピン名の最大長（50）は変えない**。住所と建物名は典型的には 30〜40 文字に収まり、上限を上げると DB の列変更・API 契約・
    mobile の定数を同時に動かす必要がある。
  - 他の Places / Routes と同じく、backend のメモリに座標5桁の TTL キャッシュ（住所なしも含む）+ SingleFlight を置き、DB・ログには残さない。
  - API キーは Places / Routes と同じくヘッダー（`X-Goog-Api-Key`）で送る。座標は Google へのクエリ（`locationQuery`）で送り、
    パスの形（`/location/{lat},{lng}`）は使わない（ログの `_endpoint()` と `core/tracing.py` はクエリしか落とさないため）。
    httpx の INFO ログ（URL 全体）は `core/logs.py` で WARNING に固定し、HTTP エラーの例外連鎖も切る（`raise ... from None`）。
  - mobile の名前欄は「未編集（null）」と入力値を分けて持ち、未編集の間だけ住所を表示・保存する（effect で書き込まない）。
    取得が遅れて届いても入力中の名前を上書きせず、未編集のまま位置を調整すれば新しい位置の住所に変わる。初期値のままの名前は
    破棄確認の未保存入力に数えない。取得が終わる前に保存すると「無題のピン」になる（保存を住所の取得に左右させない）。

## 検討した選択肢

### 選択肢1: Google Maps Platform（採用）

- **概要**: Places API でスポット取得、Routes API で徒歩の時間/距離を算出。地図は Google/Apple ネイティブ地図。
- **メリット**: データ品質が高く、POI・ルーティングが単一ベンダーで揃い MVP に最短。無料枠あり。ドキュメント・実績が豊富。
- **デメリット**: 従量課金でコスト管理が必要。ベンダーロックイン。

### 選択肢2: OpenStreetMap 系（Overpass + OSRM/GraphHopper）

- **概要**: POI は Overpass、ルーティングは OSRM/GraphHopper。
- **メリット**: 無料/OSS でベンダーコストなし。
- **デメリット**: 公開 API のレート制限や自前ホスティングの検討が必要。POI 品質・整備コストが読みにくく MVP が遅くなる。

### 選択肢3: ユーザー記録のみ（外部 POI なし）

- **概要**: スポットはユーザーが歩いて記録したものだけ。
- **メリット**: backend が最小。
- **デメリット**: 「往復範囲のスポット候補提示」が初期は成立しない（シード前提）。本アプリの中核体験を満たせない。

### SS-43追補: 表示名のローカライズ方針

- **provider の言語指定を利用する（採用）**: backend から日本語を優先指定し、返された名称を利用する。
  日本語が無い場合も provider が返す別言語名を維持でき、追加の外部サービス・課金・待ち時間が発生しない。
- **mobile または backend で名称を機械翻訳する**: 日本語表示率は上げられるが、翻訳品質、固有名詞の改変、
  API コスト、応答時間、保存される目的地名との一貫性に新たな問題が生じるため採用しない。
- **日本語名が無い候補をすべて除外する**: 日本語表示は徹底できるが候補数が減り、散歩先を探す中核体験を
  損なうため採用しない。名称自体が空・不正な候補だけを backend で除外する。

### SS-138追補: ピン名の初期値に使う住所の取り方

- **Geocoding API v4 で逆ジオコーディングする（採用）**: ピンの位置そのものの住所が得られ、日本の住所では建物名が
  `premise` として返ることがある。2026-03-30 に GA。キーをヘッダーで渡せ、エラーも Places / Routes と同じ HTTP のステータスと
  `error` 本文で返る。既定の上限は 25 QPS で、この用途には足りる。Places / Routes と同じ server key に「Geocoding API」を許可するだけで使える。
- **Geocoding API v3（`maps/api/geocode/json`）**: 応答の内訳は v4 と同じだが、API キーを URL のクエリでしか受け取らない
  （ログ・トレースにキーが残らないよう気を配り続ける必要がある）。失敗も HTTP 200 + `status` で返り、他の API と扱いが揃わない。
  v4 が後継として GA になっているため採用しない（最初は v4 を Preview と誤認して v3 で実装し、同じ PR の中で v4 に切り替えた）。
  なお v3 は Google の Legacy 一覧には入っておらず、廃止予定も発表されていない（2026-10 時点）。
- **逆ジオコーディングの address descriptors（周辺の目印と位置関係）**: 建物の「中にいる」判定が取れるが、v3 だけの機能で日本では
  実験的な提供。v4 では SearchDestinations の landmarks（一部 Preview）に置き換わっている。今回はピン名の建物名の取り方を変えないので使わない。
- **Places API の Nearby Search で最寄りの施設名を使う**: 施設名は得られるが「ピンの位置の住所」にならず、ビルの中の店舗名を
  物件名と取り違える。施設が無い場所では何も返らないため採用しない。
- **応答で表示用のラベル（「付近」込み）を返す**: mobile は受け取るだけで済むが、文言・上限の変更に backend のデプロイが要り、
  表示の都合が API 契約に入るため採用しない。

## 決定理由

- 本アプリの中核である「往復範囲のスポット提示＋徒歩ルート」を**最短で成立**させられるのは、POI とルーティングが揃う Google Maps Platform だった。
- コスト・レート制限の懸念は、**backend 経由のキャッシュ/プロキシ層**を設けることで制御可能と判断した。クライアント直叩きにするとキー秘匿・キャッシュ・レート制御が困難になる。
- OSS 系は魅力的だが、MVP 段階での整備・運用コストが読みにくく、立ち上げ速度を優先して見送った（将来の乗り換え余地は残す）。
- （SS-43 追補）Google Places 自身の言語指定とフォールバックを利用すれば、候補の網羅性を保ちながら、
  翻訳サービスを追加せずに日本語表示を優先できる。backend を表示名の契約境界、mobile を防御的な表示境界とする。

## 影響

### ポジティブな影響

- 中核機能（探索・ルート）を早期に実装開始できる。
- コスト・レート制御・キー秘匿を backend の一箇所に集約できる。
- 地図描画とデータ取得の責務が分離される（描画=mobile、データ=backend 経由）。
- スポット名が日本語で表示されやすくなり、カード、ルート概要、地図マーカー、アクセシビリティ名で
  同じ表示名を一貫して利用できる。

### ネガティブな影響・トレードオフ

- （SS-138 追補）ピン登録画面を開くたび（同じ位置はキャッシュ）と位置を調整するたびに Geocoding API の利用量が増える。探索と同じ backend のレート制限（1ユーザー 30 回/分）の枠を使う。
- （SS-138 追補）建物名が入るかは場所による。住所の途中に建物名が入る形式では、建物名を住所から外せずラベルで重なりうる（末尾一致のときだけ外している。実キーでの確認が残っている）。

- 従量課金のため、利用量監視とキャッシュ設計が継続的に必要。
- 特定ベンダーへの依存が生じる（抽象化で緩和はするが完全には消えない）。
- 日本語名が provider に存在しない場合は別言語名になるため、すべての候補が日本語になる保証はない。
- 表示名が空・不正な候補は除外するため、provider の応答件数より候補数が少なくなる場合がある。

### 移行・対応が必要な事項

- backend に Google Maps Platform 連携（Places/Routes）と**キャッシュ/プロキシ層**を実装した（M4）。実装は `integrations/google_maps/` に隔離する。
- Google Maps Platform の API キー発行・課金設定・利用制限（リファラ/IP制限等）を用意する。キーはリポジトリにコミットしない。
- 往復“時間”範囲は Routes `computeRoutes` の徒歩片道時間・距離を 2 倍して算出する。将来、複数目的地や交通条件が要件になった場合のみ方式を再評価する。（**SS-33 追補**: 候補の絞り込み（`/explore/places`）は引き続き片道×2の近似のまま（補正係数は入れない）。選択後のルートは `/explore/routes/loop` が返す周回全体の実測値になる。詳細は [ADR-007](./ADR-007-loop-route-generation.md) を参照。）
- SS-43 で Places の日本語優先指定、backend の非空表示名契約、mobile の防御的フォールバックを実装した。
- 地理検索の要件が育った段階で PostGIS 等への移行を検討する。
- （SS-138 追補）server key に Geocoding API を許可し、API を有効化する（dev / prod とも。未対応だと Google が HTTP 403（`SERVICE_DISABLED` / `API_KEY_SERVICE_BLOCKED`）を返して 503 になり、名前欄が空のままになる）。実キーで建物名の返り方を確かめ、必要なら住所からの建物名の外し方を見直す。

## 関連情報

- [プロジェクト概要](../project-overview.md)
- [ADR-M-002: モバイル技術スタック](../../packages/mobile/adr/ADR-M-002-mobile-tech-stack.md)
- backend フォルダ構造（`integrations/` 隔離層）: [folder-structure](../../packages/backend/docs/folder-structure.md)
- [ADR-007: 周回ルート（往路と異なる道で戻る）の生成方式](./ADR-007-loop-route-generation.md)（SS-33）
