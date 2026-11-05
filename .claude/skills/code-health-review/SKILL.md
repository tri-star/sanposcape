---
name: code-health-review
description: "コードの健全性の月次の棚卸し。変更の多い大きいファイル・別々のフォルダで一緒に変わるファイル・コピー＆ペーストされたコード・使われていないコードを scripts/code-health/report-health.py で集め、誤検知を除いて上位を Plane の課題候補として出す。自動では直さない。月次の定期実行（Orca の automation）を想定しているが、「コードの健全性を棚卸しして」「重複や未使用のコードを洗い出して」「月次のコードのレポートを出して」のように頼まれたときにも使う。"
argument-hint: "[auto]"
---

## 目的

PR ごとの検査（`check-structure.py`・linter の関数の単位のルール）は、閾値を超えた差分を止める。
git の履歴から測る兆候（変更の集中・一緒に変わる組）と、重複・未使用のコードは、1つの PR では判断できないので、月に1回一覧で見る（ADR-018）。

このスキルは**課題の候補を出すまで**を行う。コードは直さない。直すのは起票した課題で、分け方は `structure-refactor` skill が決める。

## パラメータ

- `[auto]`: 人が応答しない定期実行。承認を待たず、月次の要約の課題を1件だけ起票して終える（手順4）。無ければ対話で、候補を示して承認されたものを起票する

## 原則

- **ツールの出力は候補であって結論ではない。** 誤検知（名前で呼ばれない使い方・意図した重複）を、コードを読んで除く。読まずに起票しない
- **既にある課題と重ねない。** ベースラインの `issue`・linter の除外のコメントの課題・Plane の未完了の課題に載っているものは、新しく起票せず「既存の課題 SS-xxx」と書く
- **件数より、直す価値で選ぶ。** 上位から最大 5 件を候補にする。1か月で消化できない数を起票しても読まれない

## 手順1: 材料を集める

`.env` と `node_modules` が無ければ `local-env-setup` skill で整える（knip が mobile の依存を読む）。

```bash
pnpm --filter mobile orval     # knip が生成物の import を解決できるように。無いと knip の節は省略される
mkdir -p tmp/code-health
python3 scripts/code-health/report-health.py > tmp/code-health/report-$(date +%Y-%m).md
python3 scripts/code-health/check-structure.py --all      # ベースラインと警告の全体
```

- jscpd は `pnpm dlx`、vulture は `uvx` で版を固定して流す（ネットワークが要る。初回はダウンロードが入る）。sandbox で拒まれたら、出力の「省略」の理由を見て sandbox の外で流し直す
- 節が「省略」のままなら、その旨をレポートの末尾と最終報告に書いて先へ進む（止まらない）
- 前回のレポートは Plane の前月の要約の課題（手順4）にある。件数の増減を比べる

## 手順2: 1件ずつ読んで、誤検知を除く

上位から順に、該当のコードを読んで次の表で判断する。

| 節 | 課題の候補になるもの | 除くもの（誤検知・意図したもの） |
| --- | --- | --- |
| 変更回数 × 行数 | 1つのファイルが複数の責務を持ち、別々の理由で変わり続けている（コミットの件名で理由を見る: `git log --format=%s --since="6 months ago" -- <path>`） | 一覧を足していくのが役目のファイル（設定の項目・文言・法的な文面）。ADR に扱いが決まっているもの |
| 一緒に変わる組 | 片方を変えるともう片方も変える必要がある、隠れた結び付き（同じ知識が2か所にある、境界がずれている） | API の契約で結ばれた backend と mobile の組、実装とその文言・設定の組のように、一緒に変わるのが自然なもの |
| 重複（jscpd） | 同じ規則・同じ UI の部品を写して持っている（片方だけ直すと食い違う） | 偶然似ている短い定型（JSX の props の並び、import の並び）。行数が多くても、別々に変わってよいもの |
| 未使用（knip） | どこからも使われないファイル・依存・export | テストからだけ使う export（テストのための公開で、意図していれば残す）。ネイティブで使う・config plugin が読む依存（`app.json`・`app.config.ts` を確かめる） |
| 未使用（vulture） | 呼ばれない関数・使われない変数 | 列挙の値（API の語彙として残すもの）、ORM・Pydantic が名前で読む属性、テストの fixture の引数。除き続けるものは `pyproject.toml` の `[tool.vulture]` に足すことを候補にする |
| ベースライン | 「下げられる」「外せる」項目（`--baseline` で下げる小さな課題）。課題が長く動いていない項目 | — |

