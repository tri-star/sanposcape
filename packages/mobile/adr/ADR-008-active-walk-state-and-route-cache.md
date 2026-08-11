# ADR-008: 進行中の散歩は feature スコープの Zustand で保持し、ルートは TanStack Query のキャッシュを画面間で共有する

## 日付

2026-08-01（初版 / SS-16）、2026-08-02 追補（SS-19）、2026-08-02 追補（SS-20）、2026-08-06 追補（SS-13）、2026-08-11 追補（SS-35）、2026-08-11 追補（SS-50）

## ステータス

採用（SS-16）。[ADR-002](./ADR-002-mobile-tech-stack.md) の「クライアント状態 = Zustand（`src/store`）」および [folder-structure](../docs/folder-structure.md) の状態管理の使い分けを、**機能スコープのストアという形で具体化**する。

**SS-19「散歩終了処理・散歩ルート保存」で追補**した（決定1 にフィールドを追加、決定4〜6 を新規追加、「影響」を書き直し）。追補部分には `（SS-19 追補）` を付けている。

**SS-20「散歩履歴一覧・詳細画面」で追補**した（決定4 の「SS-20 の履歴詳細へ遷移するために id が要る」という見込みの記述を実現済みの事実に更新し、「移行・対応が必要な事項」の SS-20 への申し送りをクローズした）。追補部分には `（SS-20 追補）` を付けている。

**SS-13「認証状態と探索ロジックの分離」で追補**した（決定6 の「実行側」を `SettingsView` から `useAuthSessionStore` へ変更した）。追補部分には `（SS-13 追補）` を付けている。

**SS-35「散歩開始後の現在地起点ルート再計算」で追補**した（決定2 に例外を追記、決定7 を新規追加）。追補部分には `（SS-35 追補）` を付けている。

**SS-50「サインアウト時の遷移をAuthGateに一本化」で追補**した（決定6 の退避と履歴スタック整理を `AuthGate` に集約した）。

## コンテキスト

SS-16「スポット選択 → 散歩ルート提示 → 散歩開始 → 散歩中表示」で、**画面をまたいで散歩の状態を持ち回る必要**が初めて発生した。

- 散歩開始画面（`app/walk-start.tsx`）でスポットを選び、backend の `POST /explore/routes/walking` で徒歩ルートを取得して地図に提示する。
- 「散歩を始める」を押すと散歩中画面（`app/(tabs)/index.tsx`）へ遷移し、**同じ目的地・同じルート**を表示し続ける。

SS-15 までは、この受け渡しを **Expo Router の params**（`goalName` / `goalTimeMin` / `goalDistKm` の文字列）で行っていた。しかし SS-16 で扱う情報は目的地の `place_id`・座標・ルートのポリライン・散歩の開始時刻と多く、params の文字列化では破綻する。あわせて次の制約がある。

- **Google Maps Platform のコスト・レート制限**: `/explore/places` と `/explore/routes/walking` は backend 側で**同一のレート制限バケット**（既定 30 req / 60 秒 / ユーザー）を共有する。散歩中に現在地が更新されるたびにルートを引き直すと、数分で 429 に達する。
- 散歩中は 1 秒ごとに経過時間が、数秒ごとに現在地が更新される。**更新頻度の高い値と、散歩中ずっと不変の値が混在**する。
- **散歩の記録・永続化は M5（SS-18〜SS-20）のスコープ**で、SS-16 の時点では保存 API が存在しない。
- 端末のスリープや画面の再マウントで経過時間がずれてはいけない。

### SS-19 で変わった前提（追補）

SS-19 で `POST /walks` への保存が mobile に入り、初版の前提のうち2つが変わった。

