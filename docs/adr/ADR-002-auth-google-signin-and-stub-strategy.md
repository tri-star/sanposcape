# ADR-002: 認証は Google 直結 + モバイル public client + backend 自前セッショントークン、スタブは3モードで切り替える

## 現在有効な決定（要約）

> 最終更新: 2026-10-27（SS-82 追補: Google サインインの失敗の分類とキャンセルの扱い。前回 2026-10-17 棚卸し追補）。本節は本文（追補を含む）を要約したもので、一次記録は本文。
> 本文と食い違う場合は本節の誤りとして本節を直す。

### 決定

- **モバイルは Google に対してのみ public client とし、Google ID token はサインイン直後に1回だけ
  `POST /auth/session` で backend の自前トークンに交換する**。以降の API は自前 access token
  （HS256 の短命 JWT）で呼び、refresh token は opaque + ローテーション + 再利用検知。（本文: 決定1）
- **自前 access token は `X-App-Authorization: Bearer` ヘッダーで送る**。backend は
  `X-App-Authorization` → `Authorization` の優先順で読む。理由（CloudFront OAC の SigV4 署名が
  `Authorization` を使う）は [ADR-005 決定4](./ADR-005-backend-serverless-deployment-lambda-function-url.md)。
  （本文: 決定1、移行・対応が必要な事項、SS-70 追補）
- **Google サインインのライブラリは `react-native-nitro-google-signin`**。Android Credential Manager に無償で対応するため。
  （本文: 決定1、検討した選択肢「Google サインインのライブラリ」）
- **複数プロバイダへの抽象化点は `POST /auth/session` の `provider` フィールド**。Apple 等の追加は
  モバイルのライブラリ1つ + backend の ID token 検証1つが中心だが、ID token 以外の入力（Apple の nonce・氏名）を
  受け渡すため、schemas・`AuthService`・`UserService` にも影響する。Apple の authorization code
  （サインイン時に refresh token へ交換して保存し、アカウント削除時に失効させる）は、`integrations/apple/`
  （REST API クライアント）・`AccountDeletionService`・新テーブル `apple_authorizations` にも影響する。
  （本文: 決定2、「SS-195 追補」節、「SS-197 追補」節、「SS-198 追補」節）
- **モバイルの認証は `EXPO_PUBLIC_AUTH_MODE = real | dev | mock` の3モードで、既定は `real`（fail-safe）**。
  `dev` は実物の backend を使い、トークン発行と `get_current_user` は real と同一のコードパスを通る。（本文: 決定3）
- **backend は `AUTH_MODE`（既定 `real`）を持ち、`POST /auth/dev-session` は `AUTH_MODE=dev` のときだけ存在する**。
  `ENV` が `local` / `test` 以外で real 以外のモードなら起動を失敗させる検証を、許可リスト方式で
  `config.py` の `_validate_environment_settings` 1箇所に集約する。（本文: 決定4）
- **`GOOGLE_ALLOWED_AUDIENCES` には動きうる全プラットフォームのクライアント ID を列挙する**
  （Android = Web クライアント ID、iOS = iOS クライアント ID が `aud` に入る）。AWS では
  Secrets Manager のキー `google_oauth_client_id`（単数形だが複数値）から写される。（本文: 決定4-1、SS-81 追補）
- **`AuthService` は `signIn(provider)` に一本化し、サインイン/サインアップを区別しない**。
  ユーザーは backend が初回サインイン時に JIT 作成する。（本文: 決定5）
- **ゲストは「トークンを持たない認証状態」として表現し、ゲストのまま保護ルート（探索・散歩・記録タブ・設定）に入れる**。
  詳細は [ADR-M-009](../../packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md)。（本文: 決定6、6-1（SS-49 追補））
- **explore 系 API（`/explore/places`・`/explore/routes/loop`・deprecated の `/explore/routes/walking`）は認証任意**。
  未認証時は `ExploreRateLimiter` の client_ip バケットで制御し、匿名の上限は認証済み以下
  （既定 10 / 30）。（本文: 決定6-1、SS-49/SS-93 追補、6-1 追補（SS-33））
- **`POST /walks` は認証必須で、ゲストの記録を後からアカウントへマージする機能は作らない**。（本文: 決定6-1、SS-49 追補）
- **Sign in with Apple は iOS だけで Google と併設し、Google のアカウントとは統合しない**（`provider="apple"` の別ユーザー）。
  Apple は氏名を初回の認可時だけ端末へ返すため `POST /auth/session` に任意の氏名を足し、アカウント削除時は
  サインイン時に交換・保存した Apple の refresh token を REST API で失効させる。
  backend の ID token 検証は `provider="apple"` で受け付け済み（`nonce` は端末の raw 値を SHA256 の hex と
  token の `nonce` で比較し apple では必須、氏名は新規作成時と未設定の既存ユーザーにだけ使い、`APPLE_ALLOWED_AUDIENCES` が空なら 400）。
  （本文: 「SS-195 追補」節、「SS-197 追補」節）
- **mobile は `expo-apple-authentication` で `signIn("apple")` を実装済み**（raw nonce を送り、authorization code は毎回、
  氏名は `/auth/session` の成功まで保持して再送。iOS だけ Apple の公式ボタンを Google の上に置く。フィーチャーフラグでは包まない）。
  保留中の氏名はサインアウト（アカウント削除成功後を含む）で消し、422 の氏名なし再送は成功してから保留を消す。
  （本文: 「SS-199 追補」節）
- **Apple のトークン失効は、サインイン時の code 交換（ベストエフォート）と削除時の失効で実装済み**（SS-198）。
  `POST /auth/session` に任意の `authorization_code` を足し、検証済み ID token の `aud` を `client_id` に
  Apple の `/auth/token` で交換して refresh token を新テーブル `apple_authorizations` に**平文で**保存する
  （交換は DB の前。失敗してもサインインは成功させる）。`DELETE /users/me` は Apple ユーザーの token を
  `/auth/revoke` で失効させてから削除する。**一時障害（タイムアウト・接続失敗・5xx・429・408・425・
  想定外の応答）は削除せず 503**、恒久的な拒否・設定ミス・鍵の未設定・token 無しはログに残して削除を進める。
  client secret（ES256）は呼び出しごとに生成しキャッシュしない。鍵の設定が無くても起動は止めない。
  （本文: 「SS-198 追補」節）
- **Google の SDK の失敗は `googleSignIn.ts` の境界で `toGoogleSignInError` に通し、分類できなくても `unknown` ではなく
  `provider_failed`（端末側の失敗。backend に未到達）にする**。Nitro は例外の `code` を JS に渡さないので、コードは
  メッセージから推定する。Google のキャンセルは連続2回目から案内のトーストを出し（設定不備もキャンセルで返るため）、
  サインインの失敗はキャンセルも含めて端末のログ（`logDiagnostic`）に残す。（本文: 「SS-82 追補」節）
- **access token はメモリ、refresh token は SecureStore に保管し、401 を受けたら single-flight で refresh して1回だけリトライする**。
  （本文: 移行・対応が必要な事項）
- **Google OAuth クライアントは Android が「識別子 + SHA-1」の組ごと、iOS が bundle ID ごとに1つ必要**。
  開発識別子 `com.sanposcape.app.dev` のビルド（E2E / `staging-apk` / クラウドビルド）はすべて同一の鍵を使うため、
  開発用 GCP プロジェクトに登録する Android の組は1つ。iOS クライアントは開発識別子に紐づき、クライアント ID は従来と同じ。
  （本文: 移行・対応が必要な事項、SS-81/SS-79 追補、「SS-79 追補」節）
- **backend の `auth` から `users` へのアクセスは必ず `UserService` を経由する**（`UserRepository` を直接持たない）。
  退会・BAN のような「このユーザーを通さない」判定を `UserService.get_by_id()` の1箇所に置けば、
  `get_current_user` と `AuthService.refresh()` の両方に効くようにするため。（本文: 「棚卸し追補（2026-10-04）」節）
- **認証 API のワイヤ形式は snake_case、モバイル内部は camelCase で、変換は `sessionMapper.ts`（レスポンス）と
  `authApi.ts`（リクエスト）の2箇所だけ**。モバイルは `GET /auth/me` を呼ばない。`POST /auth/dev-session` は
  OpenAPI に載らないため、モバイル側のローカル DTO が恒久的に必要。（本文: 「棚卸し追補（2026-10-04）」節）

### 未解決・持ち越し

- **Android 実機のサインインが未達**（Credential Manager 段階で失敗し backend に到達していない。iOS は疎通済み）。
  失敗原因がアプリ側で汎用メッセージになる診断性の問題は SS-82 で対処した（端末のログにコードと SDK のメッセージが出る）。
  原因の特定は SS-81 で継続。（本文: 決定4-1、移行・対応が必要な事項、SS-81 追補、「SS-82 追補」節）
- **Secrets Manager のキー名 `google_oauth_client_id` が複数値の実態と食い違い、設定漏れを誘発する**問題は SS-84 で扱う。
  （本文: 決定4-1、SS-81 追補）
- **本番識別子 `com.sanposcape.app` 用の OAuth 設定は一部未完了**。本番用 iOS クライアントの作成
  （本番 GCP プロジェクト `680740561437`）と、`app.config.ts` の `PRODUCTION_VARIANT` による
  `iosUrlScheme` の上書きは対応済み（2026-09-30）。残りは本番 GCP プロジェクトでの Android の登録、
  EAS `production` 環境の `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`、
  本番 Secrets Manager の `google_oauth_client_id` 設定（dev のクライアント ID を入れない）。
  （本文: 「SS-79 追補」節、「本番用 iOS OAuth クライアント追補」節）
- **iOS は審査ガイドライン 4.8 により Sign in with Apple の併設が必要**（2026-10-11 に条文で確認）。
  backend の ID token 検証（SS-197）と削除時のトークン失効（SS-198）、mobile のサインイン画面と code の送信（SS-199）は
  実装済み。iOS 実機での疎通確認は SS-196（Apple Developer の設定と鍵）と dev の `apple_allowed_audiences` の投入の後。
  （本文: 移行・対応が必要な事項、「SS-195 追補」節、「SS-197 追補」節、「SS-199 追補」節）
- **`APPLE_ALLOWED_AUDIENCES` と Apple の鍵（`APPLE_TEAM_ID` / `APPLE_SIGN_IN_KEY_ID` / `APPLE_SIGN_IN_PRIVATE_KEY`）を
  staging / production の起動時必須にするかは、本番リリース前に再判断する**。現状はどちらも必須にしていない
  （本文: 「SS-197 追補」節、「SS-198 追補」節）。
