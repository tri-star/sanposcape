---
name: feedback-import-order-and-lru-cache-test-techniques
description: 「import順序が意味を持つ」契約や「lru_cacheのcache_clear呼び出し」を回帰テストする際に使えるテクニック
metadata:
  type: feedback
  scope: durable
---

pytest はテスト collection フェーズで対象パッケージの多くのモジュールを先に import してしまうため、
「モジュール A の import 時点で副作用 X が起きないこと」「モジュール B の import が
モジュール C の処理より前に起きること」のような **import 順序そのもの** を検証したい場合、
単純に `import module` を書いても既にキャッシュ済みの `sys.modules` が返るだけで検証にならない
（SS-67 の `database.py` 遅延生成契約 / `aws_lambda/api.py` のハイドレーション順序契約で遭遇）。

**Why:** これらの契約はコードレビューだけでは壊れたことに気付きにくい（順序を入れ替えても
import 自体は成功するため）。実行時の順序保証を機械的に固定しておかないと、リファクタ時に
静かに壊れる。

**How to apply:**
- 「import 時点で特定の関数が呼ばれないこと」を検証したい場合:
  `importlib.util.find_spec(module_name)` → `module_from_spec` →
  `sys.modules[alias] = module` → `spec.loader.exec_module(module)` → `finally` で
  `sys.modules.pop(alias, None)` という手順で、**別名の使い捨てモジュール**として fresh import する。
  これなら対象モジュールが定義するクラス（例: SQLAlchemy の `Base`）が他コードの参照と
  衝突せず、後片付けも `sys.modules` から pop するだけで済む。
- 「モジュール X の import（＝その中の重い初期化処理）がモジュール Y の import より
  **前に** 起きること」を検証したい場合は、上記の別名テクニックだけでは不十分
  （Y 側が `from Y import something` のような絶対 import をしていると、Python の import
  システムは Y を正規名 `sys.modules["Y"]` にキャッシュしてしまうため）。この場合は:
  1. 検証したい呼び出し順を記録する `call_order: list[str]` を用意
  2. 順序の起点となる関数（例: シークレットのハイドレーション関数）と、順序の終点で
     呼ばれる関数（例: 設定を構築する `get_settings`）の両方を `monkeypatch.setattr` で
     スパイに差し替え、呼ばれたら `call_order.append(...)` してから元の実装を呼ぶ
  3. 終点側モジュール（例: `sanposcape.main`）を `sys.modules.pop("sanposcape.main", None)`
     で**明示的に退避**してから、起点を含む親モジュールを fresh import する。これで
     `from sanposcape.main import app` が実際に再実行され、順序を観測できる
  4. `finally` で必ず元のモジュールオブジェクトを `sys.modules` へ戻す（戻し忘れると
     後続のテストが新しく生成された別インスタンスの `app` を掴んでしまう可能性がある）
  5. 最後に `assert call_order == [...]` で順序を固定する
- `functools.lru_cache` でラップした関数（例: `get_settings`）は、CPython では
  `monkeypatch.setattr(get_settings, "cache_clear", spy)` のように**インスタンス属性の
  上書きが可能**（`_lru_cache_wrapper` オブジェクトが属性代入を受け付ける）。
  「ある関数が確実に `xxx.cache_clear()` を呼ぶこと」をテストしたい場合、元の
  `cache_clear` を保持しておいて `spy` の中で呼び出しを転送すれば、副作用（実際に
  キャッシュがクリアされること）を保ったまま呼び出し回数だけを検証できる。
