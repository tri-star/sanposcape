# ADR-M-019: 地図のアイコンと、マップピンの形・マーカーの基準点

## 日付

2026-10-04

## ステータス

採用（SS-171、SS-172）。

## コンテキスト

SS-171「地図毎にアイコンを選択できるようにする」と SS-172「マップ上のピンに地図のアイコンを反映する」を同じブランチで実装した。
地図（`SanpoMap`）に `icon` 属性を持たせ（ドメインの決定はルート [ADR-009](../../../docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md) 決定31）、
作成ダイアログと地図詳細で選べるようにし、登録済みピンをその地図のアイコンで描く。

背景:

- 登録済みピンは `RegisteredPinMarkers` で `<MapPin category="park" icon="map-pin" size={30} />` に固定されており、
  複数の地図のピンを1枚の地図（ピンタブ・散歩中のナビタブ）に重ねると、どの地図のピンか見分けられなかった。
- 「どの場所を指しているか、拡大しないと分かりにくい」という声があり、調べると好みの問題ではなく次の2つの欠陥があった。
  1. **iOS で基準点がずれている。** iOS は `provider` 未指定で Apple Maps（MapKit）で描かれる。react-native-maps の
     `anchor` は Google Maps でしか効かず、MapKit は `centerOffset` を使う。どの Marker も `anchor={{x:0.5,y:1}}` しか渡して
     いなかったため、iOS ではマーカー View の中心が座標に置かれ、先端は実際の地点より下を指していた。
  2. **先端がレイアウト枠からはみ出していた。** 旧 `MapPin` は「3つの角を丸めた正方形」を -45° 回転させたティアドロップで、
     尖った角は中心から `0.707 × size`、レイアウト枠の下端は `0.5 × size`。先端が枠の下へ約 `0.21 × size` はみ出し、
     Android（マーカーを View 枠の bitmap に焼く）では先端が切り取られ、基準点と見た目の先端も一致しなかった。

## 決定

- **D1: 地図のアイコンは地図の属性として backend が保持する。** API の値はドメインの語の enum（`pin` / `tree` / …）。
  Lucide のアイコン名ではない（Lucide のリネームに API を引きずられないため）。mobile は対応表
  （`features/pin/lib/sanpoMapIcon.ts` の `SANPO_MAP_ICON_META`）でグリフと色に変換する。表のキーを生成型の enum にして
  `Record` で網羅するので、backend が値を足したのに mobile の対応表が無い状態は typecheck で検出できる。
  API の `icon` が欠落・`null`・未知の値のとき（古い backend・新しい backend）は `pin` で扱う（`toSanpoMapIconKey`）。
