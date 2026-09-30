# ADR-014: 地図一覧と地図詳細（端末での絞り込み・ピンの全件取得の上限・地図作成ダイアログ）

## 日付

2026-09-30

## ステータス

採用（SS-121）。

## コンテキスト

v0.2 の画面構成の見直し（SS-145）で検索タブは廃止され、地図とピンの検索はピンタブの「地図一覧」ボタン
（SS-146。遷移先 `/sanpo-maps`）から開く画面で行うことになった。SS-146 は `/sanpo-maps` に「準備中」の
暫定画面（`SanpoMapListView`）を置き、「SS-121 が同じルート・testID（`sanpo-map-list-screen` /
`sanpo-map-list-back`）のまま本実装に差し替える」「実データを出すときは認証ガード（または未サインイン案内）と
API 側の認可を入れる」と決めている（[ADR-012](./ADR-012-pin-map-display-and-detail.md) SS-146 追補）。

SS-121 では次の3つを実装する。**backend の変更は不要**（既存 API で足りる）。

- 自分の地図の一覧（地図名で即時に絞り込める）。
- FAB からの地図の新規作成。
- 地図詳細（その地図のピン一覧。ピン名で即時に絞り込め、タップでピン詳細 `/pins/[pinId]` へ進む）。

使う API は `GET /sanpo-maps?expand=pin_count`（ページングなしの全件）・`POST /sanpo-maps`（201。冪等キーなし。
名前は strip 後 1〜50 code point。重複名は許可）・`GET /pins?sanpo_map_id=`（`created_at DESC, id DESC` の
keyset ページング。`limit` 最大 200）。`GET /sanpo-maps/{id}` は存在しない。`GET /pins` の `q` は
名前だけでなくメモ・タグにも部分一致する。

## 決定

- **D1: 絞り込みは地図・ピンとも端末で行い、API の `q` は使わない。** 照合は「前後の空白を除き、連続する空白
  （全角空白を含む）を1つにまとめ、小文字化した文字列同士の部分一致」（`lib/sanpoMapSearch.ts`）。
  かな・全角半角の同一視はしない（`String.prototype.normalize` も使わない。[ADR-013](./ADR-013-pin-tag-suggestions.md)
  のタグ候補・backend の `ILIKE` と揃える）。名前の無いピン（null・空白のみ）は、検索語が空でなければ
  一致しない（表示上の「名前のないピン」という文字には当てない）。
- **D2: ピン一覧は 200 件 × 最大 5 ページ（1000 件）を1つの取得関数（`fetchAllPinsInSanpoMap`）で順に取り、
  `useQuery` 1本で持つ。** 1000 件を超える地図は新しい順に 1000 件だけを表示・検索の対象にし、案内を出す
  （`truncated`）。`cursor` は空でない文字列のときだけキーを立てる（`?cursor=null` を送らない）。取り直しは
  常に1ページ目から。
- **D3: `fetchSanpoMaps` は常に `expand=pin_count` を付け、queryKey（`["sanpo-maps","list"]`）を
  ピン登録画面・ピンタブ・地図一覧で共有する。** 地図詳細の地図情報は、この一覧のキャッシュから id で引く。
- **D4: ルートは `/sanpo-maps`（既存）と `/sanpo-maps/[sanpoMapId]`（新設）。実体は `features/pin` に置く**
  （新しい feature は作らない）。
- **D5: 地図の作成 UI は画面内のダイアログ（`SanpoMapCreateDialog` + `useSanpoMapCreate`）にする。**
  ルートにしない。`Dialog` の中身を `KeyboardAvoidingView` で包む。作成は自動再送しない（冪等キーが無い）。
  成功時はダイアログを閉じ、検索語をクリアし、トーストを出し、一覧キャッシュへ即時挿入 + 再取得で反映する
  （一覧に留まる）。失敗時も一覧を取り直す（応答が届かなくてもサーバーでは作れている可能性がある）。
- **D6: ゲストは両画面を開けるが通信せず、サインイン案内を出す。** FAB と検索欄はゲストには出さない
  （押しても 401 になる操作を見せない）。これで SS-146 追補の「実データを出すときは認証ガード（または
  未サインイン案内）を入れる」を満たす。API 側の認可は既存（member の地図だけが返る。member でない地図は 404）。
- **D7: ピン一覧の行に代表写真のサムネイルを出し、画像の読み込み失敗を契機に一覧を取り直す**
  （取得から 60 秒未満なら取り直さない。ADR-012 D7 と同じ規則。`shouldRefreshPhotoUrls` を再利用）。
  写真が無いピンは `PinPhotoImage` を使わず、`map-pin` アイコンの面を出す（`PinPhotoImage` の null 表示は
  「読めなかった」の意味になるため）。
- **D8: フィーチャーフラグは既存の `pin_registration` を流用する**（両ルートとも `usePinRegistrationGate`。
  OFF 確定時は `/(tabs)` へ Redirect）。

### 検討した選択肢

#### 選択肢1: `GET /pins?q=` でサーバー検索する（D1 で却下）

- **概要**: ピン名の検索語をそのまま `q` に渡す。
- **メリット**: 1000 件を超える地図でも全件を検索できる。
- **デメリット**: `q` は名前だけでなくメモ・タグにも部分一致するので、要件「ピン名の部分一致」と結果が
  食い違う。キー入力ごとに通信するため debounce が要り、「即座に」絞り込めない。

