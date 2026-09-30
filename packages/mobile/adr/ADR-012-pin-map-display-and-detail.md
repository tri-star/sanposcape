# ADR-012: 登録済みピンの地図表示とピン詳細画面

## 現在有効な決定（要約）

> 最終更新: 2026-09-30（SS-147、SS-121）。本節は本文（追補を含む）を要約したもので、一次記録は本文。
> 本文と食い違う場合は本節の誤りとして本節を直す。

### 決定

- **登録済みピンの表示場所は「散歩中のナビタブの地図」と「ピンタブ」の2つ**。位置調整オーバーレイには表示しない。
  （本文: D1、SS-146 追補、SS-147 追補）
- **ピンをタップしたら直接 `/pins/[pinId]` へ push する**。Marker に `title` を付けず、吹き出し・ポップアップカードは挟まない。
  （本文: D1'）
- **取得範囲は表示範囲の上下左右に25%の余白を足した bbox で、表示範囲がその中に収まる間は取り直さない**
  （`resolvePinFetchBounds`）。打ち切り時だけ、拡大したら取り直す。bbox は小数4桁で外側に丸める。（本文: D2）
- **上限を超えてもページングを続けず、1リクエスト200件（地図ごと）で打ち切る。クラスタ表示は採らない**。
  打ち切りの案内はピンタブ上部の情報カード（`PinMapStatusNotice`）で出し、散歩中の地図では案内しない。
  （本文: D3、SS-146 追補、SS-147 追補）
- **複数の地図は `GET /sanpo-maps` の全地図に対して `GET /pins` を並列に呼び、`useQueries` の `combine` に
  モジュールレベルの純粋関数（`combineRegisteredPinListQueries`）を渡してマージする**。再試行も `combine` の戻り値
  （`refetchAll`）から呼ぶ。（本文: D4、D15）
- **feature 間の合成は `app/` のルートの render slot で行う**。散歩中の地図には `WalkActiveView.renderMapLayers` で
  `RegisteredPinsMapLayer` を、ナビタブ idle には `WalkActiveView.idleSection` で `features/history` の
  `RecentWalksSection` を渡す。認証値とフラグもルートが読んで注入する。（本文: D5、SS-147 追補）
- **ナビタブ idle の「最近の散歩」はサインイン中だけ出す**。`RecentWalksSection` の testID は `testIDPrefix` で受け取り
  （ナビタブは `walk-active-recent-walks`）、省略時は従来の testID を返す。（本文: SS-147 追補）
- **ナビタブ idle は `ScrollView` にし、上端だけ `useSafeAreaInsets().top` を足す。`ToastOverlay` は残す**
  （位置は `bottom = spacing[4]`）。（本文: SS-147 追補）
- **ピン詳細の写真は、最初の10件は `GET /pins/{id}` の `photos` を使い、`GET /pins/{id}/photos` は「もっと見る」で呼ぶ**。
  （本文: D6）
- **画像キャッシュは `photo.id` ベースの `cacheKey`（`memory-disk`）とし、サインアウト時の消去は
  `src/lib/imageCacheCleanup.ts` で登録する**。presigned URL は画像の読み込み失敗を契機に取り直す（60秒未満は取り直さない）。
  地図詳細のピン一覧のサムネイルも同じ規則（[ADR-014](./ADR-014-sanpo-map-list-and-detail.md) D7）。（本文: D7、SS-121 追補）
- **原本ビューアは RN `Modal` を使わない画面内オーバーレイで、前後はボタンでのみ移動する**。（本文: D8）
- **ゲストはピンタブ・ピン詳細を開けるが通信せず、サインイン案内を出す**。散歩中の地図のピンレイヤーもゲストでは
  通信しない。地図一覧 `/sanpo-maps`・地図詳細 `/sanpo-maps/[sanpoMapId]` も同じ。（本文: D9、SS-146 追補、SS-147 追補、SS-121 追補）
- **フラグは既存の `pin_registration` を流用し、`/pins/[pinId]` は OFF 確定時に `/(tabs)` へ Redirect する**。
  （本文: D10、SS-147 追補）
- **ピンタブの地図の下に `PinTabActionBar`（children スロット・右寄せ）を置き、「地図一覧」ボタンで `/sanpo-maps`
  へ遷移する**。`/sanpo-maps` は SS-121 で本実装した（[ADR-014](./ADR-014-sanpo-map-list-and-detail.md)）。testID
  `sanpo-map-list-screen` / `sanpo-map-list-back` は維持。（本文: SS-146 追補、SS-121 追補）
