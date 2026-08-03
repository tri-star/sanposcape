# ADR-003: 散歩記録は「終了時に1回保存する完了済みの散歩」として永続化し、履歴は keyset ページネーションで返す

## 日付

2026-08-01（初版）、2026-08-02 追補（SS-20）

**SS-20「散歩履歴一覧・詳細画面」で追補**した（「移行・対応が必要な事項」の SS-20 への申し送りを実績に更新）。追補部分には `（SS-20 追補）` を付けている。

## コンテキスト

M5「散歩記録・履歴」の起点となる SS-18「backend: 散歩(Walk)モデル・散歩ルート保存・履歴取得API（ユーザー紐付け・認可）」に着手するにあたり、散歩ドメインを backend にどう永続化するかを確定する必要がある。ここで引く境界は、後続の SS-19（mobile: 散歩終了処理）・SS-20（mobile: 履歴画面）がそのまま乗るため、後から変えると両方に波及する。

### 出発点となった状況

M4（SS-15 / SS-16）で「スポット候補の提示 → 徒歩ルートの提示 → 散歩開始 → 散歩中表示」までが動いているが、**backend には散歩に関するレコードが1行も存在しない**。

- 提示される徒歩経路は `place_id` と現在地から Google Routes API を都度呼んで組み立てており、サーバーに永続化していない（[ADR-001](./ADR-001-map-poi-google-maps-platform.md)）。
- mobile は散歩終了時点で「開始時刻・目的地・実活動秒・実測距離・軌跡」を保持しているが、いずれも保存先がない。`useActiveWalk.ts` にも「M5 の散歩記録保存で使う」とコメントが残っている。
- `useActiveWalkStore` は永続化されておらず、アプリを落とすと進行中の散歩が消える。

### 制約として効いた既存実装

- **アカウント削除が DB の `ON DELETE CASCADE` に依存している**。`users/repository.py:delete()` は `refresh_tokens` の CASCADE を前提に1トランザクションで完結する実装で、新しい子テーブルが CASCADE を持たないと `DELETE /users/me` が FK 違反で壊れる。
- **認証は自前セッショントークン**で、`get_current_user` が single choke point（[ADR-002](./ADR-002-auth-google-signin-and-stub-strategy.md)）。認証失敗はすべて 401 に正規化し、403 は返していない。
- **mobile の経過時間は一時停止を除外した値**（`lib/walkElapsed.ts`）。`ended_at - started_at` とは一致しない。
- **mobile の実測距離は GPS ノイズ除去済み**（`lib/walkTrack.ts` が 5m 未満の移動を捨てる）。
- **mobile の依存追加には `minimumReleaseAge` の制約**があり、新規ライブラリの導入コストが小さくない。

## 決定

### 1. 行 = 終了済みの散歩。散歩終了時の `POST /walks` 一発で登録する

散歩開始時に backend へレコードを作らない。`status` のような状態カラムも持たない。進行中の散歩は backend に存在しない。

アプリ強制終了からの復帰は mobile 側のローカル永続化で扱う想定だが、**SS-19 ではスコープ外**とした。SS-19 は「終了時にメモリ上のドラフトを送る」までで、進行中の散歩・未送信ドラフトの永続化は行っていない（保存前にアプリが落ちれば記録は失われる）。恒久対応はフォローアップ課題「mobile: 進行中の散歩と未送信の散歩記録をローカル永続化して復帰できるようにする」で扱う（[mobile ADR-008](../../packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md) の決定5）。

### 2. 軌跡は JSONB の座標ペア配列で保存する

`walks.track_points` を `JSONB` とし、`[[lat, lng], ...]`（小数6桁に丸め）で保存する。API 上は `list[GeoPoint]`（`{latitude, longitude}`）で出し入れし、変換は `walks/mappers.py` の `track_to_storage` / `track_from_storage` が担う。

上限は 10,000 点、`/walks` へのリクエスト本文は 1MiB。

### 3. `client_walk_id` による冪等化。新規は 201、再送は 200

mobile が**散歩開始時**に採番した UUID を `client_walk_id` として受け取り、`UNIQUE(user_id, client_walk_id)` で一意にする。同じ値の再送は既存レコードを返す（レコードは増えない）。

### 4. `duration_seconds` は wall-clock とは別カラムで受け取る

`ended_at - started_at` からサーバーで導出せず、一時停止を除いた実活動秒をクライアントから受け取って保存する。

### 5. 履歴一覧は不透明トークンによる keyset ページネーション

`GET /walks` は `started_at DESC, id DESC` 順で、`limit + 1` 件取得して `next_cursor` を組み立てる。cursor は `base64url("<started_at ISO8601>|<uuid>")` の不透明トークンとし、クライアントは中身を解釈しない。期間指定は `started_after` / `started_before`（半開区間）で行う。

