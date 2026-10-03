# ADR-M-018: 散歩中の位置記録はバックグラウンドのロケーションタスクで行う（使用中のみ権限・iOS background mode・Android フォアグラウンドサービス・端末バッファと統合）

## 現在有効な決定（要約）

> 最終更新: 2026-10-03（SS-157）。本節は本文（追補を含む）を要約したもので、一次記録は本文。本文と食い違う場合は本節の誤りとして本節を直す。

### 決定

- 散歩中の記録は `startLocationUpdatesAsync` + `TaskManager.defineTask`。`watchPosition` は開始できなかったときの fallback だけ（本文: 決定1）
- 権限は「使用中のみ」。`requestBackgroundPermissionsAsync` は呼ばず、`ACCESS_BACKGROUND_LOCATION` は宣言しない。iOS は `UIBackgroundModes: location`、Android は FGS（本文: 決定2）
- タスクのオプション（Highest / 10m・3秒 / Fitness / `pausesUpdatesAutomatically: false` / インジケータ / `killServiceOnDestroy: true`）（本文: 決定3）
- サンプルはバッファ（`Paths.cache` の JSONL）と hub で受け渡し、時刻カーソルで冪等に統合する（本文: 決定4・決定6）
- 止めるのは散歩の終了・サインアウト・起動時だけ。停止失敗は「停止未了」として次で止め直す（本文: 決定5）
- import 規律（本文: 決定7）／フラグで包まない（本文: 決定8）／バッファは復元の仕組みではない（本文: 決定9）
- （SS-157）iOS の利用目的文言は `app.json` の expo-location プラグインのオプションだけで設定し、3用途と背景での取得・止まる条件を書く（本文: 決定10、SS-157 追補）
- （SS-157）「常に」系2キーは消さずに使用中と同じ文言、モーションのキーも消さずに「使用しない」旨の文言（本文: 決定11・決定12、SS-157 追補）
- （SS-157）利用目的文言は日本語のみ（本文: 決定13、SS-157 追補）
- （SS-157）Android の FGS 通知文言を確定。通知チャンネルの名前・説明は expo-location の既定のまま（本文: 決定14、SS-157 追補）

### 未解決・持ち越し

- SS-36（起動時の停止 → 復元）
- SS-161（App Review・Play の FGS 申告、TestFlight での ITMS-90683 の最終確認）
- 散歩の終了忘れの自動停止（未起票）
- `version` を上げる前に 0.1.0 のバイナリへ `eas update` を出さない
- expo-location に expo/expo#49409 が入ったら、モーションを `false` + CoreMotion 除外に切り替えるか検討する（SS-157 追補）

### 変更・撤回された決定

- 本文の決定3にある `showsBackgroundLocationIndicator: true`「iOS で記録中であることを status bar に示す」は、使用中のみ権限では OS が常に表示するため、効くのはユーザーが設定アプリで「常に」を選んだ場合だけ（SS-157 追補）

## 日付

2026-10-02（初版）、2026-10-03 追補（SS-157）

## ステータス

採用（SS-156）。[ADR-M-006](./ADR-M-006-location-service-real-mock.md)（位置情報サービスは real/mock）と [ADR-M-008](./ADR-M-008-active-walk-state-and-route-cache.md)（進行中の散歩は永続化しない）に追補を入れている。SS-157 で利用目的文言・FGS 通知文言を追補。

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
2. 権限は「使用中のみ」のまま。`requestBackgroundPermissionsAsync` は呼ばない。`ACCESS_BACKGROUND_LOCATION` は宣言しない。iOS は `UIBackgroundModes: location`、Android はフォアグラウンドサービス（type location）で継続する（`app.json` の `expo-location` プラグイン。契約テスト `locationPluginConfig.test.ts` で固定。SS-157 で文言も追加）。
3. タスクのオプションと理由（`location.real.ts` の `BACKGROUND_TRACKING_OPTIONS`）:
   - `distanceInterval: 10` / `timeInterval: 3000`: 従来の `watchPosition` と同じ密度（点数の性質を変えないため、backend の契約・上限に影響しない）。
   - `accuracy: Highest`: 従来の `High` より高い。iOS は `kCLLocationAccuracyBest`（`High` は 10m 精度）、Android は `High` と同じ `PRIORITY_HIGH_ACCURACY`。徒歩の軌跡の滑らかさを優先した。電池が問題になったら `High` に下げる。
   - `activityType: Fitness`: iOS の省電力・停止判定を歩行向けにする。
   - `pausesUpdatesAutomatically: false`: ネイティブ既定が true で、止まると軌跡が欠けるため明示する。
   - `showsBackgroundLocationIndicator: true`: iOS で記録中であることを status bar に示す（SS-157 追補: 使用中のみ権限では、このプロパティに関係なく OS が背景での利用中にインジケータを出す。true が効くのはユーザーが設定アプリで「常に」を選んだときだけ）。
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

