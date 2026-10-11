---
name: feedback-sign-in-with-apple-backend-gotchas
description: Sign in with Apple を backend で扱うときの罠。nonce は端末が SHA256 hex を Apple に渡し raw を backend に送る / 氏名は初回だけ / email_verified は文字列もある / find_or_create の display_name 上書き / JWKS は jwks.py で共有 / 非JWT・非ASCII nonce の500
metadata:
  type: feedback
  scope: durable
  verify_by: 2027-10-31
---

SS-197（Apple の ID token 検証）のプラン作成・レビューで分かった、Apple 固有で取り違えやすい点。SS-198（失効）など Apple を触るプランで再利用する。

**Why:** どれもテストでは気づきにくく、実機（SS-196 の capability と端末側の実装が揃った後）で初めて壊れる。

**How to apply:**
- **nonce**: Apple は渡された値をそのまま token の `nonce` に入れる。標準の方式は「端末が raw を生成 → Apple には `sha256(raw)` の hex → backend には raw を送り、backend がハッシュして比較」。
  raw との一致も許すと、token に入っている値を送るだけで通るので防御にならない。expo-apple-authentication の `nonce` はハッシュしない（そのまま渡す）。
- **氏名は初回の認可時だけ**端末に返り、ID token には入らない。backend はリクエストの氏名を新規作成時だけ使う。
  `UserService.find_or_create()` は「None 以外なら既存ユーザーも上書き」なので、`ProviderIdentity.display_name` に詰めると毎回上書きされる。
  SS-197 では別引数 `initial_display_name` で渡し、新規作成時と既存ユーザーの値が NULL のときだけ使う。
- **`email_verified` / `is_private_email` は bool と文字列（`"true"`/`"false"`）の両方がある**。メールは欠落・非公開リレー（`@privaterelay.appleid.com`）がありうる。
- **`aud` は bundle ID**（iOS ネイティブ）。Expo Go では `host.exp.Exponent` になる。dev=`com.sanposcape.app.dev` / prod=`com.sanposcape.app`。
- **JWKS**: SS-197 で `auth/providers/jwks.py` の `get_jwks_client`（`lru_cache(maxsize=4)`）に共通化した。IdP を増やすときは maxsize が IdP 数以上かを確認する（足りないと互いに追い出して毎回 HTTP 取得になり、テストでは見えない）。
- **500 になる入力**（SS-197 のレビューで発覚）: JWT でない文字列は `get_signing_key_from_jwt` が `DecodeError`（`PyJWKClientError` ではない）を投げる。
  非 ASCII の nonce クレームは str 同士の `hmac.compare_digest` で `TypeError` になる。署名鍵解決でも `jwt.PyJWTError` を受け、比較は bytes で行う。
  常に鍵を返すフェイク JWKS ではこの経路を通らないので、`DecodeError` を投げるフェイクでテストする。
- **失効（SS-198）** には authorization code（約5分・1回限り）を `/auth/token` で交換した refresh token と、.p8 で ES256 署名した client secret が要る。
  ID token だけでは失効できない。

関連: 決定は `docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md` の SS-195 追補・SS-197 追補。[[feedback-existing-table-column-add-deploy-window]]
