---
name: project_ss88_pin_photo_confirm_review
description: SS-88ピン登録PRのレビュー結果要点。写真確定処理の冪等性バグ(Critical)と並行性ギャップ(Warning)
metadata:
  type: project
  scope: task-local
  source_issue: SS-88
  verify_by: 2026-12-31
---

SS-88（`ss-88`ブランチ、2026-09-21時点）の backend レビュー（sanpo_maps/pinsドメイン、
写真の先行アップロード→確定、ADR-009）で見つけた指摘の要点（詳細な file:line は
レビュー実施時のPRコメント・レビュー結果を参照。本メモリは要点の記録用）。

**Critical（要修正）**: `pins/service.py::PinService._prepare_photos()` が、
backend-plan.md 5.5 手順3で明示的に設計されていた「アップロード枠が真に同時な
リトライで既に `attached` 済みなら、同じ冪等ターゲット（`client_pin_id`のピン /
同じピン）への再送として成功扱いにする」処理を実装していない。
`PinPhotoUploadRepository.find_attachment()`（`(pin_id, client_pin_id)` を返す設計）は
`add_photos()` 内の事前チェックでのみ使われ、`create_pin()` の `_prepare_photos` 呼び出し
経路には組み込まれていない。結果、写真付き `POST /pins` を真に同時にリトライ
（1回目が確定処理中＝最大20秒の間に2回目が届く）すると、2回目は
`lock_for_attach`（`FOR UPDATE`）で1回目のcommitまでブロックされた後、
`status="attached"` を見て `PinPhotoUploadNotReadyError`(409) を返してしまう
（ADR-003決定3の冪等契約＝200+既存ピンを返すべき）。既存テスト
（`test_idempotent_resend_returns_existing_without_reprocessing` 等）は逐次リトライ・
写真なしのケースしか検証しておらず、このバグを検出しない。

**Why:** バックエンドプラン（backend-planner が書く `tmp/<issue>/backend-plan.md`）は
並行性・冪等性のエッジケースをかなり具体的に設計するが、実装がその一部（特に
「複数の経路で共有されるヘルパー関数の中の1分岐」）を実装し忘れても、テストが
「逐次リトライ」しかカバーしていないと気づかれずに残る。プラン文書の記述と
実装を突き合わせる際、"文章として存在する設計判断が、実際にどのコードパスまで
波及すべきか"（今回は `create_pin` と `add_photos` の両方が `_prepare_photos` を経由する
ので、本来この分岐は共有ヘルパー側に必要）を辿らないと見逃す。

**Warning（要検討）**: 確定時の実サイズ容量再チェック（`_prepare_photos` 内、
`sum_attached_bytes`/`sum_reserved_bytes` の読み取り）が、枠発行時のみ使われる
`PinPhotoUploadRepository.acquire_user_lock()`（`pg_advisory_xact_lock`）で保護されて
いない。同一ユーザーの同時確定リクエストがそれぞれ単体ではクォータ内でも合算では
超過するケースを、ロック無しで通してしまいうる。

**Warning（要検討）**: `PhotoAttacher.commit()`（サムネイルPut→CopyObject）が
`prepare()`と違い逐次実行かつ `confirm_deadline_seconds` の対象外。boto3の
`retries={"mode":"standard","max_attempts":3}`と組み合わさると、S3不調時に
Lambdaの29秒ハード制限を超えてungracefulに落ちるリスクがあり、設計意図
（503で安全に倒す）を満たさない経路が残っている。

**How to apply:** SS-88後続PR（BK-1〜BK-10）や `pins/service.py`/`photo_attacher.py`を
触るPRを見たら、上記3点が対応済みか確認する。特に「同時再送でattached済み→
idempotentに倒す」分岐が `create_pin` 経路にも入ったか、`_prepare_photos`の呼び出し元
両方（`create_pin`/`add_photos`）でテストされているかを見る。ADR-009にはこの
エッジケースの記述が無いため、修正時にADR追補も検討する。

**さらに一般化できる教訓**: バックエンドプランの「5.5 処理順序」のような詳細な
擬似コード的記述は、実装レビュー時に**プランの文章と実装コードを1行ずつ突き合わせる
価値がある**（今回のように、共有ヘルパーの1分岐だけが抜け落ちるパターンは
diffレビューだけでは気づきにくい）。

関連: [[backend-layering-conventions]]
