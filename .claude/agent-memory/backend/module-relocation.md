---
name: module-relocation
description: backend のファイル移動・モジュール統合・パッケージ改名で壊れやすい文字列（docstring＝OpenAPI description、ロガー名、parents[N]、lock namespace・S3 キー）、__pycache__ の名前空間パッケージ、ファサード経由の monkeypatch、AST アーキテクチャテストの書き方
metadata:
  type: feedback
  scope: durable
---

「配置を動かすだけ」のリファクタ（SS-137 の sanpo_maps/pins 統合、SS-181 の core/observability.py 3 分割）で洗い出した落とし穴。
SS-137 で変えてはいけないものの一覧は ADR-011 決定5「変えてはいけないもの（不変条件）とロガー名の変化」。

**Why:** どれもテストや lint では「移動した」ことと無関係に見え、レビューでも見落としやすい。openapi 差分・mobile CI・ロックの正しさという、
配置変更と関係のない所で事故になる。検査が緑のまま抜け穴を残すこともある。

**How to apply:** ファイル移動・統合・改名を含む作業では、不変条件の表（OpenAPI の docstring、ロガー名、lock namespace、S3 キー、ログ文言）と、
`__pycache__` の掃除・staleness 検査の前後比較を手順に入れる。

## 1. 動かすと壊れる文字列

- **Pydantic スキーマと router 関数の docstring は openapi.yaml の description になる。** パスを含む docstring を「ついでに」直すと yaml に差分が出て
  mobile CI が走る。openapi 差分ゼロが条件なら docstring は触らず、古い語は ADR に記録して次の API 変更で直す（[[api-contract-and-openapi]]）。
- **`logging.getLogger(__name__)` のロガー名が変わる。** `caplog.at_level(..., logger="sanposcape.x.service")` のテストを列挙して直す。INFO を拾う
  テスト（秘密情報のログ漏れ検査など）は気付けるが、WARNING のテストは root の既定レベル次第で黙って通ることがある。ログの `logger` フィールドを
  変えたくないなら、元の名前を文字列で固定する。
- **`Path(__file__).parents[N]` で openapi.yaml 等を読むテスト**は、階層が深くなると N がずれる。
- **advisory lock の namespace（`zlib.crc32(b"sanposcape.pins.…")`）はモジュールパスではなくロックキー。** 一括置換で書き換えると、デプロイの
  切り替わりで旧コードと新コードが同時に動く間は直列化が効かない。S3 キーの接頭辞（`staging/pins/…`）・URL パスも同様。置換は import 文に限定する。

## 2. 移動の後始末

- **`git mv` 後に旧ディレクトリに `__pycache__` だけが残ると、旧パッケージが名前空間パッケージとして import できてしまう。** 掃除して `test ! -e <旧パス>` を確認する。
- **旧モジュールを再エクスポートのファサードとして残すと、旧モジュールへの `monkeypatch.setattr` が実体に効かない。** 関数が読むのは定義元のグローバルで、
  `from x import f` した側が呼ぶ関数は呼ぶ側のモジュールの名前を patch する必要がある。private 名をファサードから再エクスポートしなければ、
  直し漏れは `AttributeError` で必ず気づける。
- ファイルを横断して import を切り出したら、最後に grep をやり直す（手作業の書き換えで移動先を取り違えやすい。`ruff check` の F821 と collection エラーが手掛かり）。
- `git diff --cached -M --stat` で、中身が同じ空の `__init__.py` 同士は誤ってペアリングされる（rename のはずが add に見える）。`git mv` の誤りではない。

## 3. staleness 検査（`scripts/knowledge/check-memory-staleness.py`）との関係

- バッククォート内で既知の拡張子で終わるトークンを、`git ls-files` の末尾一致でパスとして解決する。サブパッケージ名を旧ドメイン名と同じにすると
  （`pins/` → `sanpo_maps/pins/`）短い参照が生き残り、更新対象が減る。逆に、パスが解決しても中身が古いメモは検出されないので grep で拾う。
  移動の前に一度実行して基準を取る。
- agent-memory で削除済みファイルを経緯として書くときは、バッククォート + 拡張子付きのパスにしない（その言及が「存在しないパス」として検出される）。
  地の文で書くか、クラス名・テスト名で言及する。

## 4. AST によるアーキテクチャテスト（`sanpo_maps/tests/test_architecture.py`）を書く・直す

規則 M1〜M9 は ADR-011 決定3 が正本。
- 検査対象の除外条件（`conftest.py`・`__pycache__`・`tests/`）は1つのヘルパーに集約する（直下だけ見る検査に独自の `glob("*.py")` を書いたら `conftest.py` 自身を誤検出した）。
- `from X import Y` は `X` だけでなく `X.Y` も import 候補にする（`from sanposcape.sanpo_maps import maps` で依存方向の違反をすり抜けるため）。
  そのうえで公開面の許可リストは「公開面そのもの、または `<公開面>.` で始まる」の prefix 判定にする（完全一致だと `...models.Pin` を誤検出する）。
- 検査を足したら、違反を一時的に入れて落ちることを1件ずつ確かめる（戻し方は common の [[verification-revert-without-git-checkout]]）。
  既知のファイルが走査対象に含まれることを見る番兵テストも置く。

関連: [[testing]]
