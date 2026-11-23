# ADR-M-027: ピンを散歩の目的地にする（ピン詳細から散歩開始画面を開く・`place_id` に `pin:<pinId>`）

## 日付

2026-11-23（初版、SS-170）

## コンテキスト

散歩の目的地は、これまで散歩開始画面で `/explore/places` が返すスポット（Google Places の場所）から選ぶものだけだった
（`SpotCandidate`。用語はプロジェクト概要の「スポット」「ピン」）。SS-170 は、利用者が登録したピンの位置を目的地にして散歩できるようにする課題で、
本文は「ピンの位置を散歩の目的地にする」の1行だけだった。入口・画面の形・API の扱いはこの ADR で決めた。

前提として確かめた事実:

- 周回ルートの API `POST /explore/routes/loop` は、`destination.place_id`（1〜256 文字の任意の文字列）を Google へ送らない。
  backend は Routes API に座標（`latLng`）だけを渡し、`place_id` は応答の `destination` へのエコーと、散歩の記録 `walks.destination_place_id` にだけ使う
  （`maps/service.py` の `_destination_read`、`integrations/google_maps/client.py`）。
- mobile も `place_id` を経路の取得・保存・キャッシュのキー以外に使っていない（Google の場所の詳細を開くなどの用途は無い）。
  散歩中の画面の既定値には `stub-default-goal` という Google 以外の値が既にある。
- `features/sanpo-map` と `features/walk` は互いに import していない。

## 決定

### 1. 入口はピン詳細の「このピンまで散歩する」だけにする

ピン詳細（`PinDetailView`）の「場所」の節、「ピンの場所に移動」の下に「このピンまで散歩する」（`pin-detail-walk-to-pin`）を置く。
押すと `/walk-start` を push し、そのピンを目的地にした散歩開始画面を開く。

- **進行中の散歩があるときは出さない。** 散歩中の地図からもピン詳細を開けるので、開始すると進行中の散歩を上書きしてしまうため。
- アーカイブ済みのピンでも出す（目的地にできない理由が無い）。
- `features/sanpo-map` を `features/walk` に依存させないため、遷移はルート `app/pins/[pinId]/index.tsx` が作って `onWalkToPin` として注入する。
  ルートが `useActiveWalkStore` を読み、進行中の散歩があれば注入しない（無ければボタンを出さない）。View は押下を `back.runOnce` に通す。
- 散歩開始画面の地図にピンを候補として並べることはしない（決定理由）。

### 2. ピン・座標・名前はルートパラメータで渡し、開始画面で検証する

`/walk-start?pinId=&latitude=&longitude=&name=`（`features/walk/explore/lib/pinWalkDestination.ts` の `buildPinWalkStartParams` / `parsePinWalkStartParams`）。
ディープリンクで任意の値が来うるので、`pinId` は UUID、座標は `isValidCoordinate`、配列は不可で検証し、不正なら通常の散歩開始画面で開く。
名前は空なら「目的地」にし、256 code point に切り詰める（スポットの名前と同じ `resolveSpotDisplayName`）。名前の無いピンはピン詳細の表示名（`pinDisplayName`）を渡す。

開始画面でピンを API で取り直さない。ピン詳細の「ピンの場所に移動」がピンタブへ座標をパラメータで渡すのと同じ形で、読み込み中・失敗の状態を開始画面に足さずに済む。
任意の値を入れたディープリンクで変わるのは、開いた本人の散歩の目的地だけ。

### 3. 開始画面は「ピンの目的地」の形で開き、候補の探索をしない

`WalkStartView` の `pinDestination` を `useWalkPlan` に渡すと、目的地をそのピンに固定し、`useSpotCandidates` を止める（`/explore/places` を呼ばない）。
画面には現在地・ゴールのピン（`SpotMapView` の `fixedDestination`）・周回ルート・目的地のサマリ・「散歩を始める」だけを出し、
候補一覧・往復時間のスライダー・カテゴリの行は出さない（いずれも候補の探索の条件で、目的地が決まっていれば意味が無い）。見出しは「ピンまで歩く」。

- 空いた縦を地図に回す（高さ 420。通常は 296）。
- **マウントの時点でルートがあれば、地図の `initialRegion` をルートの範囲にする。** 同じピンで開き直すと周回ルートが Query のキャッシュから即座に届き、
  `useMapRouteFit` の `animateToRegion` が地図の準備前に走って捨てられ、往復半径の広域のままになったため（エミュレータで確認）。
