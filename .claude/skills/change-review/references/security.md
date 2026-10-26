security-reviewer が読む確認観点。差分が触れる節だけ読めばよい（「共通」は常に読む）。
各項目は「確認すること。なぜ・前例」の形で、このプロジェクト固有の項目と見落としやすい観点だけを置く。
決定の正本は ADR（認証 ADR-002、デプロイと秘密 ADR-004/005、写真 ADR-009、lp ADR-012、mobile の ADR-M-*）。食い違えば正本に従う。
「受容済み」とある項目は、前提が変わっていない限り再指摘しない。

# 共通

## 認可の最後の防衛線
- 認可は backend で効いているか。mobile の UI の disabled・`FeatureGate`・画面の出し分けは防衛線として数えない。前例: `/pins/[pinId]` のメンバーシップは backend の 404 だけが守っている。
- 指摘の前に、backend 側に同じ検証があるかを読む。UI だけの欠落で backend が弾くなら、攻撃は成立しない（重大度を下げるか落とす）。

## mode 系の設定は fail-closed
- 認証・外部連携・ストレージを real/dev/fake で切り替える設定を足す差分では、未設定・未知の値が安全側（real または Unconfigured）に倒れるか。前例: SS-8 で mobile の fail-open な既定と変数名の不一致が重なり、production だけ認証バイパスになる構造だった（SS-10 で是正）。backend の `AUTH_MODE` / `MAPS_MODE` でも同じ罠を踏んだ。
- コードが読む変数名と、ビルド・デプロイ定義（`eas.json`・`app.config.ts`・SAM / ワークフロー）の変数名が一致しているか。不一致は既定値に落ちるので、既定が fail-open なら即バイパスになる。
- mobile では、`src/config/*Mode.ts` が許可リストとの完全一致で判定しているか、`eas.json` の `build.production` にモード変数が明示されているか（または不要な設計か）。

## クライアントに焼き込まれる値
- `EXPO_PUBLIC_*`（mobile）と `PUBLIC_*` / `context: "client"`（lp の `astro:env`）は配布物から読める。秘密（API シークレット・署名鍵）を入れていないか。
- 秘密はリポジトリにも GitHub にも置かず、実行時に SSM / Secrets Manager から読む（ADR-004）。ワークフローで読んだ値は取得直後に `add-mask` しているか。

## ログ・診断に出さないもの
- トークン・presigned の署名や policy・座標・`place_id`・EXIF の GPS をログ・スパン・クラッシュレポートに出していないか。位置情報はこのアプリの最も機微な PII。
- 「ログに出さない」というコメントがある所に caplog / テストの回帰がない新規箇所は、テストを求める（先例は backend の節）。
- 利用者のデータをローカルに書く一回限りのスクリプト（移行など）は、エージェントが実行し出力が会話の記録に残る。標準出力・例外の文言（`str(e)`・トレースバック・ライブラリの例外に入るパスや値）に個人のデータが出ないか、置き場所の 0700/0600 が全経路で効くかを見る。見落としやすいのは、`mkdir(parents=True)` の親が既定の権限になること、`O_CREAT` の mode が既存ファイルには効かないこと、追記用のファイルだけ `O_NOFOLLOW` が漏れること。前例: SS-238（2回のレビューで別々に見つかった）。

## CI・デプロイのワークフロー
- `backend-deploy.yml` / `lp-deploy.yml` に `pull_request` / `pull_request_target` トリガーを足していないか。リポジトリは public で、fork の PR からデプロイ経路（environment と OIDC）に到達されうる（ADR-012 決定4）。
- 依存のコードを実行する build job に `id-token: write` や `environment` を付けていないか。ロールの trust は `environment:<名前>` の subject だけを許す前提で成り立っている。
- prod へのデプロイが `workflow_dispatch` + main からのみ + Environment の承認のままか。
- `contents: write` や Environment を持つ job で、`pnpm install` や版を固定していない `npx` のコードを動かしていないか。
  後続ステップの `gh` / `git` を `$GITHUB_PATH` で差し替えられ、`GH_TOKEN` が渡る。依存を動かす job と書き込む job を分ける（`mobile-production-release.yml` の resolve / release）。
