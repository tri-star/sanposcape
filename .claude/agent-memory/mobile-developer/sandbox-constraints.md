---
name: sandbox-constraints
description: このsandboxで失敗する mobile 系コマンド（expo CLIのHOME書き込み・tsx CLIのIPC・oxfmtのstrayファイル・git worktreeのread-only）と回避策。package.jsonを書き換えて回避しないこと
metadata:
  type: feedback
  scope: durable
---

sandbox 内で失敗する mobile 系コマンドと回避策。**いずれも sandbox 固有の制約であり、
通常のシェルや CI（GitHub Actions）では起きない。`package.json` のスクリプトを書き換えて
回避しないこと** — エージェント側のローカル検証でだけ迂回する。

## `expo` CLI が `~/.expo/` へ書けず EROFS になる

`pnpm exec expo install <pkg>` や `pnpm exec expo customize tsconfig.json` が失敗する:

```
Error: EROFS: read-only file system, open '/home/<user>/.expo/native-modules-cache/....bin'
```

**Why:** sandbox の実 `$HOME` は Bash ツールから書き込めないが、Expo CLI は native-module の
メタデータ等を無条件で `~/.expo/` 配下にキャッシュする。

**How to apply:** `HOME` を `$TMPDIR` 配下のスクラッチへ差し替える（テレメトリの余分な通信も止める）:

```bash
mkdir -p "$TMPDIR/fakehome"
HOME="$TMPDIR/fakehome" EXPO_NO_TELEMETRY=1 pnpm exec expo install <pkg>
HOME="$TMPDIR/fakehome" EXPO_NO_TELEMETRY=1 pnpm exec expo customize tsconfig.json
```

SS-10（2026-07-26）の `expo-secure-store` 導入と typed-routes 生成で再現・解消を確認。
HOME 差し替え無しでも通るセッションもあるので、EROFS が出たときだけ適用すればよい。
**typed-routes の生成自体はスキップしないこと** — `tsc --noEmit` が
`.expo/types/router.d.ts` の実在に依存している（[[expo-router-app-structure]]）。
なお **この HOME 差し替えを EAS ビルドに流用してはいけない**（[[feedback-eas-cloud-build-outside-sandbox]]）。

## `tsx` CLI が IPC ソケットの `listen()` を拒否されて EPERM になる

`tsx scripts/generate-tokens.ts` や、それを呼ぶ pnpm スクリプト（`pnpm --filter mobile design:tokens`）が失敗する:

```
Error: listen EPERM: operation not permitted /tmp/claude-.../tsx-.../NN.pipe
    at createIpcServer (.../tsx/dist/cli.mjs:...)
```

**Why:** `tsx` の CLI ラッパは起動時に Unix ドメインソケット（IPC チャネル）を開くが、sandbox の
制約が `$TMPDIR` 配下のそのパスへの `listen()` を拒否する。SS-1 Phase 0（2026-07-20）で
`packages/mobile/scripts/generate-tokens.ts` を検証した際に一貫して再現した。

**How to apply:** CLI バイナリではなく Node のローダー経由で実行する:

```
pnpm --filter <package> exec node --import tsx <path-to-script>.ts
```

IPC サーバを立てないため回避できる（ワンショット実行なら CLI と同じ挙動。watch モードは無い）。
**注意:** スクリプト内の `execFileSync("oxfmt", ...)` のような bare command の子プロセス呼び出しは
`pnpm exec` / pnpm スクリプト経由でないと `PATH` に `node_modules/.bin` が乗らず `ENOENT` になる。

## `format:check` が stray な untracked ファイルで失敗する

`pnpm --filter mobile format:check`（oxfmt）が `src/` 配下に紛れ込んだ `.mcp.json` や
`.claude/settings*.json`（例 `src/components/ui/.mcp.json`）で "Failed to read file" になることがある。

**Why:** sandbox が設定・セッションファイルを、たまたまその時の cwd に漏らすことがある。
`oxfmt --check src app scripts ...` がそのディレクトリを歩いて stray ファイルで詰まる。

**How to apply:** `src`/`docs` ツリー全体ではなく、**変更したファイルだけ**に対して実行する
（`packages/mobile` から `pnpm exec oxfmt --check <changed files...>`）。
**stray ファイルは触らない。`git add -A` せず、変更したパスを明示的にステージすること。**

**ただし個別ファイル実行の結果だけを信用してはいけない。** 渡すパス集合（cwd 相対の複数ルート vs
単一ファイル）によって行幅・改行の判定が微妙に変わり、個別実行では通ったのにフルコマンドで
再度崩れが検出されることがある（SS-19 で `src/lib/uuid.test.ts` の正規表現リテラル1行が、
個別実行では複数行に折り返され、パッケージ全体コマンドでは1行にまとめられた。原因は未特定）。
開発中の速さのために個別実行を使うのは構わないが、**コミット前・タスク完了前には
`pnpm --filter mobile format:check` のフルコマンドを通して green を確認する**こと。
stray ファイルでフルコマンドが通らない場合は、その旨を明示して報告する
（「個別実行では通った」だけで完了にしない）。

## git worktree が read-only bind mount でコミットできない環境がある

`<workspace>/.git` がファイルで実体（`/home/tristar/projects/sanposcape/.git/worktrees/<branch>/`）を
指す worktree 構成のとき、実体側が read-only bind mount になっていることがある
（`mount` で見ると同一パスに rw→ro の多重マウントが積まれ、最後が ro で確定する）。
`git add` / `git commit` が `Unable to create '.../index.lock': Read-only file system` で**必ず失敗する**
（sandbox policy 上は write allowOnly に含まれているのに失敗する。policy 記載と実マウント状態が不一致）。

**再現性:** 複数回リトライしても時間を置いても解消しなかった（2026-08-16、SS-60 作業時）。
`dangerouslyDisableSandbox` は policy でそもそも無効化されているため回避不可。

**How to apply:** 作業（ファイル編集・lint/format/test/typecheck）はすべて実施した上で、
**コミットだけはできない旨をユーザー・親エージェントに明示的に報告する。**
勝手に diff を諦めたり、無理なワークアラウンド（`GIT_DIR` 差し替え等。同じマウントの下なので無効）を
繰り返して時間を浪費しないこと。
