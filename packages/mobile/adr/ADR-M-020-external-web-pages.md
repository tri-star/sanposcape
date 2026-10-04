# ADR-M-020: 外部の Web ページはアプリ内ブラウザで開き、法的文書の URL はビルドで切り替えない

## 日付

2026-10-03

## ステータス

採用（SS-158）。

## コンテキスト

App Store Review Guideline 5.1.1(i) は、プライバシーポリシーへのリンクを App Store Connect のメタデータに加えて**アプリ内の分かりやすい場所にも**置くことを求める。GPS（精密な位置・軌跡）を扱うため 5.1.1 / 5.1.5 の審査で確認されやすい。

本文は LP（`packages/lp`）の `/privacy/` に置く（本番 `https://sanposcape.com/privacy/`、dev `https://dev.sanposcape.com/privacy/`）。mobile はリンクを張るだけで、本文や文言（取得する情報・目的・保存期間など）は持たない。

事実:

- `expo-web-browser` は `package.json` の dependencies に既にあり、autolinking で既存のネイティブビルドに含まれる。config plugin は不要（Android の `experimentalLauncherActivity` を有効にするときだけ manifest を変える）。
- ビルドの種類（development / preview / staging / production）での分岐は開発ツールの表示可否だけに使う（`docs/build-profiles.md`）。
- `eas update` は `eas.json` の `env` を読まないため、`EXPO_PUBLIC_*` / `extra` で持った値は OTA で抜けうる。
- フィーチャーフラグは `/app-config` の取得失敗時に全 OFF になる（ADR-008 決定9）。

## 決定

1. アプリから開く外部の Web ページ（現状はプライバシーポリシーのみ）は **expo-web-browser の `openBrowserAsync`（アプリ内ブラウザ）**で開き、失敗時だけ RN の `Linking.openURL` にフォールバックする。両方失敗したら画面内に URL 付きの案内を出す（選択してコピーできる）。別のブラウザセッションが表示中（`locked`）のときは何もしない。
2. 判定ロジックは `src/lib/externalUrl.ts`（開く手段を引数で注入する純粋関数）、配線は `src/hooks/useOpenExternalUrl.ts`。**`src/services/` の real/mock 層は作らない**（Expo Go・エミュレータ・CI のどこでも動き、E2E では押さないため mock が要らない）。
3. 開いてよい URL は `https:` のみ（`isOpenableExternalUrl`）。
4. **法的文書の URL はビルドの種類で切り替えない。** `src/config/legalLinks.ts` の定数に本番 URL を置く（`EXPO_PUBLIC_*` / `extra` を使わない）。
5. フィーチャーフラグで包まない。
6. E2E は導線の存在だけを assert し、押さない。

## 検討した選択肢

- **外部ブラウザ（`Linking.openURL` のみ）**: アプリから離れてしまい、戻る導線が弱い。読むだけの文書に向かない。フォールバックとしてのみ採用。
- **WebView 埋め込み**: `react-native-webview` は未導入。ネイティブ依存の追加・dev build の作り直し・APK キャッシュのミス・アプリ内でのナビゲーション制御が要り、文書を読むだけには過剰。
- **`EXPO_PUBLIC_PRIVACY_POLICY_URL` でプロファイルごとに切り替え**: 効力のある規約は本番 LP の1つだけ。dev LP は未公開の改訂を含みうる。staging / TestFlight のテスターにも本番の規約を見せるのが正しい。
- **`app.config.ts` の `extra` に置く**: OTA で値が抜けうる（フォールバックが要り、結局定数が要る）。
- **フィーチャーフラグで包む**: フラグは取得失敗時に全 OFF になるため、ストア審査の必須導線が通信状況次第で消える。止めたくなる理由（backend・外部 API への依存）も無い。

## 決定理由

- 審査の必須導線を、通信状況・ビルド種別・OTA のいずれにも左右されない形で常に出すため。
- 失敗時に「押しても何も起きない」を作らないため、フォールバックと画面内の案内まで持つ。
- 判定を純粋関数に寄せ、ネイティブ依存を hook に閉じ込めることで Vitest で検証できる。

## 影響

- 本番 LP に `/privacy/` がデプロイされるまでは、すべてのビルドでリンク先が 404 になるか、`sanposcape.com` に接続できない（どちらもアプリ内ブラウザの中でエラーが出るだけで、アプリ側の「開けませんでした」の案内は出ない）。dev の内容は `https://dev.sanposcape.com/privacy/` をブラウザで直接確認する。
- LP の URL（パス・末尾スラッシュ）を変えるにはアプリの更新が要る（古いバイナリは古い URL を開き続ける）。LP 側は `/privacy/` を恒久 URL として扱う。
- 今後の利用規約・サポートページも同じ方式（`useOpenExternalUrl` + `legalLinks.ts`）で追加する。
- 画面から `expo-web-browser` / `Linking.openURL` を直接呼ばない（OS の設定画面を開く `Linking.openSettings()` は対象外）。

## 関連情報

- 実装: `src/config/legalLinks.ts`、`src/lib/externalUrl.ts`、`src/hooks/useOpenExternalUrl.ts`、`src/components/legal/PrivacyPolicyLink.tsx`
- [ADR-M-004](./ADR-M-004-e2e-build-ci-strategy.md)（E2E で外部依存を避ける方針）