- 書き込む job が、依存を動かす job の outputs（コミット SHA など）をそのまま `checkout` の `ref` や git の操作に使っていないか。
  fork の PR のコミットも SHA を指定すれば取得できる。書き込む job の中で main の祖先であることを確かめ直す。
  git-cliff の設定（`cliff.toml`）は `replace_command` でコマンドを実行できるので、取り出したコミットのものではなく main の先頭のものを `--config` で渡す。
- Environment の承認は job の開始前に求められる。承認者が判断に使う値を出す検査を、承認付きの job の中に置いていないか（前段の job に分けて Job Summary に出す）。
- public リポジトリで、ビルドや成果物の URL を Job Summary・ログに出していないか。`eas build --json` / `eas build:view --json` の応答は `artifacts`（.ipa / .apk のダウンロード URL）を含み、eas-cli の進行ログは stderr にビルド URL を出す。
  `eas build:list --json` も同じ。`eas fingerprint:compare` / `fingerprint:generate` の出力は app config の中身を含み、Android の本番では Maps SDK キーが入る（SS-103）。
- job に `environment:` を足す差分で、その job が `secrets.<名前>` を参照していないか。Environment の Secret は同名のリポジトリ Secret より優先され、
  `EXPO_TOKEN` は `production` に付けると Developer から Release Manager（本番 channel へ OTA を出せる）に黙って切り替わる（ADR-008 D34）。
- `eas update` を使うワークフローで、EAS の環境変数が `eas.json` の値を上書きしないことを確かめているか。`eas update --environment` は EAS の値を `process.env` より優先し、
  `eas build` は逆に `eas.json` の build profile の env を優先する。同名の変数で OTA の JS だけが別の接続先になり、fingerprint にも現れない（ADR-008 D36）。
- 承認の前の job で確かめた外部の状態（EAS の環境変数など）が、承認を待つ間に変わりうるなら、承認の後の job で特権の操作の直前に確かめ直しているか（一覧のハッシュを outputs で渡して照合するなど）。
- 強いトークンを持つ job が `setup-node` の `cache: pnpm` を復元していないか。キーは lockfile のハッシュで、トークンを持たない job（mobile-ci・lp-ci など）と共有している。
  トークンを step の env に絞っても、同じ job の前の step で動いた依存のコードは `node_modules` や `GITHUB_PATH` を書き換えて後の step を差し替えられる（step への限定は守りにならない）。
- 判定に使う jq で `// empty` などを使うと `false` も代わりの値になる。真偽値を見るなら `if . == null then "" else tostring end` のように書く（SS-103 で保護の状態の表示を取り違えた）。

## 依存の追加
- スコープなし・typosquat 疑いのパッケージや `postinstall` の追加がないか。`package.json` / `pyproject.toml` の差分で確かめる。

