# ADR-022: ピン・写真・地図・アカウントの削除と S3 の後始末

## 日付

2026-11-08（[ADR-009](./archived/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md) から分割。決定の初出は 2026-09-25〜2026-11-06）

## ステータス

採用（backend 実装済み・dev / prod にデプロイ済み。アカウント削除後の写真の削除の定期実行は、実地の確認が未記録。[deployment.md](../../packages/backend/docs/deployment.md) 冒頭の表）

## コンテキスト

ピン・写真・地図・アカウントを消すとき、DB の行は CASCADE で消えるが、写真の実体は S3 に残る。
API の時間予算（Lambda 29 秒、アプリの予算 25 秒）の中で、DB と S3 の整合をどう保ち、消し残しをどう回収するかを本 ADR にまとめる。
写真の保存の形は [ADR-021](./ADR-021-pin-photo-upload-storage-and-delivery.md)、誰が消せるかは [ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md)。
見出しの「旧 決定N」は凍結した ADR-009 の決定番号。

前提の不変条件（ADR-021 決定1）: **DB が存在しない S3 オブジェクトを指す状態は作らない。** 許すのは「DB から参照されない S3 オブジェクト」（孤立）だけで、
容量は DB の集計なので孤立は利用者の容量に数えない。

## 決定

### 決定1: 削除は「DB commit → S3 の best-effort の即時削除」（旧 決定22）

- 手順: (1) 対象の行を `FOR UPDATE` でロックする → (2) 消す写真の `s3_key`/`thumbnail_s3_key` を列だけ集める → (3) DB の行を消して commit する
  → (4) S3 の原本・サムネイルを best-effort で消す（失敗は WARNING を出し、204 のまま返す）。
- S3 を先に消して commit に失敗すると、DB が消えた写真を指す。DB を先に消せば、S3 の失敗で残るのは孤立だけ（容量は commit と同時に空く）。
- **ストレージが未構成・障害でも削除 API は 503 にしない**（写真以外のデータの操作をストレージの状態で止めない。OpenAPI にも 503 を宣言しない）。
- 複数のキーは `ObjectStorage.delete_many(keys) -> list[str]`（失敗したキーを返す）で消す。S3 の実装は `DeleteObjects`（1回 1000 キー、`Quiet=True`）。
  IAM のアクションは `s3:DeleteObject` のままでよい。写真1枚の削除も同じ経路。
- ピン削除・写真削除・地図削除・アカウント削除（owner の地図）は、同じ部品 `PhotoObjectCleaner.delete_best_effort()`（`sanpo_maps/photos/cleanup.py`。commit しない）を使う
  （[ADR-011](./ADR-011-sanpo-maps-module-structure.md) 決定4）。
- `pin_photo_uploads` の `attached` の行は消さない（ピンへの参照を持たず、容量にも使わない）。消した写真の `upload_id` を再送すると 409 `photo_upload_not_ready`。
- 遅延削除（削除予定の行を作って後で消す）は採らなかった。孤立は後述の回収（決定4・決定5）でまとめて扱う。

### 決定2: S3 の後始末の時間予算（旧 決定22 の 2026-09-26 追補）

- **削除は削除専用の S3 client で呼ぶ**: 再試行なし（`total_max_attempts=1`）、timeout は `OBJECT_STORAGE_DELETE_CONNECT_TIMEOUT_SECONDS`（既定1秒）・
  `OBJECT_STORAGE_DELETE_READ_TIMEOUT_SECONDS`（既定5秒）。1回の最悪時間は connect + read（既定6秒）。staging の後始末と枠の取り消しも同じ client。
- 締め切りは `PIN_PHOTO_DELETE_DEADLINE_SECONDS`（既定10秒、上限20秒。`monotonic()` 基準）。**最初のチャンクは必ず試み、2つ目以降は「残り時間 ≥ 1回の最悪時間」のときだけ始める。**
  後始末の全体は `max(締め切り, 1回の最悪時間)` 以内に終わる。打ち切ったら残りを WARNING に出す。
- **起動時に「締め切り + 1回の最悪時間 ≤ 25 秒」を検証する**（env を問わず。削除より前の DB 処理と近似の誤差の分として 4 秒の余裕）。
- 近似の限界: botocore の read timeout は無通信の時間の上限で、応答全体の上限ではない。DNS の解決も timeout の対象外。
- 確定の締め切り（`PIN_PHOTO_CONFIRM_DEADLINE_SECONDS`）と staging の後始末は「呼ぶ前だけ確かめる」構造のまま（確定は 503 で再送すれば回復するため）。