一覧レスポンスは軌跡を含まない（`track_points` は `defer` して SELECT しない）。軌跡を返すのは `GET /walks/{walk_id}` のみ。

### 6. 認可は repository の型で担保し、他人の散歩は 404 を返す

`WalkRepository` の**全メソッドが `user_id` を必須キーワード引数に取る**。`walk_id` だけで引ける口を作らない。他ユーザーの散歩と存在しない ID はいずれも 404（403 は「その ID が存在する」ことを漏らすため使わない）。

### 7. `User` 側に `relationship()` を張らず、`ON DELETE CASCADE` を保つ

`walks.user_id` は `ForeignKey("users.id", ondelete="CASCADE")`。SQLAlchemy 側の `relationship()` は**意図的に追加しない**。

### 8. 提示ルートは保存せず、目的地メタだけを非正規化して持つ

SS-16 が提示する経路（`path`）は保存しない。`destination_place_id` / `destination_name` / `destination_latitude` / `destination_longitude` を `walks` の列として持つ（別テーブルにしない）。

### 9. クライアント申告の距離・時刻を採用する（範囲バリデーションのみ）

`distance_meters` / `started_at` / `ended_at` はクライアント由来の値をそのまま保存する。軌跡からのサーバー再計算はしない。異常値は範囲・整合性のバリデーション（`ended_at > started_at`、24h 上限、未来日付の排除、時計ずれ 300 秒の許容）で弾く。時計ずれの許容値は `walks/schemas.py` の `CLOCK_SKEW_TOLERANCE_SECONDS`（`duration_seconds` が wall-clock を超える分の許容）と `FUTURE_ENDED_AT_TOLERANCE_SECONDS`（未来日付の猶予）で、いずれも 300 秒。

## 検討した選択肢

### 軌跡の保存形式

#### 選択肢1: JSONB の座標ペア配列（採用）

- **概要**: `[[lat, lng], ...]` を JSONB 列に格納。
- **メリット**: 追加依存ゼロ。DB から中身を目視でき、障害調査がしやすい。キー名を持たない2要素配列にすることで `{"latitude":..,"longitude":..}` 比で行サイズが約半分。将来 PostGIS へ移す際もこの列を読んで変換すればよい。
- **デメリット**: polyline に比べれば行サイズは大きい。DB 側で幾何演算はできない。

#### 選択肢2: polyline エンコードした文字列

- **概要**: Google の Encoded Polyline Algorithm で文字列化して TEXT 列に格納。`naming-convention.md` にも `route_polyline` という列名の例があった。
- **メリット**: 行サイズが最小。Google Maps 系のツールとの親和性が高い。
- **デメリット**: mobile にデコード用の新規依存が必要（`minimumReleaseAge` の制約下では導入コストが小さくない）。DB から中身が読めず、壊れたデータの調査が困難。

#### 選択肢3: PostGIS の `geography(LineString)`

- **概要**: 空間型として保存する。
- **メリット**: 距離計算・範囲検索を DB 側で正確に行える。
- **デメリット**: MVP に PostGIS の導入・運用コストが乗る。現時点で幾何クエリの要件がない。

### 散歩レコードのライフサイクル

#### 選択肢1: 終了時に1回だけ作る（採用）

- **メリット**: 「開始したが終了しない散歩」のゴミ掃除という運用課題が MVP に持ち込まれない。API が1本で済む。
- **デメリット**: 進行中の散歩をサーバーから復元できない。複数端末での継続もできない。

#### 選択肢2: 開始時に作成し、終了時に更新する

- **メリット**: アプリ強制終了からサーバー経由で復帰できる。進行中の散歩を他端末から見られる。
- **デメリット**: 放置された「進行中」レコードの期限切れ処理が必要になる。開始・更新・終了で API が増え、状態遷移のバリデーションも必要になる。

### ページネーション方式

#### 選択肢1: keyset（cursor）ページネーション（採用）

- **メリット**: 先頭に新しい散歩が挿入されてもページ間で重複・欠落が起きない。`(user_id, started_at DESC, id DESC)` インデックスで深いページも一定コスト。SS-20 の無限スクロールと噛み合う。
- **デメリット**: 「N ページ目へジャンプ」ができない。cursor の前提（`started_at` が更新されない）を将来の編集機能が壊しうる。

#### 選択肢2: offset ページネーション

- **メリット**: 実装が単純。ページ番号を扱える。
- **デメリット**: 散歩が追加されるたびに境界がずれ、同じ散歩が2回出たり飛ばされたりする。深いページで遅くなる。

