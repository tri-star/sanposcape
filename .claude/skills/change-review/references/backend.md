# backend の確認観点

`packages/backend/` に差分があるときに読む（router・service・repository・モデル・マイグレーション・`integrations/`・`aws_lambda/`・テスト）。
規約の正本: `packages/backend/AGENTS.md`、`packages/backend/docs/folder-structure.md`・`naming-convention.md`・`local-env.md`（OpenAPI 定義）・`deployment.md`（§5 マイグレーション）、`packages/backend/docs/adr/`（ADR-B-*）、`docs/adr/`（特に ADR-003・ADR-005・ADR-008・ADR-009・ADR-011）

ここに挙げるのは、ruff・pytest が通っても残り、レビューでしか見つからないもの。正本に書いてある規約は正本を読んで照合する。

## 層の責務と依存の向き

- 3層（router → service → repository）、`integrations/` は service からだけ、`core/` はドメインを import しない、router に `try/except` を書かない。lint では守られていない。正本: folder-structure.md「各ディレクトリの役割と配置ルール」「例外と冪等な INSERT」
- `sanpo_maps/` の変更では、サブパッケージ間の依存が ADR-011 の向き（pins → maps → photos → 共有カーネル）に収まっているか。双方向が要る形を Protocol やメソッド注入で回避していないか（M9: ユースケース層を入れる）。`sanpo_maps/tests/test_architecture.py` は AST で検査するが、新しいサブパッケージや公開面を足したときに許可表（`_ALLOWED_SUBPACKAGE_DEPENDENCIES`・`_ALLOWED_PUBLIC_SURFACE`）と ADR-011 を更新しているかは人が見る。
- 現在時刻を使う service・部品が `now`（経過時間なら `monotonic`）をコンストラクタで受けているか。`datetime.now()` の直書きは日付境界のテストを書けなくする。正本: folder-structure.md「現在時刻の扱い（クロック注入）」
- `app.state` に外部クライアントを持たせる変更では、`main._lifespan` の finally から `close()` が呼ばれているか（先例: `HttpGoogleMapsProvider`・`AppConfigFlagSource`）。Lambda では shutdown が走らず、lifespan の state も使えない（folder-structure.md の `aws_lambda/` 節。SS-183）。
- Lambda 固有のコードが `aws_lambda/` の外に出ていないか（ECS 移植性の境界。grep で確かめられる）。
- 配置の理由が「循環 import を避けるため」なら、実際の import 方向を grep で確かめてから評価する。SS-98 のプランはこの理由を挙げたが、実際は core → integrations の一方向で循環しなかった（ADR-008 の SS-98 追補 D3 で訂正）。

## API 契約と OpenAPI

- router・schemas の変更に合わせて `openapi.yaml` を再出力しているか。CI は `openapi.yaml` とコードの食い違いを検査しない。古いままだと mobile の Orval が古い契約で生成される。
- mobile を壊しやすい変更（クエリの無い GET へのクエリ追加で Orval の関数シグネチャが変わる、応答への required フィールド追加で mobile の型付きフィクスチャが落ちる）なら、同じ PR に mobile の最小修正があるか。正本: local-env.md「OpenAPI 定義」、`packages/backend/AGENTS.md`
- クエリパラメータで日時を受けるときも `AwareDatetime` か（ボディだけ `AwareDatetime` にしがち）。naive な値は `timestamptz` 列との比較で DB セッションのタイムゾーン次第で境界がずれる（SS-18 の `GET /walks`。修正済み）。列が `timezone=True` かとセットで見る。
- 一覧のカーソルは `core/pagination.py` の型別ユーティリティ（`(datetime, uuid)` 用・`(int, uuid)` 用）に足しているか。ドメインごとに自前で組み立てていないか。

## トランザクションと並行性

並行テストの書き方（threading + 別 Session、`pg_stat_activity` で待つ）は `.claude/agent-memory/backend/sqlalchemy-and-db.md`、最悪時間の見積もり方は `.claude/agent-memory/backend/aws-and-external-calls.md` にある。

- 冪等キー（`client_*_id`）・advisory lock・`FOR UPDATE`・確定処理を含む変更では、プランや ADR の並行性・冪等性の設計を箇条書き単位で実装の分岐と突き合わせる。「この判断はどのファイルのどの分岐で実現されているか」を指せなければ実装漏れを疑う。SS-88 では「真に同時なリトライで枠が attached なら成功扱い」が共有ヘルパー `_prepare_photos` に無く、`add_photos` 側の事前チェックにしか無かった（`create_pin` 経由の2回目が 409 になった）。
- 共有ヘルパーは、呼び出し元の片方のテストだけでもう片方も安全と判断しない。
- 新しい `repository.delete()`（select → `session.delete()` → flush）は、同時2重 DELETE で後発が0行になっても `version_id_col` が無いと `SAWarning` しか出ず、`True` を返す（ADR-003 の「2回目の DELETE は 404」に反する）。呼び出し元が成否を区別するなら、`WalkRepository.delete()` と同じく flush の間だけ `SAWarning` を例外に昇格して捕捉しているか。`StaleDataError` だけの捕捉では何も捕まらない。`UserRepository.delete()` は docstring に理由がある意図的な未対応なので再指摘しない。
- 「ちょうど1つ」の不変条件（`is_default` など）は、増える方向と0になる方向を分けて見る。部分一意インデックスは「2つになる」しか防げない。0になる方向に直列化（advisory lock・`FOR UPDATE`）があり、判定の SELECT から commit までがロックの内側か。SS-113 で既定地図が `create_map`/`delete_map` の同時実行で崩れた（PR #103 の外部レビューで発覚。ADR-009 決定27 の追補）。
- `UPDATE`/`DELETE` の rowcount を見ずに成功扱いしていないか（同じく SS-113 の `promote_latest_to_default()`）。
- 冪等 INSERT（savepoint + `IntegrityError`）を新しいドメインで使うとき、再送ペイロードが既存行と食い違っても既存行を返すだけでよいか（users / walks はこの前提）。型そのものの正本: folder-structure.md「例外と冪等な INSERT」
- 閲覧系の service メソッドが commit していないか（commit 境界は書き込み系だけ。SS-111、ADR-009 決定14〜18）。
- 期限・猶予・取り消しを持つ定期実行（長期間使われていないアカウントの通知と削除など。ADR-015）では、規則を場面ごとに当てはめる。取り消し（利用の再開）の後にまた条件を満たしたとき古い記録で即実行されないか、連絡先が無い利用者で条件が永久に満たされない・逆に通知なしで進まないか、定期実行の停止・遅延で猶予が縮まないか、一時的な送信失敗を「届かなかった」扱いにしていないか、対象を読んでから削除するまで（外部 HTTP の間を含む）に利用が始まった場合に条件を読み直しているか。SS-188 の ADR の初稿は「3 年経過 かつ 通知から 30 日」だけで、取り消し後の再通知とメールの無い場合が抜けていた。

