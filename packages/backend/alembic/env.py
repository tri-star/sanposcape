from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

# 全モデルを読み込んで Base.metadata を満たす（autogenerate 用）
from sanposcape.all_models import Base
from sanposcape.config import get_settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _resolve_database_url() -> str:
    """マイグレーション先の DB URL を決める。

    呼び出し側（`sanposcape/aws_lambda/migrate.py`）が `config.attributes` に入れていれば
    それを優先し、無ければ `Settings` から組み立てる（ローカル / CI の従来動作）。

    ★ `config.set_main_option("sqlalchemy.url", ...)` は使わない。alembic の Config は
      値を configparser に書き込むため `%` が変数補間の記号として解釈され、URL
      エンコードされたパスワード（例: `!` → `%21`）で
      `ValueError: invalid interpolation syntax` になる。`config.attributes` は素の dict で
      補間の対象外なので、パスワードにどんな記号が含まれていても安全。

    ★ 呼び出し側の URL を上書きしないことも重要。`migrate.py` は direct(非 pooled) DSN を
      渡してくるが、ここで無条件に `Settings.database_url`（pooled）を使うと
      マイグレーションが pooled 接続で走ってしまう。Neon 公式は Schema migrations に
      pooled を使わないよう明示しており（PgBouncer transaction mode では `SET search_path`
      等がトランザクションごとにリセットされる）、しかも DDL は通ってしまうことがあるため
      気付きにくい。
    """
    url = config.attributes.get("sqlalchemy_url")
    if url:
        return str(url)
    return get_settings().database_url


def run_migrations_offline() -> None:
    url = _resolve_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(_resolve_database_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