- **保存 API が存在するようになった**（[ADR-003](../../../docs/adr/ADR-003-walk-record-persistence-and-history-api.md)）。散歩は「終了 → サマリ画面 → 保存」という流れになり、**終了してから保存が確定するまでの間**という、進行中でも保存済みでもない状態が画面をまたいで発生する。
- **冪等キーの採番タイミングが散歩開始時に決まった**（ADR-003 の決定3）。保存直前に採番するとリトライのたびに値が変わり冪等性が効かないため、`ActiveWalk` に載せて散歩開始から終了・再送まで持ち回る必要がある。

あわせて、SS-19 のセキュリティレビューで**共有端末でのアカウント切り替え**が論点になった。保存待ちの軌跡（機微な位置情報）が store に残ったままサインアウト → 別アカウントでサインインすると、前のユーザーの散歩が次のユーザーのトークンで送信されうる。

## 決定

### 1. 進行中の散歩は `features/walk/store/useActiveWalkStore.ts`（Zustand）で保持する

- 保持するのは `ActiveWalk` = `{ clientWalkId, origin, destination, roundTripMinutes, roundTripKm, startedAtMs }` の**識別情報だけ**。
  - `clientWalkId` は**SS-19 追補**。保存の冪等キー（`client_walk_id`）を**散歩開始時**に `randomUuidV4()`（`src/lib/uuid.ts`）で採番し、終了・再送でも変えない（ADR-003 の決定3）。サーバーから受け取った値ではなく端末が採番したクライアント状態なので、「サーバー由来データを入れない」規律には抵触しない。
- **サーバー由来のデータ（ルート本体）はストアに入れない。**
- 置き場所は `src/store/` ではなく **`src/features/walk/store/`**（`walk` 機能に閉じるため）。
- **永続化しない**（AsyncStorage / SecureStore を使わない）。アプリを落としたら散歩は終わる。
- Expo Router の params による受け渡しは**全廃**する。

### 2. ルート本体は TanStack Query のキャッシュを2画面で共有する

- 散歩開始画面と散歩中画面が、**同じ入力（`origin`, `destination`）で同じ `useWalkRoute` を呼ぶ**。queryKey が一致するため、遷移後も API 呼び出しは発生しない。
- `staleTime = 1 時間` / `gcTime = 2 時間` / `retry: false`。固定2点間の徒歩ルートは実質不変で、往復最大120分の散歩でもキャッシュを生かしきれる。
- **`origin` は「散歩の起点」で固定**し、現在地の更新でこの hook の入力を変えない。
- queryKey の安定性のため、`buildWalkingRouteRequest` が `origin` を**小数4桁に丸める**（GPS の揺れで毎回別のキーになるのを防ぐ。backend 側のキャッシュキー `route:{lat:.5f}:{lng:.5f}:...` にも当たるようになる）。
- **（SS-35 追補）この規律に例外を1つ追加する**: 「`origin` は散歩の起点で固定」という規律は**初期ルートについては維持**する。SS-35 で追加する「現在地起点の再計算」は Query を経由しない別経路（決定7）であり、`useWalkRoute` の queryKey は変えない。初期ルートのキャッシュ共有はそのまま残る。

### 3. 経過時間は開始時刻からの実時刻差で算出する

- `ActiveWalk.startedAtMs` を基準に `lib/walkElapsed.ts` の純粋関数で計算する。カウンタを加算しない。
- 一時停止は「停止していた累計 ms」として保持し、経過時間から差し引く。

### 4. 「終了したが保存が確定していない散歩」は第3の状態として別ストアに持つ（SS-19 追補）

散歩の状態を「進行中」「保存済み（サーバー）」の2つでは表せなくなったため、**`features/walk/store/useFinishedWalkStore.ts`** を追加し、`walk` feature のストアを2つにする。

