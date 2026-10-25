# 知識の置き場所ガイドライン

このプロジェクトで生まれる知識を「どこに、どれだけの寿命で置くか」を定めたルール。
エージェント・人間の双方に適用する。

## 3層モデル

| 層 | 置き場所 | 何を置くか | git | 寿命 |
| --- | --- | --- | --- | --- |
| **決定事項** | `docs/adr/`, `packages/{frontend,backend}/docs/adr/`, `packages/mobile/adr/` | 「なぜそう設計したか」。採用案・却下案・影響 | 管理下 | 恒久（変更時は追補） |
| **エージェントの作業記憶** | `.claude/agent-memory/<domain>/` | 「次回同じ失敗をしないための手順・落とし穴」 | 管理下 | 恒久だが棚卸し対象 |
| **一時的な作業記憶** | `tmp/<issue-id>/` | プラン・レビュー結果・引き継ぎメモ | **対象外** | チケット完了まで |

### 層をまたぐ参照ルール

**上の層は下の層を参照してはならない。**

- ❌ ADR や agent-memory が `tmp/SS-42/mobile-plan.md` を参照する <!-- tmp-ref-ok: 禁止例の提示 -->
- ✅ 参照したい内容を ADR に転記し、ADR を参照する

`tmp/` は `.gitignore` 対象のため、参照は別環境・別担当者・時間経過で必ずリンク切れになる。
この規則は CI（`scripts/knowledge/check-tmp-references.sh`）で機械的に検査される。

- ❌ コードのコメントから計画書の決定コード（`D3`・`B-D1` など）を参照する
- ✅ ADR の決定番号で参照する（または、コメントだけで意図が分かるように書く）

計画書はチケット完了時に破棄されるため、決定コードは追跡できない記号になる。CI はソースコードのコメントを検査しない。

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

### 一回限りの作業の設計

データの移行のように、複数のチケットにまたがるが、作業が終われば要らなくなる設計（データの対応・ファイルの形・手順）は、
ADR にせず、その作業のコードと同じディレクトリに `README.md` として置く。
ADR は恒久の記録で、使い終わる手順には大げさになる。`tmp/` は git の外にあり、別の worktree やチケットと共有できない。

- 作業が終わったら、コードと一緒に README を消す。消す課題は、作業の最初に起票しておく。
- ADR・agent-memory・docs から README にリンクしない。消した時点でリンク切れになる。
- 消しても git の履歴に残るので、利用者の個人のデータ（名前・本文・ユーザー ID など）を書かない。
- 作業の後も有効な決定と、作業が残したデータについての事実（例: 移したデータの日付や ID の決め方）は、消す前に ADR へ追補する。

## ADR の番号

連番は置き場所ごとに独立しているため、package 固有の ADR には接頭辞を付けて番号だけでも所属を区別する
（手順・例は `adr-writing` skill）。

| 置き場所 | 表記 |
| --- | --- |
| `docs/adr/`（全体向け） | `ADR-001` |
| `packages/frontend/docs/adr/` | `ADR-F-001` |
| `packages/backend/docs/adr/` | `ADR-B-001` |
| `packages/mobile/adr/` | `ADR-M-001` |

ファイル名・タイトル行だけでなく、他の文書やコードコメントから参照するときも同じ表記を使う。
接頭辞の無い `ADR-009` は全体向けの ADR を指す。

## ADR の追補と要約

ADR は変更時に書き換えず追補する（`adr-writing` skill）。経緯が残る代わりに、
追補が重なると「今どの決定が有効か」が読み取りにくくなるため、追補のある ADR には
冒頭に `## 現在有効な決定（要約）` を置く（`adr-summary` skill）。

- **読むとき**: まず要約で現在の決定をつかみ、理由や経緯が必要な項目だけ
  `（本文: 決定N、SS-xx 追補）` を頼りに本文を読む。
- **一次記録は本文**。要約と本文が食い違う場合は要約の誤りとして要約を直す。
- **追補したら同じ変更で要約も更新する**。初版の ADR には要約を付けない。

