---
name: doc-section-quoted-by-code-comments
description: docs の節名・文言はコードのコメント・ADR・参照資料から「正本」として引用されている。CI はこの引用を検査しないので、文書を削る・見出しを変える前に文書名で grep して引用文言を拾う
metadata:
  type: feedback
  scope: durable
---

`packages/*/docs/folder-structure.md` のような規約の文書は、コードのコメント（例: `folder-structure.md「例外と冪等な INSERT」`）、
ADR、change-review の参照資料（「正本: folder-structure.md『状態管理の使い分け』」）、agent-memory から、節名や文言の形で引かれている。
`scripts/knowledge/check-doc-references.py` が見るのはリンクとパスだけで、節名・文言の引用が壊れても検出されない。

**Why:** SS-201 で folder-structure.md を半分以下に削ったとき、参照元は 80 ファイル近くあった。見出しや要の文言を変えると、
引用している側を読んだ人が正本を見つけられなくなる。また、削った記述の中に ADR などに一次記録が無いルールが混ざっていた
（サブパッケージを増やしてよい条件など。レビューで見つかった）。

**How to apply:**
- 文書を削る・見出しを変える前に `grep -rn "<文書のファイル名>" --exclude-dir=node_modules --exclude-dir=tmp .` で参照元を拾い、
  引かれている節名・文言を一覧にして、それを残すか、参照元も直す。
- 削る記述ごとに「ADR・他の文書・コードのコメントに一次記録があるか」を確かめる。無ければルールとして1行残す。
- 引用の文言が変更前から存在しない（以前からずれている）ものは、今回の変更と切り分けて申し送りに書く。
