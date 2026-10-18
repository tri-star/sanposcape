# ADR-M-020: 外部の Web ページはアプリ内ブラウザで開き、法的文書の URL はビルドで切り替えない

## 現在有効な決定（要約）

> 最終更新: 2026-10-15（SS-187）。本節は本文（追補を含む）を要約したもので、一次記録は本文。
> 本文と食い違う場合は本節の誤りとして本節を直す。

### 決定

- **アプリから開く外部の Web ページ（プライバシーポリシー・利用規約）は expo-web-browser の `openBrowserAsync`（アプリ内ブラウザ）で開く**。
  失敗時だけ `Linking.openURL` にフォールバックし、両方失敗したら画面内に URL 付きの案内を出す。`locked` のときは何もしない。（本文: 決定1、SS-187 追補）
- **判定は `src/lib/externalUrl.ts`（純粋関数）、配線は `src/hooks/useOpenExternalUrl.ts` に置き、`src/services/` の real/mock 層は作らない**。
  画面から `expo-web-browser` / `Linking.openURL` を直接呼ばない（`Linking.openSettings()` は対象外）。（本文: 決定2、影響）
- **開いてよい URL は `https:` のみ**（`isOpenableExternalUrl`）。（本文: 決定3）
- **法的文書の URL はビルドの種類で切り替えず、`src/config/legalLinks.ts` の定数（`PRIVACY_POLICY_URL` / `TERMS_URL`）に本番 URL を置く**。
  `EXPO_PUBLIC_*` / `extra` は使わない。（本文: 決定4、SS-187 追補）
- **フィーチャーフラグで包まない**。（本文: 決定5）
- **リンクは汎用の `LegalDocumentLink` に集約し、`PrivacyPolicyLink` / `TermsLink` はその薄いラッパー**。（本文: SS-187 追補）
- **サインイン・サインアップ画面には `LegalConsentNotice`（同意の文言 + 利用規約・プライバシーポリシーの2リンク）を出し、チェックボックスは付けない**。
  設定の「このアプリについて」にも両方のリンクを出す。認証画面は高さが足りないときだけスクロールする。（本文: SS-187 追補）
- **E2E は導線の存在だけを assert し、押さない**。testID は `sign-in-` / `sign-up-` / `settings-` + `terms-link` / `privacy-policy-link`。（本文: 決定6、SS-187 追補）
- **LP の `/privacy/`・`/terms/` は恒久 URL として扱い、本番は LP を先にデプロイしてから mobile を配布する**。
  URL を変えるにはアプリの更新が要り、LP より先に配布するとリンク先が 404 になる。（本文: 影響、SS-187 追補。LP 側は [ADR-012](../../../docs/adr/ADR-012-lp-static-site-astro-s3-cloudfront.md)）

## 日付

2026-10-03（初版、SS-158）、2026-10-13 追補（SS-187）

## ステータス

採用（SS-158）。SS-187 で利用規約を同じ方式で追加した（追補）。

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

## SS-187 追補: 利用規約を同じ方式で開く

利用規約（LP の `/terms/`）を、決定1〜6 と同じ方式で追加した。

- 開く対象は プライバシーポリシーと利用規約の2つ。URL は `legalLinks.ts` の定数（`PRIVACY_POLICY_URL` / `TERMS_URL`）で、どちらもビルドの種類で切り替えない（決定4）。
- リンクは汎用の `LegalDocumentLink`（URL と表示名を受ける）に集約し、`PrivacyPolicyLink` / `TermsLink` を薄いラッパーにした（却下: 規約用に `PrivacyPolicyLink` を複製する案。開く手段・失敗時の案内が二重になる）。
- サインイン・サインアップ画面は、リンク単体ではなく `LegalConsentNotice`（「下記の利用規約とプライバシーポリシーに同意のうえ、ご利用ください。」+ 2リンク）を出す。チェックボックスは付けない。設定の「このアプリについて」にも規約リンクを足した。
- 同意の文言を足すと、375×667 級の小さい画面（iOS の Apple ボタンあり）や文字サイズの拡大時に認証画面が画面の高さを超えるため、`AuthScreenLayout` を `ScrollView`（`contentContainerStyle` の `flexGrow: 1`）にし、収まらないときだけスクロールさせる。収まるときの見た目（ヒーローが中央・アクションが下部）は変えない。
- E2E は導線の存在だけを assert し、押さない（決定6）。testID は `sign-in-` / `sign-up-` / `settings-` + `terms-link`。
- 影響: 本番 LP に `/terms/` がデプロイされるまで、規約リンクも 404 になる（`/privacy/` と同じ。LP を先に出す）。

## 関連情報

- 実装: `src/config/legalLinks.ts`、`src/components/legal/LegalDocumentLink.tsx`・`TermsLink.tsx`・`LegalConsentNotice.tsx`（SS-187）、`src/lib/externalUrl.ts`、`src/hooks/useOpenExternalUrl.ts`、`src/components/legal/PrivacyPolicyLink.tsx`
- [ADR-M-004](./ADR-M-004-e2e-build-ci-strategy.md)（E2E で外部依存を避ける方針）

## SS-221 追補: サインアップ画面の削除（2026-10-18）

サインアップ画面を削除した（ADR-M-009 SS-221 追補）。`LegalConsentNotice` を出す認証画面はサインインだけで、testID は `sign-in-` と `settings-` + `terms-link` / `privacy-policy-link` のみになった（`sign-up-` は無い）。
