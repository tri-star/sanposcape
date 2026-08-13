# ADR-002: 認証は Google 直結 + モバイル public client + backend 自前セッショントークン、スタブは3モードで切り替える

## 日付

2026-07-25（初版）、2026-08-11 追補（SS-49）

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
- **Android 用 OAuth クライアントは SHA-1 証明書フィンガープリントを要求**する。debug / EAS development / preview / production の署名鍵ごとに登録が必要で、[ADR-004](../../packages/mobile/adr/ADR-004-e2e-build-ci-strategy.md) の fingerprint キャッシュ運用とも噛み合う。

### 既存実装の問題

現行の `packages/mobile/src/services/auth/` には以下の問題があり、本 ADR の決定に合わせて是正する必要がある。

- `AuthService` が `signIn/signUp/signOut(): Promise<void>` のみで、**トークンとユーザー識別の概念を持たない**。このままでは「ユーザーを識別できるスタブ」を表現できない。
- 切り替えが `EXPO_PUBLIC_USE_AUTH_STUB !== "false"` という **fail-open**（未設定なら stub）になっている。
- コードが読む変数名 `EXPO_PUBLIC_USE_AUTH_STUB` と、`eas.json` / ADR-004 が焼き込む `EXPO_PUBLIC_AUTH_MODE` が**不一致**。real 実装が入った時点で「production ビルドなのに stub が有効」という事故になり得る。

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
app --Authorization: Bearer <自前 access token>--> 以降の全 API
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
| `real` | `auth.real.ts` | Google → `POST /auth/session` | 実物 | 本番 |
| `dev` | `auth.dev.ts` | `POST /auth/dev-session { user_key }` | **実物** | ローカル開発 / Maestro E2E |
| `mock` | `auth.mock.ts` | メモリ上の固定ダミー | **Orval MSW** | vitest |

**設計の中核**: 継ぎ目を「トークンの発行元」だけに置き、`Authorization: Bearer` を運ぶ HTTP 通信そのものは real/dev で一切変えない。`dev` モードでも **backend のトークン発行コードと `get_current_user` によるユーザー識別は real と完全に同一のコードパスを通る**。異なるのは「Google ID token を検証して `sub` を得る」か「`user_key` から開発用ユーザーを引き当てる」かの入口だけ。

### 4. backend 側の fail-safe

- backend にも `AUTH_MODE`（既定 `real`）を持たせる。
- `POST /auth/dev-session` は `AUTH_MODE=dev` のときだけ **router ごと include する**（本番ではエンドポイント自体が存在しない）。
- **`ENV` が `local` / `test` 以外なら `AUTH_MODE != real` で起動を失敗させる**。

  検証は否定リスト（`env == "production"`）ではなく**許可リスト方式**（「fail-safe な検証をスキップしてよい環境」だけを列挙する）にする。否定リストだと `staging` のような新しい `env` 値を追加した瞬間に、検証対象から静かに漏れるため。

  この許可リストのブロックは **`AUTH_MODE` 専用ではなく、モード系 env と本番必須設定をまとめて検証する唯一の場所**とする（実装: `packages/backend/src/sanposcape/config.py` の `_validate_environment_settings`）。新しい fail-safe 項目は必ずこのブロックに追加し、別バリデータを新設しない（許可リストが分裂すると片方だけ更新される事故が起きる）。

  2026-08 時点でこのブロックが検証しているのは `AUTH_MODE` / `MAPS_MODE`（SS-44 で追加。Maps provider を決定的な fake に差し替えるモード）/ `AUTH_JWT_SECRET` / `GOOGLE_ALLOWED_AUDIENCES` / `GOOGLE_MAPS_SERVER_API_KEY`。

### 5. signUp / signIn は services 層では区別しない

ソーシャルログインでは新規登録と再ログインの区別がなく、backend が初回サインイン時に JIT でユーザーを作成する。UI 上は SS-11 の要件通りサインイン/サインアップの2画面を維持してよいが、**`AuthService` は `signIn(provider)` に一本化**し、画面側は文言のみを変える。

### 6. ゲストは「トークンを持たない状態」として表現する

