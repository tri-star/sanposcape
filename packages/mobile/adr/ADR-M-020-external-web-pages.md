# ADR-M-020: 外部の Web ページはアプリ内ブラウザで開き、法的文書の URL はビルドで切り替えない

## 現在有効な決定（要約）

> 最終更新: 2026-10-24（SS-230: バージョンの行にビルド番号・チャネル・OTA の update ID を併記。前回は SS-228）。本節は本文（追補を含む）を要約したもので、一次記録は本文。
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
- **設定の「このアプリについて」の末尾にアプリのバージョンの行を出す**。表記は `<version> (<ビルド番号>)` に、本番以外のときはチャネル、
  OTA の update で起動しているときは update ID の先頭8文字を続ける（例 `1.0.0 (57)` / `1.0.0 (57) · OTA a1b2c3d4` / `1.0.0 (57) · staging`。本番の利用者にも出す）。
  `version` が読めなければ「不明」と出す。ビルド番号は `expo-application` の `nativeBuildVersion`、チャネルと update ID は `expo-updates` から
  `src/config/currentAppVersion.ts` で読み、文言は `formatAppVersion`（純粋関数）で組み立てる。`version` の取得元は ADR-008 D32 のまま。（本文: SS-228 追補、SS-230 追補）
- **E2E は導線の存在だけを assert し、押さない**。testID は `sign-in-` / `sign-up-` / `settings-` + `terms-link` / `privacy-policy-link`。（本文: 決定6、SS-187 追補）
- **LP の `/privacy/`・`/terms/` は恒久 URL として扱い、本番は LP を先にデプロイしてから mobile を配布する**。
  URL を変えるにはアプリの更新が要り、LP より先に配布するとリンク先が 404 になる。（本文: 影響、SS-187 追補。LP 側は [ADR-012](../../../docs/adr/ADR-012-lp-static-site-astro-s3-cloudfront.md)）

## 日付

2026-10-03（初版、SS-158）、2026-10-13 追補（SS-187）、2026-10-18 追補（SS-221）、2026-10-23 追補（SS-228）、2026-10-24 追補（SS-230）

## ステータス

採用（SS-158）。SS-187 で利用規約を同じ方式で追加した（追補）。SS-228 で「このアプリについて」にアプリのバージョンの行を足した（追補）。SS-230 でその行にビルド番号・チャネル・OTA の update ID を併記した（追補。SS-228 の却下を覆す）。

## コンテキスト

App Store Review Guideline 5.1.1(i) は、プライバシーポリシーへのリンクを App Store Connect のメタデータに加えて**アプリ内の分かりやすい場所にも**置くことを求める。GPS（精密な位置・軌跡）を扱うため 5.1.1 / 5.1.5 の審査で確認されやすい。

本文は LP（`packages/lp`）の `/privacy/` に置く（本番 `https://sanposcape.com/privacy/`、dev `https://dev.sanposcape.com/privacy/`）。mobile はリンクを張るだけで、本文や文言（取得する情報・目的・保存期間など）は持たない。

事実:

- `expo-web-browser` は `package.json` の dependencies に既にあり、autolinking で既存のネイティブビルドに含まれる。config plugin は不要（Android の `experimentalLauncherActivity` を有効にするときだけ manifest を変える）。
- ビルドの種類（development / preview / staging / production）での分岐は開発ツールの表示可否だけに使う（`docs/build-profiles.md`）。
  （**SS-230 追補**: 例外として、「このアプリについて」のバージョンの行は本番以外のときだけチャネル名を付記する。下の SS-230 追補）
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

## SS-228 追補: 「このアプリについて」にアプリのバージョンを出す（2026-10-23）

不具合の報告や問い合わせのときに、利用者がどのバージョンを使っているかを確かめられるよう、設定の「このアプリについて」カードの末尾に「バージョン」の行を足した。
外部の Web ページを開く導線ではないが、このカードの構成を持つのが本 ADR なのでここに記録する。

- 置き場所: 新しいカードは作らず「このアプリについて」の末尾に置く（利用条件・ポリシーと同じ「アプリについての情報」）。認証状態の分岐の外にあり、ゲストにも出る。押しても何も開かない。
- 表記: app.json の `version` をそのまま出す（`1.0.0`。接頭辞 `v` は付けない）。読めない・空のときも行は残して「不明」と出す（行を消すと「どこを見ればよいか」を案内できない）。
- 値の読み取りは `src/config/currentAppVersion.ts` の `CURRENT_APP_VERSION`（`Constants.expoConfig.version`）。最低サポートバージョンの判定（ADR-008 D32）と同じ値を1か所で読む。
- 却下: **ビルド番号の併記**。`eas.json` の `appVersionSource: remote` でビルド番号は app config に無く、ネイティブの値を読むには `expo-application`（新しいネイティブ依存 = development build の作り直し）が要る。ADR-008 D32 と同じ理由で採らない。
  （**SS-230 追補**: 併記することにした。下の SS-230 追補）
