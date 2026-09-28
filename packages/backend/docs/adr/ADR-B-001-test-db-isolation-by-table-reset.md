# ADR-B-001: backend テスト用DBの分離を「テーブルの中身を空にする」方式に変える

## 日付

2026-09-28

## ステータス

採用。実装済み（SS-141）。

## コンテキスト

`packages/backend/src/sanposcape/conftest.py` の autouse fixture `_setup_schema` は、
**テストごとに** `Base.metadata.create_all(bind=test_engine)` / `drop_all(bind=test_engine)`
（DDL）を実行してテストの独立性を担保していた。

- テスト件数は約1,100件（本 ADR 作成時点で1,116件）まで増えており、DDL の実行コストが
  積み重なっている。
- PR #103（[ADR-009](../../../docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)
  関連）のレビューで、この点が改善提案（F-005）として挙がった。
- 変更前に `pytest --durations=30` 等で計測したところ、setup/teardown（create_all/drop_all
  相当）が全体時間の約8割を占めていた（詳細は下記「計測結果」）。

### 前提として確認した事項

- **DBイメージ**: ローカル（`compose.yaml`）・CI（`.github/workflows/backend-ci.yml`）とも
  `postgres:17-alpine`。PostGIS 等の拡張は入っておらず、マイグレーションにも
  `CREATE EXTENSION` は無い。`spatial_ref_sys` のような拡張由来のテーブルは存在しない。
- **CI ではテスト用DBとマイグレーションのスモークチェック先が同じDB**: `backend-ci.yml` は
  `TEST_DB_NAME` を `DB_NAME` と同じ値（`app`）にしたうえで、テストの前に
  `uv run alembic upgrade head` を実行している。そのため「最初のテストだけ alembic 由来の
  スキーマで動き、以降は `drop_all` からモデル定義（`create_all`）由来のスキーマで動く」
  という状態になっていた。この性質（=テストはモデル定義由来のスキーマで動く）を崩さないことを
  変更の制約にした。
- **主キー**: ほとんどのテーブルは UUID 主キー（`default=uuid.uuid4`）で、シーケンス/IDENTITY 列は
  無い。例外は `sanpo_map_members` で、`sanpo_map_id`＋`user_id`（ともに UUID の FK）の
  複合主キー。
- **FK構造**: ネイティブ Enum・循環 FK は無い。`users`/`sanpo_maps`/`pins` を親とする木構造。
- **session/moduleスコープでDBにデータを入れる fixture は無い**（`auth`/`sanpo_maps`/`pins`/
  `users`/`walks` の各 `tests/conftest.py` を確認）。すべて function スコープで、テストの
  中でINSERT・commitする作り。
- **advisory lock**: アプリが使うのはすべて `pg_advisory_xact_lock`（トランザクションスコープ）
  で、コネクションプールへ返却後にロックが残ることは無い。
- **別セッション/スレッドを使うテスト**が複数存在し、「実際にcommitする」という現状の意味を
  変えない変更にする必要があった（下記「決定」参照）。

## 決定

### 1. スキーマは pytest の session スコープで1回だけ作る

`_setup_test_db_schema`（session・autouse）を新設し、セッション開始時に
`Base.metadata.drop_all(bind=test_engine)` → `Base.metadata.create_all(bind=test_engine)`、
セッション終了時に `Base.metadata.drop_all(bind=test_engine)` を実行する。

- 開始時に `drop_all` してから `create_all` するのは、CI で alembic 由来のスキーマのまま
  テストが動いてしまうのを防ぐため（コンテキストの「前提として確認した事項」を参照）。
  ローカルでも、前回の実行が落ちて残ったテーブルや別ブランチで列が変わったテーブルを
  使い回さない効果がある。
- 終了時にも `drop_all` するのは、「テストが終わったらテスト用DBは空」という従来の終了時の
  状態を保つため。コストはセッション終了時の1回分だけ。
- `drop_all`/`create_all` の前にも、`_reset_tables`（決定4）と同じ `SET LOCAL
  lock_timeout = '10s'` を設定した接続の上で実行する。理由は決定4を参照（このガードは
  `_delete_all` と共通の値を使う）。

### 2. 各テストの**前**に、対象テーブルの中身を空にする

`_reset_tables`（function・autouse、`_setup_test_db_schema` に依存）を新設し、対象
fixture の **setup 時**（テスト本体の実行前）に全テーブルの中身を空にする。
`_reset_tables` は値を返さない通常の関数で、`yield` を持つジェネレータではない
（teardown 処理は無い）。

課題本文は「各テストの後」を案として挙げていたが、「前」を採用した。理由:

