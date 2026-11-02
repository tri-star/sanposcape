# ADR-017: 関数の複雑度・長さ・依存の数・循環 import は ruff・oxlint のルールで止め、既存の違反はファイル単位の除外に課題と理由をつけて据え置く

## 日付

2026-11-02（SS-253）

## コンテキスト

コードの読みやすさを保つ仕組みを4段で入れている（SS-252〜SS-255）。SS-252 ではファイル・フォルダの単位（ファイルの行数・フォルダのファイル数・接頭辞の集中）を
`scripts/code-health/check-structure.py` で測り、ラチェット方式で止める（ADR-016。SS-252 で作成。この ADR の作成時点では未マージ）。 <!-- doc-ref-ok: SS-252 で足すスクリプト。この ADR の作成時点では main に未マージ -->
関数の単位の兆候（複雑度・長さ・引数の多さ）と、依存関係の兆候（循環 import・1ファイルの依存の多さ）は、既存の linter のほうが得意なので linter のルールで止める。それがこの課題。

ADR-016 決定7 は、SS-253 の linter のルールも同じ方針にすると決めている。閾値は緩い値から始めて段階的に下げる。既存の違反は linter の除外の設定を baseline として扱い、各除外に片付ける課題と理由をコメントで残す。

SS-253 の時点の実測（既定の閾値での既存の違反）:

- backend（ruff 0.17.1。既定は max-complexity 10・max-branches 12・max-statements 50・max-args 5）: 68 件。
  そのうち PLR0913（引数の数）が 43 件ある。大半は pytest の fixture の注入と、キーワード専用引数を並べたリポジトリ・mapper の関数
- mobile（oxlint 1.89.0）: `max-lines-per-function` を 50 行にすると 275 件。React のコンポーネントは JSX を含めて1関数になるため。
  `complexity` は既定の 20 で 6 件。`import/no-cycle` と `max-depth`（既定の 4）は 0 件

## 決定

1. **backend は ruff の `C901`・`PLR0912`・`PLR0913`・`PLR0915` を `select` に足す**（`packages/backend/pyproject.toml`）。閾値は次のとおり。

   | ルール | 既定 | 採用 |
   |---|---|---|
   | `C901`（`mccabe.max-complexity`） | 10 | 15 |
   | `PLR0912`（`pylint.max-branches`） | 12 | 15 |
   | `PLR0915`（`pylint.max-statements`） | 50 | 60 |
   | `PLR0913`（`pylint.max-args`） | 5 | 8 |

2. **mobile は oxlint に次のルールを足す**（`packages/mobile/.oxlintrc.json`）。

   | ルール | 閾値 |
   |---|---|
   | `complexity` | 20（既定） |
   | `max-depth` | 4（既定） |
   | `max-lines-per-function` | 200。空行・コメントは数えない |
   | `import/no-cycle` | 循環があれば失敗（`@/` のエイリアス越しも検出する） |
   | `import/max-dependencies` | 20。型だけの import は数えない（実行時の結合を作らないため） |

3. **既存の違反は、linter のファイル単位の除外を baseline として据え置く。** backend は `[tool.ruff.lint.per-file-ignores]`、mobile は `overrides` でルールを `off` にする。
   - 除外するのは、そのファイルで実際に違反しているルールだけにする。違反の無いルールまで除外すると、そのファイルの悪化を止められない（mobile の override で複数のファイルをまとめるときは、違反しているルールが同じファイルだけをまとめる）
   - 各除外のコメントに、片付ける課題（backend は SS-258、mobile は SS-259）と、今は分けない理由（どの関数が何をまとめて持っているか、実測の値）を書く
   - 除外を足して通すことは認めるが、課題と理由を書き、その PR の差分でレビューする（ADR-016 決定5 と同じ）
   - 片付けた PR で除外の行を消す。ruff・oxlint は使われなくなった除外を教えないので、消し忘れは検査では見つからない
4. **恒久の除外は、ルールの趣旨に合わないものだけにする。** 課題ではなく、恒久であることと理由をコメントに書く。
   - mobile のテスト（`*.test.ts(x)`）は `max-lines-per-function` を数えない。describe のコールバックが1つの関数になり、ケースを足すほど長くなるため。ファイルの長さは SS-252 の構造の検査が見る
   - mobile の `src/components/ui/icon/iconRegistry.ts` は `import/max-dependencies` を数えない。アイコンを並べる登録簿で、依存の数がそのまま登録したアイコンの数になるため
5. **閾値は既存の違反を片付けてから段階的に下げる。** 除外が減ったら（SS-258・SS-259）、閾値を既定へ近づけられるかを検討し、この ADR に追補する。
   下げるときに増える違反は、課題を起票して除外に載せる。閾値の値と理由はこの ADR が正本で、設定ファイルの値と揃える。