- 保持するのは `FinishedWalk`（`clientWalkId` / `startedAtMs` / `endedAtMs` / `elapsedSec` / `distanceMeters` / `destination` / `track`）と、保存状態の `saved` / `savedWalkId`。
- 状態遷移: 散歩中画面で終了を確定 → `useActiveWalkStore.endWalk()` と同時に `finishWalk(draft)` でドラフトを積む → サマリ画面で `useWalkSave` が `POST /walks` を1回だけ発火 → 成功で `markSaved(walk.id)`。
- `useActiveWalkStore` に相乗りさせず**ファイルを分ける**。前者は「今どの散歩をしているか」、後者は「サーバーへ送る対象そのもの」で、寿命も責務も異なるため。
- 画面間の受け渡しに Expo Router の params を使わない方針は、終了 → サマリの遷移にもそのまま適用する（決定1 と同じ理由）。

**`savedWalkId` は「サーバー由来データを store に入れない」規律に対する意図的な例外**とする。

- 例外の範囲は**サーバーが採番した識別子1つだけ**。散歩の内容そのもの（`WalkRead`）は入れない。
- 許容する理由: SS-20 の履歴詳細（`/walks/{id}`）へ遷移するために id が要るため（**SS-20 追補**: 実際に `WalkSummaryView` の「記録を見る」が `savedWalkId` を使って `/walk-history/[walkId]` へ直行する形になった）。そのために Query キャッシュへ「保存結果」を積むと、履歴一覧の queryKey とは別系統のサーバー状態が二重に生まれる。識別子1つを保存状態と一緒に持つほうが二重管理が小さい。
- `saved`（真偽）を `savedWalkId` と独立に持つのは、id が取れないケース（将来 backend の契約が変わった場合）でも「保存は済んだ」を表せるようにするため。

### 5. 「永続化しない」判断は SS-19 でも維持し、アプリ再起動からの復帰はフォローアップ課題に送る（SS-19 追補）

初版の「移行・対応が必要な事項」で M5 の保存実装時に見直すとしていた判断を、**SS-19 時点では『維持』と結論する**。`useActiveWalkStore` / `useFinishedWalkStore` のいずれにも persist ミドルウェアを入れない。理由:

- **永続ストレージの依存が現状無い。** `expo-secure-store` は値サイズ上限（約 2KB）があり軌跡を置けない。`@react-native-async-storage/async-storage` は未導入。`expo-file-system` は推移的依存として存在するが、明示依存へ昇格させると `package.json` が変わって `@expo/fingerprint` が変化し、[ADR-004](./ADR-004-e2e-build-ci-strategy.md) の E2E APK キャッシュを1回ミスさせる。
- **「復帰」は保存とは独立した設計判断。** 進行中の散歩を本当に復元するには、増え続ける `track` を測位のたびにスロットリングして書き出し、起動時に復元し、古いドラフトの期限判定を入れる必要がある。SS-19 の「終了処理・ルート保存」に混ぜると差分が大きくなりレビューが成立しない。

→ フォローアップ課題「mobile: 進行中の散歩と未送信の散歩記録をローカル永続化して復帰できるようにする」として切り出す（保存先は `expo-file-system` の明示依存化を第一候補、`async-storage` を対案として比較する）。**着手時は本 ADR の再追補が必要**。

### 6. サインアウト時に walk 系ストアと Query キャッシュをクリアする（SS-19 追補）

`src/lib/sessionCleanup.ts` に後始末レジストリ（`registerSessionCleanup` / `runSessionCleanup`）を置き、**クリアされる側が自分の後始末を登録する**形にする。

- 登録側: `useActiveWalkStore`（`endWalk()`）、`useFinishedWalkStore`（`clearFinishedWalk()`）、`src/api/queryClient.ts`（`queryClient.clear()`）。各モジュールの末尾で読み込み時に1回登録する。
- 実行側: **`src/store/useAuthSessionStore.ts` の `setSession()` が、認証状態を `authenticated → guest` に落とす時点で `runSessionCleanup()` を呼ぶ（SS-13 追補）**。これによりサインアウトだけでなく、refresh token 失効による非自発的なセッション終了でも後始末が走る。
  - 初版時点の実行側は `features/settings/components/SettingsView.tsx` の `handleConfirmLogout`（`authService.signOut()` の確定後に呼ぶ）だった。SS-13 でセッション状態を1箇所に集約する `useAuthSessionStore` を導入したことに伴い、後始末の起点も「サインアウト導線」から「認証状態そのものの遷移」へ移した。**SS-50 では退避と履歴スタックの破棄も `AuthGate` に移した。** `SettingsView` は `authService.signOut()` の起動だけを担い、サインアウト callback と React effect の実行順に依存しない。
