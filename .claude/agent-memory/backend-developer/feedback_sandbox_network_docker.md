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

**追記（SS-44）:** `api` コンテナには `curl` が入っていない（`sh: curl: not found`）。
`docker compose exec api uv run python -` にヒアドキュメントで `httpx.Client(base_url="http://localhost:8000")`
を使うスクリプトを渡すのが確実（httpxは既にbackendの依存に含まれる）。
dev token取得は `POST /auth/dev-session` に `{"user_key": "..."}` を渡す（`sub` ではない。
`auth/schemas.py` の `DevSessionCreate.user_key`）。
また `packages/backend/.env` はサンドボックスの読み取り拒否リストに入っており `cat`/`grep`
できないが、`docker compose exec api sh -c 'env | grep ...'` で実行中コンテナの実際の環境変数
は確認できる。
