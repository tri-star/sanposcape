---
name: tool-input-unescapes-unicode
description: ツールの入力（Write・Edit・Bash のコマンド）に書いた「バックスラッシュ + u + 16進4桁」が、届く前に見えない文字そのものに変わる。書いた後に code point を調べ、chr(92) で組み立ててエスケープに戻す
metadata:
  type: feedback
  scope: durable
  source_issue: SS-268
---

ソースの文字列に `"\u200d"`（ZWJ）・`"\u202e"`（RLO）・`"\u3000"`（全角空白）のようなエスケープを書くと、
保存されたファイルでは見えない文字そのものになっていた（SS-268 の `users/display_name.py` とテスト）。
Write だけでなく、Bash の `printf '%s'` や heredoc に書いた同じ並びも変わった（ツールの入力の段階で変わる）。
見た目では区別がつかず、ruff も指摘しない。`grep 'u200'` が当たらないことで気づいた。

**Why:** ソースに見えない文字が入ると、レビューで読めず、書式制御文字（bidi の上書きなど）はコードの見た目を偽る。
既存のコード（`auth/schemas.py`）はエスケープで書いている。

**How to apply:** 見えない文字・空白の類をエスケープで書くファイルは、書いた後に
`python3 -c "print([hex(ord(c)) for c in open(F).read() if 0x2000<=ord(c)<=0x206f or ord(c)==0x3000])"` で調べる
（ダッシュ U+2014 などの見える文字も出るので、200b〜200f・202a〜202e・2060〜206f・3000 を見る）。
出たら、heredoc の Python で `chr(92) + "u" + "%04x" % ord(c)` と組み立てて置き換える
（ツールの入力に、バックスラッシュと u と16進の並びを直接書かない）。