- 前のテストの teardown が失敗しても（例外やロック待ちタイムアウト）、**次のテストは必ず
  空のテーブルから始まる**。失敗が後続のテストへ連鎖しない。
- 後続の fixture がどんな順序で teardown されるかに左右されない。
- 「commitする/複数の接続を使う」テストの意味は、前後どちらで消しても変わらない。
- 最後のテストが残したデータは、session 終了時の `drop_all`（決定1）が片付ける。
- 最初のテストの前にも空にする処理が走るが、`create_all` 直後で空振りのため無視できるコスト。

### 3. 対象テーブルは `Base.metadata.sorted_tables` に限る

`alembic_version` のようなメタデータ外のテーブルや、将来 PostGIS 等の拡張を入れた場合の
拡張由来のテーブルは、この範囲に限ることで構造的に対象から外れる。

### 4. 後始末は DELETE を採用する（TRUNCATE ではなく）

各テーブルに対する `DELETE FROM`（`Base.metadata.sorted_tables` の逆順、子テーブルから）を
1トランザクションで実行する。計測の結果は「計測結果」を参照。

- `with test_engine.begin() as conn:` の中で、最初に
  `SET LOCAL lock_timeout = '10s'` を実行する。閉じ忘れたセッションが
  idle in transaction で残っている場合に、無言で止まらずエラーにするため。
  同じ値（`10s`）は `_setup_test_db_schema` の `drop_all`/`create_all`（決定1）にも
  適用する。`drop_all`/`create_all` は ACCESS EXCLUSIVE 相当のロックを要求するため
  `_delete_all` と同種のリスクがあり、かつセッション全体で最初と最後に1回ずつしか
  実行されない分、ここでハングするとテストスイート全体が無診断で止まりうるため。

**トラブルシューティング**: `lock_timeout` 超過でテストが失敗した場合、原因は
「直前まで実行されていた別のテストが接続を閉じ忘れ、`idle in transaction` のまま
残っている」ことが多い。pytest はテスト実行順を保証しないため、失敗の見た目は
「たまたま次に実行された無関係なテストの setup 失敗」になる（失敗したテスト名が
原因テストとは限らない）。調査するときは、テスト用DBに対して
`SELECT pid, state, query, state_change FROM pg_stat_activity WHERE state = 'idle in transaction';`
を実行し、長時間 `idle in transaction` のままの接続を探す。

### 5. 外側トランザクション + savepoint 巻き戻し案は採らない

検討したが不採用（詳細は「検討した選択肢」の選択肢D）。テスト用セッションとアプリ用
セッションが同じ接続を共有してしまい、次の検証の意味が失われるため。

- `sanpo_maps/maps/tests/test_service.py::test_commits_and_is_visible_from_another_session` /
  `test_cleanup_is_called_after_commit`（別セッションから見えるか）
- `auth/tests/test_repository.py::test_get_by_hash_for_update_blocks_concurrent_transaction`
  （スレッド2本での `FOR UPDATE` の直列化）
- `sanpo_maps/pins/tests/test_service.py`（スレッドを使った競合検証）
- `walks/tests/test_repository.py::TestDeleteConcurrentRace`（`StaleDataError` の競合）
- `users/tests/test_repository.py`（insert → 一意制約違反 → on conflict 的な再取得の冪等パターン）

### 6. pytest-xdist による並列化はスコープ外

ワーカーごとにテスト用DBが必要になるため、本 ADR の変更とは別チケットで検討する
（併用は可能）。

### 7. ローカルで `TEST_DB_NAME` を `DB_NAME` と同じ値にする誤設定の防止はスコープ外

ローカルの `.env` で `TEST_DB_NAME` を `DB_NAME` と同じ値にすると、テスト実行時に開発用DBの
テーブルが `drop_all`/`DELETE` される。この経路は本 ADR 以前（テストごとに `create_all`/`drop_all`
していた頃）から存在し、本 ADR は実行の頻度・タイミングを変えただけでリスクの質は変わらない。
防ぐには設定のバリデーション（`_validate_environment_settings` で `env == "local"` のときに
両者の一致を拒否する）というアプリ側の変更が必要になるため、別チケットで検討する。
CI は `env == "test"` かつジョブ専用の使い捨てコンテナで `TEST_DB_NAME == DB_NAME` にしているので、
このバリデーションを入れる場合も CI は対象外にできる。

## 計測結果

計測環境: ローカル Docker on WSL2（`docker compose exec api uv run pytest ...`）。
テスト件数: 1,116件。計測日: 2026-09-28。全体時間は3回実行した中央値
（WSL/Docker は実行ごとのばらつきが大きいため）。