## データ取扱い台帳（観点6）
- 台帳（`docs/privacy/data-inventory.md`）の行を足す・直す差分では、その行の取得箇所が §1 の対象パスに含まれているか。含まれないと、そのファイルの変更が観点6の確認から漏れる。前例: SS-184 の初版で `auth/apple_authorization.py`・レート制限・画像キャッシュ・地図のコンポーネントが漏れていた。
- 保存期間・削除の記述は、主な経路だけでなく途中で止まった経路まで追う。前例: 写真の撮影日時は紐付けた写真の側だけ書かれ、登録を破棄した枠（`pin_photo_uploads`）に残ることが抜けていた。Apple の失効も「失効できなくても削除する」と書かれていたが、一時障害では削除をやめて 503 を返す。
- infra（sanposcape-infra）側の値（ログ・トレースの保持期間など）は、出どころ（確認したコミット・ファイル）が書かれているか。このリポジトリからは確かめられない。
- infra の仕組み（メールの受信など）を台帳・ポリシーに書く差分は、主な経路（受信 → 保存）だけでなく、同じ仕組みが副次的に残すもの（SES の抑制リスト、SNS の通知メール、ログ）と、送り返す経路（返信）まで追ったか。主な経路の保存期間だけを書くと、ポリシーの「保存期間」が実際より狭くなる（SS-220 で見つかった）。
- ポリシーが「〜もあわせて行う」「〜を保存する」と言い切る処理は、ベストエフォートの分岐や設定不備（鍵の未投入など、本番の現状を含む）でも成り立つか。前例: SS-210 で「アカウント削除で Apple の連携も解除する」と書いたが、トークンが無い・鍵が無い・Apple が拒否した場合は解除せずに削除する。
- ポリシー・申告・台帳から挙動の記述を消す・置き換える差分では、その挙動を持つアプリ（審査中・配布済みのビルド）がまだサポート中でないかを確かめる。古い挙動は `git show <ビルドのコミット>:<path>` で読む。サポート中なら和集合として併記し、台帳 6 の「contract 待ち」に登録されているか（台帳 2.1）。前例: SS-212 で住所の取得を新しい挙動だけに書き換え、審査中の 1.0.0（`ce18a29`）とポリシーが食い違って LP を出せなくなった（SS-231 で併記に直した）。
- 本人確認・連絡の手順をポリシーに書く差分では、差出人の偽装で通らないか（確認用コードの返信か）、回答の送り先が確認したアドレスに限られるか、非公開リレー（`privaterelay.appleid.com`）へ届く前提（Apple Developer への送信元の登録）が記録されているかを見る（SS-210、ADR-012 の SS-210 追補）。

## 反証のときに確かめること
- ADR の文言を根拠に重大度を上げるときは、その決定が何を対象にしているかを本文で確かめる。前例: ADR-002 決定6-1 の「マージ」はサーバーに永続化済みのゲスト記録の所有権の付け替えで、SS-37（未保存の散歩の保存）には当たらなかった。
- 「冪等キーやカーソルに暗号強度は要らない」という主張は、一意制約や WHERE のスコープが `user_id` / メンバーシップで絞られていることを実コードで確かめてから受け入れる。スコープがグローバルなら判定は変わる。
- 「`redirect` 設定で守られている」という主張は通さない（RN の実機では `redirect: "error"` が効かない）。

# backend

対象は `packages/backend/src/sanposcape/`。正本は ADR-002（認証）・ADR-009 決定21・26（404/403）・ADR-013 決定6（ログ・スパン）。

## IDOR・存在の漏洩
- repository のメソッドが `user_id` を必須のキーワード引数に取るか（例: `walks/repository.py` の `get_by_id(*, user_id, walk_id)`）。ID だけで引ける取得口は指摘する。地図・ピンは `sanpo_map_members` を JOIN して絞る。
- 他人のリソースは 403 ではなく 404 か。地図・ピンは「非メンバーは 404、メンバーだが権限が無ければ 403」の順（ADR-009 決定21・26）。
- 冪等キーは `(user_id, client_*_id)` の一意制約で、`user_id` は JWT の `current_user` から取っているか（本文から取らない）。
- 既知の例外: `sanpo_maps/maps/repository.py` の `count_pins_for_maps` / `list_photo_keys_for_map` は `user_id` を取らない。呼び出し元がメンバーシップで絞った結果や `FOR UPDATE` で権限確認済みの ID だけを渡すので安全。新しい呼び出し元では、渡す ID が認可済みかを確かめる。

## カーソル
- `core/pagination.py` のカーソルは無署名の base64。それを使うクエリが呼び出し元の `user_id` / メンバーシップでも絞っているか（カーソルは WHERE の境界値で、認可の入力ではない）。絞り込みの無い新しい消費者は指摘する。
- カーソルのデコードより先に認可しているか（`PinService.list_pins` / `list_pin_photos`）。逆だと非メンバーが 400 と 404 の違いで存在を見分けられる。

