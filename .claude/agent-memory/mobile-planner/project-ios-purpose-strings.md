---
name: project-ios-purpose-strings
description: iOS の利用目的文言（Info.plist）を config plugin で扱うときの事実 — 既定の英語が黙って入る・false はキー削除で ITMS-90683 を招く・locales の向きの落とし穴（SS-157 で確認）
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-M-018-background-walk-location-tracking.md
  verify_by: 2027-04-30
---

SS-157 の計画で expo-location 57 のプラグイン・ネイティブと `@expo/config-plugins` を読んで確認した（2026-10-03）。

- **expo-location のプラグインは4キー（WhenInUse / AlwaysAndWhenInUse / Always / Motion）を常に入れる**。オプション未指定なら
  `Allow $(PRODUCT_NAME) to ...` の英語の既定文言。`isIosBackgroundLocationEnabled` とは無関係。他の Expo プラグインも同じ `createPermissionsPlugin` 方式。
- `applyPermissions` の優先順位は「オプション → `ios.infoPlist` の直書き → 既定値」。**`false` はキーを削除する**。
- **キーを消すと ITMS-90683 で提出が止まりうる**: ネイティブがその API を静的に参照していると Apple の解析が purpose string を要求する。
  expo-location は `requestAlwaysAuthorization` を文字列から組み立てた selector で呼んで回避しているが、CoreMotion は直接参照（expo/expo#49319。
  修正 #49409 は 57.0.20 に未収録）。「消す」案は発覚が TestFlight アップロード時になるので、プランでは「正確な文言を入れる」を既定にする。
- 使用中のみ権限なら `showsBackgroundLocationIndicator` に関係なく OS が背景利用中に青いインジケータを出す（Apple docs）。
- **`locales` で英語化するなら「基底を英語、`locales.ja` で日本語」**。development region が `en` なので逆にすると日本語端末に英語が出る。
  `InfoPlist.strings` は `"` をエスケープせずに書かれる。Android にも `values-b+<lang>/strings.xml` ができる。2026-10 時点で文言は日本語のみの方針。
- 生成結果は `expo config --type introspect --json` の `_internal.modResults.ios.infoPlist` / `.android.manifest` で確認できる（`ios/` が無くてよい）。
- **main checkout の node_modules は lockfile より古いことがある**（2026-10: 手元 57.0.15、lockfile 57.0.20）。lockfile の版の差分は unpkg の CHANGELOG / plugin/build で確認する。

**Why:** 上の事実はどれも、プラグインとネイティブのソースを読まないと分からない（ドキュメントや型からは読み取れない）。
しかも「キーを消す」案の失敗は、TestFlight へのアップロード時（ITMS-90683）まで発覚せず、ビルドのやり直しになる。

**How to apply:** 権限・Info.plist・ネイティブ設定のプランでは、プラグインの既定値と `false` の意味をソースで確かめ、
「キーを消す」案には提出時の ITMS-90683 リスクを必ず書く。

Related: [[project-background-location]], [[mobile-structure]]
