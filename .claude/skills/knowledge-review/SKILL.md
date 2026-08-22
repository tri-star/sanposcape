---
name: knowledge-review
description: "agent-memory と tmp/ の棚卸しを行うスキル。アクセスログ・front-matter規約・陳腐化検査の結果を突き合わせ、削除・統合・ADR昇格・再検証の提案を出す。定期実行(週次〜月次)を想定しているが、「メモリを棚卸しして」「agent-memoryを整理して」「溜まったメモリを見直して」のようにユーザーから指示された場合にも使用する。"
argument-hint: "[--agent <agent-name>] [--dry-run]"
---

## 目的

`.claude/agent-memory/` に溜まったメモリと `tmp/` の作業ファイルを定期的に見直し、
**再利用性の低い記憶が溜まり続ける状態**と**陳腐化した記憶が誤動作を招く状態**を解消します。

チケット単位の仕分けは `knowledge-harvest` skill がマージ直後に行います。
このスキルはその**取りこぼしを回収する役割**であり、両方が必要です。

前提となる3層モデルと front-matter 規約は [知識の置き場所ガイドライン](../../../docs/knowledge-management.md) を参照してください。

## 原則

- **提案までを行い、削除・統合は必ずユーザーの承認を得てから実行する。**
  agent-memory は git 管理下なので復元可能ですが、承認を挟む方が安全です。
- **読まれていない = 無価値ではない。** 稀にしか起きない事故を防ぐメモリは、そもそも読まれる
  頻度が低くなります。アクセス数は判断材料の一つであって、判定基準ではありません。
- **迷ったら残さず、ADR に昇格させる。** 決定事項として価値があるなら ADR が正しい置き場所です。

## Step 1: 材料を集める

4つの検査を実行し、結果を突き合わせます。

```bash
# 1. どのメモリが実際に読まれているか
python3 scripts/knowledge/memory-access-report.py --days 90

# 2. front-matter 規約を満たしていないメモリ（ベースラインの残件）
python3 scripts/knowledge/check-memory-frontmatter.py --all
cat scripts/knowledge/memory-frontmatter-baseline.txt

# 3. 参照先が消えている / verify_by を過ぎているメモリ
python3 scripts/knowledge/check-memory-staleness.py

# 4. tmp/ を参照しているメモリ（リンク切れ確定）
cat scripts/knowledge/tmp-reference-baseline.txt
```

加えて、インデックスの肥大を確認します。1エージェント 25 行が目安です。

```bash
wc -l .claude/agent-memory/*/MEMORY.md | sort -rn | head
```

## Step 2: 1件ずつ分類する

集めた材料をもとに、各メモリを次の5つに分類します。判断のため**本文を読んでください**。
front-matter だけで判断しないこと。

| 分類 | 典型的な条件 | 処理 |
| --- | --- | --- |
| **削除** | チケット固有の進捗・状況メモ。そのチケットは完了済み。読まれていない | ファイルと `MEMORY.md` の行を削除 |
| **統合** | 同一エージェント内に近い内容が複数ある。インデックスが 25 行を超えている | 1ファイルにまとめ、`MEMORY.md` も1行にする |
| **ADR昇格** | 「なぜそう決めたか」が書かれている（`type: project` に多い） | `adr-writing` skill で ADR へ転記し、メモリは要点＋ADRへの参照に縮退。`metadata.adr` を設定 |
| **再検証** | 参照先が消えている / `verify_by` 超過 | 現在のコードを確認し、本文を更新するか削除する |
| **維持** | 汎用的な落とし穴・手順で、内容が今も正しい | `scope: durable` を確認し、front-matter を規約に合わせる |

判断の軸は「**次のチケットでこのメモを読んで嬉しいか**」です。

### 陳腐化検査の誤検知に注意

`check-memory-staleness.py` が「参照先が存在しない」と報告しても、コード生成物や
`.gitignore` 対象のファイル（`src/api/generated/**`、`.expo/types/**` など）は
生成前なら存在しません。実際に消えたのかを確認してから判断してください。

### tmp/ 参照の扱い

`tmp/` を参照しているメモリは、参照先が既に消えているか、いずれ必ず消えます。
参照ではなく**要点を本文に書き写す**か、決定事項なら **ADR へ昇格**させてください。
対応後は `tmp/` 参照のベースラインを再生成し、件数が減ったことを確認します。

## Step 3: 提案をユーザーに提示する

分類結果を次の形でまとめ、実行前に承認を得ます。

```
## 棚卸し提案（<対象範囲> / メモリ <N> 件）

### 削除（<n> 件）
- <agent>/<file>.md — <理由。90日間未読 / SS-42完了済みの進捗メモ 等>

### 統合（<n> 件 → <m> 件）
- <agent>/<file-a>.md + <file-b>.md → <統合後の名前>.md — <理由>

### ADR昇格（<n> 件）
- <agent>/<file>.md — <どのADRに何を転記するか>

### 再検証が必要（<n> 件）
- <agent>/<file>.md — <参照先 `xxx.ts` が存在しない 等>

### 維持（<n> 件）
（件数のみ。個別列挙は不要）
```

## Step 4: 承認された内容を実行する

1. ADR昇格 → `adr-writing` skill を呼び出す（既存 ADR への追補を優先）
2. 削除・統合 → ファイルと `MEMORY.md` の該当行を同時に更新する。
   **`MEMORY.md` の行を消し忘れるとインデックスから存在しないファイルを指すことになります。**
3. 再検証 → 現在のコードを確認して本文を更新する
4. 維持 → front-matter に `scope` などが欠けていれば規約に合わせる

## Step 5: tmp/ を掃除する

```bash
scripts/knowledge/gc-tmp.sh --days 30
```

dry-run の結果を確認し、消してよいものだけになっていることをユーザーと確認してから
`--apply` を付けて実行します。進行中チケットのディレクトリと、git 管理下から参照されている
ものは自動的に保持されます。

## Step 6: 検査とベースライン更新

```bash
scripts/knowledge/check-tmp-references.sh
python3 scripts/knowledge/check-memory-frontmatter.py --all
```

整備によってベースラインから外れたファイルがあれば再生成します。

```bash
scripts/knowledge/check-tmp-references.sh --baseline
python3 scripts/knowledge/check-memory-frontmatter.py --baseline
```

## Step 7: コミットと報告

変更をコミットし、次を報告してください。ベースラインの件数は**棚卸しが機能しているかの指標**なので、
毎回の増減を記録します。

- メモリ総数の増減（例: `126 → 108 件`）
- ベースラインの増減（例: `front-matter 未整備 126 → 108`、`tmp/参照 27 → 19`）
- ADR に昇格した件数と転記先
- 削除した `tmp/` の件数

## 定期実行

週次〜月次での実行を想定しています。手動で回す場合は次のように呼び出してください。

```
/knowledge-review
```

Claude Code の `/loop` や cron ルーティンに載せることもできます。頻度を上げすぎると
「読まれていない」判定の母数が足りず精度が落ちるため、**最低でも隔週以上の間隔**を空けてください。
