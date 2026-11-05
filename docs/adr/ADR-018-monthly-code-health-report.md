# ADR-018: 変更の集中・一緒に変わる組・重複・未使用のコードは、PR ごとに止めず月次のレポートで見て、課題の候補にする

## 日付

2026-11-05（SS-255）

## コンテキスト

コードの読みやすさを保つ仕組みを4段で入れている（SS-252〜SS-255）。

1. SS-252（ADR-016）: ファイルの行数・フォルダのファイル数・接頭辞の集中を CI でラチェット方式で止める
2. SS-253（ADR-017）: 関数の複雑度・長さ・循環 import を ruff・oxlint のルールで止める
3. SS-254（ADR-016 の SS-254 追補）: 分け方を決める `structure-refactor` skill と、change-reviewer の「構造の悪化」の観点
4. SS-255（この ADR）: 月次の定期レポート

1〜3 は1つの PR の差分で判断できるものを止める。次の兆候は、1つの PR では判断できない。

- **頻繁に変わり、しかも大きいファイル**: SS-255 の起票時点で `packages/backend/src/sanposcape/main.py` と `config.py` が直近6か月でそれぞれ 33 回変わっている。1回の変更は小さく、閾値も超えない
- **別々のフォルダにあるのに一緒に変わる組**: 隠れた結び付きは、履歴を並べないと見えない
- **コピー＆ペーストされたコード**: 既存のコードとの重複は、差分だけを読むレビューでは気づきにくい。PR で止めると、意図した重複（テストの並び）まで落ちる
- **使われていないコード**: 使う側を消した PR では、使われなくなった側は差分に現れない

ADR-016 決定6 は、baseline の件数と下げられる項目を「定期の棚卸し（SS-255 の月次レポート）」で見ると決めている。

## 決定

1. **`scripts/code-health/report-health.py` が次を集め、Markdown（`--json` で JSON）で出す。** 直さない。
   - 頻繁に変わる大きいファイル: 直近6か月（`--since`）の変更回数 × 行数。実装のファイルだけ（テストの変更は数えない。テストの多さは実装の変わりやすさを表さない）
   - 別々のフォルダで一緒に変わる組: 親フォルダが違う実装のファイルの組で、3回以上一緒に変わったもの。テストは対象の実装に寄せる。実装のファイルを 20 個より多く変えたコミット（一括の置き換え・整形）は数えない。
     回数と、変更の少ないほうのファイルの変更回数のうち一緒に変わった割合を出す
   - 重複: jscpd（TS・JS・Python・Astro）。ファイルの組ごとの重複の行数で並べる。テスト同士の重複は件数だけ出す（テストは並べて書くのが普通）。プライバシーポリシーの過去の版（`packages/lp/src/pages/privacy/`）は数えない（今の版と同じ文面を残すのが目的）
   - 未使用: mobile は knip（ファイル・export・型・依存）、backend は vulture（関数・変数など。信頼度 60% 以上）
   - 構造の検査の baseline の件数（課題ごと）と、下げられる・外せる項目
   - 対象・テストの判定・一緒に変わった組の数え方は `check-structure.py`・`survey-structure.py` の関数をそのまま使う（数え方を揃える）
   - 外部のツールが流せないとき（ネットワーク・`node_modules`・Orval の生成物が無い）は、その節を「省略」として理由を書き、残りは出す
   - CI では走らせない（テストだけ `code-health.yml` の `unittest discover` に入る）
