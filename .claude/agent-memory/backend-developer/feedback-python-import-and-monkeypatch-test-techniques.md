---
name: feedback-python-import-and-monkeypatch-test-techniques
description: import 順序の契約・lru_cache の cache_clear 呼び出しを回帰テストするテクニック（別名 fresh import・sys.modules 退避・属性 spy）と、モジュール定数の monkeypatch は import 先の namespace を対象にする罠
metadata:
  type: feedback
  scope: durable
---

pytest は collection で多くのモジュールを先に import するため、「import 順序」や「モジュール定数」を検証・差し替える
テストは素直に書くと何も検証していない状態になる（SS-67 の `database.py` 遅延生成契約・`aws_lambda/api.py` の
ハイドレーション順序契約、SS-42 の streak チャンク境界テストで遭遇）。

**Why:** 順序を入れ替えても import 自体は成功するので、コードレビューだけでは壊れたことに気付けない。
monkeypatch の対象を間違えると、テストは緑のまま境界条件を通っていない。

**How to apply:**

## 1. 「import 時点で特定の関数が呼ばれないこと」を検証する

`importlib.util.find_spec(name)` → `module_from_spec` → `sys.modules[alias] = module` →
`spec.loader.exec_module(module)` → `finally` で `sys.modules.pop(alias, None)`。
別名の使い捨てモジュールとして fresh import するので、そのモジュールが定義するクラス（SQLAlchemy の `Base` など）が
他コードの参照と衝突しない。

## 2. 「X の import が Y の import より前に起きること」を検証する

別名 import だけでは不十分（Y 側の絶対 import が正規名 `sys.modules["Y"]` にキャッシュされるため）。
1. `call_order: list[str]` を用意する。
2. 起点（例: シークレットのハイドレーション関数）と終点（例: `get_settings`）を `monkeypatch.setattr` で spy に
   差し替え、`call_order.append(...)` してから元の実装を呼ぶ。
3. 終点側モジュール（例: `sanposcape.main`）を `sys.modules.pop(...)` で明示的に退避してから、起点を含む
   親モジュールを fresh import する。
4. `finally` で元のモジュールオブジェクトを `sys.modules` に戻す（戻し忘れると後続テストが別インスタンスの
   `app` を掴む）。
5. `assert call_order == [...]` で固定する。

## 3. `lru_cache` 関数の `cache_clear` 呼び出しを検証する

CPython では `monkeypatch.setattr(get_settings, "cache_clear", spy)` のようにインスタンス属性を上書きできる。
元の `cache_clear` を保持して spy から転送すれば、実際のクリアを保ったまま呼び出し回数だけを検証できる。

## 4. モジュール定数の monkeypatch は import 先の namespace を対象にする

`walks/stats.py` の `WALK_STATS_STREAK_CHUNK_SIZE` を `walks/service.py` が
`from ... import WALK_STATS_STREAK_CHUNK_SIZE` している場合、`monkeypatch.setattr(stats_module, ...)` は効かない。
service 側が import 済みの名前を見ているので `monkeypatch.setattr(service_module, ...)` にする。
チャンク境界越えのテストを書くときは特に注意。
