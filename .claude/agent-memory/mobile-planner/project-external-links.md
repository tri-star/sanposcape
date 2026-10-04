---
name: project-external-links
description: アプリから外部 Web ページ（プライバシーポリシー・利用規約・サポート等）を開くときの前提 — 既存の useOpenExternalUrl / legalLinks.ts を再利用・URL はビルドで切り替えない・LP の URL 形式・E2E で押さない（設計本体は ADR-M-020）
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-M-020-external-web-pages.md
  source_issue: SS-158
---

SS-158（2026-10-03）でプライバシーポリシーへの導線を作ったときに確認した事実と判断。設計の正本は ADR-M-020。

- **外部ページを足すときは `src/hooks/useOpenExternalUrl.ts` と `src/config/legalLinks.ts` を再利用する**。画面から
  `expo-web-browser` / `Linking.openURL` を直接呼ばない（`Linking.openSettings()` だけ例外）。
- **`expo-web-browser` は SS-158 以前から dependencies にあり、autolinking で既存ビルドに入っていた**。使い始めても
  dev build の作り直し・fingerprint 変化・E2E APK キャッシュのミスは起きなかった。→ 「package.json に既にあるが未使用の
  Expo モジュール」を使う案は、新規ネイティブ依存より格段に安い。採否の前に `rg` で未使用依存を探す価値がある。
- **法的文書の URL は全ビルド本番固定の定数**。根拠は build-profiles.md「ビルドの種類での分岐は開発ツールの表示可否だけ」と、
  `eas update` で `eas.json` の env が抜けること（[[project-build-variant-runtime]]）。
  代償として本番 LP に出るまで全ビルドでリンク切れ（404 か接続不可。どちらもアプリ内ブラウザ上のエラーでアプリの失敗案内は出ない）
  → リリース順序（LP 本番デプロイが先）をプランと handover に必ず書く。
- **LP の URL 形式**: `trailingSlash: "always"`（`/privacy/`）、`www.` は 301、dev は `dev.sanposcape.com`（main push で自動・noindex）、
  本番は手動起動＋承認。アプリに焼く URL は末尾スラッシュ付き・www なし。LP 側で一度公開した URL は恒久（docs/adr/ADR-012 の SS-158 追補）。
- フィーチャーフラグで包まない: ストア審査の必須導線は `/app-config` 失敗時の全 OFF で消えてはいけない（[[project-feature-flags]]）。
- E2E は外部ブラウザを開く操作を押さず、導線の存在だけ assert（[[project-e2e-ci-constraints]]）。
- プライバシーポリシー本文（`packages/lp/src/pages/privacy.astro`）は mobile のデータの扱いに依存する。位置情報・写真・送信先を変える
  プランでは、本文の見直しと改定日の更新をプランに含める（`packages/lp/AGENTS.md`）。

**Why:** ストア申請系のチケットは mobile・LP・ストア設定にまたがり、URL や依存の扱いを誤るとリンク切れや不要なネイティブ再ビルドになる。

**How to apply:** 外部ページ（利用規約・サポート等）を足すプランでは、上の hook と定数を再利用し、URL の追加は `legalLinks.ts` に定数を足す形にする。

Related: [[planning-constraints]], [[project-build-variant-runtime]]
