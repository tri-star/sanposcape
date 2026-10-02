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
   - `distanceInterval: 10` / `timeInterval: 3000`: 従来の `watchPosition` と同じ密度（点数の性質を変えないため、backend の契約・上限に影響しない）。
   - `accuracy: Highest`: 従来の `High` より高い。iOS は `kCLLocationAccuracyBest`（`High` は 10m 精度）、Android は `High` と同じ `PRIORITY_HIGH_ACCURACY`。徒歩の軌跡の滑らかさを優先した。電池が問題になったら `High` に下げる。
   - `activityType: Fitness`: iOS の省電力・停止判定を歩行向けにする。
   - `pausesUpdatesAutomatically: false`: ネイティブ既定が true で、止まると軌跡が欠けるため明示する。
   - `showsBackgroundLocationIndicator: true`: iOS で記録中であることを status bar に示す。
   - `foregroundService.killServiceOnDestroy: true`: 最近使ったアプリから消したら止める。進行中の散歩は永続化していないので、続けても誰も取り込めず「アプリを閉じたのに位置を取り続ける」ことになる。
4. サンプルの受け渡し: タスクがバッファ（`Paths.cache/walk-location-samples.jsonl`。JSONL 追記）に書き、同じプロセスのリスナーへも配る（`backgroundSampleHub`）。画面は測位時刻のカーソルで統合し（`walkTrackMerge`）、何度同じ点を受け取っても結果は変わらない。フォアグラウンド復帰時と再マウント時にバッファを読み直す。
   - 時刻カーソルは**端末時計が単調に進む**前提。時計が後退すると、後退後の点は（カーソルより古いので）捨てられる。同一ミリ秒の点も重複として捨てる。
   - hub はセッション開始時刻を持ち、それより前の測位時刻の点はバッファからも配信からも捨てる。`beginSession` のバッファ削除が失敗して前の散歩の点が残っても、新しい散歩に混ざらない（iOS が開始直後に届けるキャッシュ済みの古い fix も同時に除ける）。
   - JSONL は各追記の先頭にも改行を置く。書きかけで途切れた行（クラッシュ・強制終了）に次の追記が連結されても、壊れた行だけが捨てられ、次の有効な行は失われない。
   - `endSession` は全リスナーを外す。呼ぶのは散歩の終了・サインアウト・起動時だけで、いずれも hook 側も止まるため再購読は不要。この順序に依存している（`endWalk` による hook の停止が先、または同時）。
5. 寿命: 開始は散歩中画面の hook（`useWalkTracking`）。**hook のアンマウントでは止めない**（Android の戻るキーで画面だけ消えても散歩は続く）。止めるのは散歩の終了・サインアウト・アプリ起動時の3箇所だけ。開始と停止は `serialQueue` で直列化する。
   - 停止（`stopLocationUpdatesAsync`）が失敗したら1回やり直す。それでも失敗したら、記録（バッファ・リスナー）は先に畳みつつ「停止未了」を覚え、次の新規セッションの開始前・次の停止呼び出し（起動時の後始末を含む）で止め直す。停止が失敗しても点は `activeSessionId === null` で捨てられるので、残るのは OS の測位・通知・インジケータだけ。サインアウト経路の呼び出しは失敗を診断ログに残す。
   - 散歩の終了（`finishWalk`）は、ドラフトの確定が例外を投げても記録を止める（`try/finally`）。
6. バッファは `Paths.cache` に置く（`Paths.document` ではない）。居場所の軌跡が iOS の iCloud / 端末バックアップや Android の Auto Backup で端末外へ複製されないようにするため。OS が空き容量不足でキャッシュを消しうるが、その場合は軌跡が欠けるだけで散歩は続く。今は復元をしない（決定9）ので許容できる。SS-36 で復元を入れるときに置き場所を再検討する。
7. import 規律: `expo-task-manager` は `backgroundLocationTask.ts` だけが、位置サンプルのバッファ用途の `expo-file-system` は `sampleBufferStorage.file.ts` だけが import する。`expo-location` は引き続き `location.real.ts` だけ。
8. フィーチャーフラグで包まない。[release-runbook](../../../docs/release-runbook.md) の「不具合修正（元の仕様に戻すもの）」に当たる。ネイティブ設定（background mode / FGS 権限）はフラグで切り替えられない。また `/app-config` の取得失敗時はフラグが全て OFF になるため、包むと不具合が戻る。開始できない環境向けの安全弁は fallback が担う。
9. バッファは**復元の仕組みではない**。アプリの再起動を越えて散歩を引き継ぐのは SS-36 の範囲で、起動時にバッファを消す。

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
- 統合・分岐・符号化は、純粋関数（`walkTrackMerge` / `walkTrackingFallback` / `locationSample`）または依存を注入できる React 非依存のモジュール（`backgroundSampleHub` / `serialQueue`）で、Vitest でテストできる。`location.real.ts` の開始・停止の分岐も、`expo-location` を差し替えたテスト（`location.real.test.ts`）で担保する。mock も同じ hub を通る。
- 開始できない環境（古い development build など）でも、従来のフォアグラウンド記録に戻して散歩を続けられる。

### ネガティブな影響・トレードオフ

- 散歩中は Android に常に通知が出る（前面にいても）。
- iOS は位置情報のインジケータが出る。
- バッテリー消費は従来より増える（背面でも GPS を使う）。
- 点数が backend の上限（10,000 点）を超える長時間散歩は、この変更では扱わない（上限の判断は保存側）。バッファは毎回全件を読むので、長時間散歩の性能は実機で確認する。
- 散歩の終了を忘れると、気づくまで記録が続く（通知・インジケータで気づける）。
- 古いバイナリに OTA で今回の JS を配ると、`expo-task-manager` のネイティブモジュールが無く、起動時にクラッシュする（`version` を上げて互換境界を切る。[build-profiles](../docs/build-profiles.md) の運用ルール）。SS-156 の PR では `version`（0.1.0）を据え置いた。`version` を上げる PR と配布ビルドはセットで計画する運用のため、次の配布の前に上げる。それまで 0.1.0 のバイナリへ `eas update` を出してはならない。
- fallback に入った散歩は前面だけの記録になる。アプリが前面に戻るたびに背景記録の開始を再試行し、成功したら前面の購読を止めて切り替える（背面から開始して失敗した場合などを救う）。fallback 中であることを画面には出さない（別課題）。
- mock モードでは背面の記録を再現できない（Android は裏に回ると JS のタイマーが止まる）。背面の確認は real のエミュレータ・実機で行う。このため E2E（Maestro）のフローは変えていない。Home へ出て戻る手順を足しても背面の記録を検証できず、フレークの要因だけが増える。
- 精度（`accuracyMeters`）による点の除外はしない（従来の挙動を変えないため）。背面の点の品質に問題が報告されたら、後続の課題でしきい値を検討する。

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
