# ADR-011: ピンの位置の選択と調整（散歩中以外・任意地点からの登録と、登録画面での位置の微調整）

## 日付

2026-09-25

## ステータス

採用（SS-124）。

## コンテキスト

SS-88（PR #93）で実装したピン登録は「散歩中画面の『この場所にピンを追加』→ 現在地で登録」に
限定されていた。

- 散歩していないときはピンを登録できない。
- GPS の誤差や「少し先に見える場所」を直せない（`PinLocationPreview` は操作不可のプレビュー）。

これを次の2点で広げる。

- **(a)** 登録画面（`/pins/new`）から全画面の地図を開き、タップした地点へピンを動かして位置を
  調整する。
- **(b)** ナビタブで散歩をしていないときに FAB を出す。FAB から全画面の地図を現在地起点で開き、
  長押しした地点を位置として登録画面へ進む。

backend と OpenAPI の変更はない。`POST /pins`（`create_pin`）の `client_walk_id` は元々 optional で、
backend は散歩の存在を検証しない（`packages/backend/openapi.yaml` / `pins/schemas.py` で確認済み）。

並行して **SS-117**（登録画面での地図の新規作成）が `PinRegisterView.tsx` を触る予定であり、
本チケットの `PinRegisterView.tsx` への変更は「位置状態の保持と調整オーバーレイの配線」に絞る
（`usePinRegister.ts` は変更しない）。

## 決定

以下はプラン作成時にユーザーへ確認した事項（D-ユーザー決定と付記）と、mobile-planner が
自律判断した事項（D1〜D12）を合わせたもの。

- **D-ユーザー決定: (a) の操作方式はタップで移動する。** 中央固定ピン方式・マーカードラッグ
  方式は不採用。
- **D-ユーザー決定: 散歩中に開いた登録画面で位置を動かした場合、移動距離に制限を設けず、
  `clientWalkId` の紐付けは維持する。**
- **D-ユーザー決定: (b) の入口は SS-118（登録済みピンの地図表示）とは別画面として作る。** 入口の
  統合は SS-118 の後で検討する。
- **D1: FAB は散歩していないとき（`WalkIdleNotice` を表示している間）だけ出す。散歩中は出さない。**
  散歩中は既存の「この場所にピンを追加」→ 登録画面の「位置を調整」で任意地点に置け、
  `clientWalkId` も付く（ユーザー決定と同じ形）。入口を2つにしない。散歩中の画面は地図（右上に
  現在地ボタン）と下部カード（一時停止・終了・ピン追加の3ボタン）で埋まっていて FAB を置く
  余白がない。
- **D2: FAB 経由の登録の `clientWalkId` は付けない**（散歩していないので値が無い）。D1 から
  自動的に決まる。`/pins/new` には `latitude`/`longitude` だけを渡す。
- **D3: フラグは既存の `pin_registration` を流用する。** OFF・取得中・取得失敗のときは FAB を
  出さない。`/pins/pick-location` はルートごと隠す（`docs/architecture-guideline.md`
  「画面ガードレシピ」）。新しいフラグを作るには backend の登録簿（`core/feature_flags.py`）の
  変更が要る（backend は触れない）。
- **D4: 未サインインのとき、FAB も地点選択画面も出す。** サインインの要否は既存どおり登録画面の
  `PinSignInRequired` に任せる。サインインの判定を1か所（`/pins/new` のルート）に保てる。
  散歩中の「この場所にピンを追加」もサインインを見ていないので、それと揃う。既知の限界（影響を
  参照）。
- **D5: 現在地が取れない（権限拒否・取得失敗）とき、地点選択画面は日本全体を初期表示にする。**
  画面の上に `LocationPermissionNotice`（再試行・設定を開く）を重ね、長押しでの選択はそのまま
  使える。再試行で現在地が取れたら、そこへアニメーションで移動する。現在地が無くても「任意地点
  での登録」という目的は果たせる。現在地の初回取得中（`isLoading`）は地図を出さず、読み込み表示
  にする。
- **D6: (b) の地点選択画面は新しいルート `app/pins/pick-location.tsx`。長押しで `router.replace`
  して `/pins/new` へ進む。** `features/walk` は `features/pin` を import できないので、ナビタブ
  から開くにはルートの文字列で遷移するしかない。`push` にすると、スタックが
  `(tabs) → 地点選択 → 登録` になる。登録画面の保存後の `router.back()` が地点選択画面に戻って
  しまい、ナビタブの「ピンを保存しました」トースト（`useFocusEffect` の `consumeFlashMessage`）も
  出ない。`replace` ならスタックは `(tabs) → 登録` になり、SS-88 の保存後・破棄後の遷移がそのまま
  正しく動く。
