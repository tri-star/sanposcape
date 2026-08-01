---
name: ruff-cache-root-owned-permission-denied
description: packages/backend/.ruff_cache や .pytest_cache がnobody/root所有になりapp_userから書けずruff checkがPermission deniedで落ちることがある
metadata:
  type: feedback
---

`packages/backend/.ruff_cache`（バインドマウント）がホスト上で `nobody:nogroup` や `root` 所有に
なっていることがあり、コンテナ内の非root `app_user`（`docker compose exec api ...`）から書き込め
ず `ruff check` が `Failed to create temporary file: Permission denied` で失敗することがある。
`.pytest_cache` でも同様の warning（`PytestCacheWarning: ... Permission denied`）が出ることがある
が、こちらはテスト結果自体には影響しない（warningのみ）。

**Why:** 原因は未特定（WSL2のバインドマウントで過去に root 権限のプロセスがキャッシュへ書き込んだ
可能性）。コード変更が原因ではない環境側の問題。

**How to apply:** `ruff check` が上記エラーで失敗したら、コード側を疑う前にまず
`docker compose exec -u root api sh -c 'chown -R app_user:app_user /app/.ruff_cache'`
（`.pytest_cache` も同様に `chown -R app_user:app_user /app/.pytest_cache`）を実行してから
再実行する。ホスト側から直接 `rm -rf .ruff_cache` を試みても同じ権限問題で削除できないことが多い
（root/nobody所有のため）ので、コンテナ内から `-u root` で chown するのが手早い。