- **D2: アイコンは13種類で、色はアイコンから決まる（ユーザーは色を選ばない）。**
  色は `MapPin` のカテゴリ色から選ぶ。当初は既存の4系統（`theme.map.park/cafe/culture/station`）に限り新しい色を足さない方針だったが、
  ユーザーの要望（花は赤、猫は茶色、雨・避暑地は青）で、地図アイコン用に **`sky`（水色寄りの青）と `brown`（茶色）を `theme.map` に足した**
  （light/dark の両方。`ThemeMapColors` と `MapPinCategory` に追加）。パレットにピンクは無いので、花は既存の赤（station）にした。
  `sky` は現在地・ルート線の青（`route`。light `#1585fe` / dark `#3d97fe`）と見分けるため、シアン寄りの色相にしている。
  既定 `pin` は従来の登録済みピンと同じ見た目。

  | key（API 値） | グリフ | 色 | 表示名 |
  |---|---|---|---|
  | `pin`（既定） | `map-pin` | park | ピン |
  | `tree` | `tree-pine` | park | 公園・緑 |
  | `flower` | `flower-2` | station | 花 |
  | `leaf` | `leaf` | station | 紅葉 |
  | `sun` | `sun` | cafe | 太陽 |
  | `rain` | `cloud-rain` | sky | 雨 |
  | `retreat` | `mountain` | sky | 避暑地 |
  | `landmark` | `landmark` | culture | 名所・史跡 |
  | `coffee` | `coffee` | cafe | カフェ |
  | `food` | `utensils` | cafe | ごはん |
  | `bakery` | `croissant` | cafe | パン |
  | `shopping` | `shopping-bag` | station | 買い物 |
  | `cat` | `cat` | brown | 猫 |

  ピッカーの表示順は上の表のとおり（6列 × 3行。1行目: 自然・季節・天気、2行目: 場所・食・買い物、3行目: 猫。13個なので最後の行は1個で左寄せ）。
  追加した色の値と、白いグリフ（`onColor` = `#ffffff`）とのコントラスト比（図形として 3:1 以上を確認。`tokens.test.ts` で検査）:

  | 色 | light | dark |
  |---|---|---|
  | `sky` | `#0e8fc7`（3.64:1） | `#2a9bd0`（3.14:1） |
  | `brown` | `#9a6b47`（4.60:1） | `#a8754f`（3.95:1） |

  30px のピンではグリフだけの差は見分けにくいので、色で大まかな種類を分ける。色を別に選ばせる案は将来の拡張にする。
- **D3: 選ぶ場所は作成ダイアログ（既定 `pin`）と、地図詳細の「アイコンを変更」（owner のみ）。新しいルートは作らない。**
  変更は `PATCH /sanpo-maps/{id}` に `{ icon }` だけを送り（差分だけ。[ADR-M-017](./ADR-M-017-pin-edit-and-delete.md) と同じ方針）、
  成功時は地図一覧のキャッシュの1件を置き換える（`pinCount` は既存の値を残す）。editor にはボタンを出さない
  （`canManageSanpoMap`。UI 用で、安全性は backend の 403 が担保する）。
- **D4: ピンへの反映はピンの API を変えず、`GET /sanpo-maps` のキャッシュから `sanpo_map_id` で引く。**
  `useRegisteredPins` が各ピンに `sanpoMapIcon` を付ける（`attachSanpoMapIcons`）。ピンのクエリは invalidate しない
  （一覧キャッシュの更新だけでマーカーが付け直される）。反映先は、ピンタブ・散歩中のナビタブの登録済みピン、
  ピン詳細・ピン登録画面の位置プレビュー、位置調整オーバーレイの選択ピン。地図一覧の行・地図詳細のバッジ・
  保存先の地図チップのグリフにも出す（チップの色は変えない）。ピン編集画面の地図チップ（SS-175）も同様で、一覧に無い地図（今の地図が消えている場合）は既定アイコンにする。
  `tracksViewChanges={false}` のマーカーは子 View の変化がネイティブに反映されないため、key にアイコンを含めて作り直す
  （`SpotMapView` が選択状態で行っているのと同じ手法）。
- **D5: `MapPin` を `react-native-svg` の「丸い頭 + 細く尖った尾」のシルエットにし、先端をレイアウト枠の下端中央に置く。**
  形・グリフ位置・基準点は純粋関数（`components/ui/map-pin/mapPinGeometry.ts`）で求める（全体の高さ ÷ 頭の直径 = 1.45。
  実機で見て調整してよく、テストは比率ではなく不変条件で書く）。`react-native-svg` は既存依存なので development build の作り直しは不要。
- **D6: マーカーの基準点は `mapPinMarkerPlacement(size)` を `Marker` に spread する。** Android（Google Maps）は `anchor`、
  iOS（Apple Maps）は `centerOffset`（`y = -高さ/2`）を見るので両方返す。`MapPin` を載せる全マーカー
  （散歩の候補・目的地・現在地、履歴詳細、ピンの地図）に適用した。walk / history は `features/pin` を import しない
  （`mapPinGeometry` は `components/ui` にある）。
