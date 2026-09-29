# ADR-011: `sanpo_maps` モジュール構成（地図・ピン・写真の統合とモジュール内依存規則）

## 日付

2026-09-28（初版、SS-137）

## ステータス

採用（backend 実装済み。段階1: 配置の移動 [b6cfc0d]・[fa46c58]、段階2: Service の再設計
[098dc60]、段階3: 本 ADR・docs・agent-memory のパス更新）。

## コンテキスト

### 解こうとしている問題

[ADR-009](./ADR-009-sanpo-map-pin-data-model-and-photo-upload.md) 決定29（SS-113 追補）で、
`GET /sanpo-maps?expand=pin_count` を実装する際に「`sanpo_maps` は `pins` を import しない」
という依存方向を守るため、`sanpo_maps/contents.py` に `SanpoMapContents` という
`Protocol`（依存性逆転の port）を導入し、実体は `pins/service.py` の `PinService` に持たせて
`SanpoMapService.list_maps()`/`delete_map()` へメソッド引数として渡す構成にした。

この構成には、実装・レビューを重ねるうちに次の懸念が積み上がっていた。

- `pins/service.py` は `SanpoMapService` をコンストラクタで受け取り、ピン作成時の地図解決
  （`resolve_map_for_new_pin`/`get_role`/`mark_used`）に使う。一方 `sanpo_maps/service.py` は
  `PinService` の実体を port 越しに呼ぶ。**実行時には両者が互いを使っており**、「`pins →
  sanpo_maps` の一方向」という folder-structure.md の説明と、実際の依存グラフが一致していなかった。
- port の実体（`prepare_sanpo_map_deletion()`）が `PinService` の既存メソッドの再利用だったため、
  「地図の中身にアクセスするための port」という説明と、「ピン削除の後始末をそのまま流用している」
  という実装の意図がずれて見えた。
- 地図・ピン・写真は要件として強く結びついている（決定2: ピンは1つの地図に属し権限は地図単位、
  決定22・28: 削除は地図から CASCADE する）。それにもかかわらず `sanpo_maps`（地図）と `pins`
  （ピン・写真・タグ）という別ドメインに分かれていたため、依存の向きを保つたびに port や
  メソッド引数注入のような間接化が必要になっていた。

本 ADR は、この2つを**1つのモジュール**に統合し、モジュール内部の依存方向を「port を使わずに」
一方向に保てる構成に作り直す。

### 前提となる決定（既存 ADR・確定事項）

- [ADR-009](./ADR-009-sanpo-map-pin-data-model-and-photo-upload.md) 決定2: 地図とピンは N:1、
  権限は `sanpo_map_members` の role で判定する。地図名の衝突を避けるため `SanpoMap`/`sanpo_maps`
  という語を採用している。
- ADR-009 決定22・28: 削除は「DB commit → best-effort な S3 削除」で、ピン削除・写真削除・
  地図削除の3箇所が同じ時間予算の判定を使う。
- ADR-009 決定29（SS-113 追補）: 本 ADR が置き換える対象の port 構成。**本 ADR で撤去する**
  （ADR-009 側にも追補の注記を入れている）。

### ユーザー判断（2026-09-28）

- フォルダ構成（共有カーネル + `maps/`・`pins/`・`photos/`）を確認済み。
- 「Service は他の Service を使わない」という方針だけで SS-113 のような回避策
  （port + メソッド引数注入）が再び必要にならないか、という質問があった。回答は決定3'（M9）。
  今回の循環は「地図側が必要とするクエリ（ピン件数・写真キー）と S3 後始末が pins 側に
  置かれていた」ことが原因で、クエリを地図の `Repository` へ、後始末を `photos/` の部品へ
  移せば依存は一方向になり回避策は不要になる。ただし限界として、下位サブパッケージが上位の
  **業務ロジックそのもの**を必要とした場合はこの形では解けない。この限界に対する備えとして
  M9（ユースケース層の導入条件）と `test_no_protocol_ports`（M5 のテストでの固定）を追加した。

## 決定

### 決定1: 地図・ピン・写真を1つのモジュール `sanpo_maps` にする

- `packages/backend/src/sanposcape/pins/` を `sanpo_maps/` の配下へ統合する。**モジュール名は
  `sanpo_maps` のまま**にする（集約ルートは地図。ピンはちょうど1つの地図に属し、権限も
  `sanpo_map_members` の role、削除も地図から CASCADE するため、コンテキストの名前は
  親エンティティにするのが自然）。
- 旧 import 位置への再エクスポートは残さない（R6: 一括移行。`sanposcape.pins` パッケージは
  移行後は存在しない）。API（パス・operation_id・スキーマ名・tags・description）・DB スキーマ・
  advisory lock の namespace・S3 キーの接頭辞は一切変えない（決定5）。