- **D7: (a) の位置調整は、登録画面の中の全画面オーバーレイ（`position: absolute` の View）にする。
  RN の `Modal` も新しいルートも使わない。** 別のルートにすると、調整結果を登録画面へ返す仕組み
  （Expo Router には正式な「結果を返す」手段が無い）と、ディープリンクで調整画面を直接開かれた
  ときの扱いが要る。RN の `Modal` の中に `MapView` を置くと、Android で表示されない・タイルの
  読み込みが極端に遅いという既知の不具合がある（react-native-maps #3890 / #4893）。`Modal` は
  ハードウェアバックを `onRequestClose` で先に取ってしまい、`useScreenBack` の `onIntercept` も
  実質届かなくなる。オーバーレイなら登録画面の状態（入力・写真）はマウントされたまま残り、
  Android バックも `useScreenBack({ onIntercept })` 1本で閉じられる。
- **D8: 全画面地図の枠（ヘッダー・地図・現在地マーカー・選択マーカー・ヒントとアクションの
  カード・再センタリング）を `PinMapFullScreen` にまとめる。** (a)(b) の違い（タップか長押しか・
  確定ボタンの有無・現在地の取得）は呼び出し側の props に出す。見た目と地図の設定
  （`showsUserLocation={false}` など）を1か所に揃えるため。`features/pin` の中だけで使うので
  `src/components/` には置かない（2機能ルール）。
- **D9: 位置を調整できる条件は、保存中と、ピンの作成が済んだ後（`savedPinId !== null`。写真の
  紐付けの途中で失敗した場合を含む）は無効にする。** `POST /pins` の `client_pin_id` の冪等な
  再送は、内容が違っても既存のピンをそのまま返す（`packages/backend/openapi.yaml` の
  `create_pin` description）。作成後に位置を動かしても再送では反映されず、
  「動かしたのに元の位置に保存される」ことになる。
  作成前の失敗（`savedPinId === null` の error）の後は調整を許す（名前・地図の選び直しと同じ扱い）。
- **D10: 距離の制限はしない。`clientWalkId` はルートの params のまま `usePinRegister` に渡り続ける
  （変更不要）。** `usePinRegister` は `options.location` の変化をそのまま `buildCreateRequest` に
  反映するので、hook の変更は要らない。
- **D11: (a) はタップ（`onPress`）で移動する。POI をタップしたときは `onPress` が発火しないので
  `onPoiClick` も同じ処理につなぐ。長押し（`onLongPress`）でも移動する。** ユーザー決定は
  「タップで移動」。地図の上の店名などをタップして何も起きないと壊れているように見える。(b) で
  長押しを覚えたユーザーが (a) で長押ししても動くようにする（害は無い）。
- **D12: `useCurrentLocation` / `LocationPermissionNotice` は `features/walk` から
  `src/hooks/useCurrentLocation.ts` / `src/components/location/LocationPermissionNotice.tsx` へ
  昇格する。** `features/pin` から使うため、2機能ルールに従う（`folder-structure.md`、
  ADR-001 決定3）。`LocationPermissionNotice` は `services/location` の文言と「設定を開く」を
  含む完成品で、pin 側で作り直すと重複する。

## 検討した選択肢

### 選択肢1: 散歩中も FAB を出す

- **概要**: 散歩中画面にも「地図からピンを置く」FAB を出し、任意地点への登録経路を1本化する。
- **メリット**: 入口が1種類になり説明がしやすい。
- **デメリット**: 散歩中の画面は既に地図・現在地ボタン・下部の3ボタンカードで埋まっており、
  FAB を置く余白が無い。「この場所にピンを追加」との役割分担が曖昧になり、`clientWalkId` を
  付けるかどうかも曖昧になる（D1 で却下）。

### 選択肢2: (a) を別ルート + 結果の受け渡しにする

- **概要**: 位置調整を `/pins/adjust-location` のような別ルートにし、選んだ座標を登録画面へ
  返す。
- **メリット**: 画面ごとに責務が分かれ、テストしやすく見える。
- **デメリット**: Expo Router に正式な「結果を返す」手段が無く、モジュール変数での受け渡しや
  `dismissTo` での params 上書きのような回避策が要る。ディープリンクで調整画面を直接開かれた
  ときの扱いも増える（D7 で却下）。

### 選択肢3: (a) を RN `Modal` にする

- **概要**: `Dialog`（既存の破棄確認ダイアログ）と同じく RN `Modal` で全画面の地図を出す。
- **メリット**: 既存の `Dialog` コンポーネントの流儀に合わせられる。
- **デメリット**: `Modal` の中に `MapView` を置くと Android で表示されない・タイル読み込みが
  極端に遅いという既知の不具合がある（react-native-maps #3890 / #4893）。`Modal` は
  `onRequestClose` でハードウェアバックを先取りしてしまい、`useScreenBack` の `onIntercept` が
  実質届かなくなる（D7 で却下）。

### 選択肢4: 地点選択から `push` で登録画面へ進む

- **概要**: `router.replace` ではなく `router.push` で `/pins/new` へ進む。
- **メリット**: 通常の画面遷移として素直。
- **デメリット**: スタックが `(tabs) → 地点選択 → 登録` になり、保存後・破棄後の
  `router.back()` が地点選択画面に戻ってしまう。ナビタブの保存完了トーストも出ない（D6 で却下）。

