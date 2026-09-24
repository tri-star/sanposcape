---
name: pattern_secret_leak_log_guard_test
description: 機密情報（署名・トークン・ARN等）を意図的にログへ出さない実装には、caplogでそれを固定する回帰テストを書く慣習が確立している。新規ログ追加時は必ずこのテストの有無を確認する。
metadata:
  type: reference
  scope: durable
---

`packages/backend/src/sanposcape/integrations/aws/tests/test_secrets.py`
（`test_resource_not_found_is_logged_without_secret_and_reraised`）に確立された精度の高い先例:

```python
assert any("ResourceNotFoundException" in r.getMessage() for r in caplog.records)
# ARN そのものはログに出さない
assert all(_ARN not in r.getMessage() for r in caplog.records)
```

「意図的にログへ出さない」というコメント（例:
`pins/service.py` の `create_upload` にある
「★ `form.fields` は絶対にログへ出さないこと（policy / 署名 / 一時認証情報を含む）」）を見つけたら、
上記と同じ形の `caplog` ベースの回帰テストが実際に存在するか確認する。SS-88 の
`PinPhotoUploadService.create_upload`（2026-09時点）には当初このコメントがあるにもかかわらず
対応する `caplog` テストが無く Important として指摘した。

**追記（2026-09-24 時点で解消済み）**: `pins/tests/test_service.py::
TestPinPhotoUploadServiceCreateUpload::test_logs_upload_id_and_key_without_leaking_form_fields`
が追加され、`test_secrets.py` と同じ形（メッセージに `form.fields` の値が含まれないことを
assert）で固定されている。SS-111（閲覧API）レビュー時に確認。今後この関数を触るレビューで
再度このテストの有無を疑う必要はない（消えていないか確認する程度でよい）。

**How to apply:** 新しいログ出力（`logger.info/warning/error`）を追加した diff で、
「このフィールドは出さない」という注意コメントが付いているのに `caplog` での固定テストが
伴っていない場合、`test_secrets.py` の形を提案する（メッセージに機密値が含まれないことを
assert する）。将来のリファクタで `%s` に丸ごとオブジェクトを渡してしまう事故を検知できる。
