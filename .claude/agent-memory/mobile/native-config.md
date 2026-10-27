---
name: native-config
description: mobile のネイティブ・Expo 設定でソースを読まないと分からない事実 — 位置記録プラグインの既定と FGS アイコン、Appearance.setColorScheme の値、expo-file-system の同期 API、app.config.ts の型と expo config の使い分け、Nitro の例外は code を持たない
metadata:
  type: feedback
  scope: durable
  verify_by: 2027-03-31
---

背景の位置記録は ADR-M-018、利用目的文言は ADR-M-018 の SS-157 追補、テーマは ADR-M-016、ビルド variant の判定は ADR-M-007 の SS-148 追補、
依存の実態（crypto が無い・UUID は自前）は `toolsets-libraries.md` が正本。ここには正本に無い細部と調べ方を置く。
暗号論的乱数が要るとき（nonce 等）は `expo-crypto` の `getRandomBytes(n)` を使う（SS-199。`src/test/mocks/expo-crypto.ts` へのモックの追加が要る）。

## 調べ方

ネイティブの挙動は型定義やドキュメントと食い違うことがある（例: `pausesUpdatesAutomatically` の既定は型では false、ネイティブでは true）。

**How to apply:** 位置・背景実行・権限・Info.plist の計画では、ドキュメントより先に `node_modules/<pkg>/{ios,android,plugin}` を grep する
（worktree に無ければ main のチェックアウト。版の差は [[sandbox-and-tooling]]）。

## Nitro のモジュールの例外は `code` を持たない（SS-82）

`react-native-nitro-modules` の上のライブラリ（今は `react-native-nitro-google-signin`）は、ネイティブの例外を `message` だけの JS の Error にする。
ライブラリの文書が `e.code === statusCodes.X` と書いていても、実機では `code` が来ない。Android の message は fbjni の `printStackTrace` の全文
（1行目が `<クラス名>: <msg>`）、iOS は `String(describing:)`（`oneTapStartFailed("<msg>")` のような enum の表記）。

**How to apply:** Nitro のライブラリの失敗で分岐するなら、`nitrogen/generated/` の reject の箇所と `JSIConverter+Exception.hpp` を読んで JS に届く形を確かめ、
メッセージから推定する（Google サインインの実例は `services/auth/authError.ts` の `toGoogleSignInError`、決定は ADR-002 SS-82 追補）。

## 位置記録（expo-location 57）

- プラグインの `isAndroidForegroundServiceEnabled` の既定は `isAndroidBackgroundLocationEnabled` の値（既定 false）。FGS だけ欲しいなら明示する。
- FGS の通知アイコンを指定しないと、ランチャーアイコンが白い四角で出る（`androidForegroundServiceIcon`）。通知チャンネルの説明は英語固定。
- 登録済みのロケーションタスクはアプリを再起動しても OS が復元する（expo-task-manager）。進行中の散歩を永続化しない限り、起動時に止める処理が要る（現行は `backgroundLocationCleanup.ts`）。

## テーマ（RN 0.86）

- `Appearance.setColorScheme` が受け付けるのは `'light' | 'dark' | 'unspecified'` だけ（`'auto'` は RN の最新ドキュメントにしか無く、`null` も不可）。iOS 13+ / Android 10+ でのみ効く。
- 上書き中は `useColorScheme()` が上書き後の値を返すので、端末の本当の設定は読めない。
- Expo の MainActivity は `configChanges` に `uiMode` を含むので、上書きしても Activity は作り直されない。
- 保存値 `system` のまま起動した直後に OS の切替へ追従するかは未確認。system モードに触る変更では手動確認に入れる。

## expo-file-system の新 API

`File` は同期 I/O を持つ（`textSync()` / `write()` / `exists` / `create()`）。`write` の前に `create()` が要る。
最初の描画前に読みたい小さな設定の保存先に使える（`services/preferences`。新しいネイティブ依存ではない）。

## app.config.ts と expo config

- `ConfigContext.config` は `Partial<ExpoConfig>`。ヘルパーの引数・戻り値を `ExpoConfig` にすると `config.name` 等が `string | undefined` で tsc が落ちる。
- 確認コマンドの使い分け: 識別子・scheme は `expo config --type public --json`、Maps キー注入は `--type prebuild --json`、
  Info.plist・manifest の生成結果は `--type introspect --json` の `_internal.modResults.ios.infoPlist` / `.android.manifest`（`ios/` が無くてよい）。

Related: [[maps]], [[sandbox-and-tooling]]
