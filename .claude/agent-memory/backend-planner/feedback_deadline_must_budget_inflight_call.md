---
name: feedback-deadline-must-budget-inflight-call
description: 締め切り(deadline)を「呼ぶ前だけ確認」で設計すると実行中の外部呼び出しが予算外になる。boto3 の試行回数×timeout まで見積もってプランに書く
metadata:
  type: feedback
  scope: durable
---

時間予算（`*_DEADLINE_SECONDS` + `monotonic()`）を使うプランでは、「呼ぶ前に締め切りを確認する」だけでは不十分。
実行中の外部呼び出し1回の最悪時間（boto3 なら `total_max_attempts ×（connect + read）+ バックオフ`）を見積もり、
「締め切り + 1回の最悪時間 < Lambda 29 秒」が成り立つかを必ずプランに書く。

**Why:** SS-112 の PR #101 で、ピン削除の S3 後始末（`delete_many` のチャンクループ）が「呼ぶ前だけ確認」になっていた。
S3 client が3回試行 ×（2 + 5）秒なので、1回が 21 秒を超えうる。締め切り 10 秒の直前に始めると 29 秒を超え、
DB commit 済みなのに 504 になりうる、と Copilot に高重要度で指摘された。
ユーザー決定: best-effort の削除は再試行なし・短い timeout の専用 client にし、2つ目以降のチャンクは
「残り時間 ≥ 1回の最悪時間」のときだけ始める。確定処理（`pin_photo_confirm_deadline_seconds`）にも同じ構造が残っている。

**How to apply:** 締め切りつきのループや並列処理を計画するときは、次の4点を最初から決めておく。
- client の試行回数・timeout の根拠
- 「1回の最悪時間」の算出式
- 次の呼び出しを始めてよい条件（残り時間 ≥ 最悪時間）
- Settings の上限（`le`）と、組み合わせを起動時に検証するかどうか

注意点が2つある。botocore の read_timeout は「無通信の時間」の上限で、合計時間の上限ではない。DNS も timeout の対象外。
関連: backend-code-quality-reviewer の [[pattern_partial_deadline_guard]]。