### 他ユーザーのリソースに対する応答

#### 選択肢1: 404（採用）

- **メリット**: ID の存在有無を漏らさない。「存在しない」と「権限がない」を区別しないため、列挙攻撃の手がかりを与えない。
- **デメリット**: クライアント側でデバッグ時に原因が分かりにくい。

#### 選択肢2: 403

- **メリット**: 原因が明確。
- **デメリット**: 「その ID の散歩は存在する」ことを応答で教えてしまう。

## 決定理由

**ライフサイクルを「終了時1回」に絞ったのは、MVP に運用課題を持ち込まないため。** 開始時にレコードを作ると、必ず「終了しなかった散歩」が溜まり、その期限切れ判定・掃除・表示除外という仕事が increment ごとに増える。復帰要件は現時点では「アプリを落としても散歩が続く」で足り、それは mobile のローカル永続化で**満たす想定**である（ただし SS-19 時点では未実装。フォローアップ課題に送っており、それまでは保存前の記録が失われる残存リスクがある）。将来サーバー側の進行中管理が必要になっても、nullable な `status` 列を後付けできる余地は残している。

**軌跡を JSONB にしたのは、mobile への依存追加を避けつつ調査可能性を確保するため。** polyline は行サイズでは優れるが、`minimumReleaseAge` 制約のあるモバイル側にデコーダを増やす代償と、「DB を見ても軌跡が読めない」ことの調査コストが、MVP 段階では利得を上回ると判断した。6桁丸め（約 0.11m）は GPS 精度より十分細かく、精度を犠牲にしていない。

**冪等化を最初から入れたのは、散歩終了時の保存が最も失敗しやすい瞬間だから。** 屋外・電波不良の状況で送信するため SS-19 は必ずリトライする。冪等でなければ同じ散歩が履歴に二重に並び、しかもユーザーには削除手段がない（削除 API は今回スコープ外）。冪等キーを**保存直前でなく散歩開始時に採番する**のは、リトライのたびに値が変わると冪等性が効かないため。

**`duration_seconds` を別カラムにしたのは、表示値の不一致を防ぐため。** サーバーで `ended_at - started_at` を計算すると一時停止時間が混入し、終了サマリ（mobile が計算した値）と履歴（サーバーが計算した値）で異なる時間が表示される。ドメイン上「散歩した時間」は実活動秒であり、wall-clock はその近似でしかない。

**認可を repository の引数の型で担保したのは、レビューや規律ではなく構造で守るため。** 「`walk_id` だけで引けるメソッドが存在しない」という状態を保てば、うっかり `user_id` を忘れた実装は書けない。IDOR は追加のチェックを1箇所書き忘れるだけで成立するため、書き忘れようがない形にした。

**`relationship()` を張らないのは、既存のアカウント削除実装との整合のため。** `passive_deletes` 未指定の relationship を追加すると、SQLAlchemy が削除時に子行の FK を UPDATE で NULL にしようとし、DB の CASCADE 前提で組まれた `UserService.delete_current_user` が壊れる。ORM の便利さより、既存の削除経路が壊れないことを優先した。

**クライアント申告値を採用したのは、サーバー再計算のほうが値の食い違いを生むため。** mobile の距離は GPS ノイズを除去した後の値で、サーバーが軌跡から素朴に再計算すると別の数字になる。ランキングや報酬のような competitive な用途がなく改竄インセンティブが無い現状では、範囲バリデーションで異常値だけを弾くのが妥当と判断した。

## 影響

### ポジティブな影響

- mobile は散歩終了時に1リクエスト送るだけでよく、失敗してもそのまま再送すれば二重登録にならない。
- 履歴一覧は軌跡を読まないため、散歩が増えてもレスポンスサイズと I/O が膨らまない。
- `(user_id, started_at DESC, id DESC)` の複合インデックス1本で、一覧・keyset 比較・期間フィルタ・アカウント削除時の CASCADE 検索をすべて賄える。
- 週/月の集計は期間フィルタ付き一覧をクライアントで畳めば足り、専用の集計 API を持たずに SS-20 を組める。
- 認可漏れが「書き忘れ」では起こせない構造になっている。

### ネガティブな影響・トレードオフ

- 進行中の散歩をサーバーから復元できない。端末をまたいだ散歩の継続もできない。SS-19 時点では mobile 側の永続化も無いため、**保存が確定する前にアプリが落ちるとその散歩は失われる**（フォローアップ課題で対応予定）。
- 距離・時刻はクライアントを信頼しており、改竄されうる。将来ランキング等を入れる場合はサーバー再計算への切り替えが必要。
- cursor は `started_at` が不変であることを前提にしている。「散歩の編集」で開始時刻を変更可能にすると前提が崩れる。
- 目的地メタを非正規化しているため、Google Places 側で名称が変わっても履歴の表示名は当時のスナップショットのまま。
- `destination_name` の保存は Google Maps Platform の利用規約上、Place コンテンツの長期キャッシュ制限に触れうる。表示用途に限定し、識別子や認可の入力には使わない運用で扱う。

