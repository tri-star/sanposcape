---
name: project-feature-flags
description: /app-config（フィーチャーフラグ・最低サポートバージョン）の mobile 側契約と、計画時に踏みやすい落とし穴
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-008-deploy-release-separation.md
---

# `/app-config` とフィーチャーフラグ（SS-100 で設計）

一次資料: ルートの `docs/adr/ADR-008-deploy-release-separation.md`（決定2 / 決定6 / 決定9 と
追補 D1・D2・D5・D7・D9・D10）、`docs/release-runbook.md`。

**契約の要点**（backend SS-98 で実装済み・`packages/backend/openapi.yaml` 反映済み）:

- `GET /app-config` は**認証不要・DB を触らない**。`Cache-Control: no-store`（ヘッダーは
  OpenAPI に出ないので Orval からは見えない）。
- `flags` は**固定キーではなく map** (`{[key: string]: boolean}`) → mobile 側でキー定数を自前定義する
  （ADR-008 追補 D1 の申し送り）。フラグの正典は backend の
  `packages/backend/src/sanposcape/core/feature_flags.py` の `FEATURE_FLAGS`（`audience: "client"`）。
  2026-09 時点で公開フラグは疎通確認用の `app_config_probe` 1件のみ（最初の実フラグで削除される）。
- `config_source` は診断専用。**クライアントはこの値で分岐してはいけない**（内部型から落として
  構造的に防ぐのが SS-100 の方針）。
- `minimum_supported_versions.{ios,android}` は `string | null`。`null` = 促さない。
  **比較とアップデート促進 UI は SS-101 の責務**（backend の docstring にも明記されている）。
- 取得失敗・未配信・未知キーはすべて **OFF**（決定9 のフェイルセーフ）。
  逆に「公開済み機能の kill switch」は AppConfig ではなく環境変数（安全側が ON のため。追補 D8）。

**ローカル/テストでフラグを ON にする手段は backend 側にある**（mobile にモード env は作らない）:
`ENV=local|test` + `FEATURE_FLAG_MODE=stub` +
`FEATURE_FLAG_STUB_DOCUMENT='{"app_config_probe":{"enabled":true}}'`（`packages/backend/src/sanposcape/config.py`）。
E2E は実 backend を叩き、`APPCONFIG_*` の ID 未設定なら `config_source:"default"` で全 OFF。

## 計画時に踏みやすい落とし穴（SS-100 で判明）

- **`/dev-screens` と `/design-system` は `__DEV__` ガード**で、preview/release ビルドでは `/` に
  Redirect される。→ **Maestro E2E からは開けない**。「dev 画面に出して E2E で確認する」プランは書けない。
- **`src/api/queryClient.ts` の `registerSessionCleanup(() => queryClient.clear())` は
  ユーザー非依存のキャッシュまで消す**。TanStack Query の `clear()` はマウント済み observer の
  再取得を保証しないため、消えたキーに対する後続の `invalidateQueries` は空振りしうる。
  ユーザーに紐づかないサーバー状態を足すときは、クリア対象から明示的に除外することを検討する
  （除外は列挙式にして fail-safe の向きを保つ）。
- **TanStack Query の `refetchOnWindowFocus` は RN では効かない**（`focusManager` を配線していない）。
  フォアグラウンド復帰で再取得したいときは `AppState` を自前購読する。グローバルに `focusManager` を
  配線すると全クエリの挙動が変わるのでスコープ外の副作用になる。
- **Orval の faker モックは map 型のキーもランダム生成する**
  （`getGetAppConfigResponseMock()` は `flags` のキーを `faker.string.alphanumeric(5)` で作る）。
  → msw ハンドラには必ず明示的なレスポンスを渡す。
- 依存追加（AsyncStorage / persist-client など）のコストは
  「E2E APK キャッシュを1回ミスさせる」ではない（この前提は mobile ADR-004 が 2026-08-14
  追補で撤回済み。`toolsets-libraries.md` も「依存追加時の APK キャッシュミスは論点にならない」と
  明記）。実際のコストは、AsyncStorage がネイティブモジュールのため development build の
  作り直しが必要になること（mobile ADR-003）と、依存追加一般に伴う `minimumReleaseAge`（2日）の
  待機コスト。「永続キャッシュを持つか」の判断ではこちらを天秤にかける（ADR-008 追補 D14 参照）。

Related: [[mobile-structure]], [[planning-constraints]], [[project-e2e-ci-constraints]]