## 本文サイズ・例外
- 新しい書き込みエンドポイントの prefix が `main.py` の `RequestSizeLimitMiddleware` の登録に入っているか。2026-10-12 時点の対象は `/walks`・`/explore`・`/sanpo-maps`・`/pins`・`/pin-photo-uploads`（fake のときだけ `/dev-storage`）。prefix はセグメント単位で一致する。
- `/auth`・`/users` はミドルウェアの対象外で、`auth/schemas.py` の `Field(max_length=...)` だけで長さを制限している。ここにフィールドを足すなら `max_length` があるか。
- 登録した prefix の router は `responses` に 413 を入れているか（ミドルウェアはメソッドに依らず 413 を返す。GET/DELETE に 413 があっても正しい）。
- catch-all の 500 ハンドラーは無く、未処理例外は `AccessLogMiddleware` が握る。`FastAPI(...)` に `debug=True` が入ったら指摘する。

## ログ・スパン
- `AccessLogMiddleware`（`core/access_log.py`）は method・`scope["path"]`・status・経過 ms だけを出す。path を出して安全なのは、全ルーターの path パラメータが `uuid.UUID` でトークン類が本文かクエリにあるから。強制された不変条件ではないので、ルーターを足す差分のたびに確かめる。
- 写真アップロード枠の発行ログが `form.fields`（presigned POST の policy・署名・一時認証情報）を出していないか。周回ルートの lat/lng・`place_id` を出していないか。
- 「ログに出さない」箇所には caplog の回帰テストがあるか。先例: `integrations/aws/tests/test_secrets.py::test_resource_not_found_is_logged_without_secret_and_reraised`、`sanpo_maps/photos/tests/test_service.py::test_logs_upload_id_and_key_without_leaking_form_fields`、`maps/tests/test_service.py::test_get_loop_walking_route_logs_never_include_coordinates`。
- ファイル移動の差分では `caplog.at_level(..., logger=...)` のロガー名も直っているか。直し忘れると INFO を拾えず、テストが静かに無意味になる。

## 認証（ADR-002）
- dev-session の迂回の4層が残っているか: (1) `Settings.auth_mode` の既定は `real`、(2) `main.py` は `auth_mode == "dev"` のときだけ `auth_dev_router` を include、(3) `AuthService.create_dev_session` の `_assert_dev_mode`、(4) `config.py` の `_validate_environment_settings` が `env not in ("local", "test")` の許可リスト方式でモード系が `real` でないこと・`AUTH_JWT_SECRET` の長さ・本番必須設定の欠落を起動時に弾く。
- 新しいモード系の設定は (4) のブロックに1行足す形か（別のバリデーターを作っていないか）。
- real と dev が `_resolve_user()` / `_issue_session()` を共有する構造を変える差分では、`auth/tests/test_service.py::test_resolve_user_and_issue_session_shared_between_real_and_dev` と `auth/tests/test_dev_router.py::test_dev_session_token_passes_get_current_user` が意味を保っているか。
- Google ID token の検証（`auth/providers/google.py`）: `algorithms=["RS256"]` 固定、`aud` は許可リスト、`iss` は2種類を手動照合、`azp` は信用しない（いずれも意図的）。JWKS の取得失敗は 503 で fail-open しない。
- 自前のアクセス JWT は `HS256` 固定で `iss` / `aud` / `exp` と独自の `typ` で refresh と取り違えないか。鍵が空のときの固定文字列へのフォールバックは `local` / `test` だけ。
- refresh のローテーションは `SELECT ... FOR UPDATE` で直列化し、再利用を検知したら `family_id` のチェーン全体を失効させる。正当な重複リトライもリプレイ扱いになるのは意図どおり（バグとして指摘しない）。