### 決定3: 地図の削除（旧 決定28・決定33 の地図削除のロック）

1. **DB は CASCADE で消える**（`sanpo_maps` → `sanpo_map_members`・`pins` → `pin_photos`/`pin_tags`・招待）。アプリでピンを1件ずつ消さない。
2. **ロックの順は「owner 単位の advisory lock（`lock_owner()`）→ 地図の行（`FOR UPDATE`）→ 地図のピン行（`FOR UPDATE`、`lock_pins_for_map()`）」**。
   その後で写真のキーを集め（`list_photo_keys_for_map()`）、削除して commit し、決定1・2 の手順で S3 を消す。
   - advisory lock は既定地図の不変条件のため（[ADR-019](./ADR-019-sanpo-map-and-pin-data-model-and-api.md) 決定3）。`create_map` と同じ順なのでデッドロックしない。
   - ピン行をキーの収集の前にロックするのは、ピンの移動（ADR-019 決定10）と重なったとき、移動先で生き残るピンの写真を S3 から消さないため。
3. **staging（未使用の枠）は触らない**（地図と紐付いていない）。容量は commit と同時に空く。
4. 二重の DELETE の後発は、待った後に行が無く 404 になる。
5. **許容したデッドロック**: 写真の追加・ピンの作成（ピン行 → 地図の行の順に UPDATE）と地図の削除（地図の行 → ピン行）は、まれにデッドロックして PostgreSQL が片方を 500 にする。
   DB はロールバックで整合し、確定済みの S3 は孤立になる。2台の端末で同じ地図に同時に操作したときだけ起きる。分析上の結論で、テストでは固定していない。
6. 共有地図を owner が消すと、editor のピン・写真・タグも消える（地図の存続は owner が決める。[ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md) 決定2）。

### 決定4: 上限 10 GiB で大きな地図・ピンを消すと S3 を消し残す。回収は後続の課題（旧 決定37）

- **DB の処理は時間予算に収まる**: ローカルの PostgreSQL 17 で、写真7万枚の地図の削除（ピンのロック + キーの収集 + CASCADE）・アカウントの削除がそれぞれ約 0.5 秒。Neon で数倍でも数秒。
- **S3 の後始末は消し残す**: 2回目以降の DeleteObjects を始められるのは最初の 4 秒（締め切り 10 秒 − 1回の最悪 6 秒）だけで、回数は `floor(4 / 1回の時間) + 1`。

  | 1回の時間 | 回数 | 消せるキー | 写真の枚数（原本 + サムネイル） |
  | --- | --- | --- | --- |
  | 0.3 秒 | 14 | 1.4万 | 7千枚 |
  | 0.5 秒 | 9 | 9千 | 4.5千枚 |
  | 1.0 秒 | 5 | 5千 | 2.5千枚 |
  | 1.5 秒 | 3 | 3千 | 1.5千枚 |

  上限まで使った地図（写真 2.1万〜3.5万枚）を消すと、約7〜9割を消し残す。消し残しは容量に数えないので、上限まで入れて消すことを繰り返すと S3 に積み上がる。ピンの削除も同じ。
- **対処は後続の課題（Plane SS-244）**（2026-10-26 のユーザー判断。walkshare の移行を止めないため）。それまでの回収の手段は、アカウント削除後の prefix の削除（決定5）だけ。
  プライバシーポリシーの「まれに…残ることがあります」は大きな地図・ピンでは実態と合わないので、[データ取扱い台帳](../privacy/data-inventory.md) §4 に既知の差分として載せている。
- 却下: 時間予算を伸ばす（上限 20 秒で、境界が数倍になるだけ）／回収の仕組みを同じ PR で作る（移行が遅れる）。
- 未確認: 実環境の DeleteObjects 1回の時間（大きな地図の削除の WARNING の有無で確かめられる）。

### 決定5: アカウント削除後の写真は、保持期間の後にバックグラウンドで prefix ごと消す（旧 決定36）

- **削除予約**: アカウント削除（`AccountDeletionService.delete_account`）が、利用者を消すのと**同じトランザクション**で `account_photo_purges` に1行入れる
  （`user_id` PK・`requested_at`・`purge_after`。`users` への FK は持たない。同じ利用者の予約が既にあれば `ON CONFLICT DO NOTHING`）。