却下した代替案は「検討した選択肢」を参照。

### 決定2: 共有カーネル + `maps/`・`pins/`・`photos/` の3サブパッケージ

```
sanpo_maps/                     # ドメイン: 地図・ピン・写真（1つの境界づけられたコンテキスト）
├── __init__.py
│   # ---- 共有カーネル（直下）: どのサブパッケージも import してよい。サブパッケージを import しない ----
├── models.py            # 全6モデル: SanpoMap, SanpoMapMember, Pin, PinTag, PinPhoto, PinPhotoUpload
├── exceptions.py         # ドメイン全体の例外
├── permissions.py        # SanpoMapRole と can_* の純粋関数
├── advisory_locks.py     # advisory_lock_key(user_id)（2つの repository の重複関数を統合）
├── conftest.py           # テスト共通ヘルパー・fixture
├── tests/                # モジュール全体に関わるテスト（test_architecture.py・test_advisory_locks.py・test_permissions.py）
│
├── maps/                 # 地図（SanpoMap）とメンバーシップ。API: /sanpo-maps（tags=["sanpo-maps"]）
│   ├── router.py / schemas.py / mappers.py / repository.py / service.py
│   ├── access.py         # SanpoMapAccess / ResolvedSanpoMap / FIRST_SANPO_MAP_NAME
│   ├── dependencies.py
│   └── tests/
│
├── pins/                 # ピン・タグ・ピンに紐付いた写真（行）。API: /pins（tags=["pins"]）
│   ├── router.py / schemas.py / mappers.py / repository.py / service.py / tag_labels.py
│   ├── dependencies.py
│   └── tests/
│
└── photos/               # 写真の実体（オブジェクトストレージ）とアップロード枠。
    │                     # API: /pin-photo-uploads（tags=["pins"] を維持）, /dev-storage（fake 限定）
    ├── router.py         # 旧 pins/upload_router.py
    ├── dev_storage_router.py / schemas.py / repository.py / service.py
    ├── photo_attacher.py / thumbnails.py / photo_keys.py
    ├── cleanup.py        # PhotoObjectCleaner, flatten_photo_keys（旧 PinService._delete_photo_keys_best_effort）
    ├── dependencies.py
    └── tests/
```

規模の目安（本体、docstring 込み）: 共有カーネル 約400行 / maps 約850行 / pins 約2,100行 /
photos 約930行。1ファイルの最大は `pins/service.py`（約650行）。

**モデルを共有カーネル（`models.py` 1ファイル）に置く理由**: 3つのサブパッケージの
`Repository` が互いのテーブルを JOIN・集計する（`PinRepository` は `SanpoMapMember` で
認可 JOIN、`PinPhotoUploadRepository.find_attachments` は `Pin` を JOIN、
`SanpoMapRepository` が `Pin`/`PinPhoto` を集計）。モデルをサブパッケージに分けると、
モデルの import だけで maps ⇄ pins ⇄ photos の循環ができてしまう。6モデル合計で約230行に
収まり1ファイルで読める。テーブル定義は変えないので Alembic の差分は出ない。

**`photos/` の責務の線引き**: `photos/` = 「写真の実体（S3 オブジェクト）とアップロード枠」。
アップロード枠の発行・取り消し、確定処理（`PhotoAttacher`: 検証・サムネイル・Copy）、
S3 キーの組み立て、best-effort 削除（`PhotoObjectCleaner`）、fake ストレージの受け口。
`pin_photos` の行の操作（`POST/GET /pins/{pin_id}/photos`、`DELETE /pins/{pin_id}/photos/{photo_id}`）
は `pins/` に残す。これらはピンの行ロック（`get_for_member_for_update`）・ピンの権限判定と
一体で、`photos/` に移すと photos → pins の逆向き依存が生じるため。

**`maps/` という名前について**: アプリ直下の `maps/`（探索・経路ドメイン）と同名になる。
import は常に `sanposcape.sanpo_maps.maps.*` と完全修飾なので実害は無いが、ドキュメント・
コメント・agent-memory では**必ず `sanpo_maps/maps/service.py` のようにモジュール名から書く**
（folder-structure.md に明記）。

### 決定3: モジュール内規則 M1〜M8 と AST テストでの固定

依存の向きは **kernel ← photos ← maps ← pins**（本体コードのみ。`tests/`・`conftest.py` は
結合テストのため向きを問わない）。