| 方式 | 全体時間（pytest内部計測、中央値） | 全体時間（シェル `real`、中央値） | setup合計 | call合計 | teardown合計 |
| --- | --- | --- | --- | --- | --- |
| 変更前（各テストで create_all/drop_all） | 114.24s | 120.118s | 49.61s | 21.07s | 34.19s |
| TRUNCATE（session化 + 各テスト前にTRUNCATE） | 47.24s | 51.630s | 25.34s | 21.54s | 0.05s |
| **DELETE（採用）**（session化 + 各テスト前にDELETE） | **30.52s** | **32.903s** | **8.18s** | **18.19s** | **0.05s** |

- 変更前 → 採用方式（DELETE）で全体時間の中央値は **約73%短縮**（114.24s → 30.52s）。
- 変更前は setup+teardown が 83.80s / 104.87s ≈ **80%** を占めていた。
  採用方式では setup+teardown は 8.23s / 26.42s ≈ 31% まで下がった。
- **TRUNCATE と DELETE の比較**: TRUNCATE中央値 47.24s → DELETE中央値 32.81s（比較時点、
  約31%短縮）。差は事前に定めた許容誤差（3%以内ならTRUNCATEを採る）を大きく超えるため、
  事前に定めた判断基準「全体時間の中央値が明らかに短い方を採る」により DELETE を採用した。
  対象テーブルはテストのたびに数行〜0行というほぼ空の状態で実行されるため、TRUNCATE の
  ACCESS EXCLUSIVE ロック取得・カタログ更新のコストが、DELETE の行ロック・行削除のコストより
  相対的に高くなったためと考えられる。
  - この比較時点の DELETE中央値 32.81s は、TRUNCATE/DELETE を切り替える一時的な環境変数
    （`SS141_CLEANUP`）と `_truncate_all` がまだコード上に残っていた状態での計測。
    上の表（計測結果）の DELETE 行 **30.52s** は、その切り替えコードを削除した最終版
    conftest.py で改めて計測し直した値であり、同じ実行を指しているわけではない
    （別の計測回。切り替え分岐の除去でわずかに速くなっている）。
- **DELETE の安定性**: 死んだタプルの蓄積による `ORDER BY` の無いクエリの並び順の揺れを
  懸念していたが、比較時の3回 + 採用後の安定性確認2回 + 追加の連続実行3回、合計8回の
  全件実行（1,116件 × 8）で不安定な失敗は観測されなかった。
- **`_reset_tables`（DELETE）自体のコスト**: pytest を介さず `_delete_all()` を
  空のテーブルに対して1,116回単体実行したところ 1.81秒（1回あたり約1.62ms）だった。
  採用方式の全体時間（中央値30.52s）に対して約6%であり、事前に検討していた追加の
  最適化案（「DBを触らなかったテストでは後始末を省く」）の実施条件（後始末の合計が
  全体時間の1割を超える場合のみ検討する、という事前に定めた基準）を満たさないため、
  この最適化は実施していない。
  将来この最適化を検討する場合、「DBに書き込んだか」を検知するイベントフックは `test_engine`
  単体ではなく `Engine` クラス全体に付ける必要がある。CI では `get_engine()`（アプリの DB 接続）も
  テスト用DBと同じDBを指すため、`test_engine` だけを見ると `get_db` を差し替えていない経路からの
  書き込みを見逃し、後始末を誤って省いてしまう。

## 検討した選択肢

### 選択肢A: 現状維持（各テストで create_all/drop_all）

- **概要**: 変更しない。
- **メリット**: 実装済みで枯れている。テストの独立性が最も強い（スキーマ自体を含めて
  完全に作り直す）。
- **デメリット**: テスト件数に比例してDDLコストが積み重なる。計測のとおり全体時間の
  約8割を占めており、テストが増えるほど相対的に悪化する。

### 選択肢B: session化 + 各テスト前に TRUNCATE

- **概要**: 決定1・2・3・5・6は本ADRと同じ。後始末だけ TRUNCATE にする。
- **メリット**: テーブルを物理的に新品の状態へ戻すため、DELETE特有の「死んだタプルの蓄積」に
  よる並び順の揺れが原理的に起こらない。1文で全テーブルを指定できるため、外部キーの順序を
  考えなくてよい。
- **デメリット**: 計測のとおり DELETE より約31%遅い。ACCESS EXCLUSIVE ロックを取るため、
  他の接続がロック待ちで止まるリスクも DELETE より一般に高い。

### 選択肢C: session化 + 各テスト前に DELETE（採用）

- **概要**: 決定1〜6のとおり。
- **メリット**: 計測のとおり最も速い。行ロックのみで済むため、ロック競合のリスクも
  TRUNCATEより小さい。
