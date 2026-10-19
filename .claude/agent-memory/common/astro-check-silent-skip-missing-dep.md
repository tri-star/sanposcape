---
name: astro-check-silent-skip-missing-dep
description: pnpm --filter lp check が「@astrojs/check を入れますか？」の対話で止まる、または stdin が無いと exit 0 で型検査をせずに終わる。原因は hoisted の node_modules に @napi-rs/wasm-runtime が欠けていること。pnpm install --frozen-lockfile --force で直る
metadata:
  type: feedback
  scope: durable
  source_issue: SS-220
---

`pnpm --filter lp check`（`astro check`）が「To continue, Astro requires the following dependency to be installed: @astrojs/check」と出して
`pnpm add @astrojs/check typescript` の確認を求めることがある。`@astrojs/check` 自体は root の `node_modules` にある。
本当の原因は、`@astrojs/astro2tsx` が import する `@napi-rs/wasm-runtime` が `node_modules` に無く、Astro が import の失敗を「未導入」と取り違えること。

- stdin が無い（`</dev/null`・非対話の Bash）と、確認を飛ばして **exit 0 で終わり、型検査は走らない**。`&&` でつないだ後続の build も通るので、成功に見える。
  stdin が開いたままのバックグラウンド実行では、確認待ちで止まり続ける。
- SS-220 では `pnpm install --frozen-lockfile --filter lp...` で入れた worktree で起きた。続けて素の `pnpm install --frozen-lockfile` をしても
  「最新」と判断されて直らず、`--force` を付けて入れ直したら入った。メインのチェックアウトにも同じ欠けがあった（lockfile には載っている）。

**Why:** 型検査が走っていないのに「check 成功」と報告してしまう（SS-220 の初回の検証がそうだった）。

**How to apply:**
- `check` の出力に `Result (N files): - 0 errors` があるかで成功を判断する。exit code だけで判断しない。
- 確認のプロンプトが出たら、`pnpm install --frozen-lockfile --force` で入れ直す（`pnpm add` はしない。lockfile と package.json が変わる）。
