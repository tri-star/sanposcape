---
name: feedback_sandbox_constraints
description: sandbox が拒否する操作（.env編集・localhostへのcurl・dockerソケット・~/.aws・キャッシュ所有権）とそれぞれの回避策。「できない」と結論する前にここを読む
metadata:
  type: feedback
  scope: durable
---

sandbox モードで拒否・失敗する操作と回避策をまとめたもの。**「この環境では〇〇ができない」と
結論する前にここを確認する。** 実際には回避策があるのに検証を丸ごと諦めた事故が過去に起きている。

## `packages/backend/.env` は読み書きともに拒否される

Edit ツールでも Bash の `sed -i` でも書き込みが permission deny になり、`cat` / `grep` での
読み取りも拒否リストに入っている。**Why:** APIキー等の秘密情報を含みうるため、エージェントによる
直接編集を構造的に禁止している（意図的な安全策）。

**How to apply:**
- `MAPS_MODE=fake` や `GOOGLE_MAPS_LOOP_ROUTE_ENABLED=false` のような一時的な設定切替は
  `.env` を編集せず、シェル環境変数プレフィックス付きで `docker compose up -d` する
  （`compose.yaml` の `environment: KEY: ${KEY:-default}` がホストのシェル変数を拾う）。例:
  `MAPS_MODE=fake docker compose -p <project> -f <compose.yaml path> up -d`。
  環境変数プレフィックスが付いていても sandbox 内で問題なく実行できる（2026-09-15、SS-33で確認）。
- 確認が終わったらプレフィックス無しで `up -d` し直し、既定設定（`.env` の値）へ戻すこと。
- `compose.yaml` の `environment:` に列挙されていない設定（`GOOGLE_MAPS_READ_TIMEOUT_SECONDS` 等、
  安全な既定値を持つとして省略されているもの。`docs/local-env.md` の省略リスト参照）は
  この方法では上書きできない。テストコードで `Settings(...)` を明示構築して検証する。
- 実行中コンテナの実際の環境変数は `docker compose exec api sh -c 'env | grep ...'` で確認できる。

## ホストの bash から `localhost:<port>` へ到達できない

`docker compose up` した `api` コンテナに対し Bash ツールから `curl http://localhost:<BACKEND_API_PORT>/...`
を実行すると `Connection refused` になる（sandbox のネットワーク名前空間が Bash ツール呼び出しごとに
分離されているため、ポートフォワードへ到達できない）。SS-10 の手動疎通確認で発覚。

**How to apply（2択）:**
1. **`dangerouslyDisableSandbox: true` を付けた Bash から直接 `curl http://localhost:<port>/...`
   すると普通に到達できる**（2026-09-25、SS-131 で確認。`docker compose ps` で `0.0.0.0:<port>->8000/tcp`
   の公開を確認できていれば、host の curl はこれで足りる。`docker` コマンドを直叩きする他の操作と
   同様、sandbox 内では拒否されるだけで、無効化すれば動く）。
2. コンテナ外の curl を避けたい・`docker` コマンドの許可自体を最小化したい場合は
   **コンテナ内から**確認する。`api` コンテナに `curl` は入っていない（`sh: curl: not found`）ので、
   `docker compose exec api uv run python -` にヒアドキュメントで
   `httpx.Client(base_url="http://localhost:8000")` を使うスクリプトを渡すのが確実
   （httpx は既に backend の依存に含まれる）。dev token 取得は `POST /auth/dev-session` に
   `{"user_key": "..."}` を渡す（`sub` ではない。`auth/schemas.py` の `DevSessionCreate.user_key`）。

どちらも「sandbox 内の素の Bash では `Connection refused` になる」という観測だけで
「host からの疎通確認は不可能」と結論しないこと（1の存在を見落とすと2に飛びつきがちだが、
単発の目視確認なら1の方が速い）。

## `docker compose exec` の連続実行で permission denied が散発する

`docker compose exec ...` を複数の Bash ツール呼び出しとして立て続けに実行すると
`Error loading config file: open ~/.docker/config.json: permission denied` /
`permission denied while trying to connect to the docker API at unix:///var/run/docker.sock`
が非決定的に出る（8回中数回など）。`docker compose ps` は同じタイミングで成功することもあり、
`exec` 特有で起きやすい。**テストの flaky ではなく環境側の一過性の問題。**

