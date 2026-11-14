---
name: aws-cli-copy-source-no-preencode
description: aws s3api copy-object の --copy-source は aws CLI（botocore）が自分で URL エンコードする。こちらで encodeURIComponent すると二重になり、空白・+・日本語のキーが NoSuchKey になる
metadata:
  type: feedback
  scope: durable
  source_issue: SS-166
---

S3 の CopyObject の API 文書には「x-amz-copy-source の値は URL エンコードすること」とある。これは HTTP のヘッダーへの要件で、aws CLI v2・botocore は
文字列で渡したコピー元を自分で percent-encode してヘッダーに載せる。SS-166 で `${bucket}/${encodeURIComponent したキー}` を渡していたところ、
レビュアーが `--debug` で `x-amz-copy-source: b/_astro/a%2520b%252Bc.js`（二重）を確かめた。ASCII の英数字だけのキーでは起きないので、テストでも本番でも気づきにくい。

**Why:** 文書の「エンコードすること」を CLI の引数への要件と読み違えた。偽の aws を使うテストは、引数の形を自分の思い込みで検査するので見つからない。

**How to apply:**
- aws CLI・SDK に渡す `--copy-source`（`CopySource`）は `バケット/キー` を生のまま渡す。`?versionId=` を付けるときだけ版の指定として解釈される。
- CLI の実際の送信内容は、ダミーの認証情報と `--endpoint-url http://127.0.0.1:9 --debug` で、ヘッダーを見て確かめられる（AWS に届かない）。
- `--tagging`（x-amz-tagging）は CLI がエンコードしないので、こちらで URL クエリの形にエンコードする。
