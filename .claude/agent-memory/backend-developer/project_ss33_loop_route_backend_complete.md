---
name: project-ss33-loop-route-backend-complete
description: SS-33 backend（POST /explore/routes/walkingの周回化）は実装完了。次はmobile側実装
metadata:
  type: project
  scope: task-local
  source_issue: SS-33
---

SS-33「散歩ルートを『往路と復路が異なる周回(サークル)ルート』で提示する」のうち、
backend 側は 2026-08-22 に実装完了した（`tri-star/SS-33` ブランチ、5コミット + ADR-001追補1コミット）。

**実装内容（6コミットに分割。Step 2 はスキーマのみの意図的な中間コミット）:**
1. `config.py`/`.env.example`/`compose.yaml`: `GOOGLE_MAPS_LOOP_ROUTE_ENABLED`(kill switch)・
   `GOOGLE_MAPS_LOOP_DURATION_FACTOR`(既定1.15)・`GOOGLE_MAPS_ROUTE_DEADLINE_SECONDS`(既定12.0)。
2. `maps/schemas.py`: `WalkingRouteType`/`WalkingRouteLegKind`/`WalkingRouteLeg` 追加、
   `RouteDestination.place_id` を任意化、`WalkingRouteResponse` に `legs`/`return_is_same_path`/
   `route_type` 追加。openapi.yaml 再生成もこの1コミットに含める(mobile が早期に orval を回せるよう)。
   **この時点で service.py 未対応のため意図的にテストが壊れる**(次のコミットで直る)。
3. `maps/geometry.py`(新規、純粋関数): `bearing_degrees`/`haversine_meters`/`midpoint`/
   `offset_point`/`loop_waypoint_candidates`(決定的: 1回目=進行方向+90°・2回目−90°、α=0.25)/
   `path_overlap_ratio`(20mグリッドのJaccard)/`evaluate_loop`(3指標の妥当性判定)。
   定数は実 Google Routes API スパイク実測値をコメントに転記済み。
4. `integrations/google_maps/provider.py`(`ProviderIntermediate`/`ProviderRouteLeg`/`ProviderRoute.legs`
   追加)・`client.py`(intermediatesの送信・FieldMask切替・legsパース)・`fake.py`(2 leg対応)。
5. `maps/service.py`: `_resolve_loop`が経由点候補を順に試し、`evaluate_loop`で採用/再試行/フォールバック
   を判断。`maps/dependencies.py`で新設定値を注入。
6. `docs/adr/ADR-001-map-poi-google-maps-platform.md` にSS-33追補。

**テスト: 335→391 passed（+56件）。ruff check/format --check green。実 Google Routes API での
手動疎通確認も実施済み**（周回: duration_seconds==Σlegs・path長=Σleg長-1を実測で確認。
one_way: legs=[]・place_id省略時destination.name==""を確認）。

**実装時に補った/明確化した判断（プランの記述だけでは決まらなかった箇所）:**
- `client.py` の leg パース: 復路 leg だけが2点未満で壊れている場合、`ProviderRoute.legs` は
  outbound だけの**1件タプル**を返す（両方揃わない・outbound自体が壊れている場合のみ空タプル）。
  `service.py` 側は `route.legs` が空でなければ最新の使える往路として `best_outbound_leg` を
  更新し、`len(route.legs) == 2` のときだけ `evaluate_loop` で評価する2段階チェックにした。
- `GoogleMapsQuotaError`（429相当）は `GoogleMapsUnavailableError` の兄弟クラスで、経由点ごとの
  `except GoogleMapsUnavailableError:` では捕まえない。これは意図的：クォータ超過時に反対側の
  経由点へ再試行するのは無駄なので、1回目でクォータエラーが出たら即座に429として伝播させる。
- 最終フォールバック（intermediatesなしの片道呼び出し）にも「残り時間が尽きていたら呼ばない」
  ガードを追加した（ほぼゼロ秒タイムアウトでの無駄な呼び出しを避ける）。
- StrEnum（`WalkingRouteType`/`WalkingRouteLegKind`）の docstring は `app.openapi()` の
  `description` にそのまま出る。プロジェクトの「description は英語で統一」方針に反して
  日本語が漏れる落とし穴だった → StrEnum への説明は `#` コメントで書き、英語の説明が必要な
  場合は使用側の `Field(description=...)` に書く。

次はmobile側（`route_type`/`legs`/`return_is_same_path`を使った往路/復路描き分け・
SS-35との整合等）。

**2026-08-23 ローカルレビュー追随（A-1/A-2/B-1〜B-6）対応完了**（コード挙動・テスト期待値は不変）:
- `tri-star/SS-33` に2コミット追加（`73e906f` docs / `58e3ccd` chore(コメント)）。
- A-1: Google呼び出しは「品質不採用なら最大2回、応答自体が得られない場合のみ最大3回」が
  正しい実装挙動。根本原因はバックエンド実装プラン文書の「フォールバックは追加のGoogle
  呼び出しをしない」という決定の**見出しと本文の内部矛盾**（見出しは最大2回、本文は
  3回目のフォールバック呼び出しを明示）だった。見出しを本文に合わせて修正し、
  ADR-001・`config.py`コメントも合わせて修正。
- A-2: `_resolve_loop`の経由点ループで`GoogleMapsQuotaError`は兄弟例外として意図的に
  非捕捉。「1回目成功・品質不採用→2回目でクォータエラー」の中間ケースも429を優先する
  （保持済みのbest_outbound_legは使わない）ことをコメントで明記。
- B-1〜B-6: `local-env.md`(新設定3つ)・ADR-001(呼び出し回数/往復時間の取り消し線+追補/
  API契約の転記/経由点幾何の起点・MIN_LOOP_BASE_DISTANCE_METERS明記)・`milestones.md`
  (周回backend完了・mobile未着手を明示)・`project-overview.md`用語集を更新。
- **教訓**: プランのある決定の見出しと本文が食い違っている場合、実装は本文に従うことが
  多いが、見出しだけを読んだ後続作業者・レビュアーが誤解する。プラン文書に見出し／本文の
  矛盾を見つけたら、実装完了後でも見出し側を本文に揃えて直しておくと再発を防げる。
