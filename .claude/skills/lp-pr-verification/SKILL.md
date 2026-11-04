---
name: lp-pr-verification
description: "LP（packages/lp）の見た目の変更を含むPRを作成・更新した後に、PC（1440px）とスマホ（390px）の幅でページを節ごとに撮り、横スクロールの有無とともに gh の --attach でPRへコメントとして添付するスキル。task-workflow のPR作成・review-fix の push の直後に、mobile-pr-verification と並んで自動で呼ばれる。「LP のPRにスクショを貼って」「#123 の LP の画面を撮って添付して」のように直接指示された場合にも使用する。packages/lp/src に見た目の変更が無いPRでは何もせず終了し、Chrome や gh の --attach が使えない環境では省略して理由を報告する。"
argument-hint: "[PR番号] [issue-id(option)]"
allowed-tools: Bash, Read
---

# LP PR の画面キャプチャの添付スキル

レビュアーは LP の実際の見た目を手元でビルドしないと見られないため、LP のデザインを変えたPRには
PC とスマホの幅の画面キャプチャをコメントとして添付する（規則は `packages/lp/AGENTS.md` の「デザインと画像」）。

撮影は `scripts/lp-tools/capture-lp.mjs` が行う（`dist` を 127.0.0.1 で配信し、システムの Chrome を sandbox 付きで headless 起動して CDP で撮る）。
このスキルは「実行するかの判定」「省略の判断」「画像の確認」「PRへの添付」を担当する。

## パラメータ

- `[PR番号]` : 添付先のPR番号。省略時は `gh pr view --json number -q .number` で現在のブランチのPRを使う
- `[issue-id]` : 作業ディレクトリ `<task-root>` = `<project-root>/tmp/<issue-id>` を決めるために使う。
  無い場合は `<project-root>/tmp/pr-<PR番号>`

## 基本方針

- **このスキルの失敗でPR作成や呼び出し元のワークフローを止めない。** できないことが分かったら、そこで省略し、
  「省略した旨」と「理由」を呼び出し元（最終的にはユーザー）へ報告して終了する。
- 自律実行中はユーザーへの問い合わせで止まらない。
- **撮影のスクリプトは Claude Code の sandbox の外（`dangerouslyDisableSandbox: true`）で実行する。** sandbox の中では
  Chrome の SUID sandbox が起動できず FATAL で止まる。**`--no-sandbox` を付けて回避しない**（renderer の隔離が無くなる。スクリプトも付けない）。
  sandbox の中で起動に失敗したことを「Chrome が使えない」と判定して省略しないこと。
  sandbox の外での実行が許可の確認で拒まれた（自律実行で通らない）ときは、撮らずに省略し、その旨を報告する。

## 手順

### 1. 見た目の変更を含むか判定する

```bash
BASE=$(gh pr view <PR番号> --json baseRefName -q .baseRefName)
git fetch origin "$BASE"
git diff --name-only "origin/${BASE}...HEAD" -- packages/lp/src \
  | grep -E '\.(astro|css)$|^packages/lp/src/assets/'
```

- 1件以上出力された → 「見た目の変更あり」。出力されたファイルから、撮るページを次の表で決める
- 出力が空 → **このスキルは何もせず終了する**（省略ではなく対象外。報告は「LP の見た目の変更なしのため対象外」の1行でよい）

| 変わったファイル | 撮るページ（`--path`） |
|---|---|
| `src/pages/index.astro`・`src/components/**`・`src/layouts/**`・`src/styles/global.css`・`src/assets/**` | `/` |
| `src/pages/<name>.astro`・`src/pages/<name>/index.astro`（`privacy`・`terms`・`support`・`i`） | `/<name>/` |
| `src/pages/<name>/<file>.astro`（改定前のポリシーの版 `src/pages/privacy/2026-10-24.astro` など） | `/<name>/<file>/` |
| `src/pages/404.astro` | `/404.html` |
| `src/styles/legal.css` | `/privacy/`・`/terms/`・`/support/` と、改定前の版（`src/pages/privacy/` などの日付のファイル） |

