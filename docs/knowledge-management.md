# 知識の置き場所ガイドライン

このプロジェクトで生まれる知識を「どこに、どれだけの寿命で置くか」を定めたルール。
エージェント・人間の双方に適用する。

## 3層モデル

| 層 | 置き場所 | 何を置くか | git | 寿命 |
| --- | --- | --- | --- | --- |
| **決定事項** | `docs/adr/`, `packages/*/docs/adr/` | 「なぜそう設計したか」。採用案・却下案・影響 | 管理下 | 恒久（変更時は追補） |
| **エージェントの作業記憶** | `.claude/agent-memory/<agent>/` | 「次回同じ失敗をしないための手順・落とし穴」 | 管理下 | 恒久だが棚卸し対象 |
| **一時的な作業記憶** | `tmp/<issue-id>/` | プラン・レビュー結果・引き継ぎメモ | **対象外** | チケット完了まで |

### 層をまたぐ参照ルール

**上の層は下の層を参照してはならない。**

- ❌ ADR や agent-memory が `tmp/SS-42/mobile-plan.md` を参照する <!-- tmp-ref-ok: 禁止例の提示 -->
- ✅ 参照したい内容を ADR に転記し、ADR を参照する

`tmp/` は `.gitignore` 対象のため、参照は別環境・別担当者・時間経過で必ずリンク切れになる。
この規則は CI（`scripts/knowledge/check-tmp-references.sh`）で機械的に検査される。

## どの層に書くかの判断

```
その知識は「なぜそう決めたか」の記録か？
  YES → ADR（adr-writing skill を使う）
  NO  ↓
その知識は次のチケットでも再利用できるか？
  YES → agent-memory（scope: durable）
  NO  ↓
現在のチケット限定の作業メモか？
  YES → tmp/<issue-id>/（チケット完了時に破棄）
```

判断に迷ったら **ADR に寄せる**。agent-memory は「決定」ではなく「作業上のコツ」を置く場所。

## agent-memory の書き方

### front-matter（必須）

```yaml
---
name: <ファイル名と一致する kebab-case のスラッグ>
description: <1行要約。想起時の判定に使われる>
metadata:
  type: feedback | project | reference
  scope: durable | task-local
  source_issue: SS-42          # scope: task-local では必須
  verify_by: 2026-11-30        # 任意。陳腐化しやすい情報に付ける
  adr: docs/adr/ADR-003-....md # type: project かつ scope: durable では必須
---
```

#### `type`

- `feedback` — 誤動作の防止策。「こうすると失敗する / こう回避する」
- `reference` — 外部リソース・生成物の所在
- `project` — プロジェクト固有の事情。**決定事項はここではなく ADR に書く**

#### `scope`（棚卸しの判断軸）

- `durable` — チケットを越えて再利用できる。恒久的に残す
- `task-local` — 特定チケット限定。**そのチケットが閉じたら削除対象**

`type: project` かつ `scope: durable` の場合、`adr` で転記先の ADR を示すこと。
「決定事項が ADR に無いまま agent-memory にだけ残る」状態を防ぐため。
まだ ADR に落とせていない段階では `scope: task-local` + `source_issue` を使い、
チケット完了時の収穫（後述）で ADR へ昇格させる。

#### `verify_by`

バージョン番号・外部サービスの仕様・未実装の予定など、時間とともに変わる情報を含む場合に設定する。
期限を過ぎたメモリは棚卸しで再検証される。

### 本文

- `**Why:**` と `**How to apply:**` を含め、次回の行動が決まる粒度で書く
- 関連メモリは `[[name]]` でリンクする
- **`tmp/` 配下のパスを書かない**。必要な内容は本文に直接書くか ADR に昇格させる

### インデックス

`.claude/agent-memory/<agent>/MEMORY.md` に1行追記する（`- [タイトル](file.md) — 要約`）。
MEMORY.md はセッション開始時に読み込まれるインデックスで、本文は必要時のみロードされる。
1エージェントあたり 25 行を超えたら、追記の前に既存メモリの統合を検討すること。

## tmp/ の扱い

- 保存先は `tmp/<issue-id>/`（issue-id が無い場合は `tmp/<YYYYmmdd-HHMM>/`）
- エージェント間の情報共有・現在のチケットの参照に使うのは問題ない
- **進行中のチケット以外の `tmp/` は読まない**。メンテナンスされないため必ず陳腐化している
- チケット完了時に、残すべき知識を ADR / agent-memory へ収穫してからディレクトリごと破棄する

## 計測（どのメモリが役に立ったか）

メモリの取捨選択を感覚で行わないために、**本文が読まれた回数**を記録している。

- 記録: `scripts/knowledge/record-memory-access.sh`（PreToolUse フック / `Read`）
- 保存先: `.claude/memory-access-log/<YYYY-MM>/<session-id>.jsonl`
- 集計: `scripts/knowledge/memory-access-report.py`

セッションごとに別ファイルへ追記するため、**複数人がログをコミットしても衝突せず合算できる**。

```bash
scripts/knowledge/memory-access-report.py --days 30
```

出力される「一度も読まれていないメモリ」が削除・統合の第一候補になる。
ただし読まれた回数が少ないだけで無価値とは限らないため（稀にしか起きない事故を防ぐメモは
読まれる頻度が低い）、最終判断は内容を見て行う。

なお、`MEMORY.md`（インデックス）はセッション開始時に自動で読み込まれるため
`Read` を経由せず、この計測には現れない。計測対象はあくまで**本文のロード**である。

## 検査

| 検査 | コマンド | 実行タイミング |
| --- | --- | --- |
| tmp/ への参照 | `scripts/knowledge/check-tmp-references.sh` | CI（docs lint） |
| agent-memory の front-matter | `scripts/knowledge/check-memory-frontmatter.py` | メモリ書き込み時のフック / CI |
| メモリの陳腐化（参照先の実在・`verify_by`） | `scripts/knowledge/check-memory-staleness.py` | 棚卸し時 |
| tmp/ の掃除 | `scripts/knowledge/gc-tmp.sh` | 棚卸し時（既定 dry-run） |

前2つはベースライン方式で、既存の未解消分は据え置き、新規の流入のみを止める。
ベースラインは棚卸しによって減らしていく。**ベースラインの件数が減っているかどうかが、
この仕組みが機能しているかの指標**になる。

## 運用サイクル

流入を止める仕組みと、溜まったものを減らす仕組みの両方で回す。

| いつ | 何を | 誰が |
| --- | --- | --- |
| メモリ書き込みの都度 | front-matter 規約の検査 | PostToolUse フック（自動） |
| メモリ本文を読む都度 | アクセスの記録 | PreToolUse フック（自動） |
| PR時 | tmp/ 参照・front-matter 規約の検査 | CI（docs lint） |
| **チケット完了時（PRマージ）** | 決定事項をADRへ、メモリを昇格/削除、`tmp/<issue-id>` を破棄 | `knowledge-harvest` skill |
| **週次〜月次** | 取りこぼしの棚卸し、古い `tmp/` の削除 | `knowledge-review` skill |

チケット完了時の仕分けが主役で、定期棚卸しは取りこぼしの回収に徹する。
マージ直後は文脈が残っているため仕分けの精度が最も高く、時間が経つほど
「他人が書いた古いメモを文脈なしで判断する」ことになって精度が落ちるため。
