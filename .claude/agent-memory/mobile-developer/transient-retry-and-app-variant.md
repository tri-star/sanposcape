---
name: transient-retry-and-app-variant
description: SS-79で追加したtransientRetry.ts(GET/HEAD限定の一時障害再送)とapp.config.tsのAPP_VARIANT分岐(本番/開発の識別子切替)のパターン
metadata:
  type: reference
  scope: durable
---

## 一時障害の再送（`src/api/transientRetry.ts`）

CloudFront/Lambdaの一時障害（429/502/503/504/通信断）に対する指数バックオフ再送は、
**GET/HEADのみ**を対象にする。POSTを対象に広げてはいけない理由が3つある
（[[mobile-two-http-exits]]と対になる非対称性）:

1. `POST /explore/*` の429はbackend自身のレート制限（Lambdaスロットルと区別不可）。
2. `POST /walks` は `useWalkSave` が既に指数バックオフ再送を持つ（重複すると試行回数が掛け算で増える）。
3. `POST /auth/refresh` の再送はリフレッシュトークンのローテーション+再利用検知により
   セッション全体を強制失効させる。`src/services/auth/authApi.ts` は`customFetch`を通らない
   独立した出口なので、この再送は自動的に適用されない（意図的に片方だけ、という非対称性）。

`AbortError`（DOMException）は`TypeError`ではないため`error instanceof TypeError`判定で
自然に再送対象から除外される。500は「アプリ層の決定的なエラー」として明示的に対象外。

401→refresh→1回リトライ（`retryPolicy.ts`）とは独立した軸で、`client.ts`では両方を
それぞれ`sendWithTransientRetry`でラップして両方が効くようにしている。

## `app.config.ts` の `APP_VARIANT` 分岐パターン（本番/開発の識別子分割）

`app.json`には**開発用の実値**を静的に置き、`app.config.ts`が`APP_VARIANT=production`のときだけ
`PRODUCTION_VARIANT`定数で上書きする、という向きにした（逆向きにしない）。

理由: `scripts/mobile-tools/lib/common.sh`がapp.jsonをgrepしてAPP_ID/APP_SCHEMEを決めるため、
app.jsonを本番値にしてdevを動的上書きする向きだと、分岐を書き忘れたローカルツールが
本番識別子を掴んで誤診断する。開発用を静的値にしておけば、書き忘れても開発用に落ちるだけで済む。

未知の`APP_VARIANT`値（typo等）は`throw`で`expo config`評価時点で止める。本番ビルドが
黙って開発識別子になり、EASのビルド枠を消費してから発覚する事故を防ぐため。

`ConfigContext.config`の型は`Partial<ExpoConfig>`（`ExpoConfig`ではない）ので、
`app.config.ts`内のヘルパー関数のシグネチャは`Partial<ExpoConfig>`で受けて返すこと。
`ExpoConfig`で受けると`config.name`等が`string | undefined`のためtscで型エラーになる。

検証は`expo config --type public --json`（識別子/scheme/name確認）と
`expo config --type prebuild --json`（Mapsキー注入確認、`GOOGLE_MAPS_ANDROID_SDK_KEY=DUMMY`で）
の2種類を使い分ける。`HOME`環境変数を明示的に再設定しなくても、このsandbox環境では
`expo config`は素の`pnpm exec`実行で問題なく動く（`~/.expo`書込不可の問題が起きない場合もある）。

## サンドボックスでの `HOME=` 再設定はガードに引っかかる

worktree分離環境では、`HOME=...`をどんな形（`env HOME=`、変数代入前置、`export`）で設定しても
「git設定のリダイレクト先を検証できない」としてBashツールに拒否される
（`dangerouslyDisableSandbox: true`でも解除されない、別種のガード）。
まず`HOME`を変えずに素で実行し、失敗した場合のみ回避策を検討すること。