- 却下（スコープ外）: **OTA の update ID・チャネルの併記**。`runtimeVersion.policy: appVersion` なので、同じ `1.0.0` のまま OTA update や再ビルドを出しても表示は変わらず、JS のリビジョンは見分けられない。サポートで必要になったら `Updates.updateId` の併記を別課題で検討する。
  （**SS-230 追補**: ビルド番号と合わせて併記することにした）
- E2E: `theme-setting.yaml` が行（testID `settings-app-version`）の存在だけを assert する。値は版上げで変わるので assert しない。

## SS-230 追補: バージョンの行にビルド番号・チャネル・OTA の update ID を併記する（2026-10-24）

表示用の `version` はリリース時に上げ、リリースの直後に先に上げない（[ADR-006](../../../docs/adr/ADR-006-mobile-app-delivery-eas-hosted.md) の SS-230 追補）。
そのため次のリリースまで、staging のビルドはすべて公開済みの version を名乗る。ビルド同士と OTA の有無を見分けられるよう、SS-228 で却下した併記を入れる。

- 表記: `<version> (<ビルド番号>)` に、本番以外のときは ` · <チャネル>`、OTA の update で起動しているときは ` · OTA <update ID の先頭8文字>` を続ける。
  例: `1.0.0 (57)`（本番のストアのバイナリ）/ `1.0.0 (57) · OTA a1b2c3d4` / `1.0.0 (57) · staging`。**本番の利用者にも出す**（問い合わせで、どのビルド・どの OTA かを確かめられる）。
  - チャネルは本番（`PRODUCTION_UPDATES_CHANNEL`）のときは出さない。利用者には情報にならず、本番と staging を見分けるには本番以外に付けば足りる。
    これはビルドの種類での分岐で、「開発ツールの表示可否以外に使わない」（[ADR-M-007](./ADR-M-007-expo-config-and-maps-key-injection.md) の SS-148 追補 決定6）の例外とする。
    規則が防ぎたいのは本番と staging で機能の挙動が違うことで、ここはビルドの種類を見分けることそのものが表示の目的であり、機能の可否・挙動は変えない。
    常にチャネル名を出せば分岐は要らないが、本番の利用者に `production` と出しても情報にならないので採らなかった。
  - `version` が読めないときも、行は「不明」で残し、付記は続けて出す（`不明 (57)`）。値が空・空白だけの付記は出さない。
  - 文言の組み立ては `src/features/settings/lib/appVersionLabel.ts` の `formatAppVersion`（純粋関数。Vitest）。
- 値の読み取りは `src/config/currentAppVersion.ts` に集める。
  - ビルド番号: **`expo-application` を新しく入れ**、`Application.nativeBuildVersion`（iOS の `CFBundleVersion` / Android の `versionCode`）を読む。
    EAS が採番してビルド時にネイティブへ書く値で、app config には無い（`appVersionSource: remote`）。
    SS-228 で退けた理由（development build の作り直し・`minimumReleaseAge` の待機）は変わらないが、ビルド番号は version が同じビルド同士を見分ける唯一の手がかりで、
    1.0.0 の本番ビルドはすでに fingerprint の不一致で OTA を受け取れず（[release-runbook.md](../../../docs/release-runbook.md) §6.1）、次の本番バイナリはどのみち要るので、今入れても失うものがない。
  - チャネル: `Updates.channel`（ネイティブ設定なので OTA では変わらない）。development build では null。
  - OTA の update ID: `Updates.updateId`。ストアのバイナリに入っている JS で起動したときも値を持つので、`Updates.isEmbeddedLaunch` のときは出さない。
  - `version` は `expo-application` の `nativeApplicationVersion` に替えず、これまでどおり `Constants.expoConfig.version` で読む。
    最低サポートバージョンの判定（ADR-008 D32）と表示で同じ値を1か所で読むため。D32 が `expo-application` を使わない理由に挙げた依存の追加は済んだが、取得元を替える理由にはならない。
- 却下: **ビルド時のコミットハッシュを app config の `extra` に入れて出す**。ネイティブ依存は増えないが、app config がコミットごとに変わると
  ネイティブの fingerprint も毎回変わり、OTA の本番配信（fingerprint の比較）が常に止まる。
- 却下: **`AboutSection` に3つの値を別々の props で渡す**。表示の規則は `formatAppVersion` に閉じ、`AboutSection` は `AppVersionInfo` を1つ受け取って表示だけを担う。
- 長くなった値は、狭い画面でラベルを押し出さずに右寄せで折り返す（`flexShrink: 1`）。
- E2E: 変えない（行の存在だけを assert していて、値は assert しない）。