- 1つの後始末が例外を投げても残りは実行する（無関係なストアの失敗で、軌跡のような機微データが残留しないようにするため）。
- サインアウト導線は `authService.signOut()` を起動するだけにする。後始末は認証状態遷移、退避と履歴スタックの破棄は `AuthGate` が担うため、feature 側のストアが増えるたびにサインアウト導線を編集させない（＝クリア漏れを構造で防ぐ）。
- **`useAuthSessionStore` 自身は `registerSessionCleanup()` に登録しない（SS-13 追補）**。このストアは「クリアされる側のデータ」ではなく「セッション状態そのもの」であり、`loading` に戻すと `AuthGate` がスプラッシュへ送り返してしまうため。詳細は [ADR-009](./ADR-009-auth-session-state-and-route-gate.md) を参照。

### 7. 再計算後のルートは Query キャッシュではなく `useWalkRouteRecalculation` のローカル state で持つ（SS-35 追補）

散歩中に現在地が表示中のルートから逸脱したら、現在地を起点に目的地までの徒歩ルートを引き直す（`src/features/walk/hooks/useWalkRouteRecalculation.ts`）。この再計算ルートは決定2 の Query キャッシュには載せない。

- **理由**: 取得中・失敗時に直前のルートを表示し続ける必要がある。`useWalkRoute`（決定2）の入力（`origin`）を現在地に差し替えると queryKey が変わり、取得中・失敗時に `data` が `undefined` に落ちて直前のルートが画面から消える（受け入れ条件「ルート取得失敗時は直前の正常ルートと進行状態を維持する」に反する）。`placeholderData: keepPreviousData` は pending 中しか効かず、error 状態は救えない。
- **古い応答の追い越し防止**のため、`AbortController` + 単調増加の `sequence` を hook 内で自前で持つ（hook の `sequenceRef` が新しい `sequence` を採番して `beginRecalculation` に渡し、`applyRecalculationSuccess`/`applyRecalculationFailure` は一致しない `sequence` の応答を無視する）。**採番は散歩の切り替え時にも巻き戻さない** — `resetRecalculation` が state 側の `sequence` を 0 に戻すため、リセット前に飛んだリクエストは必ず不一致になって捨てられる。連続操作・連続測位でも同時リクエストは1つに保たれ、古い応答が新しいルートを上書きしない。
- **呼び出し抑制**: 逸脱 80m（`ROUTE_DEVIATION_THRESHOLD_METERS`）× 連続2測位（`REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES`）+ 最小間隔60秒（`RECALCULATION_MIN_INTERVAL_MS`）+ 連続失敗2回（`MAX_CONSECUTIVE_AUTO_FAILURES`）で自動停止する。目的地から50m以内（`DESTINATION_NEAR_RADIUS_METERS`）では再計算しない。`/explore/*` の共有レート制限（既定30 req/60秒/ユーザー）に対し、1散歩あたり最大 1 req/分に収まる（手動再計算・再試行はこの抑制の対象外だが、ユーザー操作1回につき最大1リクエストのため実害は小さい）。
- **例外の範囲を「同じ目的地へ現在地から引き直す1本のルート」に限定する**。`ActiveWalk.origin`（決定1）は書き換えない — 散歩の起点であり、`useWalkTracking.initialPosition` にも使われているため。
- 判定ロジック（折れ線までの距離・状態遷移）は `src/features/walk/lib/routeDeviation.ts` / `src/features/walk/lib/routeRecalculation.ts` の純粋関数に置き、副作用（fetch・Abort・世代管理）は hook 側に閉じる（`docs/architecture-guideline.md` の単体テスト方針どおり）。