## 写真アップロード（ADR-009）
- presigned POST が `content-length-range` と Content-Type の完全一致を条件に持ち、key が完全一致（`${filename}` を使わない）か（決定4）。
- サムネイル生成で `Image.open()`（ヘッダーのみ）の直後に `width*height > max_pixels` を確かめてからデコードしているか。`Image.MAX_IMAGE_PIXELS` に頼らないのは `ThreadPoolExecutor` で並列実行するため（決定6）。
- `integrations/aws/*` に連携を足すときも `STORAGE_MODE=real|fake` + Unconfigured の fail-safe の形か（決定8）。
- 検証・加工したバイト列と、`original/` に保存するバイト列が同じか。staging は枠の presigned POST の有効期限内なら上書きできるので、検証の後に staging を Copy（再読み込み）すると未検証のバイト列が入る。確定は検証したバイト列そのものを Put する（決定35。SS-116 で Copy 経路の TOCTOU を再現）。
- 利用者が直送したバイト列を、デコードの検証（Pillow）より前に Python で走査する処理は、10 MiB の悪意ある入力で計算量・メモリを測る。1バイトずつの Python ループ・セグメントごとの slice の蓄積は、短いセグメントや 0xFF00 の繰り返しで秒単位・数百 MiB になる（SS-116）。走査の対象外（未知・予約のマーカーなど）を「写す」扱いにすると、保証が後段のデコーダの拒否に依存する点も見る。

## テスト DB の到達経路
- `conftest.py` / `config.py` の DB まわりの差分では、`Settings.test_database_url` が `database_dsn`（本番 / staging のシークレット由来）を参照していないか。参照していなければ、テストの drop/delete が本番に届く経路は構造的に無い（ローカルの誤設定の防止はスコープ外。ADR-B-001 決定7）。

## 受容済み（再指摘しない）
- レート制限は `/explore/*`（`maps/rate_limit.py::ExploreRateLimiter`）だけ。`/auth/session`・`/auth/refresh`（総当たりできない）、`POST /walks` の件数上限なし、`POST /pin-photo-uploads`・`POST /pins`・`POST /pins/{pin_id}/photos`・`/sanpo-maps` の書き込み、周回ルートの Google Routes 2〜3回呼び出しと距離上限なし（ADR-007 の SEC-L1/L2）。認証系にレート制限を足す差分では `ExploreRateLimiter` と同じ器を使うかを見る。
- staging に dev 迂回が漏れる穴（許可リスト方式で解消済み）。`env` の `Literal` に `dev` / `prod` を安易に足さない（ADR-005 決定6）。`MAPS_MODE=fake` は API キーより先に判定する。許可リストが `("local", "test")` なので実デプロイを `ENV=test` で起動すると fake/dev が通る点は既知（そういうデプロイ定義が現れたら指摘する）。
- `X-App-Session-Id` のログ出力（小文字の UUID v4 だけ受け、不正値は捨てる。認可には使わない）。
- `POST /dev-storage/uploads` が `max_bytes` の確認前にファイル全体をメモリに読む（dev/test 専用）。

# mobile

対象は `packages/mobile/`。正本は ADR-002・ADR-M-009（ゲート・ゲスト）・ADR-M-008 決定4・6（保存と後始末）・ADR-008（フラグ）・ADR-005 決定4（ヘッダー）・ADR-M-010〜M-012（写真）。HTTP 出口の構成は `packages/mobile/docs/architecture-guideline.md`「送信側のヘッダー契約」。

