---
name: local-env-and-sandbox
description: backend のローカル確認で sandbox に拒否される操作と回避策（.env を編集せずシェル変数で compose を上書き、localhost への curl、docker compose exec の一過性の permission denied、sam build/local invoke・aws は sandbox 無効、.ruff_cache の所有権）。「できない」と結論する前に読む
metadata:
  type: feedback
  scope: durable
---

Claude Code の sandbox（設定は `.claude/settings.json`）の中で backend を確認するときに失敗する操作と、その回避策。
コマンドの実行方法そのものは `packages/backend/docs/local-development.md` が正本。

**Why:** 実際には回避策があるのに「この環境では〇〇ができない」と結論し、検証を丸ごと諦めた事故が過去に起きている。

## 1. `packages/backend/.env` は編集しない。一時的な切り替えはシェル変数で渡す

`.env` は API キーなどの秘密情報を含みうるので、エージェントは編集しない（読み書きが拒否される設定のこともある）。

**How to apply:**
- `MAPS_MODE=fake` のような一時的な切り替えは、シェル変数を前に付けて compose を作り直す
  （`compose.yaml` の `environment: KEY: ${KEY:-default}` がホストのシェル変数を拾う）。例:
  `MAPS_MODE=fake docker compose -p <project> -f packages/backend/compose.yaml up -d`
- sandbox の設定によっては、`docker` で始まるコマンドだけが sandbox 外で実行できる（環境変数を前に付けると対象外になり、
  docker のソケットに届かず失敗する）。その場合は上書き用の env ファイルを作り、
  `docker compose --env-file packages/backend/.env --env-file <上書き用> -p <project> -f packages/backend/compose.yaml up -d`
  のように後ろに渡す（後のファイルが優先される）。効いたかは `docker compose ... config` で値を確かめる。
- 確認が終わったらプレフィックス無しで `up -d` し直し、`.env` の値へ戻す。
- `compose.yaml` の `environment:` に列挙されていない設定（安全な既定値があるとして省略されているもの。`docs/local-env.md` 参照）は
  この方法では上書きできない。テストで `Settings(...)` を明示構築して検証する。
- 実行中のコンテナの実際の値は `docker compose exec api sh -c 'env | grep ...'` で確かめる。

## 2. sandbox 内の Bash から `localhost:<port>` に届かない

`docker compose up` した api に sandbox 内から `curl http://localhost:<BACKEND_API_PORT>/...` すると `Connection refused` になる
（SS-10 で発覚）。

**How to apply（どちらか）:**
1. `dangerouslyDisableSandbox: true` の Bash から直接 curl する（`docker compose ps` で `0.0.0.0:<port>->8000/tcp` を確認できていれば届く。SS-131 で確認）。
2. コンテナの中から確かめる。api コンテナに curl は無いので、`docker compose exec api uv run python -` にヒアドキュメントで
   `httpx.Client(base_url="http://localhost:8000")` を使うスクリプトを渡す。dev トークンは `POST /auth/dev-session` に `{"user_key": "..."}`（`sub` ではない）。

## 3. `docker compose exec` を立て続けに呼ぶと permission denied が散発する

`~/.docker/config.json: permission denied` や docker.sock への接続拒否が非決定的に出る。テストの flaky ではなく環境側の一過性の問題。

**How to apply:** コードを疑う前に同じコマンドを単発で再実行する。安定性を繰り返し確かめたいときは
`docker compose exec api sh -c 'for i in 1 2 3; do uv run pytest ...; done'` のように、1回の Bash 呼び出しの中でコンテナ内のループを使う。

## 4. `sam build --use-container`・`sam local invoke`・`aws` は最初から sandbox 無効で実行する

- `sam` が使う Docker への接続経路は sandbox でより厳しく塞がれていて、`docker info` が成功しても `sam build --use-container` は
  「container runtime が無い」で失敗する。`docker info` の成功を根拠にしない。`sam validate --lint` は sandbox 内でも通る。
- AWS の認証情報は sandbox の中から見えないことがある（`aws sts get-caller-identity` が `NoCredentials`）。「認証情報が無い」と結論せず、
  `aws` / `sam deploy` 系は sandbox 無効で実行する。profile は `sanposcape-dev`（`samposcape` と打ち間違えやすい）。
- SSO の再ログインや `aws configure` での新規設定は、ユーザーの明示的な指示が無い限り行わない（期限切れを見つけても再ログインしない）。
- 出力に AWS アカウント ID や DSN のパスワードが含まれることがある。ユーザーへ示すときは `sed -E 's/[0-9]{12}/<account-id>/g'` などでマスクする（public リポジトリ）。

## 5. `.ruff_cache` / `.pytest_cache` が root 所有で書けない

バインドマウントの `packages/backend/.ruff_cache` が root などの所有になり、コンテナ内の `app_user` から書けず `ruff check` が
`Failed to create temporary file: Permission denied` で落ちることがある（`.pytest_cache` は warning だけ）。

**How to apply:** コードを疑う前に `docker compose exec -u root api sh -c 'chown -R app_user:app_user /app/.ruff_cache'` してから再実行する。
ホスト側の `rm -rf` は同じ権限問題で消せないことが多い。UID/GID の合わせ方は `docs/local-env.md`「WSL2 の UID/GID を合わせる」。
