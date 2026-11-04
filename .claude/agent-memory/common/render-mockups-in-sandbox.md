---
name: render-mockups-in-sandbox
description: アプリに組み込まない画面イメージ（HTML）を sandbox で撮る手順（LP は対象外。scripts/lp-tools/capture-lp.mjs を使う） — Playwright MCP は file:// を拒否し sandbox の localhost にも届かない、google-chrome は落ちるので chrome-headless-shell を使う、PIL は uv で入れる、同梱の ffmpeg は PNG を読めない
metadata:
  type: feedback
  scope: durable
---

候補の比較用の画面イメージ（HTML）を作って PNG に撮るときに、次で時間を使った。

- **Playwright MCP のブラウザは `file://` を拒否し、sandbox 内で起動した HTTP サーバー（127.0.0.1）にも届かない**（sandbox のネットワーク名前空間が別）。
  `curl` でも sandbox 内から別コマンドのサーバーには届かない。
- **`google-chrome --headless` は sandbox 内で core dump する。** Playwright 同梱の `~/.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell` は
  sandbox 内で動く（`--no-sandbox --user-data-dir=$TMPDIR/... --screenshot=<path> --window-size=W,H --force-device-scale-factor=2 file://<path>`）。
  HOME は `$TMPDIR` 配下に向ける。
- **`--screenshot` は `#anchor` 付きで開いてもスクロール位置がずれる**（sticky ヘッダーと重なり、上が空白になる）。節ごとに他を `display:none` にした
  プレビュー HTML を作って撮る方が確実。
- **PIL はシステムに無い。** `uv run --no-project --with pillow python -I -` で一時的に入れる（`pypi.org` と `files.pythonhosted.org` が要る）。
  `~/.cache/ms-playwright/ffmpeg-*/ffmpeg-linux` は PNG のデコーダを持たないので切り出しに使えない。部分の拡大は、`overflow:hidden` の div に
  画像をずらして置いた HTML を chrome-headless-shell で撮ると速い。
- **LP（`packages/lp`）のページは、この手順ではなく `scripts/lp-tools/capture-lp.mjs` で撮る**（SS-263）。`pnpm --filter lp build` の後に sandbox の外で
  `node scripts/lp-tools/capture-lp.mjs --out <dir>` を実行すると、1440px・390px で節ごとに撮り、横スクロールの有無を出す。
  `/_astro/` の絶対パス（HTTP で配信する）・遅延読み込みと `decoding="async"` の画像・sticky ヘッダーの重なりは、スクリプトが扱う。
  システムの `google-chrome` は sandbox の外なら Chrome の sandbox 付きで動く（`--no-sandbox` は付けない）。PR への添付は `lp-pr-verification` skill。
- Artifact に載せる HTML は `<!doctype>` 無しで書く（公開時に包まれる）。手元で撮るときは doctype と charset を前に足したコピーを撮る（quirks モードを避ける）。

**How to apply:** 画面イメージを撮るときは最初から chrome-headless-shell + 節ごとのプレビュー HTML で撮る。MCP のブラウザやローカルサーバーを試さない。
LP（`packages/lp`）のページはこの手順を使わず、`scripts/lp-tools/capture-lp.mjs` を sandbox の外で使う（システムの Chrome を sandbox 付きで使い、配信もスクリプトが行う）。