| # | 規則 | 検査 |
|---|---|---|
| M1 | 依存の向きは上図のとおり。カーネルはサブパッケージを import しない | AST |
| M2 | 直下（カーネル）に置けるのは `models`/`exceptions`/`permissions`/`advisory_locks` だけ | AST |
| M3 | **Service は他の Service を import しない・コンストラクタで受け取らない**。サブパッケージを跨いで共有してよいのは、下位サブパッケージの Repository と「commit しない部品」（`SanpoMapAccess`・`PhotoAttacher`・`PhotoObjectCleaner`） | AST（import）＋レビュー（コンストラクタ引数） |
| M4 | **commit/rollback を呼ぶのは `service.py` だけ** | AST |
| M5 | 複数サブパッケージにまたがるユースケースは、依存の向きで**上位のサブパッケージの Service が持つ**（地図削除 = maps が photos の部品を使う。ピン作成 = pins が maps の部品と photos の部品を使う）。下位が上位の情報を要する場合は、クエリを下位の Repository に置く（モデルは共有なので可能）か、処理を下位へ移す。**Protocol の port・メソッド引数での注入は作らない**。下位が上位の業務ロジックそのものを必要とし、これらで解けなくなったら決定3'（M9）のユースケース層を導入する | AST（`test_no_protocol_ports`）+ レビュー |
| M6 | テーブルへの書き込み（INSERT/UPDATE/DELETE）は、そのテーブルを持つサブパッケージの Repository だけが行う。他サブパッケージのテーブルは JOIN・集計（読み取り）にだけ使ってよい。`ON DELETE CASCADE` は対象外 | レビュー |
| M7 | モジュールの外（`main.py`・`all_models.py`・他ドメイン）から import してよいのは公開面だけ: `sanpo_maps.models`・`sanpo_maps.exceptions`・`sanpo_maps.{maps,pins,photos}.router`・`sanpo_maps.photos.dev_storage_router`。公開面を広げる場合は本 ADR への追補で決めてから許可リストを広げる | AST |
| M8 | モジュール内の import は絶対 import のみ（相対 import 禁止） | AST |

上記のうち AST で決定的に判定できるもの（M1・M2・M3・M4・M5・M7・M8）は
`sanpo_maps/tests/test_architecture.py`（旧 `sanpo_maps/tests/test_dependency_direction.py`を
置き換え）で固定した。実行時 import の状態ではなく静的な AST 解析にしているのは、テストの
実行順序や他テストの import 状況に依存して結果がぶれないようにするため（旧テストと同じ理由）。

`test_architecture.py` の検査内容（9テスト）:

1. `test_top_level_has_only_kernel_modules`（M2）
2. `test_kernel_does_not_import_subpackages`（M1）
3. `test_subpackage_dependency_direction`: 許可表
   `{"photos": {"photos"}, "maps": {"maps", "photos"}, "pins": {"pins", "maps", "photos"}}`（M1）
4. `test_services_do_not_import_other_services`（M3）
5. `test_only_services_commit_or_rollback`（M4）
6. `test_outside_code_imports_only_public_surface`（M7）
7. `test_no_relative_imports`（M8）
8. `test_no_protocol_ports`（M5。**M5 の「port を作らない」をこのテストで固定した**。
   本体コードで `typing.Protocol`/`typing_extensions.Protocol`、および `abc.ABC`/
   `abc.ABCMeta`（`metaclass=ABCMeta` を含む）を基底に持つクラスを定義していないことを
   検査する。違反メッセージは「モジュール内で port を作らない。下位の Repository への
   クエリ移設・処理の下位への移動で解けなければユースケース層を導入する
   （ADR-011 M5・M9）」）
9. `test_scans_known_modules`（番兵。走査対象が空になって何も検査しない事故を防ぐ）

**M5 のレビュー観点（AST でカバーできない範囲）**: `test_no_protocol_ports` はクラス定義
（`Protocol`・`abc.ABC`/`ABCMeta`）を伴う port は検出できるが、**コンストラクタで
`Callable` 型の引数を受け取り、呼び出し元がその場で関数・メソッドを渡す**という、
クラス定義を伴わない事実上の port は AST では機械的に判定しにくい。レビュー時は、
Service のコンストラクタ引数に `Callable[...]` 型があり、それが「別サブパッケージの
判断そのものを外側から注入している」ものになっていないかを確認する。

### 決定3': ユースケース層の導入条件（M9）

**地図側（下位サブパッケージ）がピン側（上位サブパッケージ）の業務ロジックそのものを
必要とした場合は、port（Protocol）やメソッドインジェクションで回避せず、ユースケース層
（`sanpo_maps/usecases/`）を導入する。**

**背景**: SS-113 で導入した port + メソッド引数注入（コンテキストの節を参照）は、この条件に
**当たらない**。実際に地図側が必要としていたのは「ピン件数の集計」「地図削除時の写真キーの
収集」という**クエリ**と、「S3オブジェクトの best-effort 削除」という**手順**であり、
どちらも `PinService` が持つ判断（誰が編集できるか、どの状態遷移を許すか等の業務ロジック）
そのものではなかった。それにもかかわらず port という回避策で解いていたため、実行時の
相互依存（`PinService ⇄ SanpoMapService`）が残った。本 ADR の決定4はこの2つを
「クエリは下位の `Repository` へ」「手順は下位の部品（`photos/cleanup.py`）へ」移設する
ことで、port を使わずに依存を一方向にできることを示している。