- `src/layouts/**`（ヘッダー・フッター）は全ページに効くが、撮るのは `/` だけでよい（最初の節の画像にヘッダー、最後の節の画像にフッターが入る）
- 文言だけの変更（プライバシーポリシーの本文の書き換えなど、クラスや構造が変わらないもの）は、そのページを撮らずに省いてよい。省いた理由を報告に含める
- `.ts` だけの変更（`src/pages/robots.txt.ts` など）・`public/`・`astro.config.mjs` は対象外とする。ただし、PRの目的が見た目の変更であると明らかな場合は判断して含めてよい（判断理由を報告に含める）

**review-fix の push で呼ばれた場合**は、PR全体ではなく今回 push したコミットの範囲（`<push前のHEAD>..HEAD`）で判定し、
見た目に影響する修正があったときだけ、そのページを撮り直して新しいコメントとして添付する。

### 2. 前提を確認する

```bash
gh pr comment --help 2>/dev/null | grep -q -- '--attach' || gh --version   # 該当なし → 省略（gh が --attach 非対応）
```

Chrome の有無と起動は手順3のスクリプトが確かめる（無い・起動できないときは案内を出して終了コード 1 で止まる）。

### 3. ビルドして撮る

1. PRのブランチ（現在の HEAD）をビルドする（sandbox の中でよい）

   ```bash
   pnpm --filter lp build
   ```

2. sandbox の外で実行する前に、スクリプトがコミット済みの内容のままであることを確かめる（ビルドは sandbox の中で依存のコードを動かすので、
   そこで書き換えられたスクリプトを sandbox の外で動かさないため）。出力があれば撮らずに省略し、変わったファイルを報告する

   ```bash
   git status --porcelain -- scripts/lp-tools
   ```

   他人のPR（自分で書いていないブランチ）を撮るよう頼まれたときは、そのPRが `scripts/lp-tools/` を変えていないかも `git diff --name-only "origin/${BASE}...HEAD" -- scripts/lp-tools` で確かめ、
   変えていれば内容を読んでから実行する

3. 撮るページごとに、**sandbox の外で**スクリプトを実行する。出力先はページごとのディレクトリにする（`/` は `top`、`/privacy/` は `privacy` など）。
   前に撮った結果が残っていると手順5で古い画像まで添付するので、先に `<task-root>/lp-screenshots` を消す

   ```bash
   rm -rf <task-root の絶対パス>/lp-screenshots
   node scripts/lp-tools/capture-lp.mjs --out <task-root の絶対パス>/lp-screenshots/top --max-width 720
   node scripts/lp-tools/capture-lp.mjs --path /privacy/ --out <task-root の絶対パス>/lp-screenshots/privacy --max-width 720
   ```

   - 既定で 1440px と 390px を撮る。`--max-width 720` は 1440px の画像を 720px に縮小する（コメントの表で横に並べるため）
   - トップページは `main > section` ごと（Hero・Pins・Together・Walks・Steps・Download。並びは DOM の順）に撮る。`main > section` が無いページは `main` を1枚で撮る
   - 出力: `<width>/NN-<節の名前>.png`、`report.json`（Chrome の版・幅ごとの横スクロール・画像のパスの一覧 `files`）、`screenshots.md`（コメントに貼る表）
   - 端末に出る要約で、**Chrome の版**・**横スクロールの有無**・読み込めなかった画像を確かめる
   - 「viewport の高さで文書の高さが変わるレイアウト（vh など）があります」と出たら、その幅の画像は実際の画面より縦に伸びていることがある。
     手順4で見比べ、伸びていれば報告とコメントにその旨を書く（撮り方は viewport を文書の高さに広げる方式。`packages/lp/AGENTS.md`「デザインと画像」）
   - 終了コードで扱いを分ける。どの場合も、出力された案内・エラーを読んでから判断する
     - 1: Chrome が無い・起動できない。sandbox の外で実行していても案内のとおりに直せない場合は、省略して理由（案内の内容）を報告する
     - 2: 引数の誤り・dist が無い。コマンドを直して1回だけ再実行する
     - 3: 撮影の途中で失敗した（ページを開けない・CDP の応答が無いなど）。1回だけ再実行し、また失敗したら省略してエラーの要約を報告する

### 4. 画像を確かめる

