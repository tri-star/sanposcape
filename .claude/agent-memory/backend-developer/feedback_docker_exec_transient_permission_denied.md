---
name: docker-exec-transient-permission-denied
description: サンドボックスでdocker compose execを短間隔で連続実行するとdocker/config.jsonのpermission deniedが散発する
metadata:
  type: feedback
---

このsandbox環境で `docker compose exec ...` を複数のBashツール呼び出しとして立て続けに実行すると、
`WARNING: Error loading config file: open /home/tristar/.docker/config.json: permission denied` /
`permission denied while trying to connect to the docker API at unix:///var/run/docker.sock`
というエラーが散発的に出ることがある（8回中数回など、非決定的）。単発で少し間を置いて再実行すると
成功する。`docker compose ps` は同じタイミングで成功することもあり、`exec` 特有で起きやすい。

**Why:** sandboxのファイルシステム/ネットワーク許可チェックがBashツール呼び出しごとに再評価される
ためと思われる（原因は未特定）。テストコード自体の flaky ではなく、環境側の一過性の問題。

**How to apply:** `docker compose exec` を連続実行して permission denied が出た場合、テストや
実装コードを疑う前に、まず同じコマンドを単発でもう一度実行してみる。何度も安定性を確認したい場合は
`docker compose exec api sh -c 'for i in 1 2 3; do uv run pytest ...; done'` のように、
**1回のBashツール呼び出し内でコンテナ内シェルのループを使う**と、Bashツール呼び出し境界をまたがず
安定して繰り返し実行できる（SS-10ローカルレビューB-2のwith_for_update()並行テストの安定性確認で
この方法を使い、8回連続成功を確認した）。
