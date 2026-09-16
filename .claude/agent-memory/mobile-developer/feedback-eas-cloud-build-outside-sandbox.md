---
name: feedback-eas-cloud-build-outside-sandbox
description: エミュレータ確認用の development build は EAS クラウドで作る。sandbox 内ではダミー dotfile のコピーで EACCES になるので sandbox 外で実行する
metadata:
  type: feedback
  scope: durable
---

## エミュレータ確認用の development build は EAS クラウドで sandbox 外から作る

- WSL には Android SDK が無く、ローカルで APK をビルドできない。エミュレータ確認用の
  development build は EAS クラウドビルドで作る:
  `pnpm --filter mobile exec eas build --profile development --platform android --non-interactive --no-wait`
  - ネイティブ依存が変わっていなくても、`app.config.ts` / `eas.json` が前回ビルドから変わっていれば
    古い APK は使えない（作り直す）。
- Claude Code の sandbox 内で実行すると、sandbox がリポジトリ直下に置くダミー dotfile
  （`.bash_profile` 等）のコピーで `EACCES ... copyfile` になり、アップロードに失敗する。
  → **sandbox 外で実行する**。
- `eas whoami` は実 HOME で実行すればログイン済み。HOME を tmp に向けると未ログイン扱いになる
  （[[sandbox-expo-home-workaround]] の HOME 差し替えを EAS には流用しない）。
- 完了確認は `eas build:view <id> --json` の `status` をポーリングする。
- APK は `/mnt/c/temp/` に置き、`adb install -r 'C:\temp\xxx.apk'`（Windows 側 adb から見えるパス）で入れる。
- エミュレータに旧アプリ（`sanposcape`）と Dev 版（`sanposcape (Dev)`）が共存していると、
  deep link でアプリ選択ダイアログが出る。「sanposcape (Dev)」→「Just once」を選ぶ。

**Why:** SS-33 のエミュレータ確認（2026-09-16）で、ローカルビルド不可・sandbox 内アップロード失敗・
HOME 差し替えによる未ログイン扱いを順に踏んだため。

**How to apply:** mobile の変更をエミュレータで確認する前に、端末の dev build が最新の
`app.config.ts`/`eas.json` を反映しているか確認し、必要なら上記コマンドを sandbox 外で実行する。