## 検討した選択肢

### 選択肢1: Expo Router の params で持ち回る（SS-15 の延長）

- **概要**: 目的地・ルートを params に載せて画面遷移する。
- **メリット**: 新しい仕組みが不要。状態の寿命が画面遷移に自然に一致する。
- **デメリット**: ポリライン（数十〜数百点）を文字列化して渡すのは非現実的。座標・`place_id` が URL に露出する。params を持たない経路（画面カタログ、タブの直接タップ）で画面が壊れる。型安全性が無い。

### 選択肢2: ルートごとストアに入れる（Zustand に全部持つ）

- **概要**: `ActiveWalk` にルートのポリライン・所要時間・距離も含めて保持する。
- **メリット**: 参照が1箇所で分かりやすい。オフラインでも散歩中画面が成立する。
- **デメリット**: サーバー由来データをストアに複製することになり、`folder-structure.md` の使い分けに反する**状態の二重管理**が生じる。再取得・エラー・ローディングの管理を自前で書き直すことになる。

### 選択肢3: 進行中の散歩も TanStack Query で持つ

- **概要**: 「今の散歩」をクエリとして表現する。
- **メリット**: 状態管理の仕組みが1つで済む。
- **デメリット**: サーバーに存在しないクライアント状態を Query に載せるのは責務が合わない。保存 API が無い SS-16 の時点では「取得元の無いクエリ」になる。

### 選択肢4: `src/store/` に横断ストアとして置く

- **概要**: `useActiveWalkStore` を `src/store/useAppStore.ts` と同列に置く。
- **メリット**: ストアの置き場所が1箇所に集まる。
- **デメリット**: 現時点で参照するのは `features/walk` 配下だけで、横断化の必要が無い。`folder-structure.md` の「その機能の外から import されるものは置かない」という凝集の原則に反する。

### 選択肢5: 終了後も `useActiveWalkStore` にドラフトを残す（SS-19 追補・不採用）

- **概要**: 散歩終了時に `endWalk()` を呼ばず、保存が確定してから `activeWalk` を捨てる。
- **メリット**: ストアが1つのままで済む。散歩開始 → 保存完了までを1つの状態機械として書ける。
- **デメリット**: 「散歩中画面を出すべきか」の判定が `activeWalk !== null` で済まなくなり、既存の `WalkIdleNotice` の分岐に保存状態が漏れ出す。`ActiveWalk`（識別情報だけ）に `track` や実測距離といった保存対象そのものが混ざり、決定1の「識別情報だけ」という性質が崩れる。

### 選択肢6: 保存待ちドラフトを TanStack Query の mutation state だけで持つ（SS-19 追補・不採用）

- **概要**: 終了時に `useMutation` を発火し、変数・結果を mutation の状態として参照する。
- **メリット**: 新しいストアを増やさずに済む。再試行やエラー状態が Query の機構に乗る。
- **デメリット**: mutation の状態は hook がアンマウントされると失われるため、散歩中画面で終了 → サマリ画面で表示、という**画面をまたいだ受け渡しには使えない**。保存前のドラフトはサーバー由来ではなく端末側の事実であり、決定1・決定2 で引いた「クライアント状態 = Zustand」の境界にも合わない。

### 選択肢7: SS-19 でローカル永続化・復帰まで実装する（SS-19 追補・不採用）