- **D7: フィーチャーフラグは追加しない。** 地図アイコンの UI はすべて既存の `pin_registration` でガードされたルートの中にある
  （[ADR-M-014](./ADR-M-014-sanpo-map-list-and-detail.md) D8）。`MapPin` の形状・基準点の修正は不具合修正と見た目の改善として包まない。

## 検討した選択肢

- **アイコン名（Lucide 名）をそのまま API に保存する / 自由な文字列**: Lucide のリネームや mobile 側の都合が API に漏れる。
  未知の文字列の検証もできない。却下。
- **色も選ばせる**: ピッカーが複雑になり、色の組み合わせが増える。将来の拡張にする。
- **既存4系統の色だけで割り当てる（新しい色を足さない）**: 当初の案。ユーザーが「花は赤/ピンク、猫は茶色、雨・避暑地は青」を希望し、
  既存の色には茶色・青（`route` と紛らわしくない青）が無いため却下し、`sky` と `brown` を足した。`route` の青をそのまま使う案は、
  現在地・ルート線と区別できなくなるので採らなかった。
- **絵文字**: デザインシステムの Iconography 規約と `pages-components-guideline.md` のルール（`Icon` 経由のみ・絵文字禁止）に反する。却下。
- **ピンごとのアイコン**: 要件は「地図ごと」。ピンの API とデータモデルの変更が大きい。却下。
- **`Marker.image` に PNG を渡す**: アイコン × 色ぶんの画像が要り、テーマに追従しない。却下。
- **ティアドロップの View を枠に収めるだけの修正**: 先端が90°で鈍いままで、読み取りにくさの改善にならない。却下。

## 決定理由

- アイコンを地図の属性にすると、ピンタブ・散歩中の地図のように複数の地図のピンを重ねる場面で、どの地図のピンかが見分けられる。
- ピンの API を変えないのは、ピンタブ・散歩中の地図が元々 `GET /sanpo-maps` を全件取得してから地図ごとに `GET /pins` を呼んでいるため
  （[ADR-M-012](./ADR-M-012-pin-map-display-and-detail.md) D4）。追加の通信が要らない。
- iOS の基準点ずれと Android の先端の欠けは、アイコンとは独立の不具合だが、アイコンで「どの地図のピンか」を見せる以上、
  ピンが指す地点が正しく読み取れることが前提になる。同じ `MapPin` を触るので同時に直した。

## 影響

### ポジティブな影響

- ピンの色とグリフで地図を見分けられる。色は6系統（park/cafe/culture/station/sky/brown）になり、旧版より区別しやすい。iOS・Android の両方で、ピンの先端が座標に一致する。

### ネガティブな影響・トレードオフ

- 地図アイコン用に `theme.map` へ色を足したので、`Tag` など `theme.map[category]` を引く側のカテゴリ型を広げる場合は新しい色も考慮する。
  `sky` の dark（3.14:1）は白との差が小さい（3:1 の下限に近い）ので、実機のダークテーマで見え方を確認する。
- Android は背景の無い View に elevation の影が出ないので、ピンの影は iOS だけ（白い縁取りで地図と分ける）。
- Claude Design 側の `MapPin`（CSS のティアドロップ）と実装の形が食い違う。Design 側を新しい形に更新するかは未定。
- アイコンの顔ぶれを13種類から**減らす**ときは、backend の contract（既存行のデータ移行と古い mobile がいなくなるのを待つこと）になる。
  増やすのは安い（backend → `openapi.yaml` → mobile の対応表の順。backend を先に出してよい）。
- ピン詳細をディープリンクで開いた直後は、地図一覧が届くまで既定の `pin` で描かれる（届いたら作り直される）。
- backend が新しいアイコン値を足し、mobile がまだ古いままのとき、その値は `pin` に丸められる（`toSanpoMapIconKey`）。
  この状態の mobile で編集ダイアログを開くと現在値が「ピン」として選ばれ、元の値は選び直せない（許容。mobile を更新すれば解消する）。