### 選択肢5: 新しいフラグを作る

- **概要**: FAB・地点選択画面専用の新フラグ（例: `pin_registration_anywhere`）を作る。
- **メリット**: 既存の `pin_registration` と独立に ON/OFF できる。
- **デメリット**: backend の登録簿（`core/feature_flags.py`）の変更が要り、backend には触れない
  という制約に反する。`pin_registration` は prod でまだ OFF（BK-2 待ち）で、機能全体をまとめて
  止めている以上、細分化する実益が薄い（D3 で却下）。

### 選択肢6: 現在地が取れないときに東京駅を起点にする

- **概要**: `/dev-screens` の `pin-register` エントリと同じく、固定の代表地点を初期表示にする。
- **メリット**: 常に何らかの地図が見える。
- **デメリット**: ユーザーに無関係な場所を「起点」として見せることになる（D5 で却下。日本全体を
  初期表示にする）。

## 決定理由

- (a)(b) とも、既存の feature 境界（`features/walk` は `features/pin` を import しない、
  `features/pin` は認証状態を読まない）を保ったまま実装できる形を優先した。
- SS-117 と同時に `PinRegisterView.tsx` を触るため、変更点を「位置状態の保持とオーバーレイの
  配線」に絞れる設計（D7 の全画面オーバーレイ、D9 の `usePinRegister` 非変更）を選んだ。
- `POST /pins` の冪等性（`client_pin_id` の再送は内容を無視して既存のピンを返す）という既存の
  backend の契約に矛盾しない範囲で「いつまで調整できるか」を決めた（D9）。

## 影響

### ポジティブな影響

- 散歩をしていない時間帯でも、任意の場所にピンを登録できるようになる。
- GPS の誤差や見えている対象とのズレを、保存前に画面内で直せるようになる。
- `useCurrentLocation` / `LocationPermissionNotice` の昇格により、位置情報関連の重複実装を避けられる。
- 既存の不具合（散歩していない状態の分岐に `ToastOverlay` が無く、保存完了トーストが消費される
  だけで表示されていなかった）を、FAB の導線を追加するのと同じ変更でついでに直せた。

### ネガティブな影響・トレードオフ

- **ゲストがサインインしても登録画面へ戻らない**（既存の限界）。`getPostSignInDestination` は
  散歩していなければ `/walk-start` へ replace するので、選んだ地点が失われる。散歩中の
  「この場所にピンを追加」→ サインインでも同じ（SS-88 から）。本チケットでは直さない。
  直すなら SS-37 の `signInForSaveRequested` と同じ「意思表示フラグ」をピン用に足すフォローアップ。
- **作成前の失敗の後で位置を調整した場合の端のケース**。作成リクエストが backend では成功して
  いて、応答だけが失われていた場合、次の保存は `client_pin_id` の冪等な再送になり、古い位置の
  まま返る。名前・地図の選び直しにも同じ問題があり（SS-88 から）、本チケットは同じ扱いにする。
- **iOS のスワイプバック**は `useScreenBack` を通らない。調整オーバーレイを開いたまま左端から
  スワイプすると、登録画面ごと閉じうる。既存の破棄確認ダイアログも同じ制約を持つ（SS-88 から）。
- **現在地の初回取得が遅い場合**、`getCurrentPosition` は屋内などで数十秒かかってから失敗しうる
  （`location.real.ts`）。その間、地点選択画面は読み込み表示のまま（戻るは押せる）。実機で遅さが
  問題になったら、先に日本全体の地図を出して後から移動する形に変える。
- **Maestro の `longPressOn` が CI の Google Maps で `onLongPress` を発火させるかは未確認**。
  初回の CI 実行で落ちた場合は、フローを「FAB → 地点選択画面の表示 → 戻る」までに縮める。
  長押しから先は `/dev-screens` の `pin-register` エントリ（東京駅で開く）から位置調整を確かめる
  形に分ける。
- **「現在地に置く」ボタン**（地点選択画面で、長押しせずに現在地で登録する）は入れていない。
  ユーザーが決めた UX（長押し）を優先した。要望が出たらフォローアップにする。
- **SS-118（登録済みピンの地図表示）との入口の統合**は SS-118 の後で検討する（ユーザー確認済み）。

### 移行・対応が必要な事項

- なし（backend・OpenAPI の変更を伴わない）。

## 関連情報

- [ADR-009（ルート）: 散歩マップ・ピンのデータモデルと写真アップロード](../../../docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)
- [ADR-006（mobile）: 位置情報サービスは real/mock の2モード](./ADR-006-location-service-real-mock.md)
- [ADR-010（mobile）: 写真サービスと presigned POST での S3 直送](./ADR-010-photo-service-and-direct-s3-upload.md)
- [フォルダ構造](../docs/folder-structure.md)（昇格ルール）
- [アーキテクチャガイドライン](../docs/architecture-guideline.md)（画面ガードレシピ）
- 元チケット: SS-88 / PR #93