**How to apply:** テストや実装コードを疑う前に、まず同じコマンドを単発で再実行する。
安定性を繰り返し確認したい場合は
`docker compose exec api sh -c 'for i in 1 2 3; do uv run pytest ...; done'` のように
**1回の Bash ツール呼び出し内でコンテナ内シェルのループを使う**と、呼び出し境界をまたがず安定する
（SS-10 ローカルレビュー B-2 の `with_for_update()` 並行テストで8回連続成功を確認）。

## `sam build --use-container` / `sam local invoke` は Docker ソケットが塞がれて失敗する

```
Error: Running AWS SAM projects locally requires a container runtime. Do you have Docker or Finch installed and running?
```

**紛らわしい点:** 同じ sandbox 内でも `docker info` 単体は成功することがある（`sam` が使う接続経路が
`docker` CLI 直叩きとは別で、より厳しく塞がれている）。**`docker info` の成功を根拠に
`sam build --use-container` も通ると判断しないこと。**

**How to apply:** `sam build --use-container` / `sam local invoke` は最初から
`dangerouslyDisableSandbox: true` で実行する。`sam validate --lint` は Docker を使わないため
sandbox 内でも成功する。関連: [[reference-sam-cli-location]]

## AWS の認証情報は「存在する」。sandbox から見えないだけ

- `~/.aws` は `/mnt/c/Users/hirok/.aws` へのシンボリックリンク（WSL2 から Windows 側を参照）。
- sandbox のファイル読み取り deny リストに **`/mnt/c/Users` が含まれる**ため、sandbox 内では
  `ls ~/.aws` が `No such file or directory`、`aws configure list-profiles` が空、
  `aws sts get-caller-identity` が `NoCredentials` になる。
- **`dangerouslyDisableSandbox: true` で実行すれば普通に使える。** 20個以上の profile が並び、
  `sanposcape-dev` で SSO の AdministratorAccess ロールを引き受けられる
  （2026-09-06 に `sam deploy` と Lambda invoke まで実行して確認済み）。

**Why:** 「`~/.aws` が存在しない」という観測だけで「この環境では AWS 作業ができない」と結論すると、
実際には可能な検証（`sam deploy`、`sam local invoke`、`aws lambda invoke`、CloudWatch Logs の確認）を
丸ごと諦めることになる。**過去に一度この誤認が起きている。**

**How to apply:**
- `aws` / `sam deploy` 系は最初から `dangerouslyDisableSandbox: true` で実行する。
- profile は `AWS_PROFILE=sanposcape-dev`（dev アカウント）。**`samposcape` ではなく `sanposcape`**（`n`）。
  実際にタイプミスで `The config profile (samposcape-dev) could not be found` が出たことがある。
- **SSO の再ログインや `aws configure` での新規設定は、ユーザーの明示的な指示が無い限り行わない。**
  期限切れ（`LoginRefreshRequired`）を検出しても re-login しない。認証情報が無い場合の話ではなく、
  **能動的に認証情報を作る行為をしない**という方針。
- 出力に AWS アカウント ID や DSN のパスワードが含まれることがある。ユーザーへ提示する際は
  `sed -E 's/[0-9]{12}/<account-id>/g'` 等でマスクする（このリポジトリは public）。

## `.ruff_cache` / `.pytest_cache` が root 所有で書けない

`packages/backend/.ruff_cache`（バインドマウント）がホスト上で `nobody:nogroup` や `root` 所有に
なっていることがあり、コンテナ内の非root `app_user` から書き込めず `ruff check` が
`Failed to create temporary file: Permission denied` で失敗する。`.pytest_cache` でも同様の
`PytestCacheWarning` が出るが、こちらはテスト結果自体には影響しない（warning のみ）。
原因は未特定（WSL2 のバインドマウントで過去に root 権限のプロセスが書き込んだ可能性）。

**How to apply:** コード側を疑う前に
`docker compose exec -u root api sh -c 'chown -R app_user:app_user /app/.ruff_cache'`
（`.pytest_cache` も同様）を実行してから再実行する。ホスト側から `rm -rf .ruff_cache` を試みても
同じ権限問題で削除できないことが多いので、コンテナ内から `-u root` で chown するのが手早い。

関連: [[reference-sam-cli-location]], [[reference-openapi-json-gitignored]]
