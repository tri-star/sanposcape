# ADR-M-018: 散歩中の位置記録はバックグラウンドのロケーションタスクで行う（使用中のみ権限・iOS background mode・Android フォアグラウンドサービス・端末バッファと統合）

## 日付

2026-10-02

## ステータス

採用（SS-156）。[ADR-M-006](./ADR-M-006-location-service-real-mock.md)（位置情報サービスは real/mock）と [ADR-M-008](./ADR-M-008-active-walk-state-and-route-cache.md)（進行中の散歩は永続化しない）に追補を入れている。

## コンテキスト

散歩中にアプリを裏へ回す、または画面をロックすると、その間の位置が**記録されない**（精度の低下ではなく未記録）。フォアグラウンドへ戻ると軌跡が A から B へ一直線につながる。

原因は実コードと expo-location 57.0.15 のネイティブ実装で確認した。

- 記録経路が `watchPositionAsync` だけだった。**Android** は `LocationModule.kt` の `OnActivityEntersBackground { stopWatching() }` で、Activity が裏に回った時点で watch を止める。**iOS** は `BaseLocationProvider.swift` が `allowsBackgroundLocationUpdates = false` を設定し、background mode も無いので、OS が数秒でアプリを suspend する。JS が止まる以前にネイティブが取得をやめている。
- iOS: `UIBackgroundModes: location` が未設定。`expo-location` の config plugin は `isIosBackgroundLocationEnabled` が true のときだけ足す。
- Android: フォアグラウンドサービスの権限（`FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_LOCATION`）が未設定。無いと `startLocationUpdatesAsync` が `ForegroundServicePermissionsException` を投げる。
- `expo-task-manager` が未導入。無いと iOS は `TaskManagerUnavailable`、Android は `TaskManagerNotFoundException`。
- 型定義（`Location.types.d.ts`）は `pausesUpdatesAutomatically` の既定を `false` と書くが、`EXLocationTaskConsumer.m` の実際の既定は `true`。

設計に効く事実:

- iOS は「使用中のみ」で足りる（`startLocationUpdatesAsync` が確認するのはフォアグラウンド権限と background mode だけ）。Android も `foregroundService` オプション付きなら `ACCESS_BACKGROUND_LOCATION` を要求しない。ただし**アプリが前面にいる間にしか開始できない**。
- 登録したタスクはアプリを再起動しても残る（expo-task-manager）。進行中の散歩は永続化していない（ADR-M-008 決定5）ので、起動時に前回のタスクを止めないと、散歩していないのに測位が続く。
- 課題は「常に」権限を不要と判断済み。

## 決定

1. 散歩中の位置記録は `Location.startLocationUpdatesAsync` + `TaskManager.defineTask`（`index.ts` からトップレベルで評価）で行う。`watchPosition` は背景記録を開始できなかったときの fallback だけに使う。
2. 権限は「使用中のみ」のまま。`requestBackgroundPermissionsAsync` は呼ばない。`ACCESS_BACKGROUND_LOCATION` は宣言しない。iOS は `UIBackgroundModes: location`、Android はフォアグラウンドサービス（type location）で継続する（`app.json` の `expo-location` プラグイン。契約テスト `locationPluginConfig.test.ts` で固定）。
3. タスクのオプションと理由（`location.real.ts` の `BACKGROUND_TRACKING_OPTIONS`）:
   - `accuracy: Highest` / `distanceInterval: 10` / `timeInterval: 3000`: 従来の `watchPosition` と同じ密度（点数の性質を変えないため、backend の契約・上限に影響しない）。
   - `activityType: Fitness`: iOS の省電力・停止判定を歩行向けにする。
   - `pausesUpdatesAutomatically: false`: ネイティブ既定が true で、止まると軌跡が欠けるため明示する。
   - `showsBackgroundLocationIndicator: true`: iOS で記録中であることを status bar に示す。
   - `foregroundService.killServiceOnDestroy: true`: 最近使ったアプリから消したら止める。進行中の散歩は永続化していないので、続けても誰も取り込めず「アプリを閉じたのに位置を取り続ける」ことになる。