**導入条件（(a) または (b) が起きたら導入する。どちらも数え上げ・手続きで判定できる形にしている）**:

- (a) M5 の「下位の Repository へのクエリ移設」「処理の下位への移動」を実際に試みても、
  ある Service のメソッドが依存の向きに逆らって他サブパッケージの Service の**判断
  そのもの**（誰が編集できるか、どの状態遷移を許すか等の業務ロジック）を必要とする
  ケースが**1件でも**出たら該当する。例えば「ピンの編集権限の判定（誰が編集できるか）
  そのものを地図側が必要とする」ようなケースはクエリでも部品への切り出しでも解けず、
  この条件に該当する。
- (b) (a) には該当しない（依存の向きに沿ってクエリ・部品として置ける）が、複数
  サブパッケージにまたがるユースケースの数が**3つ以上**になり、かつそれぞれの主たる
  持ち主となる Service が異なって（横断処理ごとに「maps の Service が持つ」「pins の
  Service が持つ」のようにバラけて）読み手が呼び出し関係を追えなくなった場合。今は
  「ピン作成」「地図削除」の2つで、どちらも `pins` の Service が自然に持てる（決定4）
  ため該当しない。3つ目の横断処理が増えたら、それが既存の持ち主（`pins` の Service）に
  自然に収まるかをまず確認し、収まらなければ該当するとみなす。

**導入時の形**: モジュール直下に `usecases/` を設け、双方向に必要となった処理をそこへ移す。
**各サブパッケージの `router.py` だけが `usecases` を import してよい**（`usecases` は
全サブパッケージの Service/部品を import できる）。`router.py` 以外のファイルから
`usecases` を import してはならない。router はサブパッケージ配下にあるため、パッケージ
単位で見ると `usecases → 各サブパッケージ` と `各サブパッケージ（の router.py）→
usecases` が同時に存在するように見えるが、**ファイル単位では常に `router.py → usecases
→ 各サブパッケージの Service/部品` の一方向**であり、循環 import は生じない（`router.py`
は他のどのファイルからも import されない末端のため）。M7 の公開面は変わらない（`main.py`
は引き続き各 `router.py` だけを import し、`usecases` を直接 import しない）。導入したら
本 ADR に追補し、`test_architecture.py` の許可表に `usecases`（全サブパッケージの
Service/部品を import 可）を加えたうえで、「`router.py` だけの例外」（M1 のサブパッケージ
許可表とは別枠で `usecases` の import を許す）を検査するテストを追加する。

**今は導入しない**。またがる処理が「ピン作成」「地図削除」の2つだけで、どちらも
依存の向きに沿って上位サブパッケージの Service が自然に持てるため（決定4）。層を足すと
`router → usecase → service` の3段になり、他ドメインと形がさらに離れる（folder-structure.md
の「ドメイン単位の凝集 × レイヤー分離」という前提との整合性が下がる）。

### 決定4: Service 循環の解き方

| 旧（SS-113） | 新（本 ADR） | 理由 |
|---|---|---|
| `PinService` が `SanpoMapService` を持ち、`resolve_map_for_new_pin`/`get_role`/`mark_used` を呼ぶ | **`maps/access.py` の `SanpoMapAccess`**（新設）を持つ。3メソッドは本文そのままで移す。`SanpoMapAccess` は `SanpoMapRepository` と `now` だけを持ち、Session を持たず commit しない | 地図の解決（「最初の地図」の自動作成・既定地図の選択）は地図の知識なので maps に残す。Service ではない部品にすることで、呼び出し元（`PinService`）のトランザクションに乗ることが型で明らかになる |
| `SanpoMapService.list_maps(..., pin_counter=port)` | `list_maps(current_user, *, include_pin_count: bool = False)`。集計は `SanpoMapRepository.count_pins_for_maps()`（`PinRepository` から本文そのまま移す） | 地図 ID で集計する読み取りクエリは地図の Repository に置ける（モデル共有・M6 の読み取り） |
| `SanpoMapService.delete_map(..., contents=port)` | `delete_map(current_user, sanpo_map_id)`。キー収集は `SanpoMapRepository.list_photo_keys_for_map()`（移設）、S3 の後始末は**コンストラクタで受け取る `PhotoObjectCleaner`**（`photos/cleanup.py`） | 旧 port の `prepare_sanpo_map_deletion` = 「キー収集 + 後始末関数」を、Repository のクエリと photos の部品に分解しただけ。手順（lock_owner → FOR UPDATE → 認可 → キー収集 → 削除・繰り上げ → commit → ログ → 後始末）は1行も入れ替えない |
| `PinService._delete_photo_keys_best_effort()` | `PhotoObjectCleaner.delete_best_effort(keys)`。`PinService`・`SanpoMapService` は `photo_cleaner` を受け取る | ピン削除・写真削除・地図削除の3箇所で同じ時間予算の判定を使うため（ADR-009 決定22 追補・決定28）。本文は移すだけで、判定・ログ文言は変えない |
| `SanpoMapService(db, repository, now)` | `SanpoMapService(db, repository, photo_cleaner)` | `now` は `mark_used` でしか使っていなかった（`SanpoMapAccess` へ移る） |
| `PinService(db, repo, upload_repo, sanpo_map_service, photo_attacher, storage, *, …, photo_delete_deadline_seconds, photo_delete_call_worst_case_seconds, now, monotonic)` | `PinService(db, repo, upload_repo, sanpo_map_access, photo_attacher, photo_cleaner, storage, *, user_quota_bytes, confirm_deadline_seconds, read_photos_limit, download_url_ttl_seconds, now)` | 削除の時間予算の設定と `monotonic` は cleaner へ移る |