2. **ツールの版は固定し、固定の仕方は依存の有無で分ける。**
   - jscpd は `pnpm dlx jscpd@5.4.2` で流す。jscpd 5 は依存の無い単体のバイナリ（プラットフォームごとの optional dependency も同じ版に固定）で、版で中身が決まる
   - vulture は `uvx --python 3.12 --from vulture==2.16 vulture` で流す。Python 3.11 以上では依存が無い。uvx はプロジェクトの requires-python を見ないので、backend と同じ Python を指定する（古い Python では新しい構文のファイルを解析できずに飛ばす）
   - knip は依存を caret の範囲で持つので、`pnpm dlx` では実行のたびに推移的な依存の版が変わる。mobile の devDependency にして lockfile と dependabot に載せる
     （アプリの JS・ネイティブには入らない。devDependency の追加の前後で `@expo/fingerprint` のハッシュが同じことを確かめた）。
     package.json の `scripts` には足さない。`@expo/fingerprint` は `scripts` をハッシュの材料に入れるので、1つ足すだけで本番のビルドとの fingerprint の比較（OTA の配信の前の確認）が変わる。
     `report-health.py` は `pnpm exec knip` で直接呼ぶ
   - 版を上げるときは `report-health.py` の定数（jscpd・vulture）を変える
3. **誤検知の除外は設定ファイルに理由つきで書く。** 毎月同じ誤検知が並ぶと、一覧が読まれなくなるため。
   - knip: `packages/mobile/knip.jsonc`（vitest の alias の mock・手で流すスクリプトを entry に、CI が使う CLI・Orval の生成物が使う依存を `ignoreDependencies` に）
   - vulture: `packages/backend/pyproject.toml` の `[tool.vulture]`（FastAPI のルーター・例外ハンドラ、Pydantic の validator、pytest の fixture のデコレータ）
   - 除外は、名前で呼ばれないが使われていると確かめたものだけにする。判断の要るもの（列挙の値・依存）は除外せず、月次の棚卸しで判断する
4. **`code-health-review` skill（`.claude/skills/code-health-review/SKILL.md`）が、レポートを読んで課題の候補を出す。** `knowledge-review` と同じく、提案までを行い、コードは直さない。
   - 上位をコードを読んで確かめ、誤検知（名前で呼ばれない使い方・意図した重複・一緒に変わるのが自然な API の契約の組）を除く。判断の基準は skill の表
   - ベースラインの `issue`・linter の除外のコメントの課題・Plane の未完了の課題と重なるものは、新しく起票しない
   - 候補は最大 5 件。直す価値で選ぶ
   - 対話のときは候補を示し、選ばれたものを Backlog に起票する（`ready` は付けない）
   - 定期実行（`auto`）のときは、月次の要約の課題を1件だけ Backlog に起票し、本文に候補の表を載せる。人の確認なしに課題を増やさないため
   - 直すときの分け方は `structure-refactor` skill が決める
5. **月に1回、Orca の automation で `/code-health-review auto` を流す。** 登録はユーザーが行う（コマンドは skill の「定期実行」）。
   Claude Code の `/schedule`（クラウドのルーティン）は使わない。依存の整備と Plane の MCP の設定が、手元の環境（Orca の worktree）を前提にしているため
6. **Codex 側には、まだ適応していない。** `import-claude-skill` で差分を見て適応する（AGENTS.md。ADR-016 決定14 の `structure-refactor` と同じ）。

## 検討した選択肢

### 選択肢1: PR ごとの検査にする（jscpd・knip・vulture を CI で止める）

- **概要**: 重複率・未使用の件数を CI の閾値で止める
- **メリット**: 増えた時点で止まる
- **デメリット**: 誤検知（意図した重複、名前で呼ばれない使い方）を毎回除外に足すことになり、除外が増えるほど検査が意味を失う。
  git の履歴から測る兆候（変更の集中・一緒に変わる組）は、そもそも1つの PR の差分で判断できない

### 選択肢2: GitHub Actions の schedule で月次にレポートを出す

- **概要**: `schedule:` の workflow でスクリプトを流し、ジョブの概要に出す
- **メリット**: 人もエージェントも要らずに毎月出る
- **デメリット**: 課題にするかの判断（誤検知を除く・既存の課題と重ねない）ができず、Plane にも書けない。レポートだけが出ても読まれない

### 選択肢3: スクリプトで集め、skill で判断して課題の候補にする（採用）