### 移行・対応が必要な事項

- `GeoPoint` を `maps/schemas.py` から `core/geo.py` へ昇格した（`maps/schemas.py` は再エクスポート）。ドメイン間の直接 import を避けるため。クラス名を変えていないので OpenAPI のコンポーネント名 `GeoPoint` は不変で、mobile の生成物に破壊的変更は出ない。
- `/explore` 専用だったリクエストサイズ制限ミドルウェアを `path_prefix` 引数付きに汎用化し、`core/middleware.py` へ移した。`/explore`（32KiB）と `/walks`（1MiB）で別々の上限を掛けている。
- `WALKS_REQUEST_MAX_BYTES` を追加した（既定 1MiB / 上限 4MiB）。
- SS-19 への申し送り（**クローズ済み**）: 実績は以下のとおり。
  - **対応済み**: `client_walk_id` は散歩開始時（`WalkStartView` の散歩開始時）に `randomUuidV4()` で採番し、`ActiveWalk.clientWalkId` → `FinishedWalk.clientWalkId` と持ち回る（再送でも変えない）。`duration_seconds` には一時停止を除いた `elapsedSec` を送る（`lib/finishedWalk.ts` で wall-clock 秒を超えないようクランプ済み。300 秒のスキュー許容には頼らない）。リクエストは `lib/walkCreateRequest.ts` が snake_case の `WalkCreate` に組み立てる。
  - **未対応（フォローアップ課題へ）**: ローカル永続化。SS-19 はドラフトをメモリ上の Zustand（`useFinishedWalkStore`）にしか持たない。
  - 追加の実装事実: 軌跡は送信直前に `lib/walkTrackPayload.ts` で小数6桁へ丸め・連続重複除去・上限超過時のみ等間隔間引きを行う（記録中の間引き 10m/3秒 + 5m フィルタで通常は上限に達しない）。保存成功時に `invalidateQueries({ queryKey: ["walks"] })` を呼ぶ。
- SS-20 への申し送り（**一部クローズ**、SS-20 追補）: 実績は以下のとおり。
  - **対応済み**: 履歴一覧の無限スクロールは `next_cursor` ベースの `useInfiniteQuery`（`features/history/hooks/useWalkHistory.ts`）で実装した。記録タブの「最近の散歩」・`/walk-history`（一覧）・`/walk-history/[walkId]`（詳細）から閲覧できる。
  - **非スコープで据え置き（スタブ継続）**: 期間フィルタ（`started_after`/`started_before`）と週/月チャートの実データ化は SS-20 のスコープに含めなかった。記録タブの集計表示（週/月チャート・連続日数・歩数目標）は `useHistorySummary` のスタブ値のまま（`docs/milestones.md` に留保を明記）。
  - **保留（次タスクへ再送り）**: 連続日数（streak）をサーバー側に持たせるかどうかの判断は、期間フィルタ・週/月集計と合わせて着手するタスクへ持ち越す。
- 集計 API（`GET /walks/stats`）と削除 API（`DELETE /walks/{id}`）は今回スコープ外。連続日数（streak）は全履歴の走査が必要なため、必要になった時点でサーバー側に持たせるかを判断する（未着手）。

## 関連情報

- [ADR-001: 地図・POI は Google Maps Platform を使う](./ADR-001-map-poi-google-maps-platform.md) — 提示経路を永続化せず `place_id` から都度取得する方針の出典
- [ADR-002: 認証は Google 直結 + backend 自前セッショントークン](./ADR-002-auth-google-signin-and-stub-strategy.md) — `get_current_user` を single choke point とする方針、401 への正規化
- [mobile ADR-008: 進行中の散歩の状態管理とルートキャッシュ](../../packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md) — SS-19 追補で「永続化しない」判断を維持した経緯（決定5）と、保存待ちドラフトの持ち方（決定4）
- [マイルストーン M5: 散歩記録・履歴](../milestones.md)
- `packages/backend/docs/folder-structure.md` — ドメイン単位の凝集 × `router → service → repository` の3層、`core/` への昇格ルール
- `packages/backend/docs/naming-convention.md` — 「提示経路 = `walking_route`」「歩いた軌跡 = `track`」の使い分け
- 実装: `packages/backend/src/sanposcape/walks/`、`core/geo.py`、`core/pagination.py`、`core/middleware.py`