- **概要**: `useActiveWalkStore` / `useFinishedWalkStore` に persist ミドルウェアを入れ、起動時に復元・再送する。
- **メリット**: 「保存前にアプリが落ちると記録が消える」という初版からの残存リスクを解消できる。
- **デメリット**: 永続ストレージの依存追加（`@expo/fingerprint` の変化 → ADR-004 の E2E APK キャッシュミス）と、測位のたびの書き出しスロットリング・起動時復元・古いドラフトの期限判定という独立した設計が必要になる。SS-19 の差分に混ぜるとレビュー不能な規模になる（決定5 を参照）。

## 決定理由

- **状態の性質で置き場所を分けるのが最も破綻しにくい**。「サーバー由来 = Query、クライアント状態 = Zustand」という既存方針をそのまま適用すると、選択肢2・3は自動的に外れる。ルートは backend が返すデータであり、`ActiveWalk` は端末側の「今の状況」である。
- **API コストが設計を強く制約した**。`/explore/places` とレート制限バケットを共有する以上、ルートを1回しか引かない構造が必須だった（SS-35 の決定7 で「散歩中の逸脱時に引き直す」例外を足したが、そこでも抑制条件を重ねて1散歩あたり最大 1 req/分に収めている。制約自体は緩んでいない）。「2画面が同じ queryKey で呼ぶ」という形にすると、キャッシュ共有が**副作用ではなく設計の主目的**になり、意図が明示される。`origin` を丸めて固定するという規律もここから導かれる。
- **選択肢4より feature スコープを選んだ**のは、横断化の必要が生じてから昇格させる方が、逆（先に横断に置いて後から降格）より安全なため。コンポーネントの昇格ルールと同じ判断基準で一貫させた。
- **経過時間を実時刻から算出する**のは、`setInterval` のカウントアップだと画面の再マウント・端末スリープでずれるため。純粋関数に切り出せて Vitest でテストできる副次効果もある（RN のレンダリングテストが書けない制約下では重要）。

### SS-19 追補分の決定理由

- **ストアを2つに分けたのは、状態の性質で置き場所を分けるという初版の判断基準をそのまま適用した結果**。「今どの散歩をしているか」と「サーバーへ送る対象そのもの」は寿命も更新頻度も異なり、1つのストアに畳むと決定1 の「識別情報だけ」という不変条件が壊れる（選択肢5）。ストアが2つになる代償より、それぞれの不変条件が単純なまま保たれる利得を採った。
- **`savedWalkId` だけを例外にしたのは、例外の範囲を最小に固定するため**。「サーバー由来データを入れない」を厳格に守ると、SS-20 の詳細遷移のために保存結果を Query キャッシュへ積むことになり、履歴一覧とは別系統のサーバー状態が生まれる（**SS-20 追補**: 実際に SS-20 では `useWalkDetail`/`useWalkHistory` の queryKey とは別に、`savedWalkId` という識別子1つだけを経路に使う形で実装された）。識別子1つに限定し、それ以外は入れないと ADR とコードのコメント両方に書くことで、なし崩し的な拡大を防ぐ。
- **「永続化しない」を維持したのは、依存追加のコストと設計の独立性が判断を分けたため**。復帰の実装そのものが不要になったわけではなく、SS-19 のスコープ（終了処理・保存）と一緒に決めるべき問題ではないという判断。ADR の TODO を「未決のまま放置」ではなく「維持と結論し、覆すには再追補が必要」と明示することで、次に触る人が同じ調査を繰り返さずに済む。
- **後始末をレジストリにしたのは、クリア漏れを規律ではなく構造で防ぐため**。サインアウト導線に「あれもこれもクリアする」と列挙する形にすると、feature 側でストアが増えるたびに同じレビュー指摘が繰り返される。クリアされる側が自分で登録する形なら、ストアの追加とクリアの追加が同じファイルの中で完結する。

## 影響

### ポジティブな影響

