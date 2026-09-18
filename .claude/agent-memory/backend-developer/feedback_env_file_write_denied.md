---
name: feedback-env-file-write-denied
description: packages/backend/.envはEdit/Write/Bashのsed等で直接編集できない（permission deny）。一時的な設定切替は環境変数プレフィックス付きdocker composeコマンドで代替する
metadata:
  type: feedback
  scope: durable
---

`packages/backend/.env`（gitignore対象・秘密情報を含む扱い）は Edit ツールでも Bash 経由の
`sed -i` でも書き込みが permission deny になる（プロジェクトの sandbox 設定で `.env` への書き込みが
一律ブロックされている）。ファイル自体を書き換える手動疎通確認の手順は使えない。

**Why:** `.env` は APIキー等の秘密情報を含みうるため、エージェントによる直接編集を構造的に
禁止している（意図的な安全策）。

**How to apply:**
- `MAPS_MODE=fake` や `GOOGLE_MAPS_LOOP_ROUTE_ENABLED=false` のような一時的な設定切替で
  手動疎通確認をしたい場合は、`.env` を編集せず、シェル環境変数プレフィックス付きで
  `docker compose up -d` を実行する（`compose.yaml` の `environment: KEY: ${KEY:-default}` が
  ホストのシェル変数を拾う）。例:
  `MAPS_MODE=fake docker compose -p <project> -f <compose.yaml path> up -d`
  この形は `docker` で始まる bare command ではなく環境変数プレフィックスが付いているが、
  sandbox内でも問題なく実行できた（2026-09-15、SS-33で確認）。
- 確認が終わったら、プレフィックス無しの `docker compose ... up -d` を実行してコンテナを
  既定設定（`.env` の値）に戻すこと。
- `compose.yaml` の `environment:` に列挙されていない設定（例: `GOOGLE_MAPS_READ_TIMEOUT_SECONDS`
  等、安全な既定値を持つとして省略されているもの。`docs/local-env.md` の省略リスト参照）は
  この方法では上書きできない。その場合はテストコードで `Settings(...)` を明示構築して検証する。

関連: [[reference-openapi-json-gitignored]]
