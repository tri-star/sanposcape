# backend memory index

backend の計画・実装の落とし穴と手順。規約の正本は `packages/backend/AGENTS.md` と `packages/backend/docs/`、決定は ADR。
レビュー観点は `../review/`、領域に属さない git・ドキュメント作業の落とし穴は `../common/`。

- [計画時の確認事項](planning-checklist.md) — 既存の受け口と並行チケット（Alembic head・ADR 番号）の衝突 / 列追加のデプロイ順 / Lambda で状態を持つ設計の境界テスト / 長い ADR の該当節の索引
- [SQLAlchemy と DB の罠](sqlalchemy-and-db.md) — 別セッション削除は TestSessionLocal で確認 / commit 後の expire / 直呼びは明示 rollback / 並行テストは pg_stat_activity で待つ / 親の付け替え×キー収集→CASCADE / collation はバイト順
- [pytest の罠](testing.md) — AUTH_MODE 依存は専用 app / 認証付き fixture は walks_client の上 / import 順序の検証 / 再 import 後は親パッケージ属性も戻す / 定数は import 先を patch / src の外のテストに conftest の隔離は効かない
- [API 契約と OpenAPI](api-contract-and-openapi.md) — SkipJsonSchema[None] で non-nullable、長さ制約は非 null 側に Annotated / 再出力の差分の読み方
- [外部呼び出しと AWS の罠](aws-and-external-calls.md) — 締め切り＋1回の最悪時間 / boto3 は total_max_attempts・endpoint_url を渡さない / httpx.Timeout と MockTransport / Fn::Sub の変数マップ / 応答の読み取りは実キーの生応答を見てから決める
- [ログとトレース](observability.md) — 計装を足したら実起動で DB ルート / test_engine.url / 文脈ログは json_logs / 識別子を足すときはプライバシー申告と照合
- [ファイル移動リファクタの落とし穴](module-relocation.md) — docstring＝OpenAPI / ロガー名・parents[N]・lock namespace / __pycache__ / ファサードへの monkeypatch / AST アーキテクチャテスト
- [ローカル確認と sandbox](local-env-and-sandbox.md) — .env を編集せずシェル変数で compose / localhost の curl / exec の一過性エラー / sam・aws は sandbox 無効 / .ruff_cache の所有権
- [Google を ADC で読むスクリプトはホストで](host-run-scripts-with-google-adc.md) — uv run --no-project・storage.Client はプロジェクト必須（無いと OSError）・sandbox の許可ホスト・型だけの例外は最小の再現で原因を見る
- [写真の規模の見積もり](photo-scale-estimation.md) — 削除の後始末で消せる量は「締め切り − 1回の最悪時間」に始めた回数（既定 4 秒）/ CASCADE の時間はローカルの psql に合成データで測る