6. **mobile の `lib/`（`src/lib/**`・`src/features/*/lib/**`）から `react-native` を値として import することを `no-restricted-imports` で止める。**
   `lib/` は判定・整形の純粋関数の層で、Vitest でテストする（`packages/mobile/docs/folder-structure.md`）。この規則は文書にあったが、機械的な検査が無かった。SS-253 の時点の違反は 0 件。
   - 型だけの import（`import type`）は許す（`allowTypeImports`。トランスパイルで消える）
   - `no-restricted-imports` の override は後勝ちで置き換わる。そのため `lib/` の override に devTools の制限を再掲する。
     さらに `features/{walk,history,pin}/lib/**` には、その後ろの override で認証の制限も再掲する。
     順序と再掲は `src/config/oxlintRestrictedImports.test.ts` で検査する
7. **backend のモジュールの境界（ADR-011）に import-linter は入れない。** `sanpo_maps/tests/test_architecture.py` が、ADR-011 の規則のうち AST で判定できるもの（M1・M2・M4・M7・M8 と、M3 の import・M5 の Protocol の port）を検査している（M6 と M3 のコンストラクタの引数はレビューで見る）。
   その中には、import の向きだけでは書けない規則（commit は `service.py` だけ、Protocol の port を作らない）も含まれる。import-linter を足すと、境界の定義が2か所に分かれる。

## 検討した選択肢

### 選択肢1: 既定の閾値のまま、既存の違反をすべて除外に載せる

- **概要**: ruff・oxlint の既定の閾値を使い、違反しているファイルをすべて除外に載せる
- **メリット**: 新しく書く関数は最初から既定の閾値で止まる
- **デメリット**: backend で約 40 ファイル、mobile で 100 を超える関数が除外になる。除外したファイルでは、そのルールが新しい関数にも効かなくなる。
  除外が多すぎると「載せれば通る」ものになり、ADR-016 が避けたかった状態になる

### 選択肢2: 閾値を今の最大値に合わせる（除外を持たない）

- **概要**: 既存の最悪の値（backend の複雑度 28、mobile の関数 410 行など）を閾値にする
- **メリット**: 除外の管理が要らない
- **デメリット**: 閾値が緩すぎて、ほとんどの新しいコードを止めない。直すべき関数も課題として見えない

### 選択肢3: 緩い閾値から始め、残る違反はファイル単位の除外で据え置く（採用）

- **概要**: 決定1〜5のとおり。既存の違反の分布を見て、除外が十数ファイルに収まる値から始める
- **メリット**: 大きく外れた関数は今日から止まる。据え置いた違反は、課題と理由つきで一覧になる。ADR-016 と同じ進め方で覚えることが少ない
- **デメリット**: 既定より緩い閾値の間は、既定を超えるが採用の閾値には収まる関数を止めない

### 除外を行単位の `# noqa` / `oxlint-disable` コメントにする案

- **概要**: 違反している関数の定義の行に抑止のコメントを書く
- **メリット**: 除外が関数の単位になり、同じファイルの新しい関数には効く。ruff の `RUF100` で、使われなくなった `noqa` を検出できる
- **デメリット**: 除外がコードのあちこちに散り、一覧と課題の対応が見えにくい。ADR-016 決定7 の「設定の除外を baseline として扱う」と合わない。
  片付けが進んで除外が関数の数件になったら、行単位に寄せることを検討してよい

## 決定理由

- 関数の単位の兆候は linter のルールが正確に測れて、エディタ上でも気づける。ファイル・フォルダの単位は SS-252 の検査に任せ、役割を分ける
- 緩い閾値から始めれば、除外を少なく保ったまま今日から入れられる。除外に課題を必須にすると、据え置いたものが放置されにくい
- `lib/` の react-native の禁止は、違反が 0 件のうちに入れれば既存のコードを直さずに済む

## 影響

### ポジティブな影響

- 大きく外れた複雑な関数・長い関数・依存の多いファイル・循環 import が、増える時点で CI（`backend-ci`・`mobile-ci` の lint の step）に止められる
- 既存の違反が、設定ファイルの除外と課題（SS-258・SS-259）で一覧になる

### ネガティブな影響・トレードオフ

- 除外はファイル単位なので、除外したファイルに足した新しい関数には、そのルールが効かない
- 除外の消し忘れは検査で見つからない（決定3）。片付けの課題で消す
- PLR0913 はキーワード専用引数も数える。キーワード専用で取り違えの起きにくい関数でも、引数をまとめる型に寄せるか、除外の理由を書く必要がある
- `no-restricted-imports` の override の順序に意味がある。override を足すときは同期テストを通す

### 移行・対応が必要な事項

- SS-258（backend）・SS-259（mobile）で除外を片付け、閾値を下げられるか検討する
- SS-252 がマージされたら、この ADR の ADR-016 への言及をリンクにする
- feature 間の直接 import（walk ⇔ pin ⇔ history など）は禁止だが、まだ機械的な検査が無い。`no-restricted-imports` で止めるかは別の課題で決める

## 関連情報

- ADR-016（SS-252。コードの構造の検査とラチェットの運用。決定5〜7 がこの ADR の進め方の元）
- [ADR-011](./ADR-011-sanpo-maps-module-structure.md) 決定3（`sanpo_maps` のモジュール内規則 M1〜M8 と、その AST テスト）
- [mobile のフォルダ構造](../../packages/mobile/docs/folder-structure.md)（`lib/` は react-native を値 import しない）
- Plane: SS-253（この ADR）、SS-252、SS-258、SS-259