- **実機で「削除後に『Apple でサインイン』の連携一覧からアプリが消える」ことは未確認**。SS-199 で端末が code を
  送るようになった（対応済み）。SS-196（鍵の登録と投入）の後に SS-162（アカウント削除導線の確認）で確認する（**2026-10-17 棚卸し追補**: SS-162 はコード上の確認で完了にしたため、実機での失効の確認は SS-208 で行う）。
  （本文: 「SS-198 追補」節）
- **mobile の Sign in with Apple は iOS 実機で未確認**（サインイン・サインアウト・再サインイン、氏名つきの初回サインインが 422 にならず
  氏名が保存されること、Apple のボタンの文言が日本語で出ること）。（本文: 「SS-199 追補」節「未確認」）

### 変更・撤回された決定

- 自前 access token のヘッダー `Authorization` → `X-App-Authorization`（決定は不変、記述のみ更新。SS-70 追補）
- 未認証ユーザーは認証ゲートで弾く（SS-13 時点）→ ゲストのまま保護ルートに入れる（本文: 決定6、6-1（SS-49 追補）。SS-57 で実装）
- 匿名バケットの上限は「低くすることを検討する」→ 認証済み以下（既定 10 / 30）で実装済み（本文: 決定6-1、SS-93 追補）
- E2E 等のビルドが使う Android の鍵: 本番識別子の `build-credential-ci` → 開発識別子の新しい鍵
  （「開発ビルドの全経路が同一鍵」という構造は維持。本文: 移行・対応が必要な事項、SS-79 追補）
- 本文のコンテキスト・ネガティブな影響にある「SHA-1 は署名鍵ごと（debug / EAS development / preview / production）に登録が必要」は
  初版時点の見込みで、現在の開発用 GCP プロジェクトの登録は開発識別子の組1つ（本文: 「SS-79 追補」節）

## 日付

2026-07-25（初版）、2026-08-11 追補（SS-49）、2026-09-06 追補（SS-70）、
2026-09-12 追補（SS-81）、2026-09-13 追補（SS-79）、2026-09-21 追補（SS-93）、
2026-09-30 追補（本番用 iOS OAuth クライアント）、2026-10-04 追補（棚卸し: SS-10 で確定した境界と API 契約）、
2026-10-11 追補（SS-195: 審査ガイドライン 4.8 と Sign in with Apple）、
2026-10-11 追補（SS-197: backend の Apple ID token 検証）、
2026-10-12 追補（SS-198: アカウント削除時の Apple トークン失効）、
2026-10-12 追補（SS-199: mobile の Sign in with Apple）、2026-10-17 棚卸し追補（Apple の失効の実機確認の担当を SS-208 に移した）、
2026-10-27 追補（SS-82: Google サインインの失敗の分類とキャンセルの扱い）

**SS-70「mobile: CloudFront 経由の API 通信に対応する」で追補**した。決定自体は変えていないが、
アクセストークンを運ぶヘッダーが `Authorization` から `X-App-Authorization` に変わったため、
本 ADR 中のヘッダー名の記述を実装に合わせて更新した（理由は
[ADR-005 決定4](./ADR-005-backend-serverless-deployment-lambda-function-url.md)）。
追補部分には `（SS-70 追補）` を付けている。

## コンテキスト