- **保持期間は `ACCOUNT_PHOTO_RETENTION_DAYS`（既定 30 日、0〜365）**。保持中に予約の行を消せば写真は残るが、DB の行は削除の時点で消えているので、戻すには DB の復元（Neon の PITR）が要る。
- **処理**（`AccountPhotoPurgeService`）: 期限を過ぎた予約を古い順に `ACCOUNT_PHOTO_PURGE_BATCH_SIZE`（既定 200）件読み、トランザクションを閉じてから、利用者ごとに
  `staging/pins/<uid>/`・`original/pins/<uid>/`・`thumb/pins/<uid>/` を「先頭 1000 件を列挙 → DeleteObjects」で空になるまで繰り返し、空になったら予約を消して commit する。
  - 冪等。S3 の失敗があった利用者はそこで打ち切って次へ。締め切り（`ACCOUNT_PHOTO_PURGE_DEADLINE_SECONDS`、既定 240 秒）を過ぎたら翌日に持ち越す。
  - prefix で消すので、best-effort の削除（決定1・3）の消し残しも一緒に消える。
  - prefix は UUID の利用者 ID からしか組み立てない（空だと全員の写真を消しうる）。
  - 1回で 12万〜24万キーを消せる見込みで、上限まで使った利用者も1回でおおむね終わる。
- **起動**: Lambda `sanposcape-<env>-backend-scheduled-photo-purge`（`aws_lambda/photo_purge.py`。API と同じ成果物の別ハンドラ、Timeout 300 秒）を EventBridge Scheduler で毎日 JST 04:00 に起動する。
  消し切れなかった利用者がいれば実行を失敗にする（Errors のアラーム）。`Invocations` が2日続けて 0 のアラームも置く。予約同時実行数は dev・prod とも 1（prod は SS-217 のデプロイ以降。ADR-005 の SS-217 追補）。
  **使い終わった招待の削除（30 日後）も同じ Lambda に相乗りする**（ADR-020 決定5。Scheduler のロール・アラームを増やさない）。
- **権限と責務の境界**（infra との合意。[deployment.md](../../packages/backend/docs/deployment.md) §17）:
  - スケジュールとスケジュールグループ `sanposcape-<env>-backend` は SAM、Scheduler が使うロールは Terraform（live/account）。デプロイ順は infra の apply → SAM。
  - **ロールが起動できるのは `sanposcape-<env>-backend-scheduled-*` の関数だけ。** 定期実行する関数の名前は `backend-scheduled-` で始め、Api・Migrate などには付けない（テストで固定）。
  - 実行ロールは写真バケットの `s3:ListBucket`（`s3:prefix` 条件で3か所）と3か所の `s3:DeleteObject` だけ。写真バケットのバージョニングは無効で、削除は S3 側では戻せない。
- 置き場所は `sanpo_maps/photos`。`users`・`aws_lambda` からは公開面 `sanpo_maps.photos.account_purge` だけを使う（ADR-011 の SS-109 追補）。
- 構成は単一 Lambda（案A）。詰まり始めたら（持ち越しが毎日続く）、dispatcher + SQS + worker（案B）に移る。予約のテーブルと1利用者分の処理はそのまま使える。
- 却下: 削除リクエストの中で即時に消す（ユーザーの要望に反し、時間予算に収まらない）／オブジェクトのタグ + ライフサイクル（作成日から数えるので保持期間にならない）／
  `deleted/` へのコピー（削除時に全コピーが要る）／キーをすべて DB に書く／S3 Batch Operations（過剰）。

### 決定6: アカウント削除のときの共有地図のデータ（旧 決定40）

- **本人が owner でない地図にある本人のピン・タグの作成者を、その地図の owner に付け替えて残す**（`AccountDeletionRepository.hand_over_to_map_owners`。users の行を消す前に同じトランザクションで）。
  - **NULL にしない**（応答の `created_by_user_id` を null 許容にすると配布済みのアプリが壊れる）。owner は地図のすべてを操作できるので、付け替えで権限は広がらない。
  - **今メンバーかどうかは見ない**（抜けた後も本人のピンは地図に残るので、editor に限ると、抜けた後の削除で owner の写真・タグまで CASCADE で消える）。
  - `updated_at` は動かさない。owner が同じ `client_pin_id` のピンを持つときだけ、付け替える行の `client_pin_id` を振り直す（一意制約に当てて削除を妨げられないように）。
