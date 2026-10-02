---
name: project-background-location
description: Facts about expo-location / expo-task-manager background tracking that are only visible in native source (watch stops on Android background, iOS pausesUpdatesAutomatically default true, tasks persist across launches) (design itself is in ADR-M-018)
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-M-018-background-walk-location-tracking.md
  verify_by: 2027-03-31
---

これらは SS-156 の計画中に expo-location 57.0.15 のネイティブ実装を読んで確認した（2026-10-02）。ドキュメントや型定義と食い違うものがある。

- **Android の `watchPositionAsync` は、Activity が裏に回ると止まる**（`LocationModule.kt` の `OnActivityEntersBackground { stopWatching() }`）。iOS の watch は `allowsBackgroundLocationUpdates = false`。→ background mode を付けても、watch ではバックグラウンドで記録できない。タスク（`startLocationUpdatesAsync`）が必須。
- **「使用中のみ」で足りる**: iOS の `startLocationUpdatesAsync` が確認するのはフォアグラウンド権限と `UIBackgroundModes: location` だけ。Android は `foregroundService` オプションがあれば `ACCESS_BACKGROUND_LOCATION` を要求しない。ただし**前面でしか開始できない**（`ForegroundServiceStartNotAllowedException`）。
- **iOS の `pausesUpdatesAutomatically` のネイティブ既定は true**（`EXLocationTaskConsumer.m`。型定義の「既定 false」は誤り）→ 必ず明示する。
- プラグインの `isAndroidForegroundServiceEnabled` の既定は `isAndroidBackgroundLocationEnabled` の値（既定 false）→ FGS だけ欲しいなら明示する。
- FGS の通知アイコンを指定しないと、ランチャーアイコンが白い四角で出る（`androidForegroundServiceIcon`）。通知チャンネルの説明は英語固定。
- **登録済みのタスクはアプリの再起動後も OS が復元する**（expo-task-manager）。進行中の散歩が非永続である限り、起動時に止める処理が必須。
- `expo-task-manager` は SS-156 で導入した（`~57.0.21`）。JS は import 時に `requireNativeModule` するので、ネイティブモジュールが無い旧バイナリに JS を OTA で配ると起動時にクラッシュする。

**SS-156 で決めた設計**（記録経路をタスク1本にする・アンマウントでは止めない・止めるのは散歩の終了/サインアウト/起動時・時刻カーソルでの冪等な統合・バッファは `Paths.cache`）は ADR-M-018 が正本。

**How to apply:** 位置・背景実行まわりのプランでは、ドキュメントより先に `node_modules/expo-location/{ios,android}` を grep する。worktree に node_modules が無いときは `/home/tristar/projects/sanposcape/node_modules` を見る。

Related: [[project-rn-runtime-capabilities]], [[project-walk-domain-contract]], [[mobile-structure]]