#### 選択肢2: ピン一覧を `useInfiniteQuery` の無限スクロールにする（D2 で却下）

- **概要**: 下端までスクロールしたら次ページを読む。
- **メリット**: 初回の取得が軽い。
- **デメリット**: 端末での絞り込みと両立しない（読み込んでいないピンが「該当なし」になる）。

#### 選択肢3: 作成を専用ルート（例 `/sanpo-maps/new`）にする（D5 で却下）

- **概要**: 画面遷移で名前を入力する。
- **メリット**: `Dialog` に入力欄を載せる前例が無い問題を避けられる。
- **デメリット**: SS-117（ピン登録画面での地図作成）は入力を保ったまま地図を作る必要があり、Expo Router には
  前の画面へ結果を返す正式な手段が無い（ADR-011 の SS-124 の知見）。ダイアログならそのまま載る。

#### 選択肢4: 地図詳細用に別の queryKey で `expand` 無しの一覧を取る（D3 で却下）

- **概要**: 画面ごとに必要な項目だけ取る。
- **メリット**: 各画面が独立する。
- **デメリット**: 作成後の反映・ピン保存後の更新を2系統で面倒を見ることになる。`pin_count` の集計は
  1クエリで安く、ピン登録画面側の余分なコストは無視できる。

## 決定理由

- 端末で絞り込むには対象が手元に揃っている必要がある。MVP の規模（1ユーザー数百件程度。ルート ADR-009
  SS-111 追補「将来の課題」）なら、ほとんどの地図は1リクエストで終わり、反応が最も速い。
- 既存の `useSanpoMaps`・`sanpoMapApi`・`pinReadApi`・`PinStateCard`・`PinPhotoImage` がすべて
  `features/pin` にあり、別 feature にすると feature 間 import の禁止（`docs/folder-structure.md`）に当たる。
- ゲストの扱い・フラグ・戻る導線（`useScreenBack`）・画面ガードは ADR-009（mobile）・ADR-012 の既存方針に揃えた。

## 影響

### ポジティブな影響

- ピンタブ →「地図一覧」から、地図とピンを名前で検索できる。検索タブ廃止（SS-145）で失われた検索手段が戻る。
- ADR-012 の既知の限界「地図上のピン操作は支援技術で代替できない」の代替導線になる。
- これまで E2E できなかった「ピン詳細への遷移」を E2E で確かめられる（`.maestro/sanpo-map-list.yaml`）。
- SS-117 は `SanpoMapCreateDialog` をそのまま使える（`testIDPrefix` で testID を変えられる）。

### ネガティブな影響・トレードオフ

- 1000 件を超える地図では、古いピンを検索できない（案内は出す）。将来、名前だけのサーバー検索
  （例 `GET /pins?name_q=`）か、仕様側で「名前・メモ・タグで検索」に揃えた `q` への切り替えを検討する。
- `POST /sanpo-maps` に冪等キーが無いので、応答が届かなかった場合にユーザーが作り直すと同名の地図が
  2つできうる（重複名は許可されているので壊れはしない。mobile は自動再送しないことで悪化させない）。
  ルート ADR-009 決定25「冪等キーは後から optional で足せる」で対応する余地がある。
- ゲストが案内からサインインしても元の画面へ戻らない（`getPostSignInDestination` の既存の限界。
  ADR-012 と同じ）。
- 地図詳細のピン件数は、ピン一覧を読み終えて打ち切っていなければ読み込んだ件数、それ以外は地図一覧の
  `pin_count`（古い可能性がある）を出す。

### 移行・対応が必要な事項

- SS-119（ピンの編集・削除）: ピンを消したら `SANPO_MAPS_QUERY_KEY`（`features/pin/lib/pinQueryKeys.ts`）も invalidate すること（地図一覧の
  ピン件数が古くなる。`PINS_QUERY_ROOT` の invalidate だけでは更新されない）。地図詳細のピン一覧は
  `["pins", ...]` 始まりなので `PINS_QUERY_ROOT` の invalidate で取り直される。
- SS-117（ピン登録画面での地図作成）: `SanpoMapCreateDialog` を使う際、ピン登録画面の `useScreenBack` の
  `onIntercept` にダイアログを閉じる分岐を足すこと。作った地図が既定になる場合がある（既定地図が無かった
  ユーザー）ので、「最初の地図」の draft は一覧の再取得で自然に消える。
- `Dialog` の `KeyboardAvoidingView` は iOS のみ `behavior="padding"`、Android は Modal のウィンドウの
  リサイズに任せる。Android でキーボード表示中にパネルが隠れる場合は `behavior="height"` にする。

## 関連情報

- [ADR-009（mobile）: 認証セッション状態の集約と認証ゲート](./ADR-009-auth-session-state-and-route-gate.md)
- [ADR-012（mobile）: 登録済みピンの地図表示とピン詳細](./ADR-012-pin-map-display-and-detail.md)（D7・D9・SS-146 追補）
- [ADR-013（mobile）: ピンのタグ入力の候補](./ADR-013-pin-tag-suggestions.md)（端末での絞り込み・照合規則）
- [ADR-009（ルート）: 散歩マップ・ピンのデータモデルと写真アップロード](../../../docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)（決定25・SS-111 追補）
- 元チケット: SS-121 / 関連: SS-113（地図 API）・SS-145・SS-146（PR #114）・SS-117・SS-119