## 認証ゲートとゲスト
- `PUBLIC_ROOT_SEGMENTS` に新しいルートの先頭セグメントが誤って足されていないか（`app/` 直下への追加だけなら `AuthGate` が自動で保護する）。
- ゲストは保護ルートに入れる前提（SS-57）。認証必須の機能は画面・通信側（`enabled: isSignedIn` 等）で止めているか。
- UI が `services/auth` のバレルを import していないか。ゲスト時に `user`（PII）を読まず `status` だけ読んでいるか（`SettingsView` が模範）。
- `useScreenBack` の `fallbackHref` がハードコードのリテラルのままか。route params・クエリ（`next=` 等）・API 応答由来になったらオープンリダイレクトを疑う。
- 戻る操作で `endWalk()` などの進行中データの破棄を呼んでいないか。`useAuthSessionStore` 自身が `registerSessionCleanup()` に登録されていないか。
- トークンは `tokenStore.secure.ts`（SecureStore）にだけ置き、AsyncStorage に置いていないか。散歩の進行中データは永続化しない設計（`useActiveWalkStore.ts`）。

## 保存 CTA と自動再送（SS-37）
- `useAuthActions.ts` / `postSignInDestination.ts` / `walkSaveTrigger.ts` / `useFinishedWalkStore.ts` の差分で、`signInForSaveRequested` のゲートが外れていないか。特に同一ドラフトの認証状態の変化による再発火が無条件になると、共有端末で他人の軌跡が自分のアカウントに保存される。
- `dismissTo("/walk-summary")` の分岐が `wantsToSaveFinishedWalk`（意思表示込み）でだけ選ばれるか。

## アカウントの破壊的操作（SS-62 が模範）
- 確認ダイアログの dismiss と disabled が実行中に確実に効くか（`dismissDisabled` + `Button` の `disabled`）。
- トークン破棄がキャッシュのクリアより前か（`signOut()` → `tokenStore.clear()` → … → `runSessionCleanup()`）。
- 401 を「ローカルを掃除して成功」に読み替えていないか。エラー文言は固定で、サーバーの本文を出していないか。

## /app-config のフラグ（SS-100）
- `queryClient.ts` の `registerSessionCleanup` の predicate で、後始末から除外するクエリがユーザー非依存のままか（除外は列挙式で、新しいクエリは既定でクリア対象）。
- `FeatureGate` / `useFeatureFlag` を認可の代わりに使っていないか（フラグは公開の制御で、権限ではない）。
- `isFeatureEnabled` の `flags[key] === true` の厳密比較を崩していないか（汚染された値が false に倒れる形）。
- `config_source` 相当の診断値が本番の経路に出ていないか。`isDevToolsEnabled()` のガードは staging では開く（ADR-M-007 SS-148 追補で許容）。

## HTTP 出口とヘッダー
- 横断ヘッダーの変更が backend 向けの2出口（`client.ts` / `authApi.ts`）の両方に入り、S3 直送には入っていないか。付け忘れはローカルでは発覚せず、CloudFront に向けた瞬間に 401/403 になる。
- `grep -rn "await fetch(\|= fetch\b" src/` で想定外の出口が増えていないか（生の `fetch` を禁止する lint は無い）。`customFetch` 以外の HTTP 出口の新設は指摘する。
- 401 → refresh → 再送で、ハッシュ計算済みの options を使い回していないか（ボディとハッシュの不整合）。
- backend の変更で、リダイレクトを返しうる応答が増えていないか（RN の実機では `redirect: "error"` が効かないので、mobile 側の設定では防げない）。
- 撤去系の差分では、旧関数・旧ファイル名の参照が grep で0件か。
- ロギング・クラッシュレポートを導入する差分では `X-App-Authorization` / `x-amz-content-sha256` をマスク対象に明示しているか（非標準ヘッダーは自動でマスクされない）。
- `app.config.ts` の `usesCleartextTraffic` は `EXPO_PUBLIC_BACKEND_API_URL` が `http://` のときだけ（preview の E2E 用）。条件を広げて production に cleartext が入らないか。

## 動的ルートとパラメータ
- `[param].tsx` の ID を route 側と API fetcher 側の2層で `isUuid()` に通しているか。Orval の URL ビルダーはエスケープしないので、未検証だとディープリンクの `../` でトークン付きリクエストを別エンドポイントへ送らせうる（SS-20 で解消済み。再指摘しない）。
- 座標は送る側（`toPickedCoordinate`）と受ける側（`parsePinLocationParams` / `isValidCoordinate`）の両方で検証しているか。生の座標・`place_id` を router params に載せていないか（散歩は store 経由）。