撮った画像はすべて Read で開いて確認する。

- 画像（アプリの画面・イラスト・QR）が枠だけになっていないか、レイアウトが崩れていないか、変更した箇所が写っているか
- 横スクロールが「あり」なら、はみ出しの起点の要素とともに NG として記録する（直すかは呼び出し元が判断する。添付は行う）
- 公開する LP なので通常は問題ないが、未公開の情報（ストアに無い機能の画面など）を扱うPRでは、PR に載せてよいものか確かめる

### 5. PRにコメントとして添付する

PR本文は後続の手順（task-workflow の「知識の収穫」の追記など）で編集されるため、本文ではなく**コメント**に添付する。

1. 本文を `<task-root>/lp-pr-verification.md` に書く。表はスクリプトが書いた `screenshots.md` をそのまま使う
   （画像の参照は `--attach` に渡すのと一字一句同じ絶対パスになっている。`gh` がアップロード先の URL に書き換える）

   ```markdown
   ## 画面キャプチャ（LP）

   - 対象コミット: <git rev-parse --short HEAD>
   - 変わったファイル: <手順1で検出したファイルの要約>
   - 確認した結果: <横スクロール・崩れ・読み込めなかった画像。無ければ「崩れ・横スクロールなし」>

   ### トップページ（`/`）

   <lp-screenshots/top/screenshots.md の中身>

   ### <ほかに撮ったページ>

   <lp-screenshots/<page>/screenshots.md の中身>

   <撮らなかったページがあれば、その理由>
   ```

2. 添付する。画像のパスは各 `report.json` の `files` から取る（本文から参照しない添付は、コメントの末尾に1枚ずつ大きく追加されるので、`files` 以外を足さない）

   ```bash
   args=()
   for report in <task-root の絶対パス>/lp-screenshots/*/report.json; do
     while IFS= read -r file; do args+=(--attach "$file"); done < <(jq -r '.files[]' "$report")
   done
   gh pr comment <PR番号> --body-file <task-root の絶対パス>/lp-pr-verification.md "${args[@]}"
   ```

   - `--attach` は 1 回 50 ファイルまで（トップページは 1 幅 6 枚で 12 枚）
   - Claude Code の sandbox が画像のアップロード先（`uploads.github.com`）を拒むと、`gh` はコメントを作る前に失敗する
     （`host is on the deny list` と `no comment was posted` が出る。SS-263 で確認）。そのときは同じコマンドを sandbox の外で実行する
   - 投稿後に `gh pr view <PR番号> --comments` で、画像が表の中に並び、末尾に重複した画像が追加されていないことを確かめる。
     末尾に追加されていれば参照パスの不一致なので、原因（どのパスが食い違ったか）を報告に含める（投稿し直して重複させない）
   - `gh` が非ゼロ終了しても、コメントが作成済みの場合がある。そのまま再実行せず、まず `gh pr view <PR番号> --comments` で確かめる。
     コメントが無ければ1回だけ再実行し、あれば欠けた画像だけを別コメントで1回だけ再添付する

### 6. 報告する

呼び出し元（最終的にはユーザー）へ次のいずれかを報告する。

- 添付した: コメントの URL、撮ったページと枚数、Chrome の版、横スクロールの有無と NG の内容
- 対象外: LP の見た目の変更なし
- 省略した: 省略した手順と理由（例: `gh 2.40.0 が --attach 非対応のため省略`、`Chrome を起動できないため省略（案内の要約）`）

呼び出し元に `<task-root>/handover-notes.md` がある場合は、省略・NG・撮らなかったページを追記する。
画像と `lp-pr-verification.md` は `<task-root>` に置くので、PRへのアップロード後は task-workflow の完了処理（knowledge-harvest）で `<task-root>` とともに削除されてよい。

## 関連

- `scripts/lp-tools/capture-lp.mjs` — 撮影のスクリプト（`--help` で使い方）
- [mobile-pr-verification](../mobile-pr-verification/SKILL.md) — mobile の画面変更の PR で同じことをエミュレータで行う
- [task-workflow](../task-workflow/SKILL.md) — PR作成（手順6「PR を作る」）の直後にこのスキルを呼ぶ
