# ADR-001: 地図・POI・ルーティング基盤に Google Maps Platform を採用し backend 経由で利用する

## 日付

2026-07-19（初版）、2026-08-09 追補（SS-43）

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

- **地図・POI・ルーティングの基盤に Google Maps Platform を採用する**（Maps / Places / Routes）。
- **Places / Routes のデータ API 呼び出しは backend 経由（キャッシュ/プロキシ層）で行い、クライアントから直接叩かない**。
  - mobile は backend の API を叩き、backend が Google Maps Platform を呼ぶ。
  - backend 側にキャッシュを差し込み、コスト・レート制限を制御する。
- 地図の**描画**は mobile 側の `react-native-maps` で行う（[ADR-002](../../packages/mobile/adr/ADR-002-mobile-tech-stack.md)）。タイル／SDK 通信と mobile 用に制限した SDK key は mobile 側で管理し、Places / Routes 用 server key と混在させない（SS-15 で実装。`packages/mobile/app.config.ts` が `GOOGLE_MAPS_ANDROID_SDK_KEY` を注入し、backend の `GOOGLE_MAPS_SERVER_API_KEY` とは別キーにする。詳細は [mobile ADR-007](../../packages/mobile/adr/ADR-007-expo-config-and-maps-key-injection.md)）。
- スポット/記録の位置データは MVP では緯度経度カラム + 単純検索とし、将来の地理検索に備え PostGIS 等への移行余地を残す。
- （SS-43 追補）スポットの表示名は backend が Google Places Nearby Search に
  `languageCode: "ja"` と `regionCode: "JP"` を指定して日本語を優先する。日本語名が提供されない場合は、
  Google が返した別言語名をそのまま利用し、追加の翻訳処理は行わない。
- （SS-43 追補）backend は provider の表示名を trim し、空・不正な表示名の候補だけを除外する。
  Place ID を表示名の代わりには使わない。mobile は旧 backend や実行時の契約逸脱に備える最終防衛として、
  空・不正な表示名を「目的地」へ置き換え、表示用文字列を最大256 Unicode code pointに制限する。

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

- 従量課金のため、利用量監視とキャッシュ設計が継続的に必要。
- 特定ベンダーへの依存が生じる（抽象化で緩和はするが完全には消えない）。
- 日本語名が provider に存在しない場合は別言語名になるため、すべての候補が日本語になる保証はない。
- 表示名が空・不正な候補は除外するため、provider の応答件数より候補数が少なくなる場合がある。

### 移行・対応が必要な事項

- backend に Google Maps Platform 連携（Places/Routes）と**キャッシュ/プロキシ層**を実装した（M4）。実装は `integrations/google_maps/` に隔離する。
- Google Maps Platform の API キー発行・課金設定・利用制限（リファラ/IP制限等）を用意する。キーはリポジトリにコミットしない。
- 往復“時間”範囲は Routes `computeRoutes` の徒歩片道時間・距離を 2 倍して算出する。将来、複数目的地や交通条件が要件になった場合のみ方式を再評価する。
- SS-43 で Places の日本語優先指定、backend の非空表示名契約、mobile の防御的フォールバックを実装した。
- 地理検索の要件が育った段階で PostGIS 等への移行を検討する。

## 関連情報

- [プロジェクト概要](../project-overview.md) / [マイルストーン](../milestones.md)（M4: 探索・散歩開始）
- [ADR-002: モバイル技術スタック](../../packages/mobile/adr/ADR-002-mobile-tech-stack.md)
- backend フォルダ構造（`integrations/` 隔離層）: [folder-structure](../../packages/backend/docs/folder-structure.md)