## 写真の直送と閲覧
- backend 以外への直送経路が増えたら、認証ヘッダーや `x-amz-content-sha256` を付けていないか（`customFetch` を通さない）。送信先は `isAllowedUploadUrl` のホワイトリスト（https は許可、http は backend と同一 origin のみ。origin は protocol/hostname/port を個別比較）か。
- 閲覧の presigned GET にも `isAllowedUploadUrl` を通しているか（アップロードと閲覧の2用途。3つ目の用途が出たら `isAllowedStorageUrl` のような一般名への改名を提案する）。画像キャッシュのキーは URL を含まない `pin-photo:<photo.id>:<variant>` か。
- サインアウト時のキャッシュ消去を、起動時に必ず読み込まれるモジュール（`imageCacheCleanup.ts`）で登録しているか。
- EXIF は撮影日時だけを取り出して捨てているか（GPS を外へ出さない・保存しない・ログに出さない）。
- UI の disabled（`canAdjustPinLocation` 等）だけに頼っていないか。`client_pin_id` の冪等再送で実害が無いか。

## 散歩・位置情報
- `watchPosition` の購読がリークしないか（resolve 前にアンマウントされたら即 `remove()`。`useWalkTracking.ts` の `cancelled` が模範）。
- 目的地名は呼び出し側の表示名を優先し、backend の `destination.name`（`place_id` のフォールバックあり）を直接出していないか。
- 外部 API の応答を型ではなく値で検証しているか（`pickLegs()` の `leg.kind` の値マッチ + 件数、座標は `isValidCoordinate`、数値は `toNonNegative`）。
- `console.*` に座標・トークンを出していないか（出力口は `diagnosticLog.ts`）。エラーはステータスで分類し固定文言か。

## 散歩記録の保存（POST /walks）
- 軌跡の送信整形（小数6桁・連続重複の除去・10,000点超のダウンサンプリング。`walkTrackPayload.ts`）が backend の `schemas.py` の定数と一致しているか。
- `saveWalk()` は意図的に `signal` を渡さない。後始末の順序を変える差分では、前のユーザーのドラフトが次のユーザーのトークンで送られないか。
- 書き込みを伴う開発用ショートカット（`ScreenCatalog` の散歩サマリ）が `isDevToolsEnabled()` でガードされているか。

## 受容済み（再指摘しない）
- `_sitemap` が本番に含まれる。`status === "loading"` の間のゲートの素通し（ADR-M-009）。
- `isDevToolsEnabled()` が staging で開く（ADR-M-007 SS-148 追補）。

# Web フロントエンド（packages/lp）

lp は Astro の静的出力（`output: "static"`）を非公開 S3 + OAC + CloudFront で配信する。認証・API 通信・ユーザー入力・フォームは無い。正本は `packages/lp/AGENTS.md` と ADR-012。

## CSP とインライン
- 出力 HTML にインラインの `<script>`（JSON-LD も含む）・`<style>`・`style="..."` 属性・`on*` 属性を残していないか。CloudFront の CSP は `'unsafe-inline'` を許さないので、残すと本番だけ動かない（ADR-012 決定3）。
- `is:inline`・`set:html`・`define:vars`（`style` 属性を生成する）を使っていないか。`set:html` は XSS の入口にもなる。
- `astro.config.mjs` の `build.inlineStylesheets: "never"` と `vite.build.assetsInlineLimit: 0` を外していないか。
- CI（`lp-ci.yml`）のインライン検査の grep を緩めていないか。ただし検査は `dist/**/*.html` だけを見る。`javascript:` URL は CSP の `script-src` で止まるが、検査には掛からない。