- **概要**: 決定1〜5のとおり
- **メリット**: 集計の仕方はスクリプトで毎月揃い、判断は skill の基準で行う。既存の棚卸し（`knowledge-review`）と同じ形で覚えることが少ない
- **デメリット**: 月次の実行に Orca の automation の登録が要る。エージェントの判断が入るので、候補の選び方は毎月少しずつぶれる

### jscpd・knip・vulture をすべて devDependency にする案

- **概要**: lockfile で3つとも固定する
- **メリット**: 固定の仕方が1つになる。dependabot が版を上げる
- **デメリット**: jscpd を root の devDependency にすると、CI・EAS の install（`pnpm install --frozen-lockfile` は workspace 全体）が月1回しか使わないツールの分だけ重くなる。
  jscpd 5 と vulture は依存が無く、版の固定で中身が決まるので、lockfile に載せて得るものが少ない

### jscpd の `--dead-code` で未使用のコードも見る案

- **概要**: jscpd 5 は JS・TS・Python の未使用のファイル・export・シンボルも出せる。ツールを1つにまとめる
- **メリット**: 依存が減る
- **デメリット**: 新しい機能で、knip（依存・config の plugin を理解する）・vulture ほどの実績が無い。課題の指定（mobile は knip、backend は vulture）にも合わない

### `check-structure.py` に足す案

- **概要**: 構造の検査と同じスクリプトで、履歴とツールの結果も出す
- **デメリット**: CI の検査（数秒で全 PR）と月次の材料（git の履歴を読み、外部のツールを流す）は目的が違い、検査を重くする（ADR-016 決定10 と同じ理由）

## 決定理由

- 1つの PR では判断できない兆候は、止めるより、一覧にして人（とエージェント）が選ぶほうが向いている
- 課題の候補にするには、誤検知を除く判断が要る。集計はスクリプトで揃え、判断は skill に寄せる
- 依存の無いツールは版の固定だけで中身が決まり、CI・EAS の install を重くしない。依存のあるツール（knip）は lockfile で固定する

## 影響

### ポジティブな影響

- 変更の集中・隠れた結び付き・重複・未使用のコードが、毎月 Plane の課題の候補として見える
- baseline・除外の片付けの進み具合（ADR-016 決定6）を毎月見られる

### ネガティブな影響・トレードオフ

- knip は mobile の devDependency なので、mobile CI・EAS の install に入り、dependabot の更新の PR が増える
- jscpd・vulture は lockfile に載らないので、dependabot は版を上げない。上げるのは `report-health.py` の定数を手で変えるとき
- vulture は信頼度 60% の項目に誤検知が多い（列挙の値・ORM の属性）。設定で除けないものは、毎月 skill で判断する
- 一緒に変わる組は、コミットの粒度に左右される（1つの課題を1コミットにまとめると組が増える）。数字は傾向として読む

### 移行・対応が必要な事項

- Orca の automation に `/code-health-review auto` を月次で登録する（skill の「定期実行」。ユーザーが行う）
- 初回の棚卸しで、knip が未使用と出す依存（`@expo/ui`・`expo-device`・`expo-font`・`expo-glass-effect`・`expo-symbols`）が本当に不要かを確かめる。
  config plugin・ネイティブから使うものなら `knip.jsonc` の `ignoreDependencies` に理由つきで足す
- Codex 側への適応（決定6）

## 関連情報

- [ADR-016](./ADR-016-code-structure-ratchet-check.md)（構造の検査。決定6 で baseline を月次で見ると決めている。決定10 の `survey-structure.py`）
- [ADR-017](./ADR-017-function-complexity-lint-rules.md)（関数の単位の linter のルールと、除外を baseline とする扱い）
- `scripts/code-health/report-health.py`、`.claude/skills/code-health-review/SKILL.md`、`packages/mobile/knip.jsonc`、`packages/backend/pyproject.toml` の `[tool.vulture]`
- Plane: SS-252、SS-253、SS-254、SS-255（この ADR）
