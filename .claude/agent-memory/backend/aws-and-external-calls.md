---
name: aws-and-external-calls
description: 外部呼び出し（boto3・httpx・Apple）と CloudFormation の罠。締め切りは実行中の1回分も予算に入れる、boto3 は total_max_attempts、endpoint_url で presigned URL のリージョンが落ちる、httpx の単一 float timeout、Fn::Sub の変数マップの値は再評価されない、外部 API の応答の読み取りは実キーの生の応答を見てから決める
metadata:
  type: feedback
  scope: durable
  verify_by: 2027-09-30
---

## 1. 締め切りは「呼ぶ前だけ確認」では足りない。実行中の1回分も予算に入れる

時間予算（`*_DEADLINE_SECONDS` + `monotonic()`）を使う処理では、実行中の外部呼び出し1回の最悪時間
（boto3 なら `total_max_attempts ×（connect + read）+ バックオフ`）を見積もり、「締め切り + 1回の最悪時間 < Lambda の 29 秒」を示す。

**Why:** SS-112 の PR #101 で、ピン削除の S3 後始末が「呼ぶ前だけ確認」になっていた。S3 client が3回試行 ×（2 + 5）秒なので1回が21秒を超えうり、
締め切り直前に始めると DB commit 済みなのに 504 になりうる。決着（削除専用 client・2つ目以降のチャンクは残り時間で判断・起動時検証）は
ADR-009 決定22 の 2026-09-26 追補。

**How to apply:** 締め切りつきのループや並列処理では最初から次を決める。
- client の試行回数・timeout の根拠と「1回の最悪時間」の算出式
- 次の呼び出しを始めてよい条件（残り時間 ≥ 最悪時間）
- Settings の上限（`le`）と、組み合わせを起動時に検証するか
- botocore の `read_timeout` は「無通信の時間」の上限で合計時間の上限ではない。DNS も timeout の対象外。

## 2. boto3 クライアントの罠

**Why:** どれもテストが通っていても本番の挙動が変わるか、テストの書き方次第でバグを見逃す（SS-88・SS-98）。

**How to apply:**
- **retries は `total_max_attempts` を使う。** `Config(retries={"max_attempts": N})` の `max_attempts` は初回を除く再試行回数で、
  `max_attempts: 1` は合計2回になる。「再試行しない」は `total_max_attempts: 1`。新しいクライアントを書くたびに踏んできた
  （`integrations/aws/appconfig.py`・`s3.py` のコメントにも経緯がある）。
- **S3 クライアントに `endpoint_url` を渡さない。** 明示すると presigned URL のホストが `<bucket>.s3.amazonaws.com`（リージョン無し）になる。
  `region_name` だけ渡せば `<bucket>.s3.<region>.amazonaws.com` になる（実機で確認。boto3 のドキュメントに明記は無い）。
- **Stubber でテストするときは実装と同じ `Config`（`signature_version`/`addressing_style`）でクライアントを作る。** 違うと実装と無関係な
  理由で URL の形のアサーションが落ちる／通る。

## 3. httpx の timeout は `httpx.Timeout` でフェーズを分け、MockTransport で検証する

単一の float を渡すと connect / read / write / pool の全フェーズに同じ値が効き、短く保ちたい connect timeout を上書きする
（SS-33。`integrations/google_maps/client.py` は `httpx.Timeout(timeout_seconds, connect=min(connect_timeout, timeout_seconds))`。ADR-007 決定4）。

**How to apply:** 実際に適用された timeout は、`httpx.MockTransport` の handler 内で `request.extensions["timeout"]` を読むとフェーズ別の dict で取れる。
これを assert すれば実通信なしで回帰テストにできる。

## 4. CloudFormation `Fn::Sub` の変数マップの値に書いた `${...}` は再評価されない

```yaml
# NG: AppId の値の中の ${Env} は解決されず、文字どおり "${Env}" が残る
Resource: !Sub
  - 'arn:aws:appconfig:...:application/${AppId}/...'
  - AppId: '{{resolve:ssm:/sanposcape/${Env}/platform/appconfig/application_id}}'
# OK: 値自体を !Sub で包む
  - AppId: !Sub '{{resolve:ssm:/sanposcape/${Env}/platform/appconfig/application_id}}'
```

**Why:** SS-98 でプランの擬似コードがこの罠を含んでいた。`sam validate --lint` は意味論のバグを検出できず、デプロイすると IAM の `Resource` が
実リソースと一致せず黙って `AccessDenied` になる。第1引数に直接 `${...}` を書く形や単一引数の `!Sub '...${Env}...'` は問題ない。

**How to apply:** template.yaml を書く・レビューするとき、`!Sub` の第2引数（マップ）の値に `${...}` があれば、値全体がもう一段 `!Sub` で
包まれているか確認する。包んだ形が正しく解決されることの裏取りと、環境ごとの初回デプロイでの確認手順は deployment.md §11
「各環境への初回デプロイで 1 回だけ確認すること」にある。

## 5. Sign in with Apple を触るときの小技

決定と罠の本体は ADR-002 の SS-195/197/198 追補にある。ADR に無い2点だけ:
- Apple の公式ドキュメントは JS 描画なので、`developer.apple.com/tutorials/data/documentation/signinwithapplerestapi/<slug>.json` を読む。
- 常に鍵を返すフェイク JWKS では、JWT でない入力の `DecodeError` の経路を通らない。その経路は `DecodeError` を投げるフェイクでテストする。

関連: [[planning-checklist]]

## 6. 外部 API の応答の読み取りは、実キーの生の応答を見てから決める

SS-212 では、Geocoding API の結果の並びを想像で組んだテスト（MockTransport）が通ったのに、エミュレータで実キーを使うと
住所が「…4-1 丸の内ビルディング 5階 丸の内ビルディング」と重なった。実際は先頭に入居者の施設・駅の結果が来て、
番地の結果が隣の建物の名前を付けることもあった（取り方の決定は ADR-001 SS-212 追補）。

**How to apply:**
- 応答の読み取りを変えるときは、api コンテナの中で実キーの生の応答（必要なフィールドだけ）を数地点ぶん表示して並びを確かめる。
  キーは `get_settings()` から読み、出力にキー・利用者 ID を出さない。
  ```bash
  docker compose -p <project> -f packages/backend/compose.yaml exec -T api uv run python - <<'PY'
  import httpx
  from sanposcape.config import get_settings
  r = httpx.get("https://geocode.googleapis.com/v4/geocode/location",
      params={"locationQuery": "35.68128,139.763681", "languageCode": "ja", "regionCode": "JP"},
      headers={"X-Goog-Api-Key": get_settings().google_maps_server_api_key,
               "X-Goog-FieldMask": "results.formattedAddress,results.addressComponents,results.types,results.bounds"})
  for res in r.json().get("results", []): print(res.get("types"), res.get("formattedAddress"))
  PY
  ```
- 見た並びをそのままテストのフィクスチャに写し、docstring に「実キーで◯◯付近を引いたときの並び」と書く。
- 修正後は `HttpGoogleMapsProvider(get_settings()).reverse_geocode(...)` を同じ地点に当てて結果を確かめる。
  エミュレータでは端末（staleTime 無限）と backend（利用者ごと 300 秒）のキャッシュが残るので、api とアプリを再起動してから見る。