## 外部オリジン
- Web フォント・CDN・アクセス解析・埋め込み（iframe・フォーム）など外部オリジンを足していないか。足すなら infra の tfvar `content_security_policy` とセットで変える必要がある（ADR-012 決定3）。解析タグを足す差分は、プライバシーポリシーの「広告・アクセス解析・クラッシュ解析のツールを組み込んでいない」（`privacy.astro` 1-7）とも食い違う（mobile にクラッシュレポートを足す差分も同じ）。
- お問い合わせはフォームにせず、mailto（`/privacy/#contact`・`/terms/#contact`・`/support/#contact`）で受けている。フォームを足すと `form-action` / `connect-src` の変更と、受け取った入力の扱いが新たに要る。
- 利用者に情報を送るよう促す記述（問い合わせ・不具合の報告・削除の依頼の案内、書いてほしい項目）を足す差分は、受け取るデータが台帳 3.7（問い合わせのメール）と食い違わないかを観点6で見る。削除・開示の依頼の案内は、本人確認の手順（ポリシー 10、`/privacy/#requests`）へ向けているか（SS-214 で見つかった）。

## ビルドに焼き込まれる値
- `astro:env` に足す変数が `context: "client"` / `access: "public"` なら `dist/` に焼き込まれて公開される。秘密は置かない（そもそも静的サイトに秘密の使い道は無いはず）。
- `PUBLIC_LP_ENV` は `development` | `production` の enum で、未知の値はビルドエラー。production 以外は noindex。既定（`development`）が noindex 側なのを崩していないか。

## 公開範囲
- dev は meta robots と CloudFront の `X-Robots-Tag` の二重で noindex。`robots.txt` で `Disallow` にしていないか（noindex を読めなくなる。ADR-012 決定6）。
- `public/` に置いたものはそのままの名前で公開される。設計資料・下書き・ソース画像を置いていないか。`/.well-known/` は置いていない（足すなら意図を確かめる）。
- `/privacy/`・`/terms/`・`/support/` は恒久 URL（アプリ内リンクと App Store Connect に登録する）。
- ポリシー以外のページ（`/support/` など）が、データの扱いの事実（取得・公開範囲・保存期間・削除の対象）をポリシーから書き写していないか。書き写すとポリシーだけ直したときに古い説明が残るので、ポリシーの節へのリンクにする（SS-214 で見つかった）。backend / mobile のデータの扱い（取得する情報・送信先・保存期間）を変える差分は、観点6（台帳との整合）で `docs/privacy/data-inventory.md`・`privacy.astro`・`docs/app-privacy-label.md` の更新が要るかを見る。

## デプロイ経路（`lp-deploy.yml`）
- 共通の「CI・デプロイのワークフロー」に加え、バケット名・distribution ID を SSM から実行時に読み、取得直後に `add-mask` しているか。リポジトリや GitHub に直書きしていないか。
- デプロイ用ロール（`sanposcape-<env>-lp-deploy`）の権限を広げる変更（`GetObject` 等）が無いか。ADR-012 決定5 では権限を足さないために S3 Lifecycle を見送った。

## React のアプリを作るときの観点
旧 frontend-security-reviewer の観点のうち、lp に当てはまらないもの。React（Vite）のアプリを作るときに使う。
- XSS: `dangerouslySetInnerHTML` にサニタイズしない値を渡さない。`href={userInput}` に `javascript:` を入れさせない。
- トークン: `localStorage` / `sessionStorage` に置かない（cookie の `HttpOnly` / `Secure` / `SameSite`）。cookie 認証なら CSRF 対策。
- OAuth / OIDC: PKCE・`state`・`nonce` の生成と検証、`redirect_uri` の固定。
- オープンリダイレクト: `next=` 等をホワイトリストなしで `navigate()` / `window.location` に渡さない。
- ログアウトで atom・Query cache・storage をすべてクリアする。`postMessage` の受信側で `event.origin` を検証する。
- `VITE_*` の秘密の混入と、スタブログイン・MSW のフラグが本番ビルドで有効にならない構造（`import.meta.env.DEV` で囲む等）。