トランザクション境界は変えない。`get_db` は FastAPI の依存キャッシュで1リクエスト1セッション
なので、`SanpoMapAccess`・`SanpoMapRepository`・`PinRepository` は同じセッションを共有する
（テストで直接組み立てる場合も同じ `db_session` を渡す）。

依存注入:

- `photos/dependencies.py`: `get_object_storage(request)`、
  `get_photo_object_cleaner(storage=Depends(get_object_storage), settings=Depends(get_settings))`、
  `get_pin_photo_upload_service`。
- `maps/dependencies.py`: `get_sanpo_map_access(db=Depends(get_db))`、
  `get_sanpo_map_service(db=Depends(get_db), photo_cleaner=Depends(get_photo_object_cleaner))`。
- `pins/dependencies.py`: `get_pin_service(db, storage=Depends(get_object_storage), settings,
  sanpo_map_access=Depends(get_sanpo_map_access), photo_cleaner=Depends(get_photo_object_cleaner))`。

`POST/PATCH /sanpo-maps` も `app.state.object_storage` に依存するようになった（旧: `GET`/
`DELETE` だけが port 経由で依存）。`app.state.object_storage` は lifespan で必ず設定される。

advisory lock の重複統合: `sanpo_maps/advisory_locks.py` の `advisory_lock_key(user_id)` に
1つにまとめた（旧 `_advisory_lock_key` が `sanpo_maps/repository.py`・`pins/repository.py` に
重複していた）。**namespace 定数（バイト列）は各 repository に残し、値は変えていない**
（決定5）。

`pins/service.py`（約650行）のさらなる分割（写真確定処理の部品化等）は本チケットでは行わない。
理由・目安は「影響・将来の課題」を参照。

### 決定5: 変えてはいけないもの（不変条件）とロガー名の変化

| 対象 | 理由 | 確認方法 |
|---|---|---|
| router の `prefix`・`tags`・`operation_id`・`responses`・関数の docstring | OpenAPI（mobile Orval は tags-split） | openapi.yaml の差分ゼロ |
| Pydantic スキーマのクラス名・フィールド・**docstring**（パスが古くなっても触らない） | docstring は OpenAPI の description になる | 同上 |
| テーブル定義（`__tablename__`・列・制約・インデックス名） | マイグレーション不要 | `alembic check` |
| advisory lock の namespace のバイト列 `b"sanposcape.sanpo_maps.owner"`・`b"sanposcape.pins.pin_photo_uploads"` | モジュールパスではなくロックキーそのもの。変えると、デプロイの切り替わりで旧コードと新コードが同時に動く間、同じユーザーの操作が直列化されない | diff で目視・コメントを追記 |
| S3 キーの接頭辞（`staging/pins/…`・`original/pins/…`・`thumb/pins/…`） | 既存オブジェクトと IAM 境界 | `photo_keys.py` を git mv だけにする |
| ログの文言（`Failed to delete %d pin photo objects`、`Skipping remaining pin photo object cleanup: …`、`pin photo upload issued: …`、`Sanpo map deleted: …`、`Pin deleted: …`） | deployment.md のトラブルシュートが文言で案内している | テストの文言 assert |
| router の include 順（`main.py`） | OpenAPI の paths の順序 | openapi.yaml の差分ゼロ |

**ロガー名は変わる**（`sanposcape.pins.service` → `sanposcape.sanpo_maps.pins.service`・
`…photos.service`・`…photos.cleanup` 等）。`logging.getLogger(__name__)` を使っているため
ファイルの移動先に応じて変わる。CloudWatch 側でロガー名に依存する設定は無い（grep 済み）ため
許容する。