- **デメリット**: 死んだタプルが蓄積し得る。`ORDER BY` の無いクエリで並び順に依存した
  テストが理論上不安定になりうる（今回は8回の全件実行で問題を確認できなかったが、
  将来テストが増えたときに再発する可能性はゼロではない。「影響」の節を参照）。

### 選択肢D: 外側トランザクション + savepoint巻き戻し

- **概要**: セッション全体を1つの外側トランザクションで包み、各テストは
  `join_transaction_mode="create_savepoint"` のsavepointとして実行し、テスト後にロールバック
  する。
- **メリット**: 最速（DBへのDML自体が発生しない）。
- **デメリット**: **不採用**。テスト用セッションとアプリ用セッションが同じ接続を共有する
  実装になるため、「別セッションから見えるか」「複数スレッドでのFOR UPDATE直列化」
  「一意制約違反からの冪等な再取得」を検証しているテスト（決定5に列挙）の前提が崩れ、
  それらのテストが実質的に無意味になる。書き換えれば対応できなくはないが、
  「テストコード本体は変えない」という事前の制約と、検証している内容（実DBの並行制御）の
  価値を優先し、不採用とした。

### 選択肢E: pytest-xdist による並列化

- **概要**: テストをワーカープロセスに分散して並列実行する。
- **メリット**: 本ADRの方式と直交する軸であり、併用すればさらに高速化できる。
- **デメリット**: ワーカーごとに独立したテスト用DB（または独立したスキーマ/DB名）が必要になり、
  CI・ローカルの両方でセットアップの変更が必要。本ADRのスコープ外とし、別チケットで検討する。

## 決定理由

- 「全体時間の中央値が明らかに短い方を採る。差が誤差（3%以内）ならTRUNCATEを採る」という
  事前に定めた判断基準に従った。DELETEとTRUNCATEの差（約31%短縮）は誤差の範囲を明らかに
  超えていたため、DELETEを採用した。
- テストの独立性（外側トランザクション+savepoint案を採らない理由）を、実行速度より優先した。
  「別セッションから見えるか」「行ロックの直列化」「一意制約違反時の挙動」は実DBの並行制御の
  正しさを検証する目的で書かれたテストであり、これらの意味を保つことを速度より優先すべきと
  判断した。
- CIでのalembic由来スキーマとの共有という既存の制約（コンテキスト参照）を壊さないことを
  最優先にした。session開始時の`drop_all`→`create_all`はこの制約を満たすために必須。

## 影響

### ポジティブな影響

- ローカル・CIともにテスト全体の実行時間が短縮される（ローカル計測で中央値約73%短縮）。
- DDLの実行回数が「テストの件数×2」から「セッションごとに2回」に減り、テストが増えても
  DDLコストは実質的に増えなくなる。
- 既存のテストコード・アプリケーションコードを変更せずに実現できた。

### ネガティブな影響・トレードオフ

- DELETEは死んだタプルを残すため、`ORDER BY`の無いクエリで並び順に依存したテストが
  理論上不安定になりうる（選択肢Cのデメリット参照）。今回の計測（8回の全件実行）では
  再現しなかったが、将来こうしたテストが発生した場合は「明示的に`ORDER BY`を付けて
  結果を安定させる」ことを個別のテスト側で対応する（DBの並び順を保証と誤認しない）。
- `_setup_test_db_schema`・`_reset_tables`はいずれも`test_engine`（DBの実接続）を直接操作
  するため、今後この2つのfixtureの実行順序（`_setup_test_db_schema`が先、`_reset_tables`が
  後）を崩す変更をconftestに加える場合は注意が必要。

### 移行・対応が必要な事項

- 今後テストを書く人への約束事（`packages/backend/docs/folder-structure.md`にも記載）:
  - テスト中にDDL（`CREATE`/`ALTER`/`DROP`/`TRUNCATE`等）を実行しない。
  - session/moduleスコープのfixtureでDBにデータを入れない（入れても各テストの前に消える）。
  - PostGIS等の拡張を追加するとき、またはmigrationで投入するマスタデータに依存するモデルを
    追加するときは、`_delete_all`の対象（`Base.metadata.sorted_tables`）と、
    seed/拡張由来データの扱いを見直す。

## 関連情報

- 課題 SS-141（本ADRの実装元）
- [ADR-009: 地図（SanpoMap）とピン（Pin）のデータモデル、写真の先行アップロードとサムネイル生成](../../../docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)
  — 本ADRのきっかけとなったPR #103のレビュー（F-005）が出たADR
- `packages/backend/src/sanposcape/conftest.py` — 実装本体（`_setup_test_db_schema`/`_reset_tables`）
- `packages/backend/docs/folder-structure.md` — テストファイルの配置とテスト用DBの分離方式
- `.github/workflows/backend-ci.yml` — CIでのテスト用DBの構成
