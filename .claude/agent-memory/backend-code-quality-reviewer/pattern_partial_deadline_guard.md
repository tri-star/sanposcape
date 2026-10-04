---
name: pattern_partial_deadline_guard
description: 複数フェーズの処理で締め切り(deadline)が一部のフェーズにしか掛かっていない、または「呼ぶ前にだけ確認」で呼び出し中の時間が予算に入っていない非対称を見つける観点。SS-88 確定処理・SS-112 削除処理での実例つき。
metadata:
  type: feedback
  scope: durable
  adr: docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md
---

`deadline_seconds`/`monotonic` を受け取って時間予算を守る処理は、このコードベースでは
「Lambda の29秒に強制終了される前に、アプリ側で制御された応答（503/204）を返す」ために使われる。
次の2種類の非対称が繰り返し見つかっている。

1. **締め切りが最初のフェーズにしか掛かっていない**（SS-88 で発見、同 PR で修正済み）:
   `sanpo_maps/photos/photo_attacher.py` の `PhotoAttacher` は当初 `prepare()`（検証・サムネイル生成）
   だけが締め切り付きで、`commit()`（サムネイル Put・原本 Copy）と `cleanup_staging()` は無期限だった。
   現在は3フェーズとも同じ `deadline_at` を受け取り、`commit()` は Put の前・Put の後・全 Future
   集約後に確認する（docstring に経緯あり）。
2. **締め切りを「呼ぶ前だけ」確認し、呼び出し中の S3 の時間が予算に入っていない**（SS-112 PR #101）:
   boto3 の既定（3回試行 × (connect + read) + バックオフ）では1回の呼び出しが20秒を超えうる。
   削除経路（`sanpo_maps/photos/cleanup.py::PhotoObjectCleaner.delete_best_effort`）は
   「削除専用 client（`total_max_attempts=1`・短い timeout）＋ 2つ目以降のチャンクは
   残り時間 ≥ 1回の最悪時間のときだけ始める ＋ 締め切り + 1回の最悪時間 ≤ 25秒を起動時に検証」
   で解消済み。**確定処理（`commit()`/`cleanup_staging()`）は「呼ぶ前だけ確認」の構造のまま**で、
   これは「確定処理は503で再送すれば回復する」というユーザー決定による受容済みのトレードオフ
   （ADR-009 決定22 の 2026-09-26 追補に記録）。再指摘しない。

**How to apply:**
- 締め切り付きの多段処理を見たら、**すべてのネットワーク I/O フェーズ**（特に応答直前まで続く
  書き込み・削除フェーズ）が同じ締め切りの傘下にあるか確認する。
- 締め切りの判定が「呼ぶ前だけ」なら、1回の呼び出しの最悪時間（timeout × 試行回数）が
  予算に収まる設計か（専用 client・起動時検証など）を確認する。
- 時間予算の計算が他モジュールの定数（例: `integrations/aws/s3.py` の
  `_DELETE_TOTAL_MAX_ATTEMPTS = 1`）を前提にしているなら、その前提をテストで直接固定しているか
  確認する（SS-112 では `integrations/aws/tests/test_s3.py::test_delete_total_max_attempts_is_one`）。
  config.py は s3.py を import できない（逆依存）ため、コメントの相互参照だけで済ませがち。
