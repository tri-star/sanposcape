---
name: sandbox-and-tooling-pitfalls
description: sandbox内で失敗するmobile系コマンド(expo CLIのHOME書き込み・EASクラウドビルド・format:checkのstrayファイル・git書き込み)と、oxfmtのスコープ/自動整形の落とし穴。package.jsonを書き換えて回避しないこと
metadata:
  type: feedback
  scope: durable
---

sandbox 内で失敗する mobile 系コマンドと、format/lint ツールの落とし穴。**sandbox 固有の制約は
通常のシェルや CI（GitHub Actions）では起きない。`package.json` のスクリプトを書き換えて
回避しないこと** — エージェント側のローカル検証でだけ迂回する。

## `expo` CLI が `~/.expo/` へ書けず EROFS になる

`pnpm exec expo install <pkg>` / `pnpm exec expo customize tsconfig.json` が
`EROFS: read-only file system, open '/home/<user>/.expo/native-modules-cache/...'` で失敗することがある
（Expo CLI は native-module のメタデータ等を無条件で `~/.expo/` にキャッシュする）。

**How to apply:**
1. まず `HOME` を変えずに素で実行する（`expo config` などは素の `pnpm exec` で通るセッションも多い）。
2. EROFS が出たときだけ `HOME` を `$TMPDIR` 配下へ差し替える:
   ```bash
   mkdir -p "$TMPDIR/fakehome"
   HOME="$TMPDIR/fakehome" EXPO_NO_TELEMETRY=1 pnpm exec expo customize tsconfig.json
   ```
3. worktree 分離環境などでは `HOME=...` の再設定自体（`env HOME=`・変数代入前置・`export`）が
   Bash ツールのガードに拒否されることがある（`dangerouslyDisableSandbox` でも解除されない別種のガード）。
   その場合は迂回を繰り返さず、実行できなかった旨を報告する。

**typed-routes の生成自体はスキップしないこと** — `tsc --noEmit` が `.expo/types/router.d.ts`
の実在に依存している（[[expo-router-app-structure]]）。

## エミュレータ確認用の development build は EAS クラウドで sandbox 外から作る

- WSL には Android SDK が無くローカルで APK をビルドできないため、EAS クラウドビルドで作る:
  `pnpm --filter mobile exec eas build --profile development --platform android --non-interactive --no-wait`
  - ネイティブ依存が変わっていなくても、`app.config.ts` / `eas.json` が前回ビルドから変わっていれば
    古い APK は使えない（作り直す）。
- sandbox 内で実行すると、sandbox がリポジトリ直下に置くダミー dotfile（`.bash_profile` 等）の
  コピーで `EACCES ... copyfile` になりアップロードに失敗する → **sandbox 外で実行する**。
- `eas whoami` は実 HOME で実行すればログイン済み。**上記の HOME 差し替えを EAS には流用しない**
  （tmp の HOME では未ログイン扱いになる）。
- 完了確認は `eas build:view <id> --json` の `status` をポーリングする。
- APK は `/mnt/c/temp/` に置き、`adb install -r 'C:\temp\xxx.apk'`（Windows 側 adb から見えるパス）で入れる。
- 旧アプリ（`sanposcape`）と Dev 版（`sanposcape (Dev)`）が共存すると deep link でアプリ選択
  ダイアログが出る。「sanposcape (Dev)」→「Just once」を選ぶ。

**Why:** SS-33 のエミュレータ確認で、ローカルビルド不可・sandbox 内アップロード失敗・HOME 差し替えに
よる未ログイン扱いを順に踏んだ。

## format:check は package.json のスクリプトで実行する（bare `oxfmt --check .` は信用しない）

`format:check` の実体は `oxfmt --check src app index.ts app.config.ts babel.config.js metro.config.js
orval.config.ts vitest.config.ts` で、`docs/`・`adr/`・`AGENTS.md`・`package.json`・`tsconfig.json`・
`docs/mock/**` は対象外。`pnpm exec oxfmt --check .`（や `--check <dir>`）は素のツリーでもこれらで
数十件の既存差分を報告する誤検知になる。無関係なタスクで docs の `.md` を1つ触ったからといって、
そのファイル全体を整形し直す責任は無い。

**How to apply:**
- 完了判定は必ず `pnpm --filter mobile format:check`（package.json 定義のスコープ）で行う。
- `src/` 配下に sandbox が漏らした stray ファイル（`.mcp.json` や `.claude/settings*.json` 等）が
  あると "Failed to read file" で詰まることがある。開発中は変更ファイルだけに
  `pnpm exec oxfmt --check <changed files...>` を当ててよいが、**個別実行の結果だけを信用しない**
  （渡すパス集合によって折り返し判定が変わり、個別では通ったのにフルコマンドで崩れが出ることがある。
  SS-19 で `uuid.test.ts` の正規表現リテラルで発生）。フルコマンドが stray ファイルで通らない場合は
  その旨を明示して報告する。
- stray ファイルは触らない。変更したパスを明示してステージ対象にする（`git add -A` しない）。
- `pnpm format` / `pnpm lint` は直前に Write/Edit したファイルをその場で整形し直す。diff の再確認を
  求められても内容変更ではないので、意図した変更が保たれているかだけ確認すればよい。

## git の書き込みが read-only で失敗する環境がある

worktree 構成などで `git add` / `git commit` / ブランチ操作が
`Unable to create '.../index.lock': Read-only file system` 等で失敗することがある
（sandbox policy の記載と実マウント状態が一致しない。SS-60 で発生）。

**How to apply:** `GIT_DIR` 差し替えのような迂回を繰り返して時間を浪費しない。ファイル編集・
lint/format/test/typecheck まで済ませた上で、**コミットできなかった旨を親エージェント・ユーザーに
明示的に報告する**。