- 散歩開始 → 散歩中の遷移で **API 呼び出しが1回で済む**。429 のリスクが構造的に下がる。
- 座標・`place_id` が router params に生値で露出しなくなった（SS-15 のセキュリティレビューでの軽微な指摘が解消）。
- 散歩中画面が params に依存しなくなり、**タブから直接開いても壊れない**（散歩中でなければ `WalkIdleNotice` を出す）。
- 経過時間・軌跡距離が純粋関数に切り出され、Vitest でテスト可能になった。
- （SS-19 追補）終了 → サマリ → 保存の受け渡しも params を使わないため、サマリ画面を直接開いても壊れない（ドラフトが無ければ `data/defaults.ts` の代表値で描画する）。
- （SS-19 追補）保存対象が `FinishedWalk` という1つの型に閉じたため、送信ペイロードの組み立て（`lib/walkCreateRequest.ts` / `lib/walkTrackPayload.ts`）を純粋関数として Vitest でテストできる。
- （SS-19 追補）クリア対象が `lib/sessionCleanup.ts` の1箇所に集まり、サインアウト時の残留データの棚卸しがそこを見るだけで済む。

### ネガティブな影響・トレードオフ

- **アプリを落とすと散歩状態が消える（残存リスク）。** M5 の保存機能（SS-19）が入っても解消していない。むしろ**影響範囲は広がった**: 進行中の散歩に加えて、**終了済み・保存前のドラフト**（`useFinishedWalkStore` の `FinishedWalk`）も同じく失われる。保存が失敗したままサマリ画面を離れる／アプリが OS に落とされると、その散歩は再送手段が無くなる。
  - 現状の緩和策は、保存失敗時にサマリ画面上で手動再試行できることだけ（`WalkSaveStatus`）。
  - 恒久対応は決定5 のフォローアップ課題（ローカル永続化と起動時の再送・復帰）に送っている。**「M5 が入るまで」という期限付きの割り切りではなく、その課題が着手されるまで残り続けるリスク**として扱う。
- （SS-19 追補）`useFinishedWalkStore.savedWalkId` により、「ストアにサーバー由来データを入れない」という規律に例外が1つ存在する状態になった。規律を読むだけでは例外の存在が分からないため、[folder-structure](../docs/folder-structure.md) と本 ADR の両方に許容条件を明記して補っている。
- 画面カタログ（`/dev-screens`）から散歩中画面を開く場合、**ストアに代表値を仕込んでから遷移する**必要が生じた（`DEFAULT_ACTIVE_WALK`）。「状態を前提に描画する画面」は単純な `router.push` では確認できない。
- `staleTime` が長いため、**同じ2点のルートは1時間再取得されない**。backend 側でルートが改善されても即座には反映されない（徒歩ルートの性質上、実害は小さいと判断）。
- 散歩中画面の「往復の目安」（探索結果のスナップショット）と「片道◯分」（実ルート値）が**異なる API 由来の数値**になる。前者は候補一覧との一貫性、後者は正確性を優先した結果で、両者が僅かにずれうる。
- （SS-35 追補）サーバー由来データが Query キャッシュ外（`useWalkRouteRecalculation` の hook state）に1箇所生まれる。画面をアンマウントすると再計算結果は失われ、初期ルート表示に戻る（散歩中画面はタブ画面で通常アンマウントされないため実害は小さい）。

### 移行・対応が必要な事項