- **ピンタブの現在地はフォーカスが戻るたびに（初回を除き）静かに取り直す**（権限をリクエストしない・失敗しても前回値を保持・
  30 秒以内はスキップ・視点は動かさない）。（本文: SS-146 追補の影響）
- **詳細ヘッダーに編集ボタンは出さず（SS-119 の範囲）、名前が無いピンは「名前のないピン」と表示する。
  日付整形は `src/lib/dateLabel.ts` に置く**。（本文: D11、D12、D13）
- **E2E はピンタブのみで、マーカーのタップ → 詳細への遷移は E2E しない**。ピン詳細への遷移は `sanpo-map-list.yaml` が
  地図詳細のピン一覧から確かめる。（本文: D14、SS-146 追補、SS-147 追補、SS-121 追補）
- **`react-native-maps` は 1.29.8。増減するレイヤーは `MapView` の子の末尾に置き、重なり順は `zIndex` で決め、
  `moveOnMarkerPress={false}`、`onMapReady` での表示範囲の報告は初回だけ**。（本文: D16）

### 未解決・持ち越し

- **地図上のピン操作は支援技術で代替できない**。代替導線として地図詳細のピン一覧（`/sanpo-maps/[sanpoMapId]`）が入った。
  （本文: 影響「ネガティブな影響」、SS-121 追補）
- **ゲストがピン詳細の案内からサインインしても元の画面へ戻らない**（ピンタブではサインイン後にピンタブへ戻るので当たらない）。
  （本文: 影響「ネガティブな影響」、SS-146 追補）
- **表示範囲に地図ごとに200件を超えるピンがあると古いピンが出ない**（拡大すると取り直す）。件数が増えたらクラスタ表示を再検討。
  （本文: 影響「ネガティブな影響」、選択肢4）
- **地図が増えたら `GET /pins` の `sanpo_map_id` 任意化を backend に依頼する**。（本文: D4、選択肢6）
- **散歩中はナビタブとピンタブの2つの地図が同時に生きる**（許容。問題が出たら `freezeOnBlur` 等を検討）。（本文: SS-146 追補の影響）
- **アカウントタブの「最近の散歩」はゲストにもエラーカードを出し、ナビタブと扱いが異なる**（SS-148 の範囲）。（本文: SS-147 追補）

### 変更・撤回された決定

- D1: 表示場所「散歩中のナビタブの地図 + `/pins/map`（idle のナビタブの『登録したピンを地図で見る』から開く）」→
  「散歩中のナビタブの地図 + ピンタブ」（SS-146 追補でピンタブを追加、SS-147 追補でボタン・ルート・`PinMapView` を削除）。
  D1 の「地点選択画面には表示しない」の地点選択画面も SS-147 で削除（ADR-011）
- D3: 打ち切りの案内を出す場所 `/pins/map` → ピンタブ（SS-146 追補）
- D9・D10: `/pins/map` のゲスト表示・フラグのガード → `/pins/map` の削除で対象外（SS-147 追補）
- D14: E2E `/pins/map` の表示と取得完了 → ピンタブへ移動（SS-146 追補）。`/pins/map` の表示確認も削除（SS-147 追補）
- D5: render slot による合成は地図レイヤーだけ → ナビタブ idle の `idleSection` にも一般化（SS-147 追補）
- 選択肢2で避けた「閲覧と登録の操作モードの混在」→ ピンタブでは、登録を長押しだけに限ることで受け入れた（SS-146 追補）
- 「`/sanpo-maps` は暫定画面でフラグだけでガードする」→ 本実装。ゲストにはサインイン案内を出し、通信しない（SS-121 追補）
- 「代替導線は未定」→ 地図詳細のピン一覧が代替導線（SS-121 追補）

## 日付

2026-09-26、2026-09-30 追補（SS-146。ピンタブでの表示）、2026-09-30 追補（SS-147。/pins/map の削除とナビタブ idle の合成）、2026-09-30 追補（SS-121。地図一覧・地図詳細）

## ステータス

採用（SS-118、SS-146 追補、SS-147 追補、SS-121 追補）。

## コンテキスト

