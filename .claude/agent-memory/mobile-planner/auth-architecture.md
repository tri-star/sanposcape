---
name: auth-architecture
description: 認証(SS-10)の確定設計 — Google直結・自前セッショントークン・AUTH_MODE 3モード。プラン作成時に前提とする決定事項
metadata:
  type: project
---

# 認証アーキテクチャ（確定・ADR-002）

一次資料: `docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md`（2026-07-25 確定）。
**Why:** ユーザーとの議論を経て確定した設計。プランで再検討・変更してはいけない。
**How to apply:** 認証に触れるタスク（SS-10〜SS-13）では必ず ADR-002 を全文読んでから書く。

決定事項の要点:

- IdP は **Google 直結**（Auth0 は不採用）。モバイルは public client、client_secret は存在しない。
- ライブラリは **`react-native-nitro-google-signin`**（Android Credential Manager を無償で使えるため）。
  `GoogleOneTapSignIn.configure/checkPlayServices/signIn/createAccount/presentExplicitSignIn/signOut`、
  判定は `isSuccessResponse` / `isNoSavedCredentialFoundResponse` / `isCancelledResponse`。Expo config plugin あり。
- Google ID token は**サインイン直後の1回だけ** backend に渡し、**backend 発行の自前トークン**
  （短命 access JWT + opaque refresh・ローテーション）に交換。以降の全 API は自前トークンの Bearer。
- スタブは boolean ではなく **`EXPO_PUBLIC_AUTH_MODE = real | dev | mock`、既定 `real`（fail-safe）**。
  `dev` は `POST /auth/dev-session` で **backend API は実物**（ローカル開発 / Maestro E2E）。`mock` は vitest 用。
  旧 `EXPO_PUBLIC_USE_AUTH_STUB`（fail-open）は廃止。`eas.json` preview は `"stub"` → `"dev"`。
- `signUp` は services 層に持たない（backend が JIT 作成）。UI は2画面のまま文言だけ変える。
- ゲストは AuthService のメソッドではなく「トークン非保持状態」で表現する。

## API 契約（SS-10 でユーザー確定）

- **backend のワイヤ形式は snake_case**（`access_token` / `expires_in` / `id_token` / `user_key` / `display_name` 等）。
  既存 `SpotRead.created_at` と規約を揃えるため。**モバイル内部の型は camelCase のまま**で、
  変換は境界2箇所（レスポンス=`sessionMapper.ts` / リクエスト=`authApi.ts`）だけで行う。
- `GET /auth/me` は backend に存在するが **モバイルからは呼ばない**。
  `/auth/session` と `/auth/refresh` のレスポンスに `user` が含まれるため、起動時の往復が無駄に増えるだけ。
- **`POST /auth/dev-session` は `include_in_schema=False`** で OpenAPI に載らない
  → Orval 生成物に出ないので、モバイル側にローカル DTO が恒久的に必要。
- 認証系の PR は **backend 先行 → mobile の2本**に分割する運用。
  mobile 着手前に `packages/backend/openapi.yaml` に `/auth/*` があるか必ず確認する。

## プラン作成時に外してはいけない構造上の制約

- **`src/api/client.ts` は `src/services/auth` を import できない**。循環参照になり、かつ
  `expo-secure-store` / native Google SDK が芋づるで読み込まれて **node 環境の vitest が壊れる**。
  レジストリ（`src/api/authTokenProvider.ts`）を挟んで登録する形にする。
- **`/auth/*` の呼び出しは `customFetch` を通さない**専用の生 fetch にする。
  通すと 401 → refresh → 401 の再帰になる。
- refresh は **single-flight** 必須（同時多発リクエスト対策）。
- refresh 失敗の扱いを分ける: **401 = セッション破棄 / ネットワークエラー = セッション保持**。
- ネイティブ import は「Google SDK ラッパ」と「SecureStore 永続化」の2ファイルに閉じる。
  それ以外は DI で純粋関数にし、vitest でテストする（RN の render テストは書けないため）。
- ネイティブモジュール追加は `@expo/fingerprint` を変える → ADR-004 の E2E APK キャッシュが必ず1回ミスし、
  開発者全員が development build を作り直す必要がある。Android は署名鍵ごと（debug/development/preview/production）に
  **SHA-1 登録**が要る（未登録は `DEVELOPER_ERROR` という分かりにくい失敗になる）。

## 認証ゲートの「1関数だけ変えればいい」は嘘（SS-57 の調査で判明・2026-08-13）

ADR-009 決定3 は「ゲスト散歩の解禁は `canEnterProtectedRoutes` に `"guest"` を足すのが唯一の変更点」と
書いているが、**同関数はゲート以外からも参照されており、1行変更だけでは壊れる**。
**Why:** 実際にプランを書くまで気付けない結合で、気付かないと「起動したらサインイン画面に行けない」
「ログアウトしても画面が固まる」という致命的な回帰になる。
**How to apply:** 認証ゲート/ゲスト可否に触るタスクでは、次の2点を必ず確認する。

- `features/auth/lib/splashDestination.ts` が `canEnterProtectedRoutes` に**委譲**している
  → guest を許可すると未サインインの起動が `/walk-start` 直行になり、サインイン画面（ゲスト導線と
  Google サインインの唯一の入口）に到達できなくなる。E2E も全滅（全フローが起動直後に
  `sign-in-google-button` を待つ）。
- サインアウト/401失効の退避（ADR-009 決定6 / SS-50）は「ゲートが guest を保護ルートで弾く」ことに
  依存している → guest を許可すると遷移せず、`SettingsView` の `isSigningOut` は成功時にリセットされない
  設計なのでダイアログが「ログアウト中...」で固まる。退避は**状態遷移（authenticated → guest）**で
  判定する形に寄せる必要がある。

## 機能側から「サインイン中のユーザー」を使いたくなった時（SS-13 / ADR-009 決定8）

- `.oxlintrc.json` の `no-restricted-imports` override が **`src/features/walk/**` と `src/features/history/**` から
  `@/services/auth` / `@/services/auth/*` / `@/store/useAuthSessionStore` への import を機械的に禁止**している。
  → これらの feature の hook/lib で認証状態を読む設計は書けない（lint で落ちる）。
- ユーザーの identity（`displayName` 等）の**単一の情報源は `useAuthSessionStore.user`**
  （ADR-009 決定1 が「store にサーバー由来データを置かない」原則の明示的な例外として許容した identity snapshot）。
  `GET /auth/me` で取り直す設計にしない（[[project_screens_and_stub_layer]] の記述と併せて、情報源を二重化しない）。
- したがって供給経路は「**ルート（`app/**`。override 対象外）で store を読み、View → hook へ props で注入**」。
  横断 hook（`src/hooks/useSessionDisplayName` 等）を挟んで feature から読む案は、ルールを形式的に回避する形なので
  採るなら ADR-009 の追補が要る。
