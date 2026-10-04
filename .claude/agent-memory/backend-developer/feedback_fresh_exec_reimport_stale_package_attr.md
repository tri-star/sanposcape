---
name: feedback-fresh-exec-reimport-stale-package-attr
description: sys.modules を差し替えて module を再 import するテストは、親パッケージ属性（sanposcape.main）も戻さないと後続の文字列 monkeypatch が古い module を指す
metadata:
  type: feedback
  scope: durable
---

`sys.modules.pop("sanposcape.main")` で再 import するテスト（aws_lambda/tests/test_api.py）は、import システムが親パッケージの属性 `sanposcape.main` も新 module で上書きする。`sys.modules` だけ戻すと、後続テストの `monkeypatch.setattr("sanposcape.main.build_x", ...)`（文字列指定は属性経由で解決）が古い module を指し、パッチが効かない。

**Why:** SS-183 で、aws_lambda の境界テストの counting フェイクがテスト実行順（test_api の後）でだけ効かず発覚した。単独実行では通るので気付きにくい。
**How to apply:** 再 import 系テストでは `sys.modules` と親パッケージ属性の両方を元に戻す。手書きの try/finally より `monkeypatch.delitem(sys.modules, ...)` と `monkeypatch.setattr(<親パッケージ>, "<名前>", 元の module)` を使うと、失敗経路でも teardown で確実に戻る（SS-183 のレビューで寄せた）。新テストで文字列パッチが「全体実行でだけ」効かないときはまずこれを疑う。
