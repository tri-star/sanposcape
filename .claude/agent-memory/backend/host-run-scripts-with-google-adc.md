---
name: host-run-scripts-with-google-adc
description: Google（Firestore・GCS）を ADC で読む一回限りのスクリプトはホストで uv run --no-project で動かす。storage.Client() はプロジェクトを渡さないと OSError、sandbox は Google のホストの許可が要る、例外を型だけにすると原因が見えないので最小の再現で確かめる
metadata:
  type: feedback
  scope: durable
  source_issue: SS-238
---

SS-238（walkshare の移行の書き出し）で、ホストから ADC で Firestore と GCS を読んだときの落とし穴。

- **コンテナでは動かせない。** compose は `packages/backend` だけを `/app` にマウントするので、リポジトリの `tmp/` も ADC（`~/.config/gcloud`）も無い。
  ホストで `uv run --no-project --python 3.12 --with <google-cloud-...> --with pillow` とし、`sanposcape` の純粋なモジュール（`tag_labels` など）は `PYTHONPATH=src` で import する。
  `pins/schemas.py` などは pydantic・sqlalchemy まで引き込むので `--no-project` では import できない（値を写してコンテナのテストで照合する）。
- **`google.cloud.storage.Client()` はプロジェクトを渡さないと `OSError`**（"Project was not passed and could not be determined"）。ADC がユーザーの認証だとプロジェクトが決まらない。
  `Client(project=...)` に渡し、課金は `GOOGLE_CLOUD_QUOTA_PROJECT=<project>` で指定する。Firestore の `Client(project=...)` も同じ。
- **sandbox の通信**: `allowed_domains` に `firestore.googleapis.com`・`storage.googleapis.com`・`oauth2.googleapis.com`・`play.googleapis.com` を入れる。
- **出力を例外の型だけにしたスクリプトは、失敗の原因が見えない。** 個人のデータを出さないために `str(e)` を捨てる作りなら、どこで落ちたかを
  連番で示すか、疑わしい呼び出しだけの最小の再現（個人のデータを含まない）で確かめる。SS-238 は `OSError` だけが出て、`storage.Client()` の再現で原因が分かった。
- ruff の E501 は全角を幅2で数える。日本語の docstring・コメントは 100 桁を超えやすいので、書いた後にまとめて `ruff check` で拾う。
