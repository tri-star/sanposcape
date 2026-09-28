---
name: feedback-module-relocation-and-ast-arch-test-gotchas
description: パッケージ移動・統合の実装と、AST によるアーキテクチャテスト（sanpo_maps/tests/test_architecture.py）を書く・直すときの落とし穴。conftest 除外の一元化、from X import Y の候補、公開面の prefix 判定、空 __init__.py の rename 誤検出、staleness 検査の誤検出
metadata:
  type: feedback
  scope: durable
  source_issue: SS-137
  adr: docs/adr/ADR-011-sanpo-maps-module-structure.md
---

SS-137（sanpo_maps と pins の統合、ADR-011）の実装で踏んだ落とし穴。次にパッケージを動かすとき、
または `sanpo_maps/tests/test_architecture.py` のような AST 検査を書く・直すときに確認する。

- **検査対象の除外条件（`conftest.py`・`__pycache__`・`tests/`）は1つのヘルパーに集約する**。
  直下だけを見る検査に独自の `glob("*.py")` を書いたら、`sanpo_maps/conftest.py` 自身が
  「カーネル以外のファイル」「サブパッケージを import するカーネル」として誤検出された。
- **`from X import Y` は `X` だけでなく `X.Y` も import 候補にする**。`X` だけ見ると
  `from sanposcape.sanpo_maps import maps` のような形で依存方向の違反をすり抜ける。
  ただし候補を増やすと、公開面の許可リストを完全一致で判定している検査は
  `from sanposcape.sanpo_maps.models import Pin`（→ `...models.Pin`）を誤検出するので、
  公開面の判定は「公開面そのもの、または `<公開面>.` で始まる」の prefix 判定にする。
- **検査を足したら、違反を一時的に入れて落ちることを1件ずつ確かめる**（戻し方は
  [[feedback-verification-revert-without-git-checkout]]）。検査が静かに何も見ていない事故は、
  番兵テスト（既知のファイルが走査対象に含まれること）でも防ぐ。
- **`git diff --cached -M --stat` で、中身が同じ空の `__init__.py` 同士は誤ってペアリングされる**
  （本来 rename のはずの `__init__.py` が add と表示される）。`git mv` の誤りではないので気にしなくてよい。
- **ファイルを横断して import を切り出したら、最後に grep をやり直す**（`ruff check` の F821 と
  pytest の collection エラーで気付けたが、手作業の import 書き換えで移動先を取り違えやすい）。
- **agent-memory で削除済みファイルを経緯として書くとき、バッククォート + 拡張子付きのパスにしない**。
  `scripts/knowledge/check-memory-staleness.py` はバッククォート内で既知拡張子で終わるトークンを
  パスとして検査するので、その言及自体が「存在しないパス」として検出される。地の文で書くか、
  クラス名・テスト名で言及する。編集のたびに検査を回すと、どの編集で増えたか切り分けやすい。

**Why:** どれもテストや lint では「移動した」ことと結び付かず、検査が緑のまま抜け穴を残したり、
関係ない所で手戻りを生んだりした。

**How to apply:** パッケージの移動・統合、または `test_architecture.py` の変更を実装するときに
上から順に確認する。モジュール内規則そのもの（M1〜M9）は ADR-011 が一次記録。
関連: [[feedback-backend-file-relocation-gotchas]]（planner 側のプランの不変条件）
