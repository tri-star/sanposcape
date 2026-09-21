---
name: feedback-boto3-s3-and-pg-advisory-lock-gotchas
description: SS-88実装で踏んだboto3 S3クライアントのendpoint_url罠・retries.max_attempts罠、pg_advisory_xact_lockの決定的キー導出、PydanticのSkipJsonSchema[None]パターン
metadata:
  type: feedback
  scope: durable
---

SS-88（`integrations/aws/s3.py`, `pins/repository.py`, `pins/schemas.py`）実装で確認した、
再発しやすい実装上の罠と、このリポジトリで採用したパターン。

**Why:** それぞれ気づきにくく（テストが通っていても本番挙動が変わる／テストの書き方次第で
バグを見逃す）、次に同種の実装をする際に同じ調査をやり直さないため。

**How to apply:**
- **boto3 S3クライアントに`endpoint_url`を明示するとpresigned URLのホストからリージョンが
  脱落する。** `boto3.client("s3", region_name=..., endpoint_url=f"https://s3.{region}.amazonaws.com", ...)`
  で作ると、`generate_presigned_url`/`generate_presigned_post`が返すホストが
  `<bucket>.s3.amazonaws.com`（リージョン無し）になった。`endpoint_url`を渡さず
  `region_name`だけ渡せば`<bucket>.s3.<region>.amazonaws.com`が正しく組み立つ
  （実機で確認済み、boto3のドキュメントには明記が無い）。
- **presigned URLの形はクライアントの`Config`（`signature_version`/`addressing_style`）に
  依存する。** Stubberでテストする際、テスト側で構築するclientの`Config`が実装側と
  異なると（例: 未指定でsignature_version="s3"のレガシー署名になる）、実装とは無関係な
  理由でURL形状のアサーションが失敗する/成功する。テストヘルパーは実装と同じ`Config`を
  明示的に使うこと。
- **`pg_advisory_xact_lock`の2引数版キーは、Python組み込みの`hash()`で作らない。**
  `PYTHONHASHSEED`のプロセスごとのランダム化により、同一値（例: user_idの文字列）でも
  Lambdaの実行環境（プロセス）が変わるとハッシュ値が変わり、異なるプロセスで処理される
  同一ユーザーの同時リクエスト間でロックが効かなくなる。決定的に導出する
  （`pins/repository.py::_advisory_lock_key`はUUIDの128bitを32bitずつXORで畳み込む）。
  namespace（key1）は`zlib.crc32(固定文字列) & 0x7FFFFFFF`のような固定値にし、他用途の
  advisory lockと衝突しないようにする。
- **boto3の`retries.max_attempts`（`mode="standard"/"adaptive"`）は「合計試行回数」ではない。**
  `integrations/aws/s3.py`の`S3ObjectStorage`が当初`retries={"mode": "standard",
  "max_attempts": 3}`としていたが、これは内部で「初回を除く再試行回数」として解釈され
  +1された値（=合計4回）が実際の試行回数になる。合計試行回数を直接指定したい場合は
  `total_max_attempts`を使う（`integrations/aws/appconfig.py`が`total_max_attempts: 1`
  で先に踏んでいた罠と同じ。SS-88のローカルレビューで再発を確認、修正済み）。この手の
  「新しい`boto3.client`のretries設定を書くたびに同じ罠を踏む」パターンなので、
  新規にAWS SDKクライアントを作る際は`total_max_attempts`を使う一択にする。
- **Pydantic v2で「省略可・明示nullは422・OpenAPI上はnon-nullable」を表現するパターン**:
  `field: T | SkipJsonSchema[None] = None` + `model_validator(mode="after")`で
  `"field" in self.model_fields_set and self.field is None`ならValueError。
  `model_fields_set`は「リクエストJSONにそのキーが存在したか」を返すため、省略時は
  チェックをすり抜け、明示`null`だけを弾ける。`pydantic.json_schema.SkipJsonSchema`から
  import する。