SS-88（PR #93）・SS-124（PR #102）でピンを登録できるようになったが、登録したピンを見る手段が
無かった。そのため `pin_registration` フラグは本チケットが入るまで ON にしない運用になっていた
（SS-111 で backend の閲覧 API（`GET /pins` / `GET /pins/{pin_id}` / `GET /pins/{pin_id}/photos`）
が実装済み）。

本チケットは backend の変更を伴わず、次の2つを実装する。

- 登録済みピンの地図表示（散歩中のナビタブの地図 + 新しい全画面地図 `/pins/map`）。（SS-147 追補: `/pins/map` は削除）
- ピン詳細画面（`/pins/[pinId]`。名前・日時・タグ・メモ・位置・写真のサムネイル一覧と原本の拡大表示）。

ユーザー追加要件として、地図上でピンをタップしたら直接ピン詳細画面へ遷移すること
（モックのポップアップカードは挟まない）が明示された。

ルート ADR-009（`docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md`）の持ち越し事項
「地図表示で `limit` を超えたときの見せ方（ページングを続けるか、クラスタ表示にするか）は SS-118 で
決める」を本 ADR の D3 で決着させる。

## 決定

以下は mobile-planner が自律判断した事項と、実装時に確定した詳細を合わせたもの。

- **D1（SS-147 追補: `/pins/map` は削除）: 表示場所は「散歩中のナビタブの地図」+「新しい `/pins/map`（idle のナビタブから開く）」。
  地点選択画面（`/pins/pick-location`）・位置調整オーバーレイには表示しない。**
  モックの main 画面（散歩中の地図）に `mainPins` があり、散歩中に登録して戻った地図にすぐ出るのが
  最も価値が高い。idle のナビタブには地図が無いため別画面が要る。ADR-011 のユーザー決定
  「(b) の入口は SS-118 とは別画面として作る。入口の統合は SS-118 の後で検討」とも一致する。
  `/pins/map` への入口は idle の `WalkIdleNotice` 直下のテキスト付き `Button`
  （「登録したピンを地図で見る」）。（SS-147 追補: /pins/map は削除）
- **D1': ピンをタップしたら直接 `/pins/[pinId]` へ push する（ユーザー追加要件）。**
  Marker に `title` を付けず、OS の吹き出しも出さない。モックの吹き出しカード
  （サムネイル + 「詳細画面を開く」）は挟まない。
- **D2: 取得範囲は表示範囲の上下左右に25%の余白を足した bbox。表示範囲がその中に収まる間は
  取り直さない（`resolvePinFetchBounds`）。** 打ち切られている（`next_cursor` あり）ときだけ、
  表示範囲が取得範囲の半分未満の高さまで拡大したら取り直す。queryKey 安定化のため bbox は
  小数4桁で外側に丸める（`roundBoundsOutward`）。
- **D3（SS-147 追補: `/pins/map` は削除。打ち切り案内はピンタブで出す）: 上限を超えたときの見せ方（ルート ADR-009 の持ち越しの決着）: ページングを続けず、
  1リクエスト200件（backend の上限。地図ごと）で打ち切り、`/pins/map` では「一部だけ表示。
  拡大すると他も出る」と案内する。クラスタ表示は採らない。**
  理由: (1) 1画面に数百のカスタム View マーカーを描くと RN の地図は重くなる、(2) クラスタ表示は
  依存ライブラリの追加（ADR-003 の development build 作り直し・`minimumReleaseAge`）が要り、
  MVP 規模（1ユーザー数百件）に見合わない、(3) 並びが `created_at DESC` なので「新しいピンが
  見える」は自然な劣化。散歩中の地図では案内しない（下部カードが既に埋まっているため静かに劣化）。
- **D4: 複数の地図は地図ごとに `GET /pins` を並列に呼んでマージする（`useRegisteredPins`）。**
  `GET /pins` は `sanpo_map_id` 必須なので、`GET /sanpo-maps` の全地図に対して呼ぶ。既定地図だけに
  すると SS-117 以降で別の地図に保存したピンがまた「表示されない」ことになる。backend への変更
  依頼はしない（`sanpo_map_id` 任意化は ADR-009 が予告済みの expand。地図数が増えたら依頼）。
- **D5（SS-147 追補: 地図以外にも一般化）: feature 間の合成は `app/` のルートの render slot（`WalkActiveView.renderMapLayers`）。**
  `features/walk` は `features/pin` を import しない規約（`docs/architecture-guideline.md`）を
  保つため、`WalkActiveView` に `renderMapLayers(visibleRegion)` の slot を足し、
  `app/(tabs)/index.tsx` が `RegisteredPinsMapLayer` を合成する。認証値（`isSignedIn`）とフラグも
  ルートが読んで注入する（既存の「ルートが注入する」方針の延長）。
