from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# 全モデルを読み込んで Base.metadata を満たす（autogenerate 用）
from sanposcape.all_models import Base
from sanposcape.config import get_settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 実行時に DB URL を設定から注入する。
# ★ 呼び出し側が既に URL を設定している場合は上書きしない。
#   `aws_lambda/migrate.py` は direct(非 pooled) DSN を明示的に渡してくるが、ここで
#   無条件に `database_url`（pooled）で上書きすると、マイグレーションが pooled 接続で
#   走ってしまう。Neon 公式は Schema migrations に pooled を使わないよう明示しており
#   （PgBouncer transaction mode では `SET search_path` 等がトランザクションごとに
#   リセットされる）、しかも DDL は通ってしまうことがあるため気付きにくい。
#   ローカル / CI は alembic.ini に sqlalchemy.url を持たないので、従来どおり
#   `get_settings().database_url` にフォールバックする。
if not config.get_main_option("sqlalchemy.url", None):
    config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
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
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
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
