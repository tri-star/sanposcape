---
name: project-build-variant-runtime
description: 実行時にビルドの種類（production か否か）を判別するときの落とし穴 — OTA で expoConfig が変わる・eas update は eas.json の env を読まない・__DEV__ ガードはバンドルから除外しない
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-007-expo-config-and-maps-key-injection.md
---

ビルド variant で分岐するプランを書く前に押さえる事実（SS-148 の計画で Expo 公式ドキュメントとコードから確認・2026-10-01）。

- **`Constants.expoConfig`（`extra` を含む）は、OTA の update で起動すると update の manifest 由来になる**
  （expo-constants の docs: "whether they are embedded or remote"）。ビルド時の値ではない。
- **SDK 55 以降の `eas update` は EAS サーバーの環境変数だけを使い、`eas.json` のビルドプロファイルの `env` を読まない**
  （EAS env vars FAQ）。`APP_VARIANT=production` や `EXPO_PUBLIC_BACKEND_API_URL` は `eas.json` の `build.*.env` にしか無いので、
  production チャネルへの OTA では抜ける。OTA 運用（SS-103）は未実装で、この問題も未解決。
- **`Updates.channel`（expo-updates）はビルド時のネイティブ設定で、OTA では変わらない**。dev build / Expo Go では常に `null`。
  `eas.json` の channel は development / preview / staging（staging-apk・staging-ios は継承）/ production。
- → `extra` だけで「本番か」を判定すると OTA で fail-open する。SS-148 で `extra.appVariant` と `Updates.channel` の
  2シグナルにし、どちらかが production なら閉じ、未知・欠落も閉じる形で実装した（`src/config/appVariant.ts` / `devTools.ts`）。
  `eas.json` との整合は契約テスト（store プロファイルは許可リスト `staging` 以外は production 必須、`extends` 解決後に検査）で守り、
  `devTools.ts` は純粋な層から import できない（`.oxlintrc.json`）。
- **`if (!__DEV__) return <Redirect/>` はコードを本番バンドルから除外しない**。import は残り、`metro.config.js` は既定で
  tree shaking も無効。「`__DEV__` は静的に除去されるので安全」という前提でトレードオフを書かない。
  `src/services/auth/index.ts` の JSDoc も「dev/mock 実装の同梱は許容」の立場。
- `src/services/auth/index.ts` の `!__DEV__`（mock モードの起動時ガード）は「非開発ビルドで禁止」が目的で、staging でも禁止のまま。
  開発ツールの判定と混ぜない。

**Why:** 「本番では開けない」のような保証は E2E（preview のみ）では検証できず、判定の穴が本番でしか顕在化しない。

**How to apply:** variant / チャネル / `__DEV__` で分岐するプランでは、OTA 時の値の出どころを必ず書き、
fail-closed の向きを判定表で示し、`eas.json` との契約テストを入れる。

Related: [[project-feature-flags]], [[planning-constraints]], [[project-e2e-ci-constraints]]