`SanpoMapSummaryRead`・`SanpoMapUpdate` の docstring に残る「他ドメイン（`pins/schemas.py` の
…）」という語は、OpenAPI の差分を避けるため本チケットでは直していない（古い語として残る。
「影響・将来の課題」参照）。

### 旧パス → 新パスの対応表

段階の凡例: **1a** = `git mv` による1対1の移動と import 書き換えのみ / **1b** = ファイルの
分割・統合（クラス・関数を丸ごと移すだけで中身は変えない）/ **2** = Service の再設計に伴う
新設・削除。パスはすべて `packages/backend/src/sanposcape/` からの相対。

| 旧 | 新 | 段階 | 備考 |
|---|---|---|---|
| `sanpo_maps/__init__.py` | そのまま | - | |
| `sanpo_maps/models.py` | そのまま | 1b | 末尾に旧 `pins/models.py` の4モデルと `PIN_PHOTO_UPLOAD_STATUSES` を追記 |
| `sanpo_maps/exceptions.py` | そのまま | 1b | 末尾に旧 `pins/exceptions.py` の9例外を追記 |
| `sanpo_maps/permissions.py` | そのまま | 1b | `SanpoMapRole` をここで定義（`maps/schemas.py` から移す） |
| `sanpo_maps/router.py` | `sanpo_maps/maps/router.py` | 1a | |
| `sanpo_maps/schemas.py` | `sanpo_maps/maps/schemas.py` | 1a/1b | |
| `sanpo_maps/mappers.py` | `sanpo_maps/maps/mappers.py` | 1a | |
| `sanpo_maps/repository.py` | `sanpo_maps/maps/repository.py` | 1a | 2 で `count_pins_for_maps`・`list_photo_keys_for_map` を受け入れる |
| `sanpo_maps/service.py` | `sanpo_maps/maps/service.py` | 1a | 2 で解決・認可系メソッドを `access.py` へ |
| `sanpo_maps/dependencies.py` | `sanpo_maps/maps/dependencies.py` | 1a | |
| `sanpo_maps/contents.py` | `sanpo_maps/maps/contents.py` → **削除** | 1a → 2 | port の撤去 |
| `pins/__init__.py` | `sanpo_maps/pins/__init__.py` | 1a | |
| `pins/router.py` | `sanpo_maps/pins/router.py` | 1a | |
| `pins/schemas.py` | `sanpo_maps/pins/schemas.py` | 1a/1b | upload 系3クラスを `photos/schemas.py` へ |
| `pins/mappers.py` | `sanpo_maps/pins/mappers.py` | 1a | |
| `pins/repository.py` | `sanpo_maps/pins/repository.py` | 1a/1b/2 | `PinPhotoUploadRepository` 等を `photos/repository.py` へ。2 で `count_pins_for_maps`・`list_photo_keys_for_map` を `maps/repository.py` へ |
| `pins/service.py` | `sanpo_maps/pins/service.py` | 1a/1b/2 | `PinPhotoUploadService` を `photos/service.py` へ。2 で `_delete_photo_keys_best_effort` を `photos/cleanup.py` へ、port 2メソッドを削除 |
| `pins/dependencies.py` | `sanpo_maps/pins/dependencies.py` | 1a/1b | `get_object_storage`・`get_pin_photo_upload_service` を `photos/dependencies.py` へ |
| `pins/tag_labels.py` | `sanpo_maps/pins/tag_labels.py` | 1a | |
| `pins/models.py` | `sanpo_maps/models.py` へ統合（ファイル削除） | 1b | |
| `pins/exceptions.py` | `sanpo_maps/exceptions.py` へ統合（ファイル削除） | 1b | |
| `pins/upload_router.py` | `sanpo_maps/photos/router.py` | 1a | 役割名に揃えて改名 |
| `pins/dev_storage_router.py` | `sanpo_maps/photos/dev_storage_router.py` | 1a | |
| `pins/photo_attacher.py` | `sanpo_maps/photos/photo_attacher.py` | 1a | |
| `pins/thumbnails.py` | `sanpo_maps/photos/thumbnails.py` | 1a | |
| `pins/photo_keys.py` | `sanpo_maps/photos/photo_keys.py` | 1a | |
| （新規） | `sanpo_maps/maps/access.py`、`sanpo_maps/photos/cleanup.py`、`sanpo_maps/advisory_locks.py` | 2 | |
| `main.py` | import パスのみ | 1a/1b | router の include 順・例外ハンドラは変えない |
| `all_models.py` | `from sanposcape.sanpo_maps.models import Pin, PinPhoto, PinPhotoUpload, PinTag, SanpoMap, SanpoMapMember` の1行に集約 | 1a/1b | |
| アプリ直下 `dependencies.py` | 1a は import パスのみ。2 で `get_sanpo_map_contents()`・pins の import・port の段落・`__all__` の該当要素を削除 | 1a → 2 | |
| `integrations/aws/s3.py` | コメント中のパス（モジュール docstring・`S3_DELETE_OBJECTS_MAX_KEYS` 等の注記・`FakeObjectStorage` の docstring）だけ更新。**S3 キーの `staging/pins/` 等は変えない** | 3 | |
| `alembic/env.py`、`scripts/*.py`、`alembic/versions/*` | **変更なし**（`all_models` 経由・歴史的なマイグレーションのため） | - | |