10. （SS-157 追補）利用目的文言の置き場と内容
    - `app.json` の expo-location プラグインのオプションだけで設定する。`ios.infoPlist` に直書きしない（`applyPermissions` は「オプション → 直書き → 既定値」の順なので二重管理になる）。
    - 内容: 3用途（散歩先の探索・ピンの場所選び・散歩ルートの記録）と、記録中は画面のロック中や他のアプリの使用中も取得し、散歩を終了すると止まること。
    - `$(PRODUCT_NAME)`・アプリ名・半角の `"` `\` を使わない。「アプリを閉じても」とは書かない（実際は止まる）。用途を増やしたら文言も直す。
11. （SS-157 追補）「常に」系のキー（`NSLocationAlwaysAndWhenInUseUsageDescription` / `NSLocationAlwaysUsageDescription`）は消さず、使用中と同じ文言にする
    - 未指定だとプラグインの既定値（`Allow $(PRODUCT_NAME) to access your location`）が入る。`false` で消せるが、背景で `startUpdatingLocation` を使うアプリでこのキーの欠落による ITMS-90683 の報告がある（Apple Developer Forums 721395）。発覚が提出時になるため、消さない。
    - 「常に」を求めないことは決定2（`requestBackgroundPermissionsAsync` を呼ばない）で担保する。キーがあると、呼べば「常に」のダイアログが出る状態にはなる。また、ユーザーは設定アプリで自分で「常に」を選べるようになる（アプリの挙動は変わらない。記録は散歩中だけ）。
12. （SS-157 追補）`NSMotionUsageDescription` は消さず、「使用しない」旨の文言にする
    - expo-location 57 は CoreMotion（`CMMotionActivityManager`）を常にリンクする。`motionUsagePermission: false` でキーを消すと ITMS-90683 で拒否される（expo/expo#49319）。修正（expo/expo#49409。Podfile のフラグで CoreMotion を除外）は 57.0.20 に入っていない。入った版に上げたら `false` への切り替えを検討する。
13. （SS-157 追補）利用目的文言は日本語のみ（`locales` は使わない）
    - 理由: UI が日本語のみ・MVP は国内向け・写真の文言も日本語のみ。英語化はアプリ全体の i18n と同時に行う。
    - 英語化するときの形: 基底（プラグインのオプション）を英語、`locales.ja` に日本語、`ios.infoPlist.CFBundleAllowMixedLocalizations: true`。逆（基底を日本語・`locales.en` で英語）は、development region が `en` のため日本語の端末に英語が出るので不可。`InfoPlist.strings` は Expo がエスケープせずに書く。Android にも `values-b+<lang>/strings.xml` が作られる。
14. （SS-157 追補）Android の FGS 通知の文言を確定。通知チャンネルの名前・説明は変えない
    - 通知: title「散歩を記録しています」、body「散歩のルートを記録するため、位置情報を取得しています。散歩を終了すると止まります。」（`BACKGROUND_TRACKING_NOTIFICATION`）。
    - チャンネルは expo-location の `LocationTaskService` が作る（名前 = アプリ名、説明 = 英語固定 "Background location notification channel"、重要度 LOW）。変えるにはネイティブのパッチか通知ライブラリの追加が要り、説明はシステムの設定画面の奥でしか見えないので、見合わない。

## 検討した選択肢

- **`watchPositionAsync` + background mode だけ（タスクを使わない）**: Android は Activity が裏に回ると expo-location が watch を止める（`stopWatching()`）ので成立しない。
- **「常に」権限を取る**: 課題で不要と判断済み。Play の背景位置の申告も要る。使用中のみ + FGS で足りる（expo-location の実装で確認済み）。
- **前面は watchPosition、背面はタスク、の二重経路**: 同じ点が2経路で届き、順序の入れ替わりで軌跡がジグザグになる。統合が複雑になるので、経路を1本にした。
- **バッファの保存先**:
  - AsyncStorage: 未導入で、ネイティブ依存の追加になる。
  - SQLite: 依存の追加が大きすぎる。
  - `expo-file-system`: 導入済み・同期 API・SS-86 と同じ使い方なので採用。
- **全サンプルを zustand に積む**: ストアは非永続なので、再マウントやプロセスの作り直しに強くならない。
- （SS-157 追補）「常に」系のキーを `false` で消す: 構造的に「常に」を要求できなくなる利点はあるが、ITMS-90683 の報告があり発覚が提出時。不採用。
- （SS-157 追補）モーションのキーを `false` で消す: expo/expo#49319 で拒否の実例。不採用。
- （SS-157 追補）利用目的文言を日本語・英語の2言語にする（`locales`）: 決定13の理由で見送り。
- （SS-157 追補）通知チャンネルを別ライブラリで先に作って名前・説明を日本語にする: 依存追加に見合わない。不採用。

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
- ~~SS-157: 通知文言（`BACKGROUND_TRACKING_NOTIFICATION`）、Info.plist の文言、Android の通知チャンネル。~~ → SS-157 で決着（決定10〜14）
- development build / 配布ビルドの作り直し（Info.plist の文言はネイティブ設定のため OTA では届かない）（SS-157 追補）。
- SS-161: App Review / Play の FGS 申告。
- 散歩の終了忘れへの自動停止（未起票。必要なら起票）。

## 関連情報

- [ADR-M-006: 位置情報サービスは real/mock の2モード](./ADR-M-006-location-service-real-mock.md)（SS-156 追補）
- [ADR-M-008: 進行中の散歩の状態管理](./ADR-M-008-active-walk-state-and-route-cache.md)（決定5・決定6 の SS-156 追補）
- [ADR-M-003: development build 前提の開発ループ](./ADR-M-003-development-build-and-dev-loop.md)
- [ADR-M-015: アプリアイコン](./ADR-M-015-app-icon-assets.md)（通知アイコンに使う単色レイヤー）
- 元チケット: SS-156（追補: SS-157）/ 関連: SS-17・SS-36・SS-161
- [expo/expo#49319](https://github.com/expo/expo/issues/49319): `motionUsagePermission: false` で ITMS-90683 になる報告
- [expo/expo#49409](https://github.com/expo/expo/pull/49409): CoreMotion を Podfile フラグで除外する修正
- [Apple: showsBackgroundLocationIndicator](https://developer.apple.com/documentation/corelocation/cllocationmanager/showsbackgroundlocationindicator)
