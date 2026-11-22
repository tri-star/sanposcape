---
name: claude-skills-readonly-in-sandbox
description: sandbox のシェル（python・sed・リダイレクト）からは .claude/skills の下に書けない（Read-only file system）。一括の置き換えは書けないファイルを飛ばして列挙し、Edit ツールで直す
metadata:
  type: feedback
  scope: durable
---

sandbox の設定で `.claude/skills` が書き込み禁止になっていて、シェルから書くと `OSError: [Errno 30] Read-only file system` で失敗する（`SKILL.md.new` のような同じフォルダの一時ファイルも作れない）。
Edit ツールでは書ける。SS-257 で、移動に合わせてリポジトリ全体のパスを python で書き換えたとき、`.claude/skills/change-review/references/mobile.md` で例外になり、後のファイルが書き換えられないまま止まった。

**How to apply:** リポジトリ全体を一括で書き換えるスクリプトは、書き込みを `try/except OSError` で囲んで続け、書けなかったファイルを出力する。
出力されたファイル（`.claude/skills/**`）は Read してから Edit ツールで直す。sandbox を外して書く必要はない。
関係: [[python-replace-assert-after-formatter]]