- 開始後は `router.dismissTo("/(tabs)")` でナビタブ（散歩中）へ戻す。ピン詳細から push で来ているので、下の `(tabs)` まで閉じる（無ければ置き換える）。
  通常の入り方（ナビタブから `replace`）の遷移は変えない。

### 4. `place_id` には `pin:<pinId>` を入れ、API は変えない

`WalkDestination.placeId` を `pin:<pinId>`（`PIN_DESTINATION_PLACE_ID_PREFIX`）にし、既存の `/explore/routes/loop` と `POST /walks` にそのまま送る。
Google の place id と見分けられ、散歩の記録（`walks.destination_place_id`）から目的地にしたピンを辿れる。
ルート ADR-003 決定8 の `destination_place_id` は、これで「Google の場所 ID、またはピンを目的地にしたときの `pin:<pinId>`」になった（ADR-003 の SS-170 追補）。

## 検討した選択肢

### 選択肢1: API に `pin_id` を足し、`place_id` を任意にする

- **概要**: `RouteDestination` / `WalkDestinationCreate` に `pin_id` を足し、`place_id` を null 許容にする。
- **メリット**: 項目の意味が明確になる。
- **デメリット**: 応答・記録の `place_id` を null 許容にする変更は配布済みのアプリを壊しうる（リリース運用手順 §7 の expand / contract・互換性台帳・フラグが要る）。
  backend は今 `place_id` を Google に使っていないので、得るものが少ない。

### 選択肢2: 散歩開始画面の地図に登録済みのピンを候補として並べる

- **概要**: スポットの候補と一緒にピンを地図・一覧に出し、選べるようにする。
- **メリット**: 開始画面だけで目的地を選び切れる。
- **デメリット**: ピンが多いと候補と混ざる。ピンの取得範囲・上限・クラスタ（ADR-M-012）・表示の絞り込み（ADR-M-021）を開始画面にも持ち込むことになる。課題の最小の解釈から外れる。

### 選択肢3: 開始画面へは `pinId` だけ渡し、ピンを API で取り直す

- **概要**: `GET /pins/{pin_id}` で名前・座標を引く。
- **メリット**: ディープリンクで名前・座標を偽れない。
- **デメリット**: 読み込み中・失敗（404・オフライン）の状態が開始画面に増える。偽れても困るのは開いた本人だけ。

## 決定理由

- 既存の API と画面で完結し、配布済みのアプリ・稼働中の backend に影響しない（mobile だけの変更で、いつ配布してもよい）。
- 目的地を決める操作は、ピンを見ているときに起きる。入口をピン詳細に置けば、開始画面にピンの取得・表示の仕組みを持ち込まずに済む。
- `features/sanpo-map` → `features/walk` の依存を作らず、ルートでの注入（認証の値の注入と同じ形。アーキテクチャガイドライン）で済む。

## 影響

### ポジティブな影響

- ピンを目的地にした散歩が、スポットと同じ周回ルート・散歩中の画面・記録・履歴（目的地の名前）で動く。
- 散歩の記録からピンを辿れる（`pin:` の接頭辞）。

### ネガティブな影響・トレードオフ

- `place_id` の意味が「Google の場所 ID」から広がった。backend・mobile で `place_id` を Google の ID として使う処理を足すときは、`pin:` で始まるものを除く必要がある。
- 共有地図のほかのメンバーのピンを目的地にすると、その名前・座標が自分の散歩の記録に写しとして残る（ピンが後で消えても残る。Google の場所の名称のスナップショットと同じ扱い。データ取扱い台帳の目的地の行）。
- ピン詳細のボタンは地図の下にあり、地図に当たるスワイプでは画面がスクロールしないため、Maestro の E2E を足していない（エミュレータの手動確認で押さえた）。

### 移行・対応が必要な事項

- 無し（API・DB・フラグを変えない）。

## 関連情報

- [ADR-003](../../../docs/adr/ADR-003-walk-record-persistence-and-history-api.md) 決定8（目的地のメタの非正規化。SS-170 追補）
- [ADR-007](../../../docs/adr/ADR-007-loop-route-generation.md)（周回ルートの生成）
- [ADR-M-008](./ADR-M-008-active-walk-state-and-route-cache.md)（進行中の散歩の状態とルートのキャッシュ）
- [ADR-M-012](./ADR-M-012-pin-map-display-and-detail.md)（ピン詳細。SS-246 追補の「ピンの場所に移動」）
- [データ取扱い台帳](../../../docs/privacy/data-inventory.md)（散歩の目的地の行）
