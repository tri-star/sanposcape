---
name: project_ss33_loop_route
description: SS-33（散歩ルートの周回化）mobile側レビューの要点。往路/復路描き分け・座標の取り扱い
metadata:
  type: project
  scope: durable
  source_issue: SS-33
  adr: packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md
---

SS-33（`tri-star/SS-33`、2026-08-23 レビュー、対象コミット `6871661`〜`5dc7fc5` の7コミット）で
`POST /explore/routes/walking` が片道ではなく周回（`legs`: outbound/return）を返すようになったことに伴い、
`lib/walkRouteLeg.ts`（`observeWalkLeg` で現在地がどちらの leg にいるかをラッチ判定）、
`lib/walkRouteRequest.ts`（`buildReturnToStartRouteRequest` で復路の「現在地→出発地」片道リクエストを追加）、
`lib/walkRoute.ts`（`resolveDestinationName` で backend の空文字 name を吸収）を新設。
Critical/High 指摘なし。

**Why**: 位置情報（現在地座標）を新しい判定ロジック・新しいAPIリクエストパスに流す変更であり、
[[project_ss35_route_recalculation]] で確立したレート抑制・sequence・AbortControllerの規律の上に
「往路/復路の送り分け」という新しい分岐が乗る変更だったため、座標漏洩・意図しないリクエスト混入・
表示名の空文字/長さ制御の3点を重点確認した。

**How to apply**（今後の周回ルート関連の変更で再確認する項目）:
- 座標・console.log: `observeWalkLeg`/`useWalkLegPhase`/`useWalkRouteRecalculation` とも
  座標をログ出力しない規律を維持（diff全体で `console\.` 該当なしを grep で確認済み）。
- APIリクエスト: `buildReturnToStartRouteRequest` は `place_id: undefined`固定・`destination`は
  `ActiveWalk.origin`（散歩開始時に確定した起点、ユーザー入力ではない）・座標は`roundCoordinate`で
  小数4桁に丸められURLではなくPOST bodyに乗る。ユーザー入力由来の未検証値の混入なし。
- 表示名: backendが`destination.name`に空文字を返しうる契約に対し、`resolveDestinationName`が
  「明示fallback→レスポンス→固定文言"目的地"」の三段フォールバックで必ず非空を保証。
  ただし`fallbackName`自体は`toWalkRoute`内で256 code point制限を再度適用しておらず、
  上流（`SpotCandidate.name`が探索API取得時点で256cp制限済み、または`RETURN_TO_START_DESTINATION_NAME`が
  短い固定文字列）の不変条件に依存する設計（Low/informational、実害なし。多層防御の観点では
  `resolveDestinationName`内でも`truncateUnicodeCodePoints`を通す方がベターだが、現状で崩れている
  経路は無い）。
- 認証境界: `.oxlintrc.json`の`features/walk/**`/`features/history/**`に対する
  auth import禁止ルールは新規ファイル（`walkRouteLeg.ts`等）にも適用範囲として維持されている
  （パスパターンがglobなので新規ファイル追加だけなら自動的に対象）。
- 永続化: ADR-008は「進行中の散歩を永続化しない」判断を維持したまま追補されており
  （`AsyncStorage`/`SecureStore`への新規書き込み経路なし、diffでも該当箇所は無し）、
  [[project_ss19_walk_finish_save]]で指摘したsignOut時の未クリア問題（Medium、別issue）とは独立。
- EXPO_PUBLIC_*: 新規追加なし。
- place_id: レスポンスの`place_id`はUI（Text/Marker）に一切表示されない設計を維持
  （`WalkRouteSummary`/`WalkActiveView`とも`destination.name`のみ表示）。