- 位置選択の地図（`PinMapCanvas`）の選択マーカーは `key={selectedMarkerIcon}` で作り直すため、`MapView` の子の先頭側で
  アンマウント・マウントが起きる。[ADR-M-012](./ADR-M-012-pin-map-display-and-detail.md) D16 のバグは 1.28.1 で修正済み（挿入になった）で、
  選択マーカーは元々この位置で出現・消失していたので新しいリスクではないと判断した（実機での確認項目に含める）。問題が出たら `mapLayers` と同じ末尾側へ移す。
- E2E（`sanpo-map-list.yaml`）は地図詳細のアイコンを「アイコンを変更」ボタンの `accessibilityLabel`（`アイコンを変更（現在: <表示名>）`）で確かめる。
  `SanpoMapIconBadge` は装飾なので a11y から隠しており（`no-hide-descendants`）、Android の Maestro は accessibility 階層を読むため
  その中の testID は見えない。a11y から隠さない形で検証する（バッジの隠しを外して二重読み上げにするより、ボタンのラベルが現在値を伝える方が支援技術にも有益）。
- 自動テストでは確かめられない。マーカーの先端の位置・Android での SVG の描画・ダークテーマでの縁取りは実機で確認する
  （Maestro はマーカーを安定して触れない。[ADR-M-012](./ADR-M-012-pin-map-display-and-detail.md) D14）。

### 移行・対応が必要な事項

- backend の `icon` 追加（ルート ADR-009 決定31）と同じブランチ・同じ PR で出す（`SanpoMapRead.icon` が必須になるため、
  mobile のフィクスチャが typecheck で落ちる）。`.maestro/sanpo-map-list.yaml` を変えたので、マージ前に `mobile-e2e.yml` を手動実行する。
- 実機確認（Android・iOS）: ① 長押しした地点にピンの先端が一致する（ズームを変えてもずれない）、② Android で先端・縁取りが切れず
  グリフが表示される（空・欠けが出たら「マウント直後だけ `tracksViewChanges` を true にして次のフレームで false に戻す」を入れる）、
  ③ 地図詳細でアイコンを変えると、ピンタブのピンの色とグリフが変わる、④ ダークテーマで縁取りが地図に埋もれない、
  ⑤ 作成ダイアログが小さい端末（幅 360dp 程度）でも収まり、キーボード表示中に作成ボタンが押せる。
- 実機確認の結果（2026-10-04、Android エミュレータ Pixel 6 Pro / API 35。PR #136 のコメントにスクリーンショット）:
  ①②③ は OK（`tracksViewChanges={false}` のままでも SVG とグリフは空にならなかったので、①②の対処は入れていない）。
  ⑤ は **NG**：幅の広い端末でも、キーボード表示中は作成ダイアログの「キャンセル」「作成」がキーボードの下に隠れる
  （キーボードを閉じれば押せる）。ピッカーの2行分だけダイアログが高くなったため。未対応で、修正するかは PR のレビューで決める。
  ④ は未確認（端末のダークモードを切り替えても表示が変わらなかった。アプリ内のテーマ設定（[ADR-M-016](./ADR-M-016-theme-mode-preference.md)）からは試していない）。iOS は未確認。

## 関連情報

- [ADR-009（ルート）: 散歩マップ・ピンのデータモデルと写真アップロード](../../../docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)（決定25・決定31）
- [ADR-M-012: 登録済みピンの地図表示とピン詳細](./ADR-M-012-pin-map-display-and-detail.md)（SS-172 追補）
- [ADR-M-014: 地図一覧と地図詳細](./ADR-M-014-sanpo-map-list-and-detail.md)（SS-171 追補）
- [ページ・コンポーネントガイドライン](../docs/pages-components-guideline.md)
- 元チケット: SS-171・SS-172
