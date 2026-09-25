---
name: pattern_partial_deadline_guard
description: 複数フェーズの確定処理で、締め切り(deadline)チェックが最初のフェーズにしか無く、後続のS3/ネットワーク書き込みフェーズが無期限になる設計ミス。SS-88 pins/photo_attacher.py で発見。
metadata:
  type: reference
  scope: durable
---

SS-88（`pins/` ドメイン、写真の先行アップロード＋確定処理）のレビューで発見。

`pins/photo_attacher.py` の `PhotoAttacher` は2段階で確定処理を行う:
1. `prepare()`（HEAD/GET・Pillowデコード・サムネイル生成、`ThreadPoolExecutor` で並列）— `deadline_seconds`/`monotonic` を受け取り、各タスク開始前に締め切り超過を確認して `ObjectStorageUnavailableError`（503）に倒す。
2. `commit()`（サムネイルPUT・原本CopyObject、**逐次ループ**）— **締め切りの概念が一切無い**。
3. `cleanup_staging()`（staging削除、best-effort）— 同じく無期限（ただし失敗はWARNINGログのみで握りつぶすので実害は小さい）。

**問題:** boto3 の `Config(connect_timeout=2, read_timeout=5, retries={"mode": "standard", "max_attempts": 3})` では、S3が劣化した状況で1回の呼び出しが最悪 ~20秒前後まで伸びうる。`commit()` は写真1枚につきPUT+Copyの2回をこれを保護なしに直列で呼ぶため、Lambda の29秒ハードリミット・CloudFrontの30秒リミットに、写真がわずか数枚あるだけで到達しうる。SS-88の設計意図（確定処理は「Lambdaに強制終了される前にアプリ側で制御された503を返す」ことで、クライアントが安全に再送できるようにする）が、`prepare()` フェーズでしか実現されていない。

**How to apply:** 「タスクを複数フェーズに分けて締め切りを設ける」設計（`deadline_seconds`/`monotonic` を受け取るクラス）を見たら、**すべてのネットワークI/Oフェーズ**（特にAPIのレスポンスを返す直前まで実行される書き込み・削除フェーズ）が同じ締め切りの傘下にあるか確認する。最初のフェーズ（検証・読み取り）だけ丁寧に締め切りを実装し、後続の書き込みフェーズ（PUT/Copy/Delete）が無期限のループになっている、という非対称は見落としやすい典型パターン。関連: [[pattern_select_then_delete_race]] と同様、「一見丁寧に設計された安全機構が、対称的に適用されていない」系の指摘。

**追記（2026-09-26, SS-112 PR#101レビュー対応で一部解消）**: `pins/service.py` の削除経路
（`delete_pin`/`delete_photo` → `_delete_photo_keys_best_effort`）は、呼び出し中のS3の時間も
予算に含める形に修正済み（削除専用clientの導入＋「最初のチャンクは必ず試み、2つ目以降は
残り時間≥1回の最悪時間のときだけ始める」判定）。詳細は [[project_ss112_delete_time_budget_review]]。
一方、`pins/photo_attacher.py` の `commit()`/`cleanup_staging()`（確定処理側）はスコープ外として
意図的に未対応のまま残っている（ユーザー決定: 「確定処理は503で再送できる設計」）。次にこのファイルを
見るときも「まだ直っていない」という前提でよい。
