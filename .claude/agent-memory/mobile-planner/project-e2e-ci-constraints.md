---
name: project-e2e-ci-constraints
description: Maestro/CI の実行モデルと、E2E フローを計画するときに効く制約（503 の根本原因・タグ運用・件数依存の禁止）
metadata:
  type: project
---

## CI の実行モデル（検証済み）

- `.github/workflows/mobile-e2e.yml` は `maestro test packages/mobile/.maestro/` で**ディレクトリ全体**を実行する。トリガは nightly / 手動 / ネイティブ影響パスへの push のみ（`.maestro/**` は**トリガに入っていない**）。
- **Maestro はワークスペース直下の yaml だけを自動実行する**（`flows` の既定は `*`。サブディレクトリは対象外）。→ `.maestro/subflows/` に置いたファイルは `runFlow` からしか実行されない＝共通手順の切り出し先として安全。
- フローヘッダの `tags:` と CLI の `--include-tags` / `--exclude-tags` で実行対象を絞れる（CLI は config.yaml より優先）。`.maestro/config.yaml` は書かなくてよい（`flows` の glob を書き損ねると「1本も実行されないのに緑」になる）。
- `assertVisible` の待ちは短い。通信・画面遷移をまたぐ箇所は `extendedWaitUntil`（`visible` / `notVisible` + `timeout`）を使う。
- **disabled なボタンをタップしても Maestro は失敗しない**（`Button` は `Pressable disabled`）。押下可能条件を示す testID を待ってからタップする設計にする。

## 「候補0件」問題の根本原因（＝差し替えの継ぎ目）

ADR-004 により CI の preview APK には Maps SDK キーが無く（地図は灰色）、CI の backend にも Google server key が無い。
キーが空だと `build_google_maps_provider()`（`packages/backend/src/sanposcape/integrations/google_maps/client.py`）が
`UnconfiguredGoogleMapsProvider` を返し `/explore/places` が 503 → 候補0件 → スポットを選べない →
**`(tabs)` 配下（ナビ/検索/記録タブ）とその先（履歴）に E2E から到達できない**（`(tabs)` に入る唯一の導線は `WalkStartView` の「散歩を始める」）。

→ SS-21 のプランでは backend に `MAPS_MODE=real|fake` と `FakeGoogleMapsProvider` を足す案を提示した（`AUTH_MODE` と同じ fail-safe 方針）。
**注意**: `packages/backend/compose.yaml` は環境変数を1つずつ列挙して渡す方式なので、新しい env は compose.yaml にも追加しないとコンテナに届かない。
実キーを CI に置く案は ADR-004 のコスト方針（課金・シークレット管理）に反するため却下している。

## E2E で assert してはいけないもの

- 地図タイルの描画・候補の件数/名称・距離や時間の具体値（ADR-004）。
- **履歴の件数・空状態**。`EXPO_PUBLIC_DEV_USER_KEY=e2e-user-1` 固定 + DB は CI ラン単位で共有のため、先に走ったフローの記録が残る。
  「`*-loading` が消える」＋「`*-error` が出ない」の2段で “取得が成功して落ち着いた” ことだけを見る。空状態の文言は Vitest（純粋関数）の責務。
- ゲスト導線（`sign-in-guest-button`）。トークン非保持のまま `/explore/places` が 401 になる（認証ゲートの統合は SS-13）。

## 既存 testID（**リネーム禁止**。現行フローが依存）

`splash-screen` / `sign-in-google-button` / `walk-start-screen` / `walk-start-duration-slider` / `walk-start-begin` /
`settings-screen` / `settings-open-logout-dialog` / `logout-dialog` / `settings-confirm-logout`。

状態違いで root の testID を使い回している箇所（`WalkSaveStatus` / `WalkRouteSummary`）は、root を据え置いたまま
**その状態でしか描画されない内側の要素**に `` `${testID}-<state>` `` を足す形で拡張する。
共有プリミティブ（`TabBar` 等）には固定 testID を埋めず、呼び出し側から prefix を注入させる。

Related: [[project-explore-api-contract]], [[feedback-mobile-testing-reality]], [[project-walk-domain-contract]]
