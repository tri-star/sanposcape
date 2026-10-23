---
name: sandbox-and-tooling
description: mobile の sandbox とツールの落とし穴 — expo CLI の HOME、EAS クラウドビルドは sandbox 外、format:check のスコープ、git 書き込み不可、古い .expo の型、eslint-disable の位置、main の node_modules と lockfile の版差、依存追加直後の配置は CI と違う、eas --json の前置き行、actionlint の入手、Metro とエミュレータは worktree 間で共有
metadata:
  type: feedback
  scope: durable
---

sandbox 固有の制約は、通常のシェルや CI では起きない。**`package.json` のスクリプトを書き換えて回避しない**。エージェントのローカル検証でだけ迂回する。
コマンドの一覧は `packages/mobile/AGENTS.md`「作業の進め方」と `docs/local-env.md`、EAS ビルドと APK の入れ方は `docs/app-startup-guide.md` が正本。

## expo CLI が `~/.expo/` に書けず EROFS になる

`expo install` / `expo customize tsconfig.json` などは native-module のキャッシュを `~/.expo/` に書く。

**How to apply:** まず HOME を変えずに実行する。EROFS が出たときだけ HOME を書き込める一時ディレクトリへ差し替える
（`HOME="$TMPDIR/fakehome" EXPO_NO_TELEMETRY=1 pnpm exec expo customize tsconfig.json`）。HOME の再設定自体がガードで拒否される環境では、迂回を繰り返さず報告する。
typed routes の生成は飛ばさない（`tsc --noEmit` が `.expo/types/router.d.ts` に依存する）。

## EAS クラウドビルドは sandbox の外で実行する

- sandbox 内では、sandbox がリポジトリ直下に置くダミーの dotfile（`.bash_profile` 等）のコピーで `EACCES ... copyfile` になりアップロードに失敗する。
- `eas whoami` は実 HOME でログイン済み。**上の HOME の差し替えを EAS に流用しない**（未ログイン扱いになる）。
- 完了は `eas build:view <id> --json` の `status` をポーリングして待つ。`app.config.ts` / `eas.json` が前回から変わっていれば、ネイティブ依存が同じでも APK を作り直す。
- 旧アプリと Dev 版が共存すると deep link でアプリ選択が出る。「sanposcape (Dev)」→「Just once」を選ぶ。

## format と lint

- **完了判定は `pnpm --filter mobile format:check`**（対象は `src` / `app` / 設定ファイル）。`pnpm exec oxfmt --check .` は対象外の docs・adr・`package.json` で数十件を報告する。
  変更ファイルだけに当てる個別実行は途中確認に使えるが、渡すパス集合で折り返し判定が変わることがある（SS-19）ので、最後はフルコマンドで確かめる。
- sandbox が漏らした stray ファイル（`.mcp.json` / `.claude/settings*.json` 等）があると "Failed to read file" で止まることがある。触らずに、通らない旨を報告する。
  ステージは変更したパスを明示する（`git add -A` しない）。
- `pnpm format` / `pnpm lint` は直前に編集したファイルを整形し直す。内容の変更ではないので、意図した変更が保たれているかだけ見る。
- **oxlint の `eslint-disable-next-line react-hooks/exhaustive-deps` は、警告が指す使用箇所ではなく `}, [deps])` の閉じ括弧の行の直前に置く**（SS-88。`WalkRouteMapView.tsx` も同じ配置）。

## 古い `.expo` の型

`.expo/` は作業ディレクトリに残り、ブランチを切り替えても消えない。別ブランチで生成された `router.d.ts` が残ると、`useLocalSearchParams` などの型が実際のルートとずれる。
ルートの追加・削除・ブランチ切り替えの後は `expo customize tsconfig.json` で作り直す。

## node_modules の版

- worktree には node_modules が無いことが多い。main のチェックアウト（`git worktree list` の先頭のパス配下の `node_modules`）で `.d.ts` やネイティブ実装を読める。
- **main の node_modules は lockfile より古いことがある**（2026-10: lucide-react-native は lockfile 1.50.0 / 手元 1.39.0、expo-location は 57.0.20 / 57.0.15）。
  `pnpm-lock.yaml` の版を先に確かめ、差があれば unpkg の CHANGELOG や該当ファイルで確認する。

## 依存を足した直後の node_modules は CI と配置が違う

`pnpm add` の直後の配置と、lockfile からの `pnpm install --frozen-lockfile` の配置は一致しない（SS-103: eas-cli の追加後、frozen の install で 138 パッケージが外れた）。
hoisted linker では配置が `@expo/fingerprint` のハッシュに入るので、追加前後の fingerprint やバンドルを比べるときは、比べる前に `pnpm install --frozen-lockfile` をかけて CI と同じ配置にする。

## eas CLI の `--json` と、ワークフローの検証の道具

- `eas` の `--json` の標準出力には、JSON の前に案内の行（「Environment variables ... loaded」など）が混ざることがある。`sed -n '/^{/,$p'`（配列なら `^\[`）で JSON の始まりから読む。
  `fingerprint:compare --json` はハッシュが違っても終了コード 0。
- 手元で `eas` を使う確認は、ログイン済みの実 HOME を使うため sandbox の外で行う（読み取りの操作に限る。`channel:view`・`env:list`・`build:list`・`fingerprint:*`）。
- actionlint と shellcheck はリポジトリにも手元にも無く、Docker での実行は許可されないことがある。公式のリリースを `$TMPDIR` に落とし、チェックサムを確かめてから使う
  （actionlint は `actionlint_<版>_checksums.txt` で照合。shellcheck は `PATH` に足すと actionlint が `run:` の中も検査する）。

## git の書き込みが read-only で失敗する

worktree 構成などで `git add` / `commit` が `index.lock: Read-only file system` で失敗することがある（SS-60）。
`GIT_DIR` の差し替えなどの迂回を繰り返さず、編集・lint・format・test・typecheck まで済ませてから、コミットできなかったことを報告する。

Related: [[ts-rn-pitfalls]], [[native-config]]

## エミュレータと Metro は worktree の間で共有されている

エミュレータ（Windows 側に1台）と Metro の 8081 は、並行している別の worktree のセッションと共有になる。
`dev-up.sh` は 8081 に Metro が居れば「既に起動済み」として**そのまま使う**ので、別の worktree の Metro なら、
その worktree のコードを見て「確認できた」と誤認する（SS-212 で ss-211 の Metro が動いていた）。

**How to apply:** 動作確認の前に、Metro の起動元を確かめる（sandbox 外で実行）。

```bash
for p in $(pgrep -f "expo start"); do echo "$p $(readlink /proc/$p/cwd)"; done
```

自分の worktree でなければ、止めたり `adb reverse` を差し替えたりすると相手の作業を壊すので、自律実行中は動作確認を省略して報告し、
ユーザーに順番を決めてもらう。
