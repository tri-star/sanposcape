# ADR-001: 地図・POI・ルーティング基盤に Google Maps Platform を採用し backend 経由で利用する

## 日付

2026-07-19（初版）、2026-08-09 追補（SS-43）、2026-08-22 追補（SS-33）

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
- （SS-33 追補）`POST /explore/routes/walking` のルート提示を、片道から**周回（現在地→目的地→
  別経路→現在地）**へ変更した。`computeRoutes` に `intermediates=[目的地(stopover),
  復路用経由点(via)]` を渡す1リクエストで往路・復路の2 legを取得する（Essentials SKU 据え置き）。
  経由点は backend が `bearing(origin→destination)` を軸にした決定的な幾何規則で生成し、
  候補分布や乱数などの非決定的な入力は使わない。起点は origin と destination の中点
  （`midpoint(origin, destination)`）とし、そこから 1回目=進行方向の右90°・2回目=左90°の
  方向へ、オフセット係数 α=0.25×直線距離（`haversine(origin, destination)`）だけ離れた点を
  経由点にする。origin と destination の直線距離が `MIN_LOOP_BASE_DISTANCE_METERS`（50.0m）
  未満（O≒D）の場合は経由点を作らず、周回にはせず片道の往復（`return_is_same_path: true`）
  にする。
- （SS-33 追補）生成した周回は迂回率・復路/往路の時間比・往路復路の折れ線重複率
  （20mグリッドのJaccard）の3指標で妥当性を判定し、いずれか1つでも基準を外れたら
  反対側の経由点で再試行する。再試行後の扱いは2通りに分かれる。
  - **品質基準を満たす応答が得られたが不採用（reject）だった場合**は、追加の Google
    呼び出しをせず、直近の試行で得た往路 leg を逆順にした復路で「同じ道を戻る」応答に
    フォールバックする（`return_is_same_path: true`）。
  - **両経由点の試行が例外／「200 + `routes` 空」／`legs` 不足のいずれかで、使える応答が
    1件も得られなかった場合**のみ、`intermediates` を付けない素の片道呼び出しを1回追加する。
    このケースに限り Google 呼び出しは1リクエストあたり最大3回になる。
  周回が作れない・品質基準を満たさない場合も HTTP 200 で返し、エラーにはしない。
- （SS-33 追補）`POST /explore/routes/walking` の API 契約を次のとおり変更した。
  - リクエストに `route_type: "loop" | "one_way"`（既定 `loop`）を追加した。`one_way` は
    SS-35「復路にいる時に出発地へ帰るルートを引き直す」用途のために用意したもので、
    `legs: []` / `return_is_same_path: false` の片道応答を返す。
  - `destination.place_id` を**必須から任意へ緩和**した。`route_type` によらず常に任意にする
    （place_id はルーティングに使っておらず必須にする技術的根拠が無いうえ、条件付き必須にすると
    クライアント側の 422 リスクだけが増えるため）。
  - レスポンスに `legs: [{kind: "outbound" | "return", duration_seconds, distance_meters, path}]`
    を追加した。`route_type=loop` では必ず `[outbound, return]` の2件、`one_way` では空になる。
  - **破壊的変更**: 既存の `duration_seconds` / `distance_meters` / `path` / `bounds` の意味を、
    `route_type=loop` のときは片道の値ではなく**周回全体（往路+復路）の値**に変更した。
    `duration_seconds` / `distance_meters` は Σ`legs[].{duration_seconds,distance_meters}` と
    恒等的に一致する。`path` は往路→復路の折れ線を接合点を重複させずに連結した全体の折れ線、
    `bounds` はその全体 `path` を包む矩形になる。`route_type=one_way` では従来どおり片道の値。
- （SS-33 追補）候補絞り込み（`POST /explore/places`）は引き続き Routes の片道呼び出し
  1回のまま据え置くが、`round_trip_duration_seconds`/`round_trip_distance_meters` は
  「片道×2×LOOP_FACTOR」（実測に基づく補正係数、既定 1.15）で算出する。一覧は「目安」、
  `POST /explore/routes/walking` が「実値」という非対称は意図的に残す。

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
- ~~往復“時間”範囲は Routes `computeRoutes` の徒歩片道時間・距離を 2 倍して算出する。将来、複数目的地や交通条件が要件になった場合のみ方式を再評価する。~~
  → **SS-33 で方式を分離**。`POST /explore/routes/walking` は片道ではなく周回（往路+復路）の
  実値を `duration_seconds` / `distance_meters` に返すようになった（片道×2 の近似はしていない）。
  `POST /explore/places` の候補絞り込みは引き続き Routes の片道呼び出し1回のままだが、
  片道×2 の構造的な過小評価を補正するため実測係数 LOOP_FACTOR を掛けた
  「片道×2×LOOP_FACTOR」（既定 1.15）に変更した。一覧は「目安」、
  `POST /explore/routes/walking` が「実値」という非対称は意図的に残す。詳細は「決定」節を参照。
- SS-43 で Places の日本語優先指定、backend の非空表示名契約、mobile の防御的フォールバックを実装した。
- 地理検索の要件が育った段階で PostGIS 等への移行を検討する。
- （SS-33 追補）周回1ルートあたりの Google 呼び出しは、品質基準での不採用（経由点の右→左の
  再試行を尽くしても reject）なら追加呼び出しをしないため最大2回に収まる。両経由点の試行が
  例外／「200 + `routes` 空」／`legs` 不足のいずれかで使える応答が1件も得られなかった場合
  のみ、3回目として `intermediates` を付けない素の片道呼び出しに落ちるため最大3回になる。
  この3回目は直前の `POST /explore/places` が同じ (origin, destination) をキャッシュに
  載せている可能性が高く（キーは小数5桁丸めで一致する）、実際には Google に出ないことが多い。
  2026-08-22 の実 API スパイク（出発地3点×目的地3件×α6値×左右2方向、108試行）では、
  採用値 α=0.25 で重複率中央値 0.147〜0.203・迂回率中央値 1.08〜1.15・復路/往路時間比が
  1.8以下の割合100%・p95レイテンシ約230msだった。最悪ケースは郊外・短距離（道の選択肢が少ない
  条件）で、3指標のしきい値（迂回率≤1.4・時間比≤1.8・重複率≤0.6）はこの最悪ケースを
  ぎりぎり通す値として確定した。
- （SS-33 追補）周回の生成には kill switch（`GOOGLE_MAPS_LOOP_ROUTE_ENABLED`）を設けた。
  `AUTH_MODE`/`MAPS_MODE` と同じ fail-safe の作法で、実地で品質が破綻した場合や
  Google の課金が跳ねた場合に再デプロイなしで SS-32 相当（同じ道を戻る）へ戻せる。

## 関連情報

- [プロジェクト概要](../project-overview.md) / [マイルストーン](../milestones.md)（M4: 探索・散歩開始）
- [ADR-002: モバイル技術スタック](../../packages/mobile/adr/ADR-002-mobile-tech-stack.md)
- backend フォルダ構造（`integrations/` 隔離層）: [folder-structure](../../packages/backend/docs/folder-structure.md)
