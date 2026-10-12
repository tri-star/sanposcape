---
name: sign-in-with-apple
description: expo-apple-authentication（SDK 57）を計画するときの事実 — プラグインの中身・Android で公式ボタンが勝手に null・エラーコード・422 は code を消費しない・expo install が app.json を書かない
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md
  verify_by: 2027-04-30
---

SS-199 の計画で、unpkg の expo-apple-authentication@57.0.2 のソースと、backend の `auth/schemas.py` を読んで確かめた（2026-10-12）。
決定とその理由は ADR-002 の「SS-199 追補」に書く。ここには、ソースを読まないと分からない事実だけを残す。

- **版**: SDK 57 は `~57.0.2`（lockfile の `expo@57.0.26` の `bundledNativeModules.json`）。main checkout の node_modules の expo は
  古い（57.0.19）ので、版は unpkg の `expo@<lockfile の版>/bundledNativeModules.json` で見る。
- **`expo install` は app.json の plugins を書き換えない**（`app.config.ts` があるため）。plugins への追加は手で行う。
- **プラグインの中身**: entitlement `com.apple.developer.applesignin=["Default"]` を**無条件で**入れる（`ios.usesAppleSignIn` は見ない）。
  加えて `CFBundleAllowMixedLocalizations=true` を入れる。パッケージを入れただけでも、prebuild-config の legacy plugin が自動で適用する。
  iOS ビルドには App ID の capability が要る（SS-196）。
- **公式ボタンは Android / web で自分で null を返す**（`ExpoAppleAuthenticationButton` が iOS 以外では undefined）。
  そのため、testID を公式ボタンに付けると、Android の `assertNotVisible` は自前の Platform 判定が壊れていても通ってしまう。
  testID は、iOS 以外で null を返す自前のラッパの View に付ける。高さと幅は `style` で指定しないと描画されない。
  `disabled` の prop は無い。
- **エラーは `CodedError`。`error.code` は文字列**: キャンセルは `ERR_REQUEST_CANCELED`。ネイティブが無いときは `ERR_UNAVAILABLE`。
  `ERR_REQUEST_UNKNOWN`（1000）は、Apple ID 未サインインの端末でのキャンセルでも、capability の欠落でも出る。
  `signInAsync` は token / code / user のどれかが欠けると、自分で `ERR_REQUEST_FAILED` を投げる。
- `signOutAsync` はサインインのシートを出す。Expo の JSDoc も「使わず、アプリのデータを消せ」と書いている。
- **`POST /auth/session` の 422 は FastAPI のリクエスト検証（ハンドラの前）で返る** → authorization code は消費されない。nonce の検証は
  状態を持たない。このため、氏名を外して同じ token / code で再送できる。氏名の 255 文字は、Python の `len`（コードポイント）で数える。
- `expo-crypto` に `getRandomBytes` がある（暗号論的乱数）。vitest のモック（`src/test/mocks/expo-crypto.ts`）には SS-199 まで無かった。

**Why:** どれも型やドキュメントからは読み取れない。間違えると、テストは通るのに、iOS の実機で初めて壊れる
（Android の CI では検出できない）。

**How to apply:** Apple やネイティブの UI ボタンを使うプランでは、上の点をソースで確かめてから書く。iOS の実機確認はこの環境ではできない。
そのため、PR にはチェックリストを付け、課題はユーザーの確認待ちにする（[[auth-and-session]]、[[testing-and-e2e]]）。
