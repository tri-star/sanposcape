---
name: sandbox-network-docker-exec
description: このサンドボックス環境ではホストのbashからdocker portマッピング経由のlocalhostアクセスができない。手動疎通確認はdocker compose exec内から行う
metadata:
  type: feedback
---

このリポジトリ（sanposcape）の開発環境で `docker compose up` した `api` コンテナに対し、
Bashツールから直接 `curl http://localhost:<BACKEND_API_PORT>/...` を実行すると
`Connection refused` になる（sandboxのネットワーク名前空間がbashツール呼び出しごとに
分離されている可能性があり、ホスト側にポートフォワードされているはずのポートへ到達できない）。

**Why:** SS-10（認証API実装）でエンドポイントの手動疎通確認（curl）を行おうとした際に発覚。
`docker compose exec api curl ...` や `docker compose exec api python -c "...urllib.request..."`
のように**コンテナ内から**リクエストを送ると問題なく到達できる。

**How to apply:** 手動疎通確認・スモークテストが必要な場面では、最初から
`docker compose exec api python -c "import urllib.request; ..."` （または `curl` がコンテナに
入っていればそれ）を使う。ホストのbashから直接 `curl localhost:<port>` を試みて時間を溶かさない。