## 検討した選択肢

### サブパッケージの切り方

| 案 | 内容 | 評価 |
|---|---|---|
| **A（採用）** | 共有カーネル（直下）+ `maps/`・`pins/`・`photos/` | 依存の向きを1本の列（kernel ← photos ← maps ← pins）で書ける。各サブパッケージの中は他ドメインと同じ役割名のファイル（router/service/repository…）になり、既存の naming-convention.md をそのまま使える |
| B | `maps/` + `pins/` の2つだけ（写真は pins 内） | pins が約3,000行のまま残り、写真の保管・アップロード枠（S3・時間予算・Pillow）とピン本体の CRUD が同じ `service.py`・`repository.py` に混ざる |
| C | 直下にフラットに置き、ファイル名に接頭辞（`map_service.py`・`pin_service.py`…） | 約25ファイルが1階層に並ぶ。「ドメイン名はフォルダで表し、ファイル名に重ねない」規約（naming-convention.md 基本方針）に反する |
| D | 地図のファイルを直下に残し、`pins/`・`photos/` だけサブパッケージにする | 移動が最小になる。ただし直下に「共有カーネル」と「地図の層」が混ざり、地図 service が `photos` を使う一方で `photos` は直下の `models.py` を使うため、パッケージ単位では直下 ⇄ photos が循環する |
| E | 層で切る（`routers/`・`services/`・`repositories/`） | 「ドメイン単位の凝集 × レイヤー分離」（folder-structure.md の前提）に反する |

### モジュール名

- **`sanpo_maps` を残す**を採用。却下: 名前を `pins` にする（地図が子のように見える。
  `pins/pins/` と重なる）。新しい名前にする（`pin_maps` 等。ADR-009 に無い語が増える）。

### Service 循環の解き方

- **却下**: `PinService` が `SanpoMapRepository` を直接使い、解決ロジックを `PinService` に
  書く。「最初の地図」の名前（`FIRST_SANPO_MAP_NAME`、mobile と一致させる定数）や既定地図の
  選び方という地図の知識が pins に漏れる。
- **却下**: 横断ユースケース層（application service）を新設する。横断フローは
  「ピン作成」「地図削除」の2つだけで、どちらも上位サブパッケージの Service が自然に持てる
  （M5）。層を足すと router → usecase → service の3段になり、他ドメインと形がさらに離れる。
- **却下**: `SanpoMapService` に `PinService` を注入する。Service 同士の依存がまた生まれる
  （M3 違反）。

### ADR の置き場所

- **新規 `docs/adr/ADR-011-…` + ADR-009 への注記追補**を採用。置き換える内容がコードの配置と
  モジュール内の規則で、ADR-009 の主題（データモデル・写真アップロードの API 契約）ではない。
  ADR-009 は既に約1,190行あり、規則の一次記録を独立させた方が folder-structure.md から
  参照しやすい。`adr-writing` skill の「まず既存 ADR への追補を検討」は、決定29 の一部撤回を
  ADR-009 の追補（注記）で記録することで満たす。backend 専用フォルダ
  （`packages/backend/docs/adr/`）ではなく `docs/adr/` にするのは、「地図とピンは1つの
  境界づけられたコンテキスト」というドメイン上の判断を含むため。
  ※ `packages/mobile/adr/ADR-011-…` と番号が並ぶが、フォルダごとの連番なので問題ない
  （ADR-009 も同様）。

## 決定理由

`sanpo_maps` に統合し port を撤去する構成にしたのは、**実行時の相互依存を型で表現できない
port（Protocol + メソッド引数注入）よりも、依存の向きに沿った素直な参照（下位の Repository
へのクエリ、commit しない部品への注入）の方が、コードを読んだときに依存グラフと実装が一致する**
ため。地図・ピン・写真が要件として強く結びついている（権限・ライフサイクル・トランザクションを
共有する）以上、別ドメインとして無理に分けて port で繋ぐより、1つのモジュール内でサブパッケージ
として分け、AST テストで依存方向を固定する方が、追加要件（BK-2 のアカウント削除時の写真削除等）
が来たときにも同じ枠組み（M1〜M9）で判断できる。