knip・vulture の誤検知を設定で除く（`packages/mobile/knip.jsonc`・`packages/backend/pyproject.toml`）のは、毎月同じものが並ぶときだけにする。除く理由をコメントで書く。

## 手順3: 既存の課題と突き合わせる

- ベースライン（`scripts/code-health/structure-baseline.json` の `issue`）、ruff の `per-file-ignores`・`.oxlintrc.json` の除外のコメントの課題
- Plane の未完了の課題（`plane-project-manager` エージェントで、候補のファイル名・機能名で検索する）

重なるものは「既存の課題 SS-xxx に含まれる」と書き、新しい候補にしない。既存の課題に新しい事実（重複が増えた、など）があれば、その課題へのコメントを候補にする。

## 手順4: 課題の候補を出す

候補を次の形でまとめる。

```
## コードの健全性の課題候補（YYYY-MM）

| # | 候補（課題名の案） | 種類 | 根拠（レポートの数字） | 対象 | 次の手 |
|---|---|---|---|---|---|
| 1 | pin と history の状態カードの共通化 | 重複 | 54 行・2 箇所 | HistoryStateCard.tsx・PinStateCard.tsx | structure-refactor で置き場所を決める |

- 既存の課題に含まれるもの: <SS-xxx: 何が含まれるか>
- 除いた誤検知: <件数と代表例。設定で除くことにしたものはその旨>
- 件数の推移: 重複 x% → y%、knip n 件、vulture m 件、ベースライン k 件（前回比）
- 省略した節: <あれば理由>
```

- **対話のとき**: 表をユーザーに示し、起票するものを選んでもらう。選ばれたものを `plane-project-manager` エージェントで Backlog に起票する（ラベル `ready` は付けない。着手の判断はトリアージで行う）
- **`auto` のとき**: 個別には起票しない。「コードの健全性の課題候補（YYYY-MM）」という課題を1件だけ Backlog に起票し、本文に上の表と箇条書きを載せる（同じ月の課題が既にあれば、新しく作らずコメントで追記する）。
  ユーザーがトリアージで選び、必要なら `task-breakdown` skill で分ける。人の確認なしに課題を増やさないため

どちらも、レポート本文（`tmp/code-health/report-YYYY-MM.md`）はリポジトリにコミットしない（`tmp/` は git の管理外）。数字は課題の本文に残す。

## 手順5: 報告する

- 候補の件数と、起票した課題（`auto` では要約の課題）の ID
- 件数の推移（重複の割合、knip・vulture の件数、ベースラインの件数）
- 省略した節と理由
- 設定（knip・vulture の除外）を変えたなら、その差分は PR にする（このスキルの中ではコミットしない。小さな課題として候補に含める）

## 定期実行

月に1回。Orca の automation に載せる（sandbox の外で、ユーザーが登録する）。

```bash
orca-ide repo list --json    # sanposcape の repo id を引く
orca-ide automations create --name "コードの健全性の月次の棚卸し" --trigger "0 9 1 * *" \
  --prompt "/code-health-review auto" --provider claude --repo id:<repoId> --json
```

- `--repo` にすると、実行ごとに新しい worktree ができる（main から）。手順1の `local-env-setup` が要る
- Claude Code の `/schedule`（クラウドのルーティン）は使わない。手順1の依存の整備（`local-env-setup`・pnpm・uv）と Plane の MCP の設定が、手元の環境（Orca の worktree）を前提にしているため