`AuthService` のメソッドとしての `guest` は持たせず、認証状態（トークン非保持）として表現する。これは [SS-13](https://github.com/tri-star/sanposcape)「認証状態と探索ロジックの分離」で実装に落とされ、探索ロジックが認証に不可分に依存しない形が `.oxlintrc.json` の import 制限により構造的に担保されている（詳細は [mobile ADR-009](../../packages/mobile/adr/ADR-009-auth-session-state-and-route-gate.md)）。SS-13 時点では未認証をゲートで弾いていたが、SS-49 の合意（下記 6-1）を受けて SS-57 でゲスト散歩を解禁し、`guest` のまま保護ルート（探索・散歩・記録タブ・設定）に入れるようになった。

### 6-1. ゲスト時の backend API 契約（SS-49 追補）

mobile ADR-009 が「今回は決めない」として持ち越していた、将来ゲスト散歩を許可する際に backend と合意すべき2つの論点を SS-49 で決定した。

1. **`/explore/places` `/explore/routes/walking` は認証を任意化し、未認証（ゲスト）でも呼べるようにする。**
   - `get_current_user`（認証必須）への依存を、認証任意の依存関数に差し替える。
   - レート制限は既存の `ExploreRateLimiter`（`packages/backend/src/sanposcape/maps/rate_limit.py`）が user_id と client_ip の両方でバケットを持つ設計になっているため、未認証時は client_ip のみのバケットで制御する。
   - 匿名バケットの上限は認証済みより低く設定することを検討する（キャリアグレード NAT 等で IP が複数ユーザー間に共有されうるため）。具体の閾値は実装タスク（SS-56）側で決定する。
2. **`POST /walks`（散歩記録の保存）は未認証では許可しない。** サインインを促す導線に倒し（[mobile ADR-009](../../packages/mobile/adr/ADR-009-auth-session-state-and-route-gate.md) の保護ルート方針に従う）、ゲスト記録を後からアカウントへマージする機能は作らない。

**決定理由**: `docs/project-overview.md` が当初から明記していた「記録・履歴の永続化のみが認証を要求する」「ゲストでの散歩開始（記録なし）」という構想に、この2点がそのまま合致するため。マージ機能（ゲストの記録を後からアカウントへ紐付ける案）は、所有権付け替えと `client_walk_id` 冪等キーの再設計という複雑さを伴い、MVP のスコープでは必要性が無いと判断して見送った。

**影響**: mobile 側は `canEnterProtectedRoutes`（`features/auth/lib/authGate.ts`、決定3参照）に `"guest"` を許可として追加し、`SignInView` / `SignUpView` のゲスト導線を復活させた（SS-57 で実装済み）。backend 側の実装は SS-56（先行して main にマージ済み）。詳細は [mobile ADR-009](../../packages/mobile/adr/ADR-009-auth-session-state-and-route-gate.md)「SS-57 追補」を参照。

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
- `EXPO_PUBLIC_AUTH_MODE` に統一することで、`eas.json` / ADR-004 との変数名不一致と fail-open 既定という既存の事故要因が解消される。

### ネガティブな影響・トレードオフ

- **自前のトークン発行・更新・ローテーション・再利用検知を実装・保守する責任**を負う。認証で最も間違えやすい領域であり、レビューを厚くする必要がある。
- **Android の SHA-1 フィンガープリント登録**が署名鍵ごと（debug / EAS development / preview / production）に必要になり、運用の手間が増える。設定漏れは Android で分かりにくいエラーになりやすい。
- Google サインインが**ネイティブモジュール**のため、導入時に ADR-004 の fingerprint が変わり E2E 用 APK の再ビルドが発生する。
- `react-native-nitro-google-signin` は情報量が少なく、問題発生時の調査コストが読みにくい。
- モバイル側の `AuthService` が `Promise<void>` の3メソッドから、トークン・セッション復元を含むインターフェースへ拡張されるため、SS-11 の画面実装は本 ADR 確定後の形に追従する必要がある。

### 移行・対応が必要な事項

- `docs/project-overview.md` の「認証: Auth0（backend: authlib / mobile: OIDC）」の記述を **Google 直結**に更新する。
- `packages/mobile/src/services/auth/index.ts` の切り替えを `EXPO_PUBLIC_AUTH_MODE`（既定 `real`）の3値に変更し、`EXPO_PUBLIC_USE_AUTH_STUB` を廃止する。
- `packages/mobile/eas.json` の `preview.env.EXPO_PUBLIC_AUTH_MODE` を `"stub"` から **`"dev"`** に修正する。ADR-004 の該当記述も併せて更新する。
- mobile に `react-native-nitro-google-signin` と `expo-secure-store` を追加する。access token はメモリ、refresh token は SecureStore に保管し、`mock` モードでは in-memory 実装に差し替えられるよう `TokenStore` を抽象化する（vitest の node 環境では SecureStore が動かないため）。
- `packages/mobile/src/api/client.ts` に `Authorization` ヘッダ付与と、401 → refresh → 1回だけリトライを実装する。**同時多発リクエストに備えて refresh は single-flight にする**こと。
- backend に `src/sanposcape/auth/` を新設し、`POST /auth/session` / `POST /auth/refresh` / `POST /auth/logout` / `GET /auth/me` と、`AUTH_MODE=dev` 限定の `POST /auth/dev-session` を実装する。`get_current_user` を `dependencies.py` に追加する（既に TODO コメントあり）。
- backend に JWT/JWKS 依存（`pyjwt[crypto]` 等）と `users` / `refresh_tokens` のマイグレーションを追加する。
- backend の OpenAPI 更新後、`pnpm --filter mobile orval` を再実行する。
- **iOS で Google ログインを提供する場合、App Store 審査で Sign in with Apple の併設が要求される**。MVP のリリース計画に織り込む必要がある。

## 関連情報

- [ADR-001(横断): 地図・POI に Google Maps Platform](./ADR-001-map-poi-google-maps-platform.md)
- [ADR-003: development build 前提と開発ループ](../../packages/mobile/adr/ADR-003-development-build-and-dev-loop.md)
- [ADR-004: E2E ビルド・CI 戦略](../../packages/mobile/adr/ADR-004-e2e-build-ci-strategy.md)
- [mobile ADR-009: 認証セッション状態を1箇所に集約し、認証ゲートで未認証を弾く](../../packages/mobile/adr/ADR-009-auth-session-state-and-route-gate.md) — 決定6「ゲストはトークン非保持の認証状態として表現する」を実装に落とした ADR
- [モバイルのアーキテクチャガイドライン](../../packages/mobile/docs/architecture-guideline.md)
- [プロジェクト概要](../project-overview.md)
- [RFC 8252: OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252)
- [RFC 7636: PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [Expo: Using Google authentication](https://docs.expo.dev/guides/google-authentication/)
- [Expo: AuthSession](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- 関連 WorkItem: SS-10（本 ADR の起点）, SS-11（認証画面）, SS-12（backend ユーザーモデル・削除API）, SS-13（認証状態と探索ロジックの分離）, SS-49（決定6-1 追補の起点）, SS-56（backend: explore 認証任意化）, SS-57（mobile: ゲスト導線復活）