## クエリと ORM の振る舞い

- 一覧は「本体1 + 付随情報 N 種類を `IN (...)` でバッチ取得」の型か（`list_tags_for_pins`・`get_cover_photos`・`count_photos_for_pins`）。ループ内のクエリは本物の N+1。
- `add_all()` → `flush()` の後にループで `refresh()` していないか。SQLAlchemy 2.0 + psycopg は複数行 INSERT でも RETURNING でサーバー生成値を flush 時点で埋めるので、1件ずつ SELECT し直すだけになる（SS-88 の `add_photos()`/`add_tags()`）。単一 `create()` の1回の `refresh()` は問題ない。
- 同じ PK の取得が2回に見えても、同じセッションの identity map に載っていれば SQL は出ない（SS-111 の `sanpo_maps/pins/service.py::get_pin()`）。間に `populate_existing()` や別セッションが無ければ、N+1 として指摘する前に SQL ログで確かめるか、重要度を Low に留める。
- commit の後のログで、削除していない ORM オブジェクトの属性（`current_user.id` など）を読んでいないか。`expire_on_commit=True` なのでログのためだけに再 SELECT が飛ぶ。`session.delete()` した対象は expunge されるので飛ばない（SS-112）。commit 前にローカル変数へ控える（お手本: `sanpo_maps/photos/service.py` の `PinPhotoUploadService`）。

## 時間予算と外部呼び出し

- `deadline_seconds`/`monotonic` の時間予算は、Lambda の29秒で強制終了される前に制御された応答（503/204）を返すためのもの。すべてのネットワーク I/O フェーズ（特に応答直前まで続く書き込み・削除）が同じ締め切りの傘下にあるか。SS-88 の `PhotoAttacher` は最初のフェーズにしか掛かっていなかった。
- 呼ぶ前だけ締め切りを確かめる形なら、1回の最悪時間（timeout × 試行回数）が予算に収まるか（SS-112）。確定処理の「呼ぶ前だけ」は ADR-009 決定22 の 2026-09-26 追補で受容済みなので再指摘しない。
- 時間予算の計算が他モジュールの定数（例: `integrations/aws/s3.py` の `_DELETE_TOTAL_MAX_ATTEMPTS`）を前提にしているなら、その前提をテストで固定しているか（`integrations/aws/tests/test_s3.py::test_delete_total_max_attempts_is_one`）。
- タイムアウト・ロックのガードを一部の操作にだけ足していないか。同じファイル・同じ関心事の中で同種のロックを要求する操作を横並びで見る。SS-141 では `_delete_all()`（DML）にだけ `lock_timeout` を足し、より広く衝突する `drop_all`/`create_all`（DDL）に無かった（ADR-B-001 決定1・決定4）。「頻度が低いから」はガードを省く理由にならない。

## スキーマ変更とデプロイ順

- 既存テーブルへの列追加では、列を読むコードのデプロイから migrate の invoke までの間、そのテーブルを読む API が `UndefinedColumn` で 500 になる。デプロイのワークフローはマイグレーションを実行せず、migrate の invoke は手動で別。順序の前提や影響範囲がプラン・PR に書かれているか。正本: deployment.md §5、ADR-005 決定9、`docs/release-runbook.md`
- 新しいドメインの models を `all_models.py` に import しているか（無いと autogenerate がモデルを認識しない）。拡張やマスタデータに依存するモデルを足したら、テスト DB の `_delete_all` の対象を見直したか。正本: folder-structure.md「`models.py` の配置と Alembic」「テストファイルの配置」、ADR-B-001

## テストと設計根拠の裏取り

- 並行性・冪等性の設計に対して、逐次リトライのテストしか無いなら、「真に同時なリクエスト」を再現するテスト（threading + 別 Session）が無いこと自体を指摘してよい。逐次のテストが通ることと、並行で不変条件が崩れないことは別の観点（上の並行性の項目はどれもテスト網羅を確認して OK とした後に見つかった）。
- 新しいコードのコメントが計画書の決定コード（`D6`・`Q3`・`B-D5`）を参照していないか。規則は `docs/knowledge-management.md`「層をまたぐ参照ルール」で、CI（check-tmp-references.sh）は `.py` を見ない。既存コードに多く残る（2026-10-12 時点で `src/` に数十箇所）ので、コメントだけで意図が自己完結していれば Low、ラベルしか手掛かりが無ければ Medium で「ADR の決定番号で参照するか自己完結させる」を提案する。その PR 固有の問題として厳しく扱いすぎない。