4. サンプルの受け渡し: タスクがバッファ（`Paths.document/walk-location-samples.jsonl`。JSONL 追記）に書き、同じプロセスのリスナーへも配る（`backgroundSampleHub`）。画面は測位時刻のカーソルで統合し（`walkTrackMerge`）、何度同じ点を受け取っても結果は変わらない。フォアグラウンド復帰時と再マウント時にバッファを読み直す。
5. 寿命: 開始は散歩中画面の hook（`useWalkTracking`）。**hook のアンマウントでは止めない**（Android の戻るキーで画面だけ消えても散歩は続く）。止めるのは散歩の終了・サインアウト・アプリ起動時の3箇所だけ。開始と停止は `serialQueue` で直列化する。
6. import 規律: `expo-task-manager` は `backgroundLocationTask.ts` だけが、位置サンプルのバッファ用途の `expo-file-system` は `sampleBufferStorage.file.ts` だけが import する。`expo-location` は引き続き `location.real.ts` だけ。
7. フィーチャーフラグで包まない。[release-runbook](../../../docs/release-runbook.md) の「不具合修正（元の仕様に戻すもの）」に当たる。ネイティブ設定（background mode / FGS 権限）はフラグで切り替えられない。また `/app-config` の取得失敗時はフラグが全て OFF になるため、包むと不具合が戻る。開始できない環境向けの安全弁は fallback が担う。
8. バッファは**復元の仕組みではない**。アプリの再起動を越えて散歩を引き継ぐのは SS-36 の範囲で、起動時にバッファを消す。

## 検討した選択肢

- **`watchPositionAsync` + background mode だけ（タスクを使わない）**: Android は Activity が裏に回ると expo-location が watch を止める（`stopWatching()`）ので成立しない。
- **「常に」権限を取る**: 課題で不要と判断済み。Play の背景位置の申告も要る。使用中のみ + FGS で足りる（expo-location の実装で確認済み）。
- **前面は watchPosition、背面はタスク、の二重経路**: 同じ点が2経路で届き、順序の入れ替わりで軌跡がジグザグになる。統合が複雑になるので、経路を1本にした。
- **バッファの保存先**:
  - AsyncStorage: 未導入で、ネイティブ依存の追加になる。
  - SQLite: 依存の追加が大きすぎる。
  - `expo-file-system`: 導入済み・同期 API・SS-86 と同じ使い方なので採用。
- **全サンプルを zustand に積む**: ストアは非永続なので、再マウントやプロセスの作り直しに強くならない。

## 決定理由

- 背面で止まる原因はネイティブ側にあるため、JS での工夫では直らない。タスク + background mode / FGS が唯一の経路になる。
- 経路を1本（タスク）にし、受け取り側を「時刻カーソルでの冪等な統合」にすることで、リスナー・バッファ・fallback のどこから何度届いても同じ結果になる。
- 使用中のみ権限で済ませることで、App Review・Play の申告と権限ダイアログの負担を最小にする。

## 影響

### ポジティブな影響

- 背面・画面ロック・別アプリへの切り替え中も記録が続き、復帰後の軌跡が途切れない。
- 統合・分岐・符号化はすべて純粋関数（`walkTrackMerge` / `walkTrackingFallback` / `locationSample` / `backgroundSampleHub` / `serialQueue`）で Vitest でテストできる。mock も同じ hub を通る。
- 開始できない環境（古い development build など）でも、従来のフォアグラウンド記録に戻して散歩を続けられる。

### ネガティブな影響・トレードオフ

- 散歩中は Android に常に通知が出る（前面にいても）。
- iOS は位置情報のインジケータが出る。
- バッテリー消費は従来より増える（背面でも GPS を使う）。
- 散歩の終了を忘れると、気づくまで記録が続く（通知・インジケータで気づける）。
- 古いバイナリに OTA で今回の JS を配ると、`expo-task-manager` のネイティブモジュールが無く、起動時にクラッシュする（`version` を上げて互換境界を切る。[build-profiles](../docs/build-profiles.md) の運用ルール）。
- fallback に入った散歩は、その散歩の間は前面だけの記録のままになる（復帰時に背景記録へ戻す再試行はしない）。
- mock モードでは背面の記録を再現できない（Android は裏に回ると JS のタイマーが止まる）。背面の確認は real のエミュレータ・実機で行う。

### 移行・対応が必要な事項

- development build の作り直し（ネイティブ依存とプラグイン設定が変わる）。
- SS-36: 起動時の停止を「復元」へ差し替える。一時停止の状態の永続化。
- SS-157: 通知文言（`BACKGROUND_TRACKING_NOTIFICATION`）、Info.plist の文言、Android の通知チャンネル。
- SS-161: App Review / Play の FGS 申告。
- 散歩の終了忘れへの自動停止（未起票。必要なら起票）。

## 関連情報

- [ADR-M-006: 位置情報サービスは real/mock の2モード](./ADR-M-006-location-service-real-mock.md)（SS-156 追補）
- [ADR-M-008: 進行中の散歩の状態管理](./ADR-M-008-active-walk-state-and-route-cache.md)（決定5・決定6 の SS-156 追補）
- [ADR-M-003: development build 前提の開発ループ](./ADR-M-003-development-build-and-dev-loop.md)
- [ADR-M-015: アプリアイコン](./ADR-M-015-app-icon-assets.md)（通知アイコンに使う単色レイヤー）
- 元チケット: SS-156 / 関連: SS-17・SS-36・SS-157・SS-161