- **本人の写真は消す**: `pin_photos.uploaded_by_user_id` の CASCADE で行が消え、S3 は決定5 の予約（30 日後）で消える。
- **本人が owner の地図は、地図ごと CASCADE で消え、ほかの利用者が上げた写真の S3 も commit の後に best-effort で消す**（その写真は本人の prefix の外にあり、予約では消えない）。
  users の行を消す前に、本人の地図の「ピン行 → 地図の行 → もう一度ピン行」の順に `FOR UPDATE` でロックしてからキーを集める（本人の地図へ移ってくる途中のピンも待つ。写真の追加と向きを揃える）。
  - **締め切りは、それまでにかかった時間だけ縮める**: `min(PIN_PHOTO_DELETE_DEADLINE_SECONDS, 25 − 経過時間 − 1回の最悪時間)`（Apple の失効が先に最悪 11〜19 秒かかるため）。
  - 消し残しは、その写真を上げた人のアカウント削除か SS-244 の回収まで残る（家族・友人での共有で 2.5千〜7千枚を超えるのはまれと見る）。
- FK の CASCADE は残す（migration は無い）。置き場所は `sanpo_maps/pins`。`users` からは公開面 `sanpo_maps.pins.account_deletion` だけを使う。ログは件数だけ（ID・キーは出さない）。
- mobile はフラグ `map_invitation` が ON のとき、削除の確認ダイアログにこの扱いを書く。
- 却下: 作成者を NULL にする・FK を `SET NULL` にする／「退会したユーザー」の行に付け替える（実在しない利用者で例外が増える）／本人のピンも消す（地図が欠ける）。

## 検討した選択肢

主な却下案は各決定に書いた。

## 影響

### ポジティブな影響

- 削除 API はストレージの状態に左右されず、DB と S3 の不整合は孤立の1種類に限られる。
- アカウント削除の後の写真は、保持期間の後に必ず回収される（消し残しも prefix で一緒に消える）。

### ネガティブな影響・トレードオフ

- 大きな地図・ピンの削除で消し残した写真は、回収（SS-244）ができるまで S3 に残り、運用者の保存費用になる（容量に数えない）。

### 持ち越し

- **Plane SS-244**: 消し残したキーの回収（キーを DB に書いて日次で消す、または孤立の掃除）。
- **Plane SS-218（BK-3）**: 期限切れの枠・`attached` の枠の行、参照されない S3 オブジェクトの掃除（ADR-021 の持ち越し）。
- デプロイしたスケジュールからの実際の起動は、確かめた記録が無い。
- 保持期間と Neon の PITR の期間の整合は未確認。PITR より長く写真を残しても持ち主の行に戻せない。
- 実環境の写真バケットのバージョニング・ライフサイクルは、infra のコード上は無効だが実環境では未確認。
- owner と editor のアカウント削除が同時に走ると、付け替えが FK の検査で失敗しうる（500。再試行で直る）。ロックの順が逆になる組み合わせ（同じ owner の地図の削除とアカウント削除など）も、
  PostgreSQL が片方を 500 にするだけでデータは壊れない。まれなので対処しない。
- 退会の処理中に同じ利用者が別の端末で作ったピンは、付け替えから漏れて CASCADE で消えうる（同じ利用者の同時操作に限る）。

## 関連情報

- 経緯の記録: [ADR-009（凍結）](./archived/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)
- [ADR-019](./ADR-019-sanpo-map-and-pin-data-model-and-api.md)、[ADR-020](./ADR-020-sanpo-map-sharing-permissions-and-invitations.md)、[ADR-021](./ADR-021-pin-photo-upload-storage-and-delivery.md)
- [ADR-011](./ADR-011-sanpo-maps-module-structure.md)（`PhotoObjectCleaner`・公開面）、[ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md) の SS-217 追補（予約同時実行数）
- [ADR-012](./ADR-012-lp-static-site-astro-s3-cloudfront.md) の SS-109・SS-248 追補（プライバシーポリシー 6・7）、[データ取扱い台帳](../privacy/data-inventory.md)
- [packages/backend/docs/deployment.md](../../packages/backend/docs/deployment.md) §17（定期実行の Lambda）
- Plane: SS-109、SS-112、SS-113、SS-175、SS-217、SS-236、SS-244、SS-251