- ~~**M5（SS-18〜SS-20）で散歩記録の保存を実装する際**、この ADR の「永続化しない」判断を見直す。~~ → **SS-19 で対応済み**。`WalkTrackState.points` / `elapsedSec` / `distanceMeters` は `buildFinishedWalk`（`lib/finishedWalk.ts`）で `FinishedWalk` にまとめ、`buildWalkCreateRequest` 経由で `POST /walks` に渡す形になった。persist ミドルウェアの追加は**見送り**と結論した（決定5）。
- **フォローアップ課題（未着手）**: 「mobile: 進行中の散歩と未送信の散歩記録をローカル永続化して復帰できるようにする」。着手時は決定5 を覆すことになるため、本 ADR の再追補が必要。
- ~~**SS-20（履歴一覧・詳細）への申し送り**: `useWalkSave` の成功時に `invalidateQueries({ queryKey: ["walks"] })` を呼んでいるため、履歴一覧・詳細の queryKey は `["walks", ...]` 始まりにすること。保存直後の履歴に新しい散歩が出ない不具合を防ぐ。詳細遷移には `useFinishedWalkStore.savedWalkId` を使える。~~ → **SS-20 で対応済み**。`features/history/hooks/useWalkHistory.ts` は `queryKey: ["walks","list",{limit}]`、`useWalkDetail.ts` は `["walks","detail",walkId]` で統一し、`useWalkSave` の `invalidateQueries({ queryKey: ["walks"] })` に載る。`WalkSummaryView` の「記録を見る」は `useFinishedWalkStore.savedWalkId` を使って `/walk-history/[walkId]` へ直行する。
- **SS-33（往路と復路が異なる周回ルート）** では `WalkRoute` に往路/復路の区別（`legs` 等）が入る見込み。ルートを Query キャッシュで共有する構造自体は維持できるが、API 呼び出しが増える場合は `staleTime` / レート制限の再検討が必要。（SS-35 追補）その場合、決定7 の `walkRouteFitKey` と `isOffRoute` の判定対象（どの leg の折れ線を使うか）も見直しが必要になる。
- 機能スコープのストアが**2つ以上の機能から参照されるようになったら `src/store/` へ昇格**させる。SS-19 時点では `useActiveWalkStore` / `useFinishedWalkStore` とも `features/walk` 配下（と開発確認用の `ScreenCatalog`）からのみ参照しており、昇格しない。

## 関連情報

- [ADR-002: mobile の技術スタック](./ADR-002-mobile-tech-stack.md) — クライアント状態 = Zustand の原則
- [ADR-004: E2E ビルド・CI 戦略](./ADR-004-e2e-build-ci-strategy.md) — 依存追加が `@expo/fingerprint` 経由で APK キャッシュに効く（決定5 の理由）
- [ADR-006: 位置情報サービスは real/mock の2モード](./ADR-006-location-service-real-mock.md) — SS-16 で `watchPosition` を追加
- [ADR-001: 地図・POI は Google Maps Platform](../../../docs/adr/ADR-001-map-poi-google-maps-platform.md) — Routes は backend 経由、片道値2倍で往復算出
- [ADR-003: 散歩記録の永続化と履歴 API](../../../docs/adr/ADR-003-walk-record-persistence-and-history-api.md) — `client_walk_id` の採番タイミング（決定3）、保存 API の契約
- [ADR-009: 認証セッション状態を1箇所に集約し、認証ゲートで未認証を弾く](./ADR-009-auth-session-state-and-route-gate.md) — 決定6 の実行側を `useAuthSessionStore` へ移した経緯（SS-13 追補）
- [folder-structure](../docs/folder-structure.md) — `features/<feature>/store/` の配置ルールと状態管理の使い分け
- 実装: `src/features/walk/store/`、`src/features/walk/lib/finishedWalk.ts`、`src/features/walk/hooks/useWalkSave.ts`、`src/lib/sessionCleanup.ts`、`src/lib/uuid.ts`、`src/store/useAuthSessionStore.ts`
- （SS-35 追補）実装: `src/features/walk/lib/routeDeviation.ts`、`src/features/walk/lib/routeRecalculation.ts`、`src/features/walk/hooks/useWalkRouteRecalculation.ts`、`src/features/walk/lib/walkRouteNotice.ts`、`src/features/walk/components/WalkRouteNotice.tsx`
- Plane: SS-16（本 ADR の発生元）、SS-19（本追補の発生元）、SS-20（本追補の発生元）、SS-33（周回ルート）、SS-18〜SS-20（M5 散歩記録・履歴）、SS-13（本追補の発生元）、SS-35（本追補の発生元）、SS-50（本追補の発生元）
