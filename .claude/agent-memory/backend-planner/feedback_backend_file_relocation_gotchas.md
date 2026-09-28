---
name: feedback-backend-file-relocation-gotchas
description: backend のファイル移動・モジュール統合のプランで見落としやすい点。docstring が OpenAPI の description になる、ロガー名・parents[N]・lock namespace の文字列、staleness 検査の末尾一致、__pycache__ が名前空間パッケージを残す
metadata:
  type: feedback
  scope: durable
---

「配置を動かすだけ」のリファクタ（SS-137 の sanpo_maps/pins 統合で洗い出した）でも、次の箇所は壊れやすい。
プランの不変条件・検証手順に必ず入れる。

- **Pydantic スキーマと router 関数の docstring は openapi.yaml の description になる**。パスを含む docstring
  （例: `pins/schemas.py の PinRead…`）を「ついでに」直すと openapi.yaml に差分が出て mobile CI が走る。
  openapi 差分ゼロが条件なら docstring は触らず、古くなった語は ADR に記録して次の API 変更で直す。
- **`logging.getLogger(__name__)` のロガー名が変わる**。`caplog.at_level(..., logger="sanposcape.x.service")`
  のテストを列挙して直す。INFO を拾うテスト（秘密情報のログ漏れ検査など）はロガー名がずれると失敗するので気付けるが、
  WARNING のテストは root の既定レベル次第で通ってしまうことがある。
- **`Path(__file__).parents[N]` で openapi.yaml 等を読むテスト**は階層が深くなると N がずれる。
- **advisory lock の namespace（`zlib.crc32(b"sanposcape.pins.…")` のような文字列）はモジュールパスではなくロックキー**。
  一括置換で書き換えると、デプロイの切り替わりで旧コードと新コードが同時に動く間は直列化が効かない。S3 キーの接頭辞
  （`staging/pins/…`）・URL パスも同様。置換は行頭の import 文に限定する。
- **`git mv` 後に旧ディレクトリに `__pycache__` だけが残ると、旧パッケージが名前空間パッケージとして import できる**。
  掃除して `test ! -e <旧パス>` を確認させる。
- **`scripts/knowledge/check-memory-staleness.py` はバッククォート内のパスを `git ls-files` の末尾一致で解決する**。
  サブパッケージ名を旧ドメイン名と同じにすると（`pins/` → `sanpo_maps/pins/`）短い参照が生き残り、更新対象が減る。
  逆に、パスが解決しても中身の主張が古いメモリは検査で見つからないので grep で拾う。git mv 前に一度実行して基準を取る。

**Why:** どれもテストや lint では「移動した」ことと無関係に見え、レビューでも見落としやすい。openapi 差分・mobile CI・
ロックの正しさという、配置変更と関係のない所で事故になる。

**How to apply:** ファイル移動・モジュール統合・パッケージ改名を含むプランでは、不変条件の表（OpenAPI の docstring、
ロガー名、lock namespace、S3 キー、ログ文言）と、`__pycache__` 掃除・staleness の前後比較を実装ステップに入れる。

関連: [[feedback-openapi-change-triggers-mobile-ci]] / [[feedback-check-sibling-tickets-before-shared-infra]]