## agent-memory の書き方

### Codex から利用する場合

この文書の自動読込・Readフック・アクセス計測はClaude Codeの機構を説明している。
Codexでは同じ自動動作を前提にせず、必要なトピックのインデックスと本文を明示的に読む。
配置とfront-matterの規約は共有する。Codexの取り込みsnapshotは設定の比較データであり、
エージェントの記憶や作業指示としては読み込まない。

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

`.claude/agent-memory/<domain>/MEMORY.md` に1行追記する（`- [タイトル](file.md) — 要約`）。
MEMORY.md は作業の最初に読むインデックスで、本文は必要時のみ読む。
1ディレクトリあたり 25 行を超えたら、追記の前に既存メモリの統合を検討すること。

### ディレクトリ（`<domain>`）

| ディレクトリ | 置くもの | 読む契機 |
| --- | --- | --- |
| `backend/` | backend の実装・計画の落とし穴と手順 | `packages/backend/AGENTS.md` の指示 |
| `mobile/` | mobile の実装・計画の落とし穴と手順 | `packages/mobile/AGENTS.md` の指示 |
| `common/` | 領域に属さない git・ドキュメント作業の落とし穴 | ルートの `AGENTS.md` の指示 |
| `plane-project-manager/`、`dependabot-update-resolver/` | その agent 固有の手順 | agent の `memory: project` による自動読込 |

agent 名ごとに分けていた時期（〜SS-202）は、同じ領域の知識が planner / developer / reviewer に分散し、
メインエージェントが直接作業する構成では読む場所が定まらなかったため、領域ごとに再編した。
レビューで繰り返し使う確認項目はメモリではなく `.claude/skills/change-review/references/` に置く
（レビュアーが必ず読むのは参照資料で、メモリは索引から関係するものだけを読むため。経緯は [ADR-014](./adr/ADR-014-claude-harness-main-agent-and-review-structure.md)）。

## tmp/ の扱い

- 保存先は `tmp/<issue-id>/`（issue-id が無い場合は `tmp/<YYYYmmdd-HHMM>/`）
- エージェント間の情報共有・現在のチケットの参照に使うのは問題ない
- **進行中のチケット以外の `tmp/` は読まない**。メンテナンスされないため必ず陳腐化している
- チケット完了時（`task-workflow` の PR 作成直後）に、残すべき知識を ADR / agent-memory へ収穫してからディレクトリごと破棄する

## 計測（どのメモリが役に立ったか）

メモリの取捨選択を感覚で行わないために、**本文が読まれた回数**を記録している。

- 記録: `scripts/knowledge/record-memory-access.sh`（PreToolUse フック / `Read`・`Bash`）
- 手元の保存先: `<git-common-dir>/memory-access-log/<YYYY-MM>/<session-id>.jsonl`（作業ツリーの外。同じ clone の worktree で共有）
- 共有の保存先: `.claude/memory-access-log/<YYYY-MM>/<session-id>.<移した時刻>-<乱数>.jsonl`（コミットする）
- 移し込み: `scripts/knowledge/flush-memory-access-log.sh`
- 集計: `scripts/knowledge/memory-access-report.py`（共有と手元の両方を読む）

フックは作業ツリーの外に記録するので、作業の途中や PR 作成の後にメモリを読んでも作業ツリーは汚れない。
PR を作るとき（`knowledge-harvest` のコミット）に移し込みスクリプトで共有の保存先へ移してコミットする。
移した後に読んだ分は手元に残り、次の PR で移される。人が手で PR を作るときも、PR 前に同じスクリプトを実行する。
移すたびに一意なファイル名にするため、**別マシン・複数人のログや、同じセッションのログを別々の PR に移しても衝突せず合算できる**
（手元の置き場所は全 worktree で共有されるので、同じセッションの分が別々のブランチへ移ることがある）。