- **D6: 写真は最初の10件は `GET /pins/{id}` の `photos` をそのまま使い、`GET /pins/{id}/photos` は
  「もっと見る」を押したときだけ呼ぶ。** 写真10枚以下のピンでは往復を1回に抑える。
  ビューアの末尾（最後に読み込んだ写真で `hasMore`）で次ページを読み込む。
- **D7: 画像キャッシュは `cacheKey = pin-photo:<photo.id>:<thumb|original>`、
  `cachePolicy="memory-disk"`。presigned URL は応答ごとに変わるため URL をキーにしない
  （mobile ADR-010 決定8 / ルート ADR-009 決定15）。**
  サインアウト時に `Image.clearMemoryCache()` / `clearDiskCache()` を `registerSessionCleanup` で
  走らせる。登録は `PinPhotoImage.tsx`（コンポーネント）ではなく、起動時に必ず評価される
  `src/lib/imageCacheCleanup.ts`（`app/_layout.tsx` から副作用 import）に置く。写真を一度も
  表示しないまま出たサインアウトでも消去を保証するため（SS-118 ローカルレビュー SEC-M1）。
  presigned GET は `urls_expire_at` より
  前に失効しうる（backend `config.py` の注記: 署名した Lambda の一時認証情報の寿命が上限）ため、
  期限時刻ではなく「画像の読み込み失敗」を契機に詳細を取り直す（取得から60秒未満なら取り直さない。
  `shouldRefreshPhotoUrls`）。閲覧 URL にも直送用の `isAllowedUploadUrl` を適用する
  （関数名・挙動は変えない。用途を JSDoc に追記）。
- **D8: 原本ビューアは RN `Modal` を使わない画面内オーバーレイ（`position: absolute` の
  `View`）。** ADR-011 D7 と同じ理由（`Modal` は Android のハードウェアバックを
  `onRequestClose` で先取りし、`useScreenBack` の `onIntercept` が届かなくなる）。前後はボタンの
  みで移動する（モックどおり。スワイプ・ピンチズームはスコープ外）。背景は両テーマで暗色
  （`theme.palette.ink900`。用途名では表現できないため意図的に palette を直接使う）。
- **D9（SS-147 追補: `/pins/map` は削除）: ゲストは `/pins/map` とピン詳細のルートを開けるが通信せず、サインイン案内を出す**
  （ADR-011 D4 と同じく入口ボタンはゲストにも出す）。散歩中の地図のピンレイヤーもゲストでは通信
  しない。
- **D10（SS-147 追補: `/pins/map` は削除）: フラグは既存の `pin_registration` を流用する。** `/pins/map` と `/pins/[pinId]` は画面
  ガードレシピで OFF 確定時に `/(tabs)` へ Redirect する。
- **D11: 詳細ヘッダーの編集ボタンは出さない（SS-119 の範囲）。** 右端にスペーサーを置き、
  SS-119 がそこにボタンを足す。
- **D12: 名前が無いピンの表示名は「名前のないピン」。**
- **D13: 日付整形（`features/history/lib/walkDateLabel.ts`）を `src/lib/dateLabel.ts` へ昇格し、
  walk 固有の関数名を汎用名へ変える。** `features/pin`（詳細画面の登録日時）でも使うため2機能
  ルールに従う（`docs/folder-structure.md`）。SS-120（検索タブ）の日付表示でも再利用できる。
- **D14: E2E は `/pins/map` の表示と取得完了（エラーにならない）までとし、マーカーのタップ →
  詳細への遷移は E2E しない。**（SS-147 追補: /pins/map は削除） Google Maps の描画面上の `Marker` は testID で安定して触れず、
  フローからピン ID を知る手段も無いため。詳細の状態判定は `pinDetailState.test.ts` が担う。
