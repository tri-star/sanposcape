#!/usr/bin/env bash
# postgres コンテナ初回起動時に、テスト用DBを追加作成する。
# (docker-entrypoint-initdb.d 配下は初回のボリューム初期化時のみ実行される)
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE ${TEST_DB_NAME}'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${TEST_DB_NAME}')\gexec
EOSQL

echo "Ensured test database '${TEST_DB_NAME}' exists."