移す前に clone を消した分と、ログを移した PR がマージされずに閉じた分は失われる（許容している。経緯は SS-204）。
`Bash` での読み取りは、読み取り系のコマンド（`cat`・`head`・`sed` など）の引数に書かれた agent-memory のパスから推定する近似。
リダイレクトの書き込み先・`sed -i`・`git log` / `diff` / `rm` の引数は数えない。`cd` してから相対パスで読む、`grep`・`git show` で読む、は記録されない。
フックや移し込みを試すと、試したコマンド自体も記録される。試した後は、移す前に手元のログから該当する行を取り除く（SS-204 で、試験の記録をそのままコミットしかけた）。

```bash
scripts/knowledge/memory-access-report.py --days 30
```

出力される「一度も読まれていないメモリ」が削除・統合の第一候補になる。
ただし読まれた回数が少ないだけで無価値とは限らないため（稀にしか起きない事故を防ぐメモは
読まれる頻度が低い）、最終判断は内容を見て行う。

なお、agent の `memory: project` で自動読込される `MEMORY.md` は `Read` を経由しないため、この計測には現れない。
領域別ディレクトリの `MEMORY.md` は作業の最初に `Read` で読むので生ログには残るが、集計（`memory-access-report.py`）は `MEMORY.md` を除外する。

## 検査

| 検査 | コマンド | 実行タイミング |
| --- | --- | --- |
| tmp/ への参照 | `scripts/knowledge/check-tmp-references.sh` | CI（docs lint） |
| agent-memory の front-matter | `scripts/knowledge/check-memory-frontmatter.py` | メモリ書き込み時のフック / CI |
| 文書中のリンク・ファイルパス・pnpm script の実在（インラインのリンク、ルート相対のインラインコードのパス、`pnpm --filter`。範囲外は doc-maintainer） | `scripts/knowledge/check-doc-references.py` | CI（docs lint。全 PR・main への push） |
| メモリの陳腐化（参照先の実在・`verify_by`） | `scripts/knowledge/check-memory-staleness.py` | 棚卸し時 |
| tmp/ の掃除 | `scripts/knowledge/gc-tmp.sh` | 棚卸し時（既定 dry-run） |

tmp/ 参照・front-matter・文書中の参照の3つはベースライン方式で、既存の未解消分は据え置き、新規の流入のみを止める。
ベースラインは棚卸しによって減らしていく。**ベースラインの件数が減っているかどうかが、
この仕組みが機能しているかの指標**になる。

## 運用サイクル

流入を止める仕組みと、溜まったものを減らす仕組みの両方で回す。

| いつ | 何を | 誰が |
| --- | --- | --- |
| メモリ書き込みの都度 | front-matter 規約の検査 | PostToolUse フック（自動） |
| メモリ本文を読む都度 | アクセスの記録（手元へ） | PreToolUse フック（自動） |
| PR時 | tmp/ 参照・front-matter 規約・文書中のリンク・パス・pnpm script の実在の検査 | CI（docs lint） |
| **チケット完了時（PR作成直後）** | 決定事項をADRへ、メモリを昇格/削除、`tmp/<issue-id>` を破棄し、手元のアクセスログを移して、結果を PR に含める | `knowledge-harvest` skill（`task-workflow` から自動モードで） |
| PRマージ時 | 収穫の取りこぼし（残った `tmp/<issue-id>`・task-local メモリ）がある場合のみ回収 | `task-status-sync` の `pr-merged` → `knowledge-harvest` skill |
| **週次〜月次** | 取りこぼしの棚卸し、古い `tmp/` の削除、main 全体での文書の乖離の確認 | `knowledge-review` skill |

チケット完了時の仕分けが主役で、定期棚卸しは取りこぼしの回収に徹する。
PR作成直後は文脈が残っているため仕分けの精度が最も高く、時間が経つほど
「他人が書いた古いメモを文脈なしで判断する」ことになって精度が落ちるため。
また、この時点で収穫すれば ADR 追補やメモリの変更を実装と同じ PR でレビューできる。