- **D15: 全地図の `GET /pins` の結果は、`useQueries` の `combine` にモジュールレベルの純粋関数
  （`pinRead.ts` の `combineRegisteredPinListQueries`）を渡してマージする。** `combine` 未指定の
  `useQueries` の戻り値は毎レンダー新しい配列になり、`useMemo([queries])` でマージしても
  `WalkActiveView` の毎秒の再レンダーで `pins` が毎回新しい参照になって `RegisteredPinMarkers` の
  `React.memo` が効かない（SS-118 ローカルレビュー ARCH-W1）。`combine` の関数参照が不変なら
  TanStack Query はクエリの状態が変わらない限り再計算を省き、変わったときも `replaceEqualDeep` で
  構造共有するため、データが同じ間は `pins` の参照が保たれる。再試行も `combine` の戻り値
  （`refetchAll`）から呼び、生の結果配列を `useCallback` に閉じ込める stale closure を避ける
  （同 QA-W2）。前回値を `useRef` + 浅い比較で再利用する自作の仕組みは、TanStack Query の仕組みで
  足りるため採らない。
- **D16: `react-native-maps` を 1.27.2 から 1.29.8 へ上げる。増減するレイヤー（`mapLayers`）は
  `MapView` の子の末尾に置き、重なり順は `zIndex` で決める。マーカーのタップでカメラを動かさない
  （`moveOnMarkerPress={false}`）。`onMapReady` での表示範囲の報告は初回だけにする。**
  - 背景（PR #105 の実機確認で発覚）: 散歩中の地図でピンのタップ → 詳細 → 戻るを繰り返すと、
    ルート線・現在地・目的地のマーカーが消えた。
  - 原因: 1.27.2 の Android 実装では、`MapView` の子の追加が挿入ではなく置き換え
    （`features.set(index, …)`）だった。さらに、画面を離れてネイティブの地図が window から外れて
    いる間の追加・削除も正しく扱えなかった。そのため、子の途中に置いたピンのレイヤーが増減すると、
    既存のルート線・マーカーの管理が壊れて消えた。上流の v1.28.1「fix ghost features on MapView
    (#5859)」で修正済み（挿入になり、外れている間の変更も退避・復元される）。
  - JS 側の回避策は採らなかった。画面を離れている間とバックグラウンドの間はピンの増減を止め、
    変更はレイヤーごと作り直す、という案だったが、ライブラリ内部の挙動に依存して壊れやすく、
    ライブラリを上げれば不要になる。
  - 更新にはネイティブの変更が含まれるため、development build の作り直しが要る（ADR-003）。
  - 末尾配置・`zIndex`・`moveOnMarkerPress`・`onMapReady` の初回限定は、ライブラリの修正後も
    意味がある。末尾配置は既存の子の位置を動かさない。`zIndex` は同じ座標のピンが現在地を隠さない
    ようにする。`moveOnMarkerPress` は、戻ったときに地図がピンの位置へずれないようにする。
    `onMapReady` は付き直すたびにも呼ばれ、そのときの `initialRegion` は実際の表示範囲と違う。

## 検討した選択肢

### 選択肢1: idle のナビタブ自体を地図にする

- **概要**: 「散歩していないとき」のナビタブを `WalkIdleNotice` ではなく地図画面に置き換える。
- **メリット**: 新しい画面（`/pins/map`）を作らずに済む。
- **デメリット**: `features/walk` の大きな改修になりスコープが過大。散歩の開始導線（idle notice）
  との同居も設計し直しになる（D1 で不採用）。

### 選択肢2: 地点選択画面（`/pins/pick-location`）にピンを重ねる

- **概要**: 既存の全画面地図（FAB → 地点選択）にそのまま登録済みピンを重ね、新しい画面を作らない。
- **メリット**: 画面数が増えない。
- **デメリット**: ユーザーが ADR-011 で「入口の統合は SS-118 の後で検討する」と決めており、
  先取りしてしまう。閲覧専用の地図（長押しで登録へ進ませたくない）と登録用の地図
  （長押しが本来の目的）の操作モードが1画面に混在し、事故（閲覧中の誤操作で登録画面へ進む）の
  リスクがある（D1 で不採用）。

### 選択肢3: タップでポップアップカード（モックどおり）を挟む

- **概要**: モックの `mainPins` にあるとおり、マーカータップでサムネイル付きのポップアップ
  カードを出し、そこから「詳細画面を開く」で遷移する。
- **メリット**: モックに忠実。地図上で概要を確認してから詳細へ進むかを選べる。
- **デメリット**: ユーザーが「タップしたら直接詳細画面に遷移する」ことを追加要件として明示した
  ため不採用（D1'）。

### 選択肢4: 上限超過時にクラスタ表示にする

- **概要**: マーカーが密集したら数字付きの円にまとめる（地図アプリでよくある UI）。
- **メリット**: 大量のピンでも地図が重くならず、全件の位置感を把握しやすい。
- **デメリット**: クラスタリング用ライブラリの追加が要り、development build の作り直しと
  `minimumReleaseAge`（ADR-003 / ADR-004）の待ちが発生する。MVP 規模（1ユーザー数百件程度）では
  投資対効果が低い（D3 で不採用。将来件数が増えたら再検討）。

### 選択肢5: 上限超過時もページングを続ける（`next_cursor` を辿る）

- **概要**: `GET /pins` の keyset ページングを使い切るまで取得を続け、表示範囲内の全件を描く。
- **メリット**: 「一部だけ表示」という妥協が要らない。
- **デメリット**: 1画面に数百〜のカスタム View マーカーを描くことになり RN の地図描画が重くなる。
  往復回数も増える。表示件数を絞って軽快さを優先した（D3 で不採用）。

### 選択肢6: `sanpo_map_id` を任意化するよう backend に依頼する

- **概要**: `GET /pins` の `sanpo_map_id` を省略可能にし、mobile から一括取得する。
- **メリット**: 地図が増えても mobile 側の並列リクエストが不要になる。
- **デメリット**: 本チケットのスコープ外（backend 変更なし）。MVP は地図が実質1つ・SS-117後も
  数個程度で、並列呼び出しで十分間に合う（D4 で不採用。将来の申し送りとして残す）。

## 決定理由

- 既存の feature 境界（`features/walk` は `features/pin` を import しない、`features/pin` は
  認証状態を読まない。ADR-009（mobile）/ ADR-011 と同じ規約）を保ったまま実装できる形を優先した。
- ユーザーの明示要件（タップで直接詳細へ）を最優先し、モックとの差分は ADR に明記して透明にした。
- ルート ADR-009 の持ち越し事項（上限の見せ方）は、依存追加を伴わない選択肢（打ち切り + 案内）を
  MVP のスコープとして採用し、クラスタ表示は将来の拡張として残した。

## 影響

### ポジティブな影響

- `pin_registration` フラグを ON にできるようになる（登録したピンを見る手段ができたため）。
- 散歩中に登録したピンがその場で地図に反映される（`usePinSave` の invalidate）。
- 画像キャッシュのキーを `photo.id` に統一したことで、presigned URL の再発行がキャッシュの
  再ダウンロードを招かない。

### ネガティブな影響・トレードオフ

- 地図上のピン操作は支援技術（スクリーンリーダー等）で代替できない（ADR-011 と同じ既知の限界）。
  検索タブ（SS-120）を代替導線に想定していたが、SS-145 で検索タブは廃止された。代替導線は未定。
  （SS-121 追補）地図詳細のピン一覧（`/sanpo-maps/[sanpoMapId]`）が代替導線になった。
- ピンの E2E はマーカーのタップを含まない（D14。SS-147 追補: E2E はピンタブのみ）。詳細画面の見た目は `/dev-screens` からの手動
  確認に頼る。
- （解消済み・SEC-M1）当初は `PinPhotoImage.tsx` のモジュール末尾で消去登録していたため、写真を
  一度も表示しないまま出たサインアウトでは消去が走らない限界があった。`src/lib/imageCacheCleanup.ts`
  へ登録を移し、`app/_layout.tsx` から副作用 import することで解消した（D7 参照）。
- ゲストが案内からサインインしても元の画面（地図・詳細）へ戻らない
  （`getPostSignInDestination` の既存の限界。ADR-011 と同じ）。
- 表示範囲に地図ごとに200件を超えるピンがあると古いピンが出ない（拡大すると取り直す）。

### 移行・対応が必要な事項

- なし（backend・OpenAPI の変更を伴わない）。

## SS-146 追補: ピンタブでの表示（2026-09-30）

### 決定・理由

- D1 の追補: 表示場所にピンタブを加える。選択肢2で避けた「閲覧と登録の操作モードの混在」は、登録を長押しだけに限り（タップはピン詳細のみ・Marker に `onLongPress` は無い）、誤って長押ししても未入力なら登録画面から確認なしで戻れるので受け入れる。
- 状態表示: `/pins/map` と同じ `resolvePinMapNotice`・案内（`PinMapStatusNotice` に切り出し）をピンタブ上部の情報カードで出す（D3 の打ち切り案内もピンタブで出す）。`RegisteredPinsMapLayer`（状態を出さない包み）は使わず、`useRegisteredPins` + `RegisteredPinMarkers` を直接使う。
- D9 の追補: ゲストは地図を見られるが通信せず、サインイン案内を出す。サインイン成功後は既存の `(tabs)` へ `dismissTo` で戻り（進行中の散歩があればナビタブ、無ければピンタブ。ADR-009 SS-146 追補）、ピンタブでは「元の画面へ戻らない」限界が当たらない。
- ボタン配置エリア（`PinTabActionBar`）を地図の下・タブバーの上に通常フローで置く（地図に重ねない）。最初のボタン「地図一覧」は `/sanpo-maps`（SS-121 まで暫定画面。SS-121 で本実装）。
  - 構造は children スロット（横並び・右寄せ・折り返し）。並べるボタンの種類・出し分け条件が未確定なので、配列＋判定関数のデータ駆動より、呼び出し側が並べる方が変更に強いと判断した。使うのはピンタブだけなので `features/pin` に置く。
  - 「地図一覧」は SS-121 が未完了でも常に表示し、遷移先に「準備中」の暫定画面（`SanpoMapListView`）を置く。却下案「SS-121 完了までボタンを出し分ける（非表示）」は、受け入れ条件「地図一覧ボタンが右寄せで表示される」を満たせないため採らなかった。v0.2 のストアリリース前に SS-121 が同じルート・testID（`sanpo-map-list-screen` / `sanpo-map-list-back`）のまま本実装に差し替える前提。→ SS-121 で決着（そのとおり差し替えた）。
  - ~~`/sanpo-maps` は現状フラグ（`pin_registration`）だけでガードする（静的表示なので露出する情報が無い）。SS-121 で実データを出すときは、認証ガード（または未サインイン案内）と API 側の認可を必ず入れる。~~ → SS-121 で決着（未サインイン案内。API は member のみ。下記 SS-121 追補）。
- `/pins/map` はナビタブの導線が残る間は残し、別課題で削除する。D14 の E2E はピンタブへ移し、`/pins/map` は表示確認だけ残す。（SS-147 追補: `/pins/map` は SS-147 で削除した）

### 影響

ピンタブは一度開くとマウントされたまま残るため、散歩中はナビタブとピンタブの2つの地図が同時に生きる（許容。問題が出たら `freezeOnBlur` 等を検討）。

常駐するので現在地がマウント時のままだと古くなる。フォーカスが戻るたびに（初回マウントを除く）`useCurrentLocation().refresh()` で現在地を取り直す。`refresh` は静かな取り直しで、次の性質を持つ（レビュー対応で確定）。

- `isLoading` を立てず `errorCode` も先にクリアしない。地図・ボタンが点滅しない。
- 権限をリクエストしない。`getPermissionStatus()` が `undetermined` なら何もせず既存状態を保持する。
- 取得に失敗しても直前の座標と `errorCode` を保持する（UI を変えない）。権限が取り消されていた場合（`granted` でない）だけ、従来どおり座標を null に戻して権限案内を出す。
- 直近 30 秒以内に取得できていれば何もしない（`src/lib/locationRefreshPolicy.ts` の `LOCATION_REFRESH_MIN_INTERVAL_MS`。タブを行き来するたびに GPS を起動しないため）。
- モードは ref ではなくリクエストの state（`{ n, silent, ... }`）で持つ。取得中の `refresh` は何もしないので、同じ tick で `retry`（ユーザー操作）と重なっても `retry`（非 silent）が勝つ。
- 地図の視点は動かさない。フォールバック表示から静かな取り直しで初めて現在地が取れた場合も自動移動しない（`useCurrentLocation` が `coordinatesFromRefresh` を返し、`usePinLocationPicker` が判定する）。現在地マーカーと「現在地」ボタンの移動先だけが新しくなる。

## SS-147 追補: /pins/map の削除とナビタブ idle の合成（2026-09-30）

### 決定・理由

- D1 の追補: 表示場所から `/pins/map`（idle のナビタブの「登録したピンを地図で見る」）を外す。ボタンとルート・`PinMapView` を削除する。表示場所は「散歩中のナビタブの地図」と「ピンタブ」の2つになる。
- D14 の追補: E2E はピンタブのみ（SS-146 で移したもの）。`/pins/map` の表示確認も削除する。
- D5 の補足: render slot による合成を、地図以外にも使う。`WalkActiveView.idleSection` に `features/history` の `RecentWalksSection` をルートが渡す（サインイン中だけ）。詳細は `docs/folder-structure.md`。
  - 却下案: `RecentWalksSection` を `src/components/` へ昇格する（feature 間の import が無いので昇格の条件に当たらない）、`WalkActiveView` から直接 import する（`features/walk` → `features/history` の依存を作る）。
- ゲスト（未サインイン）にはナビタブの「最近の散歩」を出さない。ゲストは記録を持てず `GET /walks` が必ず 401 になり、出すとナビタブの先頭にエラーカードが残り続けるため。同じルートの登録済みピンのレイヤー（`isSignedIn` で描き分け）と形を揃えた。アカウントタブは従来どおりゲストにもエラーカードを出すので、2つのタブで扱いが異なる（アカウントタブは SS-148 の範囲）。
- `RecentWalksSection` の testID は呼び出し側から接頭辞（`testIDPrefix`）を受け取る。タブ画面は一度開くとマウントされたまま残るため、ナビタブとアカウントタブで同じ testID が同時に存在しうる。既存 E2E を壊さないよう、省略時は従来の testID を返す（`recentWalksTestIds` のテストで固定）。ナビタブ側の接頭辞は `walk-active-recent-walks`。
- ナビタブ idle は `ScrollView` にし、上端だけ `useSafeAreaInsets().top` を足す（「まだ散歩を始めていません」カードがステータスバーに重なる既存の不具合の修正）。下端はタブバーが余白を持つので足さない（`PinTabView` と同じ）。`SafeAreaView` は repo に使用例が無いので使わない。
- idle の `ToastOverlay` は FAB を撤去した後も残す（位置は `bottom = spacing[4]`）。`consumeFlashMessage()` はフォーカスのたびにメッセージを消費するため、表示先を消すと届いたトーストが黙って捨てられる。
- `/pins/map`・`/pins/pick-location` のルート削除は、チケット本文（ボタンと FAB の削除）には無いが本課題に含めた。SS-146 追補とコードの JSDoc で「ナビタブの導線を削除する別課題でルートごと削除する」と予告しており、本課題がその別課題に当たるため。残すと画面カタログとディープリンクからしか開けない、到達不能なルートになる。

## SS-121 追補: 地図一覧・地図詳細（2026-09-30）

地図一覧（`/sanpo-maps`）の本実装と地図詳細（`/sanpo-maps/[sanpoMapId]`）の新設は [ADR-014](./ADR-014-sanpo-map-list-and-detail.md) に記録した。本 ADR への影響は次のとおり。

- SS-146 追補の「`/sanpo-maps` の認証ガード（または未サインイン案内）と API 側の認可を入れる」は決着した。ゲストには未サインイン案内を出して通信せず（D9 と同じ）、API は member の地図だけを返す。
- SS-146 追補の「SS-121 が同じルート・testID のまま本実装に差し替える」は、そのとおり差し替えた。
- 「地図上のピン操作は支援技術で代替できない」の代替導線として、地図詳細のピン一覧が入った。
- D14（ピン詳細への遷移は E2E しない）は、マーカーのタップについては変わらない。ピン詳細への遷移は地図詳細のピン一覧から `sanpo-map-list.yaml` で確かめる。
- D7 の「画像の読み込み失敗を契機に取り直す」規則を、地図詳細のピン一覧のサムネイルにも適用した。

## 関連情報

- [ADR-009（ルート）: 散歩マップ・ピンのデータモデルと写真アップロード](../../../docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)（決定15・持ち越し事項の決着）
- [ADR-010（mobile）: 写真サービスと presigned POST での S3 直送](./ADR-010-photo-service-and-direct-s3-upload.md)（決定8）
- [ADR-011（mobile）: ピンの位置の選択と調整](./ADR-011-pin-location-picking-and-adjustment.md)（D7 のオーバーレイ方式・入口統合の申し送り）
- [フォルダ構造](../docs/folder-structure.md)（昇格ルール・feature 間の render slot 合成）
- [アーキテクチャガイドライン](../docs/architecture-guideline.md)（画面ガードレシピ・写真の扱い）
- [ADR-014（mobile）: 地図一覧と地図詳細](./ADR-014-sanpo-map-list-and-detail.md)（SS-121 追補）
- 元チケット: SS-118 / 関連: SS-88（PR #93）・SS-111・SS-124（PR #102）・SS-146（PR #114）・SS-147（PR #115）・SS-121
