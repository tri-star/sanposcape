---
name: security-mobile-auth
description: mobile の認証まわりのセキュリティレビュー観点 — 認証ゲートとゲスト、mode 系 env の fail-closed、保存 CTA のゲート（SS-37）、破壊的操作の4点（SS-62）、/app-config のフラグ（SS-100）
metadata:
  type: feedback
  scope: durable
  adr: packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md
---

設計の正本は ADR-002（認証方式・fail-safe な既定）、ADR-M-009（ゲート・ゲスト・退避・削除後の扱い）、ADR-M-008 決定4・6（保存と後始末）、ADR-008（フラグ）。
構造の説明は正本に任せ、ここには差分で確かめることだけを置く。

## 認証ゲートとゲスト

1. `PUBLIC_ROOT_SEGMENTS` に新しいルートの先頭セグメントが誤って足されていないか（`app/` 直下への追加だけなら `AuthGate` が自動で保護する）。
2. ゲストは保護ルートに入れる前提（SS-57）。認証必須の機能は画面・通信側（`enabled: isSignedIn` 等）で止めているか。
3. UI が `services/auth` のバレルを import していないか。ゲスト時に `user`（PII）を読まず `status` だけ読んでいるか（`SettingsView` が模範）。
4. `useScreenBack` の `fallbackHref` がハードコードのリテラルのままか。route params・クエリ（`next=` 等）・API 応答由来になったらオープンリダイレクトを疑う。
5. 戻る操作で `endWalk()` などの進行中データの破棄を呼んでいないか。`useAuthSessionStore` 自身が `registerSessionCleanup()` に登録されていないか。

**再指摘しない受容済みの Low:** `_sitemap` が本番に含まれる、`status === "loading"` の間のゲート素通し（ADR-M-009 で受容）。

## mode 系の env を足す PR（`EXPO_PUBLIC_*_MODE` など）

SS-8 では fail-open な既定と変数名の不一致が重なり、production だけで認証バイパスになる構造だった（SS-10 で是正。backend の `AUTH_MODE` / `MAPS_MODE` でも同じ罠を踏んだ）。
1. コードが読む変数名と `eas.json` / `app.config.ts` の変数名が一致しているか。
2. 既定値が fail-closed か（未設定・未知の値は安全側。`src/config/*Mode.ts` の完全一致方式）。
3. `eas.json` の `build.production` に明示されているか（または不要な設計か）。
未対応なら P2。

## 保存 CTA と自動再送（SS-37）

`useAuthActions.ts` / `postSignInDestination.ts` / `walkSaveTrigger.ts` / `useFinishedWalkStore.ts` の差分で最初に確かめる:
1. `signInForSaveRequested` のゲートが外れていないか。特に「同一ドラフトの認証状態変化による再発火」まで無条件になっていないか（共有端末で他人の軌跡が自分のアカウントに保存される）。
2. `dismissTo("/walk-summary")` の分岐が `wantsToSaveFinishedWalk`（意思表示込み）でだけ選ばれるか。

**教訓:** ADR の文言を根拠に重大度を上げるときは、その決定が何を対象にしているかを本文で確かめる（ADR-002 決定6-1 の「マージ」はサーバーに永続化済みのゲスト記録の所有権付け替えで、SS-37 には当たらなかった。ADR-M-009 に記載）。

## アカウント関連の破壊的操作（SS-62 が模範）

1. 確認ダイアログの dismiss と disabled が実行中に確実に効くか（`dismissDisabled` + `Button` の `disabled`）。
2. トークン破棄がキャッシュのクリアより前か（`signOut()` → `tokenStore.clear()` → … → `runSessionCleanup()`）。
3. 401 を「ローカルを掃除して成功」に読み替えていないか。
4. `customFetch` 以外の HTTP 出口を新設していないか。エラー文言は固定でサーバーの本文を出していないか。

## /app-config のフラグ（SS-100）

`/app-config` 関連や `queryClient.ts` の `registerSessionCleanup` の predicate の差分で:
1. 後始末から除外するクエリがユーザー非依存のままか（除外は列挙式で、新しいクエリは既定でクリア対象）。
2. `FeatureGate` / `useFeatureFlag` を認可の代わりに使っていないか（フラグは公開の制御で、権限ではない）。
3. `config_source` 相当の診断値が本番の経路に出ていないか（`isDevToolsEnabled()` のガードは staging では開く。ADR-M-007 SS-148 追補で許容）。
`isFeatureEnabled` は `flags[key] === true` の厳密比較なので、汚染された値は false に倒れる。この形を崩していないかも見る。