M3「認証・アプリ骨格」の起点となる [SS-10](https://github.com/tri-star/sanposcape) 「services層: 認証(OIDC)の real/stub 実装と切り替え」に着手するにあたり、以下を確定する必要がある。

- **実認証をどう実装するか**（モバイルアプリという制約下での OIDC の組み立て方）
- **それをどうスタブ化するか**（`architecture-guideline.md` が要求する「認証は services 層でスタブ差し替え可能にする」）

### 出発点となった課題

チームの既存知見は Web アプリのものだった。Web では frontend/backend が同一オリジンに置けたため、

- backend を **confidential client** にして client_secret を秘匿し、
- backend が IdP と authorization code flow を実行し、
- frontend との間は **HttpOnly Cookie の opaque token** で繋ぐ

という構成が取れた。しかしモバイルアプリではこの前提が2つとも崩れる。

1. **同一オリジンが存在しない**。Cookie の土台（オリジン・SameSite・CSRF 防御）が成立しない。React Native の fetch にも Cookie jar はあるが OS 実装依存で、アプリ再起動をまたぐ挙動の保証が弱く、認証基盤にするには不適切。
2. **client_secret を秘匿できない**。アプリバイナリは解析可能なため confidential client になれない。[RFC 8252 (OAuth 2.0 for Native Apps)](https://datatracker.ietf.org/doc/html/rfc8252) は **public client + PKCE + システムブラウザ**（WebView 禁止）を要求する。

### 調査で判明した制約

- **`docs/project-overview.md` は当初 IdP に Auth0 を想定していた**が、ベンダー依存を避けたいという判断から **Google 直結**に方針変更した。これにより Auth0 前提では存在しなかった制約が発生する（下記）。
- **Google は「自社 API 向けの JWT アクセストークン」を発行しない**。Auth0 なら `audience=自分のAPI` の JWT アクセストークンを発行できるが、Google の場合:
  - **access token は不透明文字列**（Google API 用。backend が JWKS で検証できない）
  - **ID token のみが検証可能な JWT**。ただし有効期限は約1時間で、**我々の側から失効させる手段がない**
- **Expo SDK 57 の AuthSession ドキュメントは、IdP 固有ライブラリが存在する場合はそちらを使うことを推奨**しており、`expo-auth-session` の `GoogleAuthRequestConfig` は **deprecated** になっている。つまり「1つの汎用 OAuth ライブラリで複数プロバイダを束ねる」構成は Expo の推奨から外れる。
- **Android の従来の Google Sign-In SDK は Google により deprecated** で、Android Credential Manager への移行が推奨されている。
- **Android 用 OAuth クライアントは SHA-1 証明書フィンガープリントを要求**する。debug / EAS development / preview / production の署名鍵ごとに登録が必要で、[ADR-M-004](../../packages/mobile/adr/ADR-M-004-e2e-build-ci-strategy.md) の fingerprint キャッシュ運用とも噛み合う。

### 既存実装の問題

現行の `packages/mobile/src/services/auth/` には以下の問題があり、本 ADR の決定に合わせて是正する必要がある。

- `AuthService` が `signIn/signUp/signOut(): Promise<void>` のみで、**トークンとユーザー識別の概念を持たない**。このままでは「ユーザーを識別できるスタブ」を表現できない。
- 切り替えが `EXPO_PUBLIC_USE_AUTH_STUB !== "false"` という **fail-open**（未設定なら stub）になっている。
- コードが読む変数名 `EXPO_PUBLIC_USE_AUTH_STUB` と、`eas.json` / ADR-M-004 が焼き込む `EXPO_PUBLIC_AUTH_MODE` が**不一致**。real 実装が入った時点で「production ビルドなのに stub が有効」という事故になり得る。

## 決定

### 1. 実認証: モバイルを public client とし、backend で自前セッショントークンに交換する

```
[real]
app --native Google Sign-In (Credential Manager)--> Google
    => Google ID token (JWT)
app --POST /auth/session { provider: "google", id_token }--> backend
    backend: Google JWKS で ID token を検証 (iss/aud/exp)
             sub -> users テーブルを JIT 作成/引き当て
    => 自前 access token (短命JWT) + 自前 refresh token (opaque, ローテーション)
app --X-App-Authorization: Bearer <自前 access token>--> 以降の全 API
```

- モバイルは **Google に対してのみ public client** として振る舞う。client_secret は使わない。
- **Google ID token は「サインイン直後の1回」しか使わない**。以降のすべての API 通信は backend が発行した自前トークンで行う。
- 自前 access token は **HS256 の短命 JWT**（単一 backend のため対称鍵で十分）。refresh token は **opaque + ローテーション + 再利用検知**。
- Google サインインのライブラリは **`react-native-nitro-google-signin`** を採用する。

### 2. 複数プロバイダへの備えは「backend の provider フィールド」に集約する

抽象化点をモバイルの OAuth ライブラリではなく **`POST /auth/session` の `provider` フィールド**に置く。Apple 等を追加する場合は、

- モバイル: プロバイダ固有ライブラリを1つ追加（例: `expo-apple-authentication`）
- backend: そのプロバイダの ID token 検証実装を1つ追加

で済み、**`AuthService` インターフェースから下流はすべて無変更**になる。

### 3. スタブは boolean ではなく3モードにする

`EXPO_PUBLIC_AUTH_MODE = real | dev | mock`（**既定は `real`** = fail-safe）。

| モード | モバイル実装 | トークン取得元 | backend API | 用途 |
|---|---|---|---|---|
| `real` | `auth.real.ts` | Google → `POST /auth/session`（SS-199 追補: Apple も同じ） | 実物 | 本番 |
| `dev` | `auth.dev.ts` | `POST /auth/dev-session { user_key }` | **実物** | ローカル開発 / Maestro E2E |
| `mock` | `auth.mock.ts` | メモリ上の固定ダミー | **Orval MSW** | vitest |

**設計の中核**: 継ぎ目を「トークンの発行元」だけに置き、`X-App-Authorization: Bearer` を運ぶ HTTP 通信そのものは real/dev で一切変えない。`dev` モードでも **backend のトークン発行コードと `get_current_user` によるユーザー識別は real と完全に同一のコードパスを通る**。異なるのは「Google ID token を検証して `sub` を得る」か「`user_key` から開発用ユーザーを引き当てる」かの入口だけ。

### 4. backend 側の fail-safe

- backend にも `AUTH_MODE`（既定 `real`）を持たせる。
- `POST /auth/dev-session` は `AUTH_MODE=dev` のときだけ **router ごと include する**（本番ではエンドポイント自体が存在しない）。
- **`ENV` が `local` / `test` 以外なら `AUTH_MODE != real` で起動を失敗させる**。

  検証は否定リスト（`env == "production"`）ではなく**許可リスト方式**（「fail-safe な検証をスキップしてよい環境」だけを列挙する）にする。否定リストだと `staging` のような新しい `env` 値を追加した瞬間に、検証対象から静かに漏れるため。

  この許可リストのブロックは **`AUTH_MODE` 専用ではなく、モード系 env と本番必須設定をまとめて検証する唯一の場所**とする（実装: `packages/backend/src/sanposcape/config.py` の `_validate_environment_settings`）。新しい fail-safe 項目は必ずこのブロックに追加し、別バリデータを新設しない（許可リストが分裂すると片方だけ更新される事故が起きる）。

  2026-09 時点でこのブロックが検証しているのは `AUTH_MODE` / `MAPS_MODE`（SS-44 で追加。Maps provider を決定的な fake に差し替えるモード）/ `FEATURE_FLAG_MODE`（SS-98。AppConfig フィーチャーフラグ取得を stub に差し替えるモード）/ `AUTH_JWT_SECRET` / `GOOGLE_ALLOWED_AUDIENCES` / `GOOGLE_MAPS_SERVER_API_KEY` / `DATABASE_DSN`（SS-67）。

  real でない側の呼称はモードの性質に応じて用途別に使い分けている（`AUTH_MODE=dev` / `MAPS_MODE=fake` / `FEATURE_FLAG_MODE=stub`）。名称が揃っていないのは意図的な区別であり、統一漏れではない。

### 4-1. `GOOGLE_ALLOWED_AUDIENCES` は必ず全プラットフォーム分を列挙する（SS-81 追補）

**ID token の `aud` はプラットフォームごとに異なる。** Android は Web クライアント ID、
iOS は iOS クライアント ID が `aud` に入る（`react-native-nitro-google-signin` が
プラットフォーム別のクライアント ID で Google と対話するため）。

したがって backend の `GOOGLE_ALLOWED_AUDIENCES` には、**そのビルドが動きうる全プラットフォームの
クライアント ID をカンマ区切りで設定しなければならない**。片方しか無いと、
**そのプラットフォームだけが `InvalidAudienceError` で 401 になる**。

これは決定1（モバイルを public client にする）の直接の帰結である。却下した選択肢3
（backend を confidential client にする）のメリットとして「Web クライアント1つで済み、
プラットフォーム別クライアント ID が不要」を挙げていたが、その裏返しが実際に運用上の
落とし穴として現れた形になる。

**SS-81 で実際に踏んだ。** dev のシークレットに Web クライアント ID しか入っておらず、
iOS 実機のサインインが 401 になった。しかも**アプリ側には原因の分からない汎用メッセージしか
出ない**ため切り分けに時間がかかっている（診断性の改善は SS-82）。

AWS 環境では Secrets Manager のキー `google_oauth_client_id`（**単数形だが複数値**）が
`core/runtime_config.py` の `SECRET_KEY_TO_ENV` によって環境変数 `GOOGLE_ALLOWED_AUDIENCES`
へ写される。この命名が設定漏れを誘発する点は SS-84 で扱う。

> **`.env.example` と `config.py` のコメント（`Android=Web ID / iOS=iOS ID`）が正しい。**
> `packages/mobile/docs/build-profiles.md` には「`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` が
> `aud` に使う値」という誤った記述があり、SS-81 で訂正済み。

### 5. signUp / signIn は services 層では区別しない

ソーシャルログインでは新規登録と再ログインの区別がなく、backend が初回サインイン時に JIT でユーザーを作成する。UI 上は SS-11 の要件通りサインイン/サインアップの2画面を維持してよいが、**`AuthService` は `signIn(provider)` に一本化**し、画面側は文言のみを変える。

### 6. ゲストは「トークンを持たない状態」として表現する

`AuthService` のメソッドとしての `guest` は持たせず、認証状態（トークン非保持）として表現する。これは [SS-13](https://github.com/tri-star/sanposcape)「認証状態と探索ロジックの分離」で実装に落とされ、探索ロジックが認証に不可分に依存しない形が `.oxlintrc.json` の import 制限により構造的に担保されている（詳細は [ADR-M-009](../../packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md)）。SS-13 時点では未認証をゲートで弾いていたが、SS-49 の合意（下記 6-1）を受けて SS-57 でゲスト散歩を解禁し、`guest` のまま保護ルート（探索・散歩・記録タブ・設定）に入れるようになった。

### 6-1. ゲスト時の backend API 契約（SS-49 追補）

ADR-M-009 が「今回は決めない」として持ち越していた、将来ゲスト散歩を許可する際に backend と合意すべき2つの論点を SS-49 で決定した。

1. **`/explore/places` `/explore/routes/walking` は認証を任意化し、未認証（ゲスト）でも呼べるようにする。**
   - `get_current_user`（認証必須）への依存を、認証任意の依存関数に差し替える。
   - レート制限は既存の `ExploreRateLimiter`（`packages/backend/src/sanposcape/maps/rate_limit.py`）が user_id と client_ip の両方でバケットを持つ設計になっているため、未認証時は client_ip のみのバケットで制御する。
   - 匿名バケットの上限は認証済みより低く設定することを検討する（キャリアグレード NAT 等で IP が複数ユーザー間に共有されうるため）。具体の閾値は実装タスク（SS-56）側で決定する。
     （**SS-93 追補**: SS-56 で実装済み。匿名の上限は `GOOGLE_MAPS_ANONYMOUS_RATE_LIMIT_REQUESTS`（既定 10）、
     認証済みは `GOOGLE_MAPS_RATE_LIMIT_REQUESTS`（既定 30）で、匿名が認証済みを超えないことを
     `config.py` の `_validate_environment_settings` で検証している）
2. **`POST /walks`（散歩記録の保存）は未認証では許可しない。** サインインを促す導線に倒し（[ADR-M-009](../../packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md) の保護ルート方針に従う）、ゲスト記録を後からアカウントへマージする機能は作らない。

**決定理由**: `docs/project-overview.md` が当初から明記していた「記録・履歴の永続化のみが認証を要求する」「ゲストでの散歩開始（記録なし）」という構想に、この2点がそのまま合致するため。マージ機能（ゲストの記録を後からアカウントへ紐付ける案）は、所有権付け替えと `client_walk_id` 冪等キーの再設計という複雑さを伴い、MVP のスコープでは必要性が無いと判断して見送った。

**影響**: mobile 側は `canEnterProtectedRoutes`（`features/auth/lib/authGate.ts`、決定3参照）に `"guest"` を許可として追加し、`SignInView` / `SignUpView` のゲスト導線を復活させた（SS-57 で実装済み）。backend 側の実装は SS-56（先行して main にマージ済み）。詳細は [ADR-M-009](../../packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md)「SS-57 追補」を参照。

### 6-1 追補（SS-33）

SS-33 で新設した `POST /explore/routes/loop` も、`/explore/places` `/explore/routes/walking` と同じ扱いにする。認証は任意（`get_current_user_optional`）で、レート制限も同じ `ExploreRateLimiter`（`/explore/places` と共有のバケット）を使う。新しいバケットは作らない。既存 `/explore/routes/walking` は挙動・スキーマを変えずに `deprecated=True` を付与しただけで、6-1 の扱いは変わらない（詳細は [ADR-007](./ADR-007-loop-route-generation.md) 決定4）。

## 検討した選択肢

### 実認証のアーキテクチャ

#### 選択肢1: モバイルが public client + backend で自前トークンに交換（採用）

- **概要**: 上記「決定」の構成。モバイルは Google と PKCE / ネイティブ SDK で対話し、得た ID token を1回だけ backend に渡して自前セッショントークンに交換する。
- **メリット**:
  - Google 依存が「サインイン直後の1回」に閉じる。以降の API はプロバイダ非依存。
  - **失効・ローテーション・アカウント削除(SS-12)を完全に自前制御できる**。
  - `dev` スタブが real と同じトークン発行コードパスを通るため、**スタブのテスト忠実度が高い**。
  - 複数プロバイダの抽象化点が `provider` フィールド1箇所に集約される。
- **デメリット**: 自前のトークン発行・更新・ローテーションを実装する責任を負う。

#### 選択肢2: Google ID token をそのまま毎リクエストの Bearer にする

- **概要**: 自前トークンを一切発行せず、backend は毎回 Google JWKS で ID token を検証する。
- **メリット**: 実装量が最小。最も間違えやすいトークン発行を自前で書かずに済む。
- **デメリット**:
  - **失効不能**。ログアウト・アカウント削除が最大約1時間効かない。
  - ID token（認証アサーション）を API 資格情報に流用する形になり、意味論的に適切でない。
  - `dev` スタブは backend 側で**検証経路ごと別物**に分岐する必要があり、real とコードパスが乖離する。

#### 選択肢3: backend を confidential client にする（Web の方式の持ち込み）

- **概要**: アプリは `WebBrowser.openAuthSessionAsync` で backend の `/auth/login` を開くだけにし、backend が client_secret を保持して Google と code 交換する。IdP 依存が backend に閉じ、アプリは IdP を知らない。
- **メリット**:
  - Google の設定が **Web アプリケーション用 OAuth クライアント1つ**で済み、**SHA-1 フィンガープリント登録やプラットフォーム別クライアント ID が不要**になる。ネイティブ設定ゼロ。
  - チームの Web での既存知見がそのまま活きる。
- **デメリット**:
  - アプリ↔backend 間にも **PKCE 相当が必須**。Android の custom scheme は他アプリが横取りし得るため、one-time code を `code_challenge` に束縛しないと乗っ取られる。
  - ネイティブのアカウント選択 UI（Credential Manager）が使えず、ブラウザ往復の UX になる。
  - 結局自前トークン発行は必要で、選択肢1に対する実装量の優位はない。

### Google サインインのライブラリ

#### 選択肢1: `react-native-nitro-google-signin`（採用）

- **概要**: Nitro Modules ベースの Google サインインライブラリ。
- **メリット**: **Android Credential Manager に無償で対応**（Google が移行を推奨、旧 SDK は deprecated）。本プロジェクトは `react-native-nitro-modules` を既に導入済み（`@expo/ui` 経由）で土台がある。
- **デメリット**: 新しめのライブラリで情報量が少ない。

#### 選択肢2: `@react-native-google-signin/google-signin`

- **メリット**: 実績・情報量が豊富でハマった時に調べやすい。
- **デメリット**: **Credential Manager 対応が有償プラン扱い**で、無償範囲では deprecated な旧 SDK 経路になる。

#### 選択肢3: `expo-auth-session` の Google プロバイダ

- **メリット**: JS のみでネイティブモジュールが増えない。
- **デメリット**: **`GoogleAuthRequestConfig` は deprecated**。Expo 公式が IdP 固有ライブラリの利用を推奨しており、逆行する。

## 決定理由

- **Web で Cookie を選んだ理由がモバイルには存在しない**。Cookie(HttpOnly) の主目的は「JS にトークンを晒さない = XSS 対策」だが、ネイティブアプリに XSS は無く、代わりに Keychain / Android Keystore という OS 保護の保管先（`expo-secure-store`）がある。したがって Web の構成をそのまま移植する動機は弱い。
- **Google 直結を選んだ時点で「IdP にトークン管理を任せる」旨味が失われる**。Auth0 であれば自分の API を audience とする JWT アクセストークンを発行してもらえたが、Google はそれを提供しない。ID token を API 資格情報に流用する（選択肢2）と失効制御を失うため、**自前トークン発行は避けられないコスト**と判断した。
- そのコストを払う以上、**払った分の見返りを最大化する**構成を選ぶ。自前トークンにすることで、ログアウト・強制失効・アカウント削除(SS-12)が完全に自前で制御でき、かつスタブ設計が最もきれいになる。
- **スタブのテスト忠実度**が決め手になった。選択肢1では `dev` モードが real と同じトークン発行・同じ `get_current_user` を通るため、「スタブでは通るが本番で落ちる」類の乖離が構造的に起きにくい。これは `architecture-guideline.md` が E2E に求める「認証=スタブ / backend API=実物」を最も忠実に満たす。
- ライブラリは、Google 自身が旧 Android SDK を deprecated としている以上、**Credential Manager 対応を無償で得られること**を優先した。Nitro の土台が既にある点も後押しになった。

## 影響

### ポジティブな影響

- mobile ↔ backend の API 通信が real/dev で**完全に同一**になり、ローカル開発と Maestro E2E が本物の API・本物のユーザー識別のまま回せる。
- 認証プロバイダの追加が backend の検証実装1つ + モバイルのライブラリ1つで済み、アプリの大部分に波及しない。
- ログアウト・アカウント削除・強制失効を自前で完全に制御できる（SS-12 の前提が整う）。
- `EXPO_PUBLIC_AUTH_MODE` に統一することで、`eas.json` / ADR-M-004 との変数名不一致と fail-open 既定という既存の事故要因が解消される。

### ネガティブな影響・トレードオフ

- **自前のトークン発行・更新・ローテーション・再利用検知を実装・保守する責任**を負う。認証で最も間違えやすい領域であり、レビューを厚くする必要がある。
- **Android の SHA-1 フィンガープリント登録**が署名鍵ごと（debug / EAS development / preview / production）に必要になり、運用の手間が増える。設定漏れは Android で分かりにくいエラーになりやすい。
- Google サインインが**ネイティブモジュール**のため、導入時に ADR-M-004 の fingerprint が変わり E2E 用 APK の再ビルドが発生する。
- `react-native-nitro-google-signin` は情報量が少なく、問題発生時の調査コストが読みにくい。
- モバイル側の `AuthService` が `Promise<void>` の3メソッドから、トークン・セッション復元を含むインターフェースへ拡張されるため、SS-11 の画面実装は本 ADR 確定後の形に追従する必要がある。

### 移行・対応が必要な事項

- `docs/project-overview.md` の「認証: Auth0（backend: authlib / mobile: OIDC）」の記述を **Google 直結**に更新する。
- `packages/mobile/src/services/auth/index.ts` の切り替えを `EXPO_PUBLIC_AUTH_MODE`（既定 `real`）の3値に変更し、`EXPO_PUBLIC_USE_AUTH_STUB` を廃止する。
- `packages/mobile/eas.json` の `preview.env.EXPO_PUBLIC_AUTH_MODE` を `"stub"` から **`"dev"`** に修正する。ADR-M-004 の該当記述も併せて更新する。
- mobile に `react-native-nitro-google-signin` と `expo-secure-store` を追加する。access token はメモリ、refresh token は SecureStore に保管し、`mock` モードでは in-memory 実装に差し替えられるよう `TokenStore` を抽象化する（vitest の node 環境では SecureStore が動かないため）。
- `packages/mobile/src/api/client.ts` に `Authorization` ヘッダ付与と、401 → refresh → 1回だけリトライを実装する。**同時多発リクエストに備えて refresh は single-flight にする**こと。
  （**SS-70 追補**: 送出するヘッダーは `X-App-Authorization` に変更済み。CloudFront(OAC, `SigningBehavior: always`)
  がオリジンへの SigV4 署名を `Authorization` に入れるため、ビューアが送った `Authorization` はオリジンに届かない。
  詳細は [ADR-005 決定4](./ADR-005-backend-serverless-deployment-lambda-function-url.md)。
  backend は `X-App-Authorization` → `Authorization` の優先順で読むため、本 ADR の設計自体は変わらない）
- backend に `src/sanposcape/auth/` を新設し、`POST /auth/session` / `POST /auth/refresh` / `POST /auth/logout` / `GET /auth/me` と、`AUTH_MODE=dev` 限定の `POST /auth/dev-session` を実装する。`get_current_user` を `dependencies.py` に追加する（既に TODO コメントあり）。
- backend に JWT/JWKS 依存（`pyjwt[crypto]` 等）と `users` / `refresh_tokens` のマイグレーションを追加する。
- backend の OpenAPI 更新後、`pnpm --filter mobile orval` を再実行する。
- **iOS で Google ログインを提供する場合、App Store 審査で Sign in with Apple の併設が要求される**。MVP のリリース計画に織り込む必要がある。
  （**SS-195 追補**: 審査ガイドライン 4.8 の条文で該当を確認し、併設の方針を決めた。下記「SS-195 追補」節を参照）
- （**SS-81 追補。SS-79 でアプリ識別子分割に伴い更新: 下記「SS-79 追補」参照**）
  **Android の OAuth クライアントは署名鍵ごとに SHA-1 の登録が必要**。
  EAS のビルドクレデンシャルは1つの既定構成が E2E / `staging-apk` / クラウドビルドの
  すべてで共通に使われるため、登録する SHA-1 は1つで足りる（`eas build --local` も
  ランナーで鍵を生成せず Expo サーバーの既定クレデンシャルを取得する）。**SS-81 時点では
  この既定構成が `build-credential-ci`（本番識別子 `com.sanposcape.app` 用）だったが、
  SS-79 の識別子分割以降は開発識別子 `com.sanposcape.app.dev` 用の新しい鍵に切り替わって
  いる**（「全経路が同一鍵」という構造は維持）。詳細は
  [build-profiles.md](../../packages/mobile/docs/build-profiles.md)。
- （**SS-81 追補**）**Android の実機サインインは未達**。端末（AQUOS sense3 / Android 11）の
  Credential Manager 段階で失敗し backend へ到達していない。iOS は実機で疎通済み（SS-82 で継続）。

## SS-79 追補: アプリ識別子分割後の OAuth クライアントと GCP 登録状態

SS-79 でアプリ識別子を本番（`com.sanposcape.app`）と開発（`com.sanposcape.app.dev`）に
分割したことに伴い、Google OAuth クライアントと GCP の登録状態を記録する。

- **OAuth クライアントは「識別子 + SHA-1」の組ごとに1つ必要**（Android）/
  「bundle ID ごとに1つ」必要（iOS）。識別子を分割すると、開発用と本番用で別クライアントが
  要るのはこのため。
- **開発用 GCP プロジェクト（`647949159303`）に登録済みなのは開発識別子の組だけ**:
  `com.sanposcape.app.dev` + SHA-1 `83:1C:84:C2:4D:1D:6E:99:13:B4:4A:CA:71:05:3B:B2:3D:00:B5:9E`
  （EAS が生成した開発用の新規 Keystore）。**本番識別子 `com.sanposcape.app` の登録はこの
  GCP プロジェクトには無い**（本番は別の GCP プロジェクトで登録し直す想定。上記
  SS-81 追補の「Android の OAuth クライアントは署名鍵ごとに SHA-1 の登録が必要」の対象は
  開発識別子に置き換わった）。
- **iOS クライアント（`647949159303-53e8cedj7ochfqqhhccc9b9l77jvt7gq`）はクライアント ID が
  不変のまま**。GCP コンソールでこのクライアントの bundle ID を `com.sanposcape.app` から
  `com.sanposcape.app.dev` へ**編集**しただけで、クライアント ID 自体は変わらないことを
  ユーザーが確認した。したがって `app.json` の `iosUrlScheme`・backend の
  `GOOGLE_ALLOWED_AUDIENCES`（Secrets Manager `/sanposcape/dev/shared` の
  `google_oauth_client_id`）はいずれも**無変更**で済んでいる。
- **本番用 iOS OAuth クライアントは未作成**（**2026-09-30 追補: 作成し `app.config.ts` に反映済み。
  下記「本番用 iOS OAuth クライアント追補」節を参照**）。既存クライアントを開発識別子に編集したため、
  `production` プロファイルを使い始める段で本番識別子（`com.sanposcape.app`）用のクライアントを
  新規作成し、`packages/mobile/app.config.ts` の `PRODUCTION_VARIANT` に `iosUrlScheme` を
  追加し、本番の Secrets Manager（`/sanposcape/prod/shared`）の `google_oauth_client_id` に
  Web クライアント ID + 本番用 iOS クライアント ID を設定する必要がある（**dev のクライアント
  ID を入れないこと**）。
- 識別子ごとの署名鍵・登録状態の一覧は
  [build-profiles.md](../../packages/mobile/docs/build-profiles.md) の「アプリ識別子の定義」を
  参照。

## 本番用 iOS OAuth クライアント追補（2026-09-30）

本番 GCP プロジェクト（`680740561437`）に、本番識別子 `com.sanposcape.app` 用の iOS OAuth
クライアントを作成した（クライアント ID `680740561437-1q63dlugo3vrecpvsrd15jsgpt4g57dp`）。

- **`packages/mobile/app.config.ts` の `PRODUCTION_VARIANT` にこのクライアントの iOS URL スキーム
  （`com.googleusercontent.apps.680740561437-1q63dlugo3vrecpvsrd15jsgpt4g57dp`）を追加し、
  `APP_VARIANT=production` のときだけ `react-native-nitro-google-signin` の `iosUrlScheme` を
  上書きする**ようにした。`APP_VARIANT` 未設定時は `app.json` の開発用の値のまま。
  それまでは本番ビルドにも dev クライアントの URL スキームが入っていた（上書きすべき値が無かった）。
- **プラグインが plugins 配列に見つからなければ `expo config` の評価時点で例外にする**。
  名前変更等で差し替えが空振りすると、本番でだけ iOS サインインが壊れ、ビルドや E2E
  （Android のみ）では検出できないため。`APP_VARIANT` の typo を例外にするのと同じ考え方
  （[ADR-M-007](../../packages/mobile/adr/ADR-M-007-expo-config-and-maps-key-injection.md)）。
- **URL スキームと `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` は同じクライアントを指す必要がある**。
  前者はリポジトリ（`app.config.ts`）、後者は EAS の `production` 環境変数と供給元が分かれて
  いるため、クライアントを作り直したときは両方を更新すること。
- **本番の残作業**（本追補時点で未完了。リポジトリ外の設定）: EAS `production` 環境の
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` /
  `GOOGLE_MAPS_ANDROID_SDK_KEY`（secret）、本番 Secrets Manager（`/sanposcape/prod/shared`）の
  `google_oauth_client_id` に Web クライアント ID + 本番用 iOS クライアント ID を設定
  （dev のクライアント ID を入れない）、本番 GCP プロジェクトでの Android の登録
  （`com.sanposcape.app` + 本番鍵の SHA-1。build-profiles.md の「アプリ識別子の定義」参照）。

## 棚卸し追補（2026-10-04）: SS-10 で確定した境界と API 契約

SS-10 の実装とローカルレビューで決めたが、エージェントのメモリとコードコメントにしか残っていなかった
決定を、knowledge-review の棚卸しで本 ADR に移した。決定の時期は SS-10（2026-07 末）。

### backend: `auth` → `users` のアクセスは `UserService` に一本化する

- `src/sanposcape/auth/` から `src/sanposcape/users/` へのアクセスは、常に `UserService`
  （`users/service.py`）を経由する。`AuthService` は `UserRepository` を直接受け取らず、
  ユーザーの引き当ては `UserService.get_by_id()` を使う。
- **理由**: SS-10 の実装では当初 `AuthService.refresh()` が `UserRepository.get_by_id()` を直接呼んでいた。
  このままだと、将来「退会済み・BAN 済みのユーザーを弾く」判定を `get_current_user` だけに足したとき、
  refresh は判定を素通りしてトークンを発行し続ける認可漏れになる。判定の置き場所を
  `UserService.get_by_id()` の1箇所にしておけば、`get_current_user`（`src/sanposcape/dependencies.py`）と
  `AuthService.refresh()` の両方に自動的に効く。
- 当時の例外だった `dependencies.py` の `get_current_user()`（`UserRepository` を直接使っていた）も、
  現在は `UserService` 経由になっている。

### mobile ⇔ backend の認証 API 契約

- **ワイヤ形式は snake_case**（`access_token` / `expires_in` / `id_token` / `user_key` / `display_name` など）。
  他の API のレスポンス（`created_at` など）と規約を揃えるため。**モバイル内部の型は camelCase** のままとし、
  変換はレスポンス側の `src/services/auth/sessionMapper.ts` と、リクエスト側の `src/services/auth/authApi.ts` の
  2箇所に閉じる。
- **モバイルは `GET /auth/me` を呼ばない**。`/auth/session` と `/auth/refresh` のレスポンスに `user` が含まれるため、
  起動時の往復が増えるだけになる。identity の情報源は
  [ADR-M-009](../../packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md) 決定1 のとおり
  `useAuthSessionStore.user` に一本化する。
- **`POST /auth/dev-session` は `include_in_schema=False`**（`auth/dev_router.py`）で OpenAPI に載らない。
  本番に存在しないエンドポイントを公開の API 契約に含めないため。その結果 Orval の生成物にも出ないので、
  モバイル側にはこのエンドポイント用のローカル DTO が恒久的に必要になる。

## SS-195 追補（2026-10-11）: App Store 審査ガイドライン 4.8 と Sign in with Apple

「影響」節で「iOS で Google ログインを提供する場合、Sign in with Apple の併設が要求される」と見込みで
書いていた点を、ガイドラインの条文で確認し、併設の方針を決めた。実装は後続タスク（SS-196: Apple Developer の設定と鍵の登録、SS-197: backend の ID token 検証、SS-198: backend の削除時のトークン失効、SS-199: mobile のサインイン画面）で行う。

### 結論: 4.8 に該当し、iOS では Sign in with Apple の併設が必要

- 4.8（Login Services）は、サードパーティやソーシャルのログイン（例として Google Sign-In を明記）で
  **ユーザーの主アカウント**を作成・認証するアプリに、次の3条件を満たす別のログイン手段を
  **同等の選択肢として**併せて提供するよう求める: 収集を名前とメールアドレスに限る / メールアドレスを
  非公開にできる / 同意なく広告目的でアプリ内の行動を収集しない。Sign in with Apple はこれを満たす。
- 本アプリは Google サインインで `users`（`provider="google"`）を JIT 作成し、散歩記録・履歴の持ち主として
  識別に使っているので、これが 4.8 の「主アカウント」に当たる。
- 例外（自社のアカウントのみを使う / 代替アプリマーケットプレイス / 既存の教育・企業アカウントが必須 /
  政府・業界の電子 ID / 特定のサードパーティサービスのクライアント）は、いずれにも当たらない。
- ゲストのまま散歩できること（決定6・6-1）は 5.1.1(v) を満たすが、4.8 の例外にはならない。
  記録の保存と履歴にはサインインが要り、その手段が Google だけだからである。
- 確認した条文: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) の
  4.8・5.1.1(v)（2026-10-11 に参照）。

### 併設の方針

- **iOS は Google と Sign in with Apple の両方を出す**（Apple だけにする案は採らない）。
  iOS を Apple だけにすれば 4.8 から外れるが、Android（Google のみ）で作ったアカウントに iOS から入れなくなる。
- **Sign in with Apple は iOS だけで出し、Android には出さない**。4.8 は App Store の要件であり、Android で
  Apple を出すには Web フローと Services ID が別に要る。このため、iOS で Apple を選んだアカウントには
  Android から入れない（MVP では許容する）。
- **Google と Apple のアカウントは自動で統合しない**。`users` は `(provider, provider_subject)` の一意制約のままで、
  Apple は `provider="apple"` の別ユーザーになる。Apple はメールアドレスを非公開リレーにできるため、
  メールアドレスで名寄せすることはできない。
- **追加の形は決定2のとおり**とする: モバイルは `expo-apple-authentication` を1つ足し、`AuthService.signIn("apple")` で呼ぶ。
  backend は `POST /auth/session` の `provider` に `"apple"` を足し、Apple の ID token を検証する
  `IdentityProvider` を1つ足す（JWKS は `https://appleid.apple.com/auth/keys`、`aud` は bundle ID）。
  ただし Apple は**氏名を ID token に入れず、初回の認可時にだけ端末へ返す**ため、`POST /auth/session` には
  任意の氏名を足す必要がある（決定2の「下流は無変更」から外れる点）。
- **アカウント削除（`DELETE /users/me`）では Apple のトークンを失効させる**。Apple は Sign in with Apple を使う
  アプリに、削除時に REST API で失効させるよう求めている
  （[Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)）。
  失効には Apple の refresh token が要るので、backend はサインイン時に端末から受け取った authorization code を
  Apple と交換して保存する。交換・失効に使う client secret は Sign in with Apple 用の秘密鍵（.p8）で署名するため、
  その鍵を Secrets Manager に置く（[ADR-004](./ADR-004-secrets-management-and-cicd-aws-credentials.md)）。
  決定1の「ID token はサインイン直後の1回だけ使う」は変わらない。
- **Server-to-Server 通知（同意の取り消し・Apple ID の削除）は初回の対応に含めない**。必須なのは韓国に拠点を置く
  開発者だけで、本アプリは該当しない。
- サインイン画面では、Sign in with Apple のボタンを Google と同等以上に目立たせる
  （4.8 の「同等の選択肢」と Human Interface Guidelines に合わせる）。

## SS-197 追補（2026-10-11）: backend の Apple ID token 検証

SS-195 追補の「併設の方針」のうち、`POST /auth/session` が Apple の ID token を受け付ける部分を実装した。
決定1〜2・SS-195 追補の方針は変えない。実装にあたり、追補に書いていなかった次の点を決めた。
authorization code の交換・Apple の refresh token の保存・削除時の失効は SS-198 の範囲で、本追補は扱わない。

### nonce は端末の raw 値を受け、SHA256 の hex と token の nonce を比較する。apple では必須

- 端末は Apple に `sha256(raw).hexdigest()`（小文字 hex）を渡し、backend には raw を `nonce` で送る。
  backend は同じ変換をして token の `nonce` クレームと定数時間比較する（hex の大小文字は無視）。
- **token の `nonce` と同じ値をそのまま送っても通らない**。token が漏れたとき、`nonce` クレームを送り返すだけで
  通ってしまうと、nonce を検証する意味（盗んだ token の再送を防ぐ）が無くなるため。raw は token から逆算できない。
- `provider="apple"` では `nonce` を必須にする（スキーマで 422、provider でも 401 で二重に防御し、router を経由しない
  呼び出しでも素通りさせない）。token に `nonce` クレームが無い場合も 401。長さは 16〜256 文字
  （16 文字未満はエントロピー不足、上限は低コスト DoS 対策）。
- Google は従来どおり nonce を検証しない（受けても無視する）。端末が渡すようになったら同じ方式で足せる。

### 氏名（`display_name`）は ID token に氏名が無い場合だけ使い、保存済みの値は上書きしない

- Apple は 2 回目以降に氏名を返さない。既存ユーザーに反映すると、消えたり端末側の古い値に戻ったりするため、
  **保存済み（非 NULL）の値は上書きしない**。一方、既存ユーザーの `display_name` が NULL のときは補完する
  （初回のセッション応答を端末が受け取れなかった場合に、再送で回復できるようにするため。NULL を埋める限り
  「消える」「古い値に戻る」は起きない）。provider を問わない意味にした
  （Google は token の `name` が優先されるので挙動は変わらない）。
- `ProviderIdentity.display_name` には詰めない。詰めると `find_or_create` の「None 以外なら更新」で
  既存ユーザーにも毎回上書きされる。別経路の `initial_display_name` として渡す。
- 入力検証: 前後の空白（全角を含む）を除去し、空なら未指定として扱う（422 にしてサインイン自体を失敗させない）。
  除去後 255 文字まで（`users.display_name` の列幅）。制御文字（Cc: NUL・改行・タブ等）、行・段落区切り
  （Zl・Zp）、書式制御文字（Cf: 双方向制御やゼロ幅スペースによる表示なりすまし）を含めば 422
  （NUL は PostgreSQL の text に入らず 500 になる）。絵文字の合字と一部言語の表記に必要な
  ZWJ（U+200D）・ZWNJ（U+200C）だけは許可する。

### メールは `email_verified` が真のときだけ保存する

- Apple は `email_verified` / `is_private_email` を bool と文字列 `"true"` の両方で返す。bool の `True` または
  文字列 `"true"` のときだけ保存し、それ以外は保存しない。非公開リレー（`@privaterelay.appleid.com`）はそのまま保存する。
- メールは識別に使わない（同一性は `sub`）表示用の付随情報であり、未検証のアドレスは持たない方が安全側。
  `is_private_email` は使う機能が無いので保存しない。

### 許可 audience は Secrets Manager の `apple_allowed_audiences`。未設定なら apple だけ 400

- iOS ネイティブの `aud` は bundle ID（dev=`com.sanposcape.app.dev`、本番=`com.sanposcape.app`）。
  `APPLE_ALLOWED_AUDIENCES` に入れ、AWS では Secrets Manager のキー `apple_allowed_audiences` から写す。
  キー名は環境変数名に揃えた（`google_oauth_client_id` が単数形で複数値を持ち設定漏れを誘発した SS-84 の轍を踏まない）。
  bundle ID は秘密ではないが、Google の audience と同じ置き場所にして、運用者が探す場所を1つにした。
- 空のときは `"apple"` をレジストリに登録せず、`POST /auth/session` は 400 `Unsupported provider` を返す。
  401 にしないのは「トークンが悪い」と「サーバが未設定」を端末側で区別できるようにするため。Google は影響を受けない。
- **staging / production の起動時必須チェック（決定4）には含めない**。必須にすると、シークレットへ投入する前に
  デプロイした時点で Google を含む API 全体が起動しなくなる。空でも認証は閉じる側（apple だけ使えない）に倒れる。
  必須化は本番リリース前（SS-198・SS-199 が揃い、本番シークレットへ投入した後）に再判断する。
- 未投入のままデプロイすると、cold start ごとに `missing expected keys` の ERROR ログが出る（API は起動する）。
  あわせて、`APPLE_ALLOWED_AUDIENCES` が空であることを示す WARNING が**プロセスにつき 1 回だけ**出る
  （最初の auth 系リクエストで。レジストリの組み立てはリクエストごとに呼ばれ、未認証でもログ量を増やせるため、
  組み立て自体は副作用を持たせない）。
  投入してからデプロイする（手順は [デプロイ手順](../../packages/backend/docs/deployment.md)）。

### JWKS クライアントのキャッシュは Google と Apple で共有し、`maxsize=4` にする

- 従来の `lru_cache(maxsize=1)` を Apple と共有すると、交互のリクエストで互いのクライアントを追い出し、
  毎回 JWKS を HTTP 取得する（キャッシュが効かないことはテストでは見えない）。

### 今回スコープ外とした事項

- **検証済み `aud` を `ProviderIdentity` に持たせない**。SS-198 の authorization code 交換では検証済み token の
  `aud`（bundle ID）を `client_id` に使うのが安全だが、SS-197 では使わないため足さなかった。`ProviderIdentity` に
  持たせるか、交換を `verify` とは別のメソッドに切り出すかは SS-198 で決める（外部 HTTP は DB トランザクションの前に置く）。
  （SS-198 追補: `ProviderIdentity.audience` に持たせた。「SS-198 追補」節）
- **未知の `kid` を持つ不正 JWT による JWKS 再取得の誘発**は対策しない。PyJWT は `kid` が一致しないたびに JWKS を
  取り直すため、未認証のリクエストで Apple / Google への HTTPS 取得（タイムアウト 5 秒）を起こせる。
  `/auth/*` にレート制限を入れるときにまとめて扱う。
- **OpenAPI の `/auth/session` に 400 / 401 / 503 を宣言しない**。SS-197 以前からの欠落で Apple 固有ではないため、別途扱う。

### 影響

- DB スキーマは変えない（`provider` は CHECK 制約の無い `String(32)`、Apple の `sub` は約 44 文字で `String(255)` に入る。
  `UNIQUE(provider, provider_subject)` により Google と同じ `sub` でも別ユーザーになる）。
- `SessionCreate` に任意の `nonce` / `display_name` を足した。required は増えないので既存の mobile の呼び出しは壊れない。
- 実機の Apple ID token での疎通は SS-196（Sign in with Apple capability）と SS-199（端末側）が揃うまで確認できない。
  Expo Go 経由の token は `aud=host.exp.Exponent` になり拒否される（development build 前提）。

## SS-198 追補（2026-10-12）: アカウント削除時に Sign in with Apple のトークンを失効させる

SS-195 追補の「アカウント削除（`DELETE /users/me`）では Apple のトークンを失効させる」を実装した。
決定1〜2・SS-195 追補・SS-197 追補の方針は変えない（決定1の「ID token はサインイン直後の1回だけ」も不変）。
実装にあたり、追補に書いていなかった次の点を決めた。Apple の REST API の仕様は 2026-10-12 に
Apple の公式ドキュメントで確認した（`/auth/token` と `/auth/revoke` は form-urlencoded、`/auth/revoke` の 200 は
「失効させた、または既に無効だった」で冪等、失敗は 400 + `{"error": ...}`、code は 1 回限り・5 分）。

### `authorization_code` は任意。apple のときだけ使い、google では無視する

- `SessionCreate` に任意の `authorization_code`（1〜512 文字）を足した。required は増やさない。apple でも必須にしない
  （SS-199 より前の端末・古いビルドが壊れないため。code が無ければ交換しないだけ）。google では `nonce` と同じく無視する。
- 形式（文字種）は検証しない。Apple は形式を公開しておらず、厳しくすると Apple 側の変更でサインイン自体が 422 になる。
  上限 512 は低コスト DoS 対策のみ。

### 交換の `client_id` は検証済み ID token の `aud`。`ProviderIdentity.audience` に持たせる

- 交換に要るのは署名検証済みの `aud` だけなので、`verify` の結果（`ProviderIdentity`）に `audience` を1項目足した
  （別メソッドに切り出す案は、token を2回デコードするか、`IdentityProvider` に Apple 専用のメソッドが増えるため採らない）。
  Apple の `aud` は単一の文字列。list で来たときは `client_id` を一意に決められないので `None`（= 交換しない）。
- `client_id` をリクエストから受け取らない（改ざんできる）。`APPLE_ALLOWED_AUDIENCES` の先頭も使わない
  （dev と prod の bundle ID を両方入れたときに取り違える）。失効にも同じ `client_id` が要るので、保存しておく。

### refresh token は新テーブル `apple_authorizations` に保存する。`users` ドメインに置く

- 1 ユーザー 1 行（`user_id` が主キー、`users.id` への `ON DELETE CASCADE`）。列は `client_id` / `refresh_token` /
  `created_at` / `updated_at`。再サインインのたびに upsert で最新の token に上書きする
  （古い token は失効させない。最新を失効させれば認可全体が取り消される）。
- **`users` に列を足さず新テーブルにする**: 既存テーブルへの列追加は、deploy から migrate までの間に `users` を読む全 API が
  500 になる（[ADR-008](./ADR-008-deploy-release-separation.md) 決定7の SS-171 追補）。新テーブルなら影響はこのテーブルを読む
  経路だけで、さらに**読むのを Apple ユーザーの削除と code 付きのサインインに限る**ので、Google ユーザーには空白が無い。
  この「Apple ユーザーのときだけ読む」条件を崩さないこと。`User` に relationship を定義しないのも同じ理由
  （ORM の `session.delete(user)` が子を読みに行くと、migrate 前に Google ユーザーの削除まで 500 になる）。
- **`users` ドメインに置く**: 削除（`users`）が token を読む必要があり、`users` から `auth` は import できない。
  保存は `auth` から `UserService` 経由で行う（棚卸し追補の境界を守る）。
- Apple の REST API クライアントは `integrations/apple/`（`users` と `auth` の両方から使うため `auth/providers/` には置けない）。
  lifespan で1つ作り、`get_apple_sign_in_client` で DI する。

### refresh token は暗号化せず平文で保存する

- この token は Apple の API（更新・失効）にしか使えず、使うには .p8 で署名した client secret が要る。DB だけが漏れても使えない。
  暗号鍵を置く先も .p8 と同じ Secrets Manager になるため、シークレットが漏れる場面では暗号化も破られる。
  得る防御がほぼ無いのに、鍵の管理・ローテーション・復号失敗時の扱いが増える。SQL のバインド値は既に例外に出ない（`hide_parameters`）。
- .p8 と DB の両方が漏れた場合にできるのは、ユーザーの認可の取り消しと Apple の ID token（nonce 無し）の取得まで。
  backend は Apple の ID token に nonce を必須にしているので、それでこのアプリにサインインはできない。
- 暗号化したくなった場合の代替は、`cryptography` の Fernet で暗号化し、鍵を Secrets Manager の別キーに置く
  （列は暗号文の `Text`。鍵のローテーションに MultiFernet が要る）。

### サインイン時の交換は DB の前に行い、失敗してもサインインは成功させる

- 順序: ID token の検証 → **交換（Apple の HTTP）** → ユーザーの解決 → token の保存 → セッション発行 → commit。
  外部 HTTP の間に DB のトランザクション（Neon の pooled 接続）を握らない。
- **交換が失敗（タイムアウト・5xx・429・400・鍵の未設定・想定外の例外）してもサインインは失敗させない**。token を保存しないだけ。
  Apple の一時障害で Apple ユーザーがサインインできなくなる方が影響が大きい。token の無いユーザーは、次のサインインで
  端末が新しい code を送れば自己回復する（SS-199 で毎回送る）。code は 1 回限りなので**再試行しない**
  （タイムアウトでも Apple 側は成功している可能性があり、再送は `invalid_grant` になる）。
- **交換レスポンスの `id_token` の `sub`・`aud` が、検証済みのユーザーと一致するときだけ保存する**。他人の code を自分の
  アカウントに紐付けられると、自分のアカウント削除で他人の認可を取り消せてしまうため。この `id_token` は TLS で Apple から
  直接受け取ったので署名は検証しない（OIDC Core 3.1.3.7）。不一致・デコード不能は WARNING を出して保存しない。
- ログの重み: 未設定は出さない（起動時に1回出している）/ 一時障害・`invalid_grant` は WARNING /
  **`invalid_grant` 以外の拒否はすべて ERROR**（`invalid_client`・`unauthorized_client` は鍵・Team ID・Key ID・bundle ID の
  設定ミス。`invalid_request`・未知のコード・JSON でない 4xx は想定外。どちらも運用者が確認するもの）/
  client secret を生成できない（鍵はあるが署名できない）場合と、クライアントの想定外の例外（安全網。型名だけを出す）も ERROR。
  `invalid_grant`（code の期限切れ・使用済み）だけが利用者・端末起因の想定内で、判定は
  `AppleSignInRejectedError.is_expected_rejection` の1箇所。一時障害のログには固定語彙の `reason`
  （`timeout` / `connect_error` / `request_error` / `http_5xx` / `http_408` / `http_425` / `http_429` /
  `unexpected_status` / `invalid_response`）だけを出し、任意の文字列は載せない。
- **保存の失敗でもサインインは失敗させない**。交換に成功した後の `apple_authorizations` への upsert は SAVEPOINT
  （`db.begin_nested()`）で囲み、`SQLAlchemyError` は型名だけを WARNING に出して続ける。マイグレーション前の空白
  （テーブルが無い）でも、ユーザー作成とセッション発行を巻き込まない。この場合 token は保存されず（code は消費済み）、
  次のサインインで自己回復する。
- **交換結果の `sub`・`aud` が一致しないとき、取得した token は破棄するだけで失効させない（受容）**。入手に他人の code が要り、
  悪用の余地が小さい。失効まで試みると、他人の認可に触る経路が増える。

### 削除は「token を読む → トランザクションを閉じる → 失効 → 削除」。一時障害は 503 で削除しない

| 失効の結果 | 扱い | ログ |
|---|---|---|
| 200 | 削除へ進む | なし |
| 一時障害（タイムアウト・接続失敗・5xx・429・408・425・想定外の応答） | **削除せず 503** | WARNING（`reason` 付き） |
| 400 `invalid_grant`（token が既に無効） | 削除へ進む | WARNING |
| それ以外の拒否（`invalid_client`・`unauthorized_client`・未知のコード・JSON でない 4xx）・client secret の生成失敗・鍵の未設定 | 削除へ進む | **ERROR** |
| Apple ユーザーだが token が無い | 削除へ進む（失効の手段が無い） | INFO |
| Google / dev ユーザー | 失効しない（テーブルも読まない） | なし |

- 一時障害で止めるのは、token が残るのでユーザーの再試行で失効まで完了できるから（Apple の失効は冪等）。mobile は 5xx を
  「時間をおいて再試行」として扱っており、変更は要らない。503 は `{"detail": "Account deletion temporarily unavailable"}`
  （OpenAPI の説明は `Account deletion temporarily unavailable; the account was not deleted`）。
  408・425 は 4xx だが待てば通りうるので一時障害に分類する。3xx は想定外の応答（リダイレクトは追わない）。
  Apple の障害中に削除が続くと 5xx アラームが鳴りうる（意図どおり）。
- 恒久的な失敗で止めないのは、再試行しても直らず、削除できない状態を作る方がアカウント削除の要件（審査 5.1.1(v)）上まずいから。
  ユーザーは iOS の設定から連携を外せる。
- 常に削除を優先する案は採らない: Apple の障害中に削除したユーザーの認可は残り、token も CASCADE で消えるので後から失効できない。
  失効待ちの token を別テーブルに退避して後で再試行する案は、定期実行の仕組みが無いので採らない。
- token を読んだ後・外部 HTTP の前に `commit()` で読み取りだけのトランザクションを閉じる（変更は無い）。再試行はしない。
  失効の後に DB の削除が失敗して 500 になっても、再試行で失効は冪等に成功して削除へ進める。
- 競合（受け入れる）: 読んだ後・削除の前に別端末で再サインインして token を更新すると、新しい token は失効されずに CASCADE で
  消える。ロックを握ったまま外部 HTTP をしない方を優先する（実害は連携一覧に残るだけで、ユーザーが手で外せる。発生頻度が低く、
  読み直しやロックの追加は見合わない）。
- 競合（対処済み）: 失効している間（外部 HTTP の間）に同じユーザーが別のリクエストで先に削除された場合、期限切れの
  `User` を削除しようとすると `ObjectDeletedError`（500）になる。失効の後にユーザーを読み直し、既に無ければ何もせず 204 とする
  （冪等。再現テストあり）。
- タイムアウトは httpx のフェーズごとの上限で、全体の上限ではない。write と pool は connect と同じ値にし、実効の最悪時間は
  `connect * 3 + read`（設定の上限値で 3*3 + 10 = 19 秒。既定は 11 秒）。API Gateway の 29 秒に収まるよう、
  connect の上限は 3 秒、read は 10 秒にした。応答本文のサイズ上限は設けない（相手は TLS の Apple 固定）。

### client secret は呼び出しごとに生成し、キャッシュしない。鍵が無くても起動は止めない

- Sign in with Apple 用の秘密鍵（.p8）で ES256 署名した JWT（`iss`=Team ID、`sub`=`client_id`、`aud`=`https://appleid.apple.com`、
  `kid`=Key ID、`exp`=`iat`+300 秒）。署名は 1 ms 未満で、呼ぶのは code のあるサインインと Apple ユーザーの削除だけ。
  キャッシュすると有効期限・鍵の差し替え・時計の扱いが増え、長命の secret が漏れたときの影響も大きくなる。
- 設定は Secrets Manager の `apple_team_id` / `apple_sign_in_key_id` / `apple_sign_in_private_key`（キー名は環境変数名に揃える）。
  PEM は `SecretStr`。**起動時の必須チェックには含めない**（SS-197 と同じ理由）。3つとも空なら交換・失効だけが無効
  （Apple が有効なときだけ WARNING を1回）、一部だけ・PEM 不正・EC P-256 でない場合は ERROR を1回出して無効扱い
  （項目名だけを出し、値は出さない）。ローカルは通常鍵不要。`AUTH_MODE=dev` でも `POST /auth/session` は使えるので、
  iOS 実機の ID token があればローカルでも Apple ユーザーは作れるが、鍵が無ければ code の交換と失効は行われない
  （失効まで確かめるときだけ鍵を `.env` に書く）。fake モードは足さない（テストは DI の Fake で足りる）。
- client secret の生成に失敗したとき（起動時の検査をすり抜けた鍵の不備など）は、専用の `AppleSignInClientSecretError` にして
  設定ミスとして扱う（交換は ERROR でサインイン続行、削除は ERROR で削除を進める）。一時障害（Unavailable）にすると
  削除が 503 のまま永久に進まなくなり、未設定（NotConfigured）にすると交換側でログが出ず気付けず、
  Apple の拒否（Rejected）に見せると `error` とステータスが実態と食い違うため、どれにも寄せない。
- 秘密（code・refresh token・client secret・交換レスポンスの `id_token`）はログ・例外メッセージ・スパンに出さない
  （[ADR-013](./ADR-013-observability-adot-application-signals.md)）。Apple の応答の `error` は既知の集合に正規化し、任意の文字列を反映させない。

### 影響

- 新テーブル `apple_authorizations`（マイグレーション `add_apple_authorizations`）。deploy から migrate までの間に
  500 になるのは Apple ユーザーの削除だけ。code 付きの Apple サインインは、保存を SAVEPOINT で囲んでいるので失敗しても
  サインインは成功する（token が保存されないだけ）。それでも migrate を先に流すのが推奨
  （[リリース手順](../release-runbook.md) 7.4）。
- `SessionCreate` に任意の `authorization_code` を足した（required は増えない）。`DELETE /users/me` の OpenAPI に 503 を宣言した。
- 鍵を投入するまで、Apple ユーザーの削除は Apple のトークンを失効させずに進む（ERROR ログ）。投入手順は
  [デプロイ手順](../../packages/backend/docs/deployment.md) §3.2。

### 未解決

- 鍵（と `APPLE_ALLOWED_AUDIENCES`）を staging / production の起動時必須にするかは、本番リリース前に再判断する。
- 実機で「削除後に『Apple でサインイン』の連携一覧からアプリが消える」ことは、SS-196（鍵の登録と投入）と SS-199
  （端末が code を送る。対応済み）が揃うまで確認できない。SS-162（アカウント削除導線の確認）で確認する。
  （**2026-10-17 棚卸し追補**: SS-162 はコード上の確認で完了にした。prod の鍵は 2026-10-17 に投入済みで、実機での確認は SS-208 で行う）
- Server-to-Server 通知（同意の取り消し・Apple ID の削除）は対象外のまま（SS-195 追補）。
- Lambda が凍結から戻った後、Apple への古い keep-alive 接続が使われて失効が接続エラー（= 削除が 503）になる可能性がある。
  ユーザーの再試行で回復するので、いまは対策しない。SS-162（2026-10-17 棚卸し追補: SS-208 に移した）の実機確認で起きるようなら
  `httpx.Limits` の `keepalive_expiry` を短くするか keep-alive を切ることを検討する。

## SS-199 追補（2026-10-12）: mobile の Sign in with Apple

決定2（モバイルはライブラリ1つ）と SS-195 追補の方針（iOS だけ Apple を Google と同等に併設）を mobile に実装した。
backend の契約は SS-197・SS-198 追補のとおりで、API の変更は無い。

### nonce は `getRandomBytes(32)` の hex を raw として backend へ、`sha256(raw)` の小文字 hex を Apple へ渡す

backend は raw を受けて SHA256 の hex と token の `nonce` クレームを比べる（SS-197 追補）。raw をそのまま Apple に渡すと 401、省くと 422 になる。
nonce は推測されると意味が無いので、`Math.random` ではなく暗号論的乱数の `expo-crypto.getRandomBytes` を使う。32 バイトの hex は 64 文字で、backend の 16〜256 文字に収まる。

### authorization code は毎回のサインインで送る

backend は毎回 code を refresh token に交換して上書きする。初回だけ送ると、交換に失敗したユーザーが自己回復できない（SS-198 追補）。
交換に失敗しても `/auth/session` は 200 を返すので、端末側では特別な扱いをしない。

### 氏名は成功まで SecureStore に保持し、Apple のユーザー識別子が一致するときだけ再送する

Apple が氏名を返すのは初回の認可だけで、backend への送信に失敗すると二度と取れない。そのため `/auth/session` を呼ぶ前に
SecureStore（refresh token と同じ Keychain。個人情報なので同じ扱い）へ Apple のユーザー識別子と組で保存し、200 の後に消す。
保留は1ユーザー分の単一スロットで、別の Apple ユーザーの氏名つきサインインが保存に成功すると上書きされる。保存に失敗したときは、
ストアに残る別ユーザーの保留分を成功後の消去で巻き込まない（消すのは「今回の保存が成功した」または「保留がこのユーザーのもの」のときだけ）。
**サインアウトでも消す。** 保留が残るのはサインインに失敗した場合だけで、サインアウトした時点で再送の必要は無く、個人情報を端末に残さないため。
real の `onSignOut` が Google のサインアウトと保留の消去を両方試し、どちらの失敗も握りつぶして他方を止めない。
アカウント削除の成功後もローカルのセッション破棄は `authService.signOut()` を経由するので、同じ経路で消える。
識別子が一致するときだけ再送するのは、同じ端末で別の Apple ID がサインインしたとき、前の人の氏名を別アカウントに書き込まないため。
端末側で禁止文字（Cc・Cf・Zl・Zp。ZWJ・ZWNJ は残す）の除去、前後の空白の除去、255 コードポイントへの切り詰めをしてから送る
（backend は禁止文字を含むと 422 にするので、端末側で取り除いて氏名を活かす）。禁止文字の正規表現は Unicode property escapes を使うが、
Hermes が解釈できなくても起動を壊さないよう実行時に生成し、作れなければ除去だけを諦める。

**422 で氏名を送っていたときは、氏名を外して1回だけ再送する。** 氏名が backend の検証で弾かれ続けると、保持 → 再送 → 422 を繰り返し、
その Apple ID ではサインインできなくなる（iOS の Keychain はアプリを再インストールしても残りうるので、利用者には直せない）。
同じ token / code / nonce で再送できるのは、422 が FastAPI のリクエスト検証（ハンドラの前）で返るので code がまだ消費されておらず、
nonce の検証は状態を持たない（token のクレームとハッシュを比べるだけ）ため。
**保留は、氏名なしの再送が成功した後に消す。** 再送の前に消すと、422 の原因が氏名以外（nonce や code の長さなど）で再送も失敗したときに、
Apple が初回しか返さない氏名を失う。再送が失敗したら保留を残してエラーを投げる（次回も「氏名つき → 422 → 氏名なし」を1回ずつ試すだけで、
無限ループにはならない）。422 の `detail.loc` で氏名が原因かを絞り込むことは、backend の 422 の形への依存が増えるためしない。

### エラーの扱い

- `ERR_REQUEST_CANCELED` はキャンセル（無反応）。
- `ERR_REQUEST_UNKNOWN` は capability の欠落など設定ミスでも同じコードになるので、キャンセル扱いにしない（汎用の失敗トースト）。原因が見えなくなるのを避けるため。
- `ERR_UNAVAILABLE`（ネイティブモジュールが無い。iOS 以外・Expo Go 等）も `configuration`。
- `ApiError` 400 は `configuration`（backend の `APPLE_ALLOWED_AUDIENCES` 未設定。`/auth/session` の 400 は `Unsupported provider` だけ）。`/auth/refresh` は 400 を返さないのでセッション破棄の判定には影響しない。
- `AppleAuthentication.signOutAsync` は使わない（サインインのシートが出る。Expo の推奨）。サインアウトは既存の `signOut()` で完結する（保留中の氏名の消去も `onSignOut` に含める）。

### dev / mock は provider を無視する

決定3のとおり、継ぎ目はトークンの発行元だけ。iOS シミュレータの dev ビルドで Apple ボタンを押すと、Google と同じ開発用ユーザーでサインインする。

### 画面は iOS だけ、Apple の公式ボタンを Google の上に同じ高さ・幅で置く

4.8 の「同等の選択肢」と Human Interface Guidelines のため。配色はテーマで黒（ライト）/ 白（ダーク）。Android と web では描画しない。

### フィーチャーフラグで包まない

`/app-config` の取得失敗・未配信は全フラグ OFF に倒れる（ADR-008 決定9）。Apple のボタンが消えて Google だけが残ると、iOS で 4.8 に反した状態になる
（審査中に起きれば却下理由になる）。止めたい場合は backend の `APPLE_ALLOWED_AUDIENCES` を空にすれば足りる（apple だけ 400 になり、端末は「設定が未完了」のトーストを出す）。
トレードオフとして、リリース後に「ボタンだけ隠す」ことはできない（再ビルドか OTA が要る）。

### 影響

- `expo-apple-authentication` の追加で development build の作り直しが要る（ADR-M-003）。
- iOS は entitlement `com.apple.developer.applesignin` が入るので、App ID に Sign in with Apple の capability（SS-196）が要る。

### 未確認

- iOS 実機でのサインイン・サインアウト・再サインイン（この対応の環境では確認できない）。
- Apple のボタンの文言が日本語で出ること。プラグインが `CFBundleAllowMixedLocalizations` を入れるので日本語で出る見込みだが、
  アプリは日本語のローカライズを宣言していない（development region は `en`）。英語で出た場合は `ios.infoPlist` の
  `CFBundleLocalizations` に `ja` を入れることを別課題で検討する（推測では設定を足さない）。

## SS-82 追補（2026-10-27）: Google サインインの失敗の分類とキャンセルの扱い

SS-81 で Android 実機の Google サインインが「サインインに失敗しました。もう一度お試しください。」で失敗し、
backend が一度も呼ばれていないことを CloudWatch Logs で確かめるまで、端末側の失敗だと分からなかった。
原因が分からない状態になること自体を直す（SS-81 の原因の特定とは別）。

### 事実: Nitro は例外の `code` を JS に渡さない

`react-native-nitro-google-signin`（1.3.0）は Nitro（`react-native-nitro-modules` 0.36）の上にあり、ネイティブの例外は
**`message` だけの JS の `Error`** になる。ライブラリの文書は `isErrorWithCode(e) && e.code === ...` と書くが、実機では `code` が来ない。

- Android: 生成コードが `jni::JniException(throwable)` を `jsi::JSError(e.what())` にする。fbjni（0.7.0）の `what()` は
  `printStackTrace` の出力なので、`message` は1行目が `com.nitrogooglesignin.GoogleSignInException: <メッセージ>`（`Throwable.toString()`）で、
  その後に `\tat …` のフレームが続く。推定の正規表現は行頭・行末に固定せず、`AuthError` の message には1行目だけを残す。
- iOS: `Error.toCpp()` が `String(describing: self)` を使うので、`oneTapStartFailed("<メッセージ>")` のような enum の表記。

そのため `error.code` を見ていた分類（`DEVELOPER_ERROR` → `configuration` など）は実機では一度も当たらず、全部 `unknown` になっていた。

### 決定

- **`AuthErrorCode` に `provider_failed` を足す**。プロバイダの SDK が端末側で失敗した（backend に届いていない）ことを表す。
  `ONE_TAP_START_FAILED`（Credential Manager の失敗の既定値）、`PLAY_SERVICES_NOT_AVAILABLE`、サインインの流れでは出ない `SIGN_IN_REQUIRED` /
  `SIGN_OUT_FAILED` / `REVOKE_ACCESS_FAILED` を写す。トーストは汎用の失敗と区別できる Google 用の文言にする。
  `PLAY_SERVICES_NOT_AVAILABLE` は以前の対応表では `configuration` だったが、端末の Play 開発者サービスが無い・古いことで、
  SDK が更新のダイアログを出した後に投げる。その上に「サインインの設定が未完了です」と出すとアプリの不備に読めるので、`provider_failed` に移した
  （以前は `code` が JS に来ず、実機ではこの経路に入っていなかった）。
- **`googleSignIn.ts` が SDK の呼び出しを包み、`toGoogleSignInError`（`authError.ts`。純粋）に通す**。`code` があればそれを使い、
  無ければメッセージから推定する（iOS は case 名、Android はライブラリが固定で付ける文言: DEVELOPER_ERROR の SHA-1 の案内、
  PLAY_SERVICES_NOT_AVAILABLE、Activity が無いときの IN_PROGRESS）。**推定できなくても `provider_failed` にする**。
  Google の SDK から来たことは確かなので、backend に届く前の失敗だと分かるだけで切り分けが進む。
  推定したコード（できなければ `UNKNOWN`）と元のメッセージは `AuthError` の `message` に残す。
- **Google のキャンセルは、連続2回目から案内のトーストを出す**（1回目は従来どおり無反応）。Credential Manager は、
  ユーザーが閉じたときも、SHA-1 の登録漏れ・パッケージ名の誤り・Web/Android のクライアント ID の取り違えのときも
  `RESULT_CANCELED`（ライブラリでは `type: 'cancelled'` の応答）を返し、JS からは区別できない。連続回数は成功・Google のキャンセル以外の失敗
  （Apple のキャンセルを含む）で 0 に戻す。判定は `features/auth/lib/signInFailureFeedback.ts`。Apple のキャンセルは数えない（設定ミスは `ERR_REQUEST_UNKNOWN` で来て区別できる。「SS-199 追補」節）。
- **サインインの失敗は、キャンセルも含めて `logDiagnostic("auth.sign-in.failed", …)` で端末のログに残す**（全ビルド）。
  載せるのは provider・分類したコード・`AuthError` の message（推定したコード、キャンセルならどの段で返ったか）・元の例外の name と message の1行目。
  トークン・メールアドレスは載せない（`ApiError` の本文や SDK の応答を渡さない）。組み立ては `features/auth/lib/signInFailureLog.ts` で、載らないことをテストで固定している。送信はしない（`console.warn` → logcat / Console.app）。

### 採らなかった案

- **内部配布ビルドだけキャンセルで診断を出す**: ビルドの種類で分岐してよいのは開発ツールの表示可否だけ（`config/devTools.ts`、ADR-M-007 SS-148 追補）。代わりにログを全ビルドで出す。
- **アカウント選択の画面が出た後のキャンセルかで分ける**: ライブラリの応答にその情報が無く、JS から判定できない。
- **キャンセルのたびにトーストを出す**: 本当のキャンセルで毎回出るのは煩わしい。
- **ライブラリに patch を当てて `code` をメッセージに埋める**: 保守が増える。推定と「不明でも `provider_failed`」で切り分けには足りる。

### 影響・注意

- メッセージからの推定はライブラリの版に依存する。ライブラリを上げたら、`authError.ts` の `GOOGLE_CODE_BY_MESSAGE` が
  ネイティブ側（`GoogleSignInController.kt`・`GoogleSignInAuthorizationHelper.kt`・`HybridNitroGoogleSignin.swift`）の文言と合っているかを確かめる。
  外れても `provider_failed` に倒れるだけで、無反応や汎用の文言には戻らない。
- 実機で `ONE_TAP_START_FAILED`・設定不備のキャンセルを再現しての確認はしていない（エミュレータでは Google の OAuth の失敗を作れない）。
  SS-81 の実機の調査で、logcat の `ReactNativeJS` に `[sanposcape] auth.sign-in.failed` が出ることを確かめる。

## 関連情報

- [ADR-001(横断): 地図・POI に Google Maps Platform](./ADR-001-map-poi-google-maps-platform.md)
- [ADR-M-003: development build 前提と開発ループ](../../packages/mobile/adr/ADR-M-003-development-build-and-dev-loop.md)
- [ADR-M-004: E2E ビルド・CI 戦略](../../packages/mobile/adr/ADR-M-004-e2e-build-ci-strategy.md)
- [ADR-M-009: 認証セッション状態を1箇所に集約し、認証ゲートで未認証を弾く](../../packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md) — 決定6「ゲストはトークン非保持の認証状態として表現する」を実装に落とした ADR
- [モバイルのアーキテクチャガイドライン](../../packages/mobile/docs/architecture-guideline.md)
- [プロジェクト概要](../project-overview.md)
- [RFC 8252: OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252)
- [RFC 7636: PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [Expo: Using Google authentication](https://docs.expo.dev/guides/google-authentication/)
- [Expo: AuthSession](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- 関連 WorkItem: SS-10（本 ADR の起点）, SS-11（認証画面）, SS-12（backend ユーザーモデル・削除API）, SS-13（認証状態と探索ロジックの分離）, SS-49（決定6-1 追補の起点）, SS-56（backend: explore 認証任意化）, SS-57（mobile: ゲスト導線復活）, SS-195（「SS-195 追補」節の起点）, SS-197（「SS-197 追補」節の起点）, SS-198（「SS-198 追補」節の起点）, SS-199（「SS-199 追補」節の起点）, SS-82（「SS-82 追補」節の起点）, SS-196〜SS-199（Sign in with Apple の対応）