## 影響

### ポジティブな影響

- `PinService` と `SanpoMapService` が互いを import・保持・呼び出ししなくなった
  （`test_architecture.py` が M1〜M5・M7・M8 と番兵を AST で固定）。
- advisory lock の重複関数が1箇所（`sanpo_maps/advisory_locks.py`）に統合された。
- 地図削除・ピン削除・写真削除の3箇所が同じ `PhotoObjectCleaner` を使うようになり、時間予算の
  判定ロジックの重複が無くなった。
- モジュール内規則（M1〜M9）が明文化・AST 検査化されたことで、次に他ドメイン（BK-2・BK-7 等）
  が地図・ピンの機能を必要としたときの判断基準（M7 の公開面をどう広げるか、M9 のユースケース層を
  導入すべきか）が事前に用意されている。

### ネガティブな影響・トレードオフ

- ロガー名が変わる（`sanposcape.pins.service` → `sanposcape.sanpo_maps.pins.service` 等）。
  CloudWatch Logs Insights のクエリでロガー名を直接指定している場合は影響するが、grep で
  確認した範囲では該当する運用設定は無い。
- `sanpo_maps/maps/` とアプリ直下の `maps/`（探索・経路ドメイン）が同名になる。パスを書くときは
  必ずモジュール名から書く規則（folder-structure.md）を徹底する必要がある。
- `SanpoMapSummaryRead`・`SanpoMapUpdate` の docstring に残る「他ドメイン（`pins/schemas.py` の
  …）」という語が実態と合わなくなった。OpenAPI の差分を避けるため本チケットでは残した
  （下記「将来の課題」）。

### 移行・対応が必要な事項

- [x] 段階1（配置の移動）・段階2（Service 再設計）・段階3（本 ADR・docs・agent-memory の
      パス更新）をすべて完了。
- [x] `SanpoMapSummaryRead`・`SanpoMapUpdate` の docstring の古い語（「他ドメイン
      （`pins/schemas.py` の…）」）は、次に openapi.yaml を変更するチケットで一緒に直す。
      → SS-136 で `openapi.yaml` の変更（地図のタグ一覧 API の追加）と一緒に直した。
- [ ] `pins/service.py`（約650行）が約800行を超えるか、写真確定処理（`_prepare_photos`/
      `_commit_photos`）を使う3つ目のユースケースが現れたら、確定処理を `photos/` の部品
      （`PhotoConfirmer` 等）へ切り出すことを検討する。本チケットでは行わない
      （理由: `create_pin`・`add_photos` の写真確定には、真に同時な冪等リトライへの
      フォールバックとロック取得順序という壊れやすい不変条件があり、境界整理が目的の
      本チケットで動かす利益が無いため）。
- [ ] 将来 BK-2（アカウント削除時の写真削除）・BK-7（招待）等の他ドメインが地図の権限・
      写真削除を必要とする場合は、M7 の公開面（`sanpo_maps.models`・`sanpo_maps.exceptions`・
      各 `router`）を本 ADR への追補で意識的に広げてから使う。
- [ ] `sanpo_maps/photos/service.py` の `PinPhotoUploadService.delete_upload`（アップロード枠の
      取り消し）は、commit 後の staging 削除で `ObjectStorageUnavailableError` だけを捕捉している
      （他の commit 後の後始末は `PhotoObjectCleaner.delete_best_effort()` の `except Exception`）。
      想定外の例外は commit 後にもかかわらず router まで伝播しうる。統合前（旧 pins の service）
      からの挙動をそのまま移したもので、揃えると振る舞いが変わるため本チケットでは直さず、
      別チケットで「commit 後の後始末は例外を外に出さない」に揃えるかを判断する
      （SS-137 ローカルレビュー、2026-09-28 ユーザー判断で見送り）。

## 関連情報

- [ADR-009: 地図（SanpoMap）とピン（Pin）のデータモデル、写真の先行アップロードとサムネイル生成](./ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)
  —— 決定29（SS-113 追補）が本 ADR で置き換わる port 構成。地図・ピンのデータモデル・API 契約は
  引き続き ADR-009 が一次記録
- [packages/backend/docs/folder-structure.md](../../packages/backend/docs/folder-structure.md)
  「複数エンティティを持つドメイン（`sanpo_maps/`）」節
- [packages/backend/docs/naming-convention.md](../../packages/backend/docs/naming-convention.md)
- `packages/backend/src/sanposcape/sanpo_maps/tests/test_architecture.py`
  —— M1〜M5・M7・M8 を AST で検査する実装（M6・M9 はレビューで確認）
- Plane: SS-137（本 ADR）、SS-113（本 ADR が置き換える port 構成の導入元）
