# データ取扱い台帳

Sanposcape が扱う利用者のデータを、実装の事実（どこで取得し、どこへ送り、どこにいつまで置き、どう消すか）で1行ずつまとめる（SS-184）。

- この台帳が**正本**。[プライバシーポリシー](../../packages/lp/src/pages/privacy.astro)（`/privacy/`）と
  [App Privacy の申告](../app-privacy-label.md)は、この台帳から書く。3つが食い違えば、まず実装を確かめて台帳を直し、ポリシーと申告を合わせる。
- ポリシーとのずれは、ポリシーを書くときより、backend・mobile の変更（DB モデル、ログ、送信内容、権限、外部 SDK の追加）で生まれる。
  そのため、ずれを生みうるパスを「[対象パス](#1-対象パスポリシーに関係する変更)」に挙げ、計画（`task-workflow`）とレビュー（`security-reviewer`）でここを確かめる。
- 確認日: 2026-10-13（SS-184 の作成時。backend・mobile のコードを読んで照合した）、2026-10-14（SS-169。端末の方位の行を足した）、2026-10-14（SS-138。ピンの位置の住所の取得の行を足した）、2026-10-15（SS-109。アカウント削除後の写真の削除を反映し、削除予約の行を足した）

## 1. 対象パス（ポリシーに関係する変更）

差分が次のどれかに触れたら「プライバシーへの影響があるかもしれない変更」として扱い、[2. 変更したときの手順](#2-変更したときの手順)に従う。
パスに当たらなくても、利用者のデータの取得・送信・保存・削除・公開範囲が変わるなら同じ扱いにする
（SS-158 で見つかった食い違いの多くは、データ機能そのものではない変更から生じていた）。

| 領域 | パス | 変わりうること |
| --- | --- | --- |
| backend | `packages/backend/src/sanposcape/**/models.py`、`packages/backend/alembic/versions/` | 保存するデータ・列・削除時の連鎖（`ON DELETE CASCADE`） |
| backend | `packages/backend/src/sanposcape/**/schemas.py` | 受け取るデータ（リクエストのフィールド、GET のクエリ） |
| backend | `packages/backend/src/sanposcape/integrations/`、`packages/backend/src/sanposcape/auth/providers/`、`packages/backend/src/sanposcape/auth/apple_authorization.py` | 外部サービスへ送るもの・外部サービスから受け取って保存するもの |
| backend | `packages/backend/src/sanposcape/core/logs.py`・`access_log.py`・`tracing.py`、`packages/backend/src/sanposcape/aws_lambda/`、ログを出す行の追加（`logger.*`） | ログ・トレースに残るもの |
| backend | `packages/backend/src/sanposcape/maps/rate_limit.py`・`maps/dependencies.py` | メモリに一時保持する識別子（アカウントの内部 ID・IP アドレス） |
| backend | `packages/backend/template.yaml`（ロググループの保持期間・ADOT）、`packages/backend/src/sanposcape/config.py`（キャッシュの TTL・URL の有効期限など） | 保存期間・一時保持の長さ |
| backend | `packages/backend/src/sanposcape/users/service.py`（アカウント削除）、`packages/backend/src/sanposcape/sanpo_maps/photos/` | 削除の手段と、削除後に残るもの |
| backend | `packages/backend/feature-flags.json` | データを扱う機能の公開（フラグを ON にすると、その機能のデータの扱いが利用者に及ぶ） |
| mobile | `packages/mobile/app.json`、`packages/mobile/app.config.ts` | 権限と利用目的の文言、plugin（SDK）、`updates.url` |
| mobile | `packages/mobile/src/services/location/`・`photo/`・`auth/`・`preferences/` | 端末で取得・保存するもの（位置・写真・EXIF・トークン・設定） |
| mobile | 送信内容を組み立てる処理: `packages/mobile/src/features/*/lib/*Request.ts`・`*Payload.ts`・`pinFetchBounds.ts`・`pinEditDraft.ts`、`packages/mobile/src/features/*/api/`、`packages/mobile/src/api/`（共通ヘッダー） | backend へ送るもの・座標の精度・クエリに載るもの |
| mobile | `packages/mobile/src/lib/sessionCleanup.ts`・`backgroundLocationCleanup.ts`・`imageCacheCleanup.ts`、`packages/mobile/src/features/pin/components/PinPhotoImage.tsx`（画像のキャッシュの方針） | 端末に残るものと、それを消す時 |
| mobile | `react-native-maps` を import するファイル（`SpotMapView.tsx`・`PinMapCanvas.tsx` など。`showsUserLocation`・地図の provider） | 地図 SDK へ渡るもの |
| 共通 | `packages/backend/pyproject.toml`、`packages/mobile/package.json` の依存の追加・更新（Dependabot の更新を含む） | SDK が第三者へ直接送るもの（バージョンでプライバシーマニフェストが変わりうるので確かめる） |
| lp | `packages/lp/src/`、`packages/lp/astro.config.mjs` | 紹介サイトで読み込む外部オリジン・アクセス解析・Cookie |
| infra（別リポジトリ） | sanposcape-infra の CloudFront・S3 のログ設定（`log_retention_days`）、トレース（`aws/spans`）の保持期間（observability の設定）、S3 のライフサイクル | アクセスログ・トレースの保存期間。このリポジトリの差分には現れないので、infra を変えるときに台帳を見る |

## 2. 変更したときの手順

1. **計画**: プランの「プライバシーへの影響」欄に、上の対象パスに触れるか、触れるなら台帳のどの行が変わるかを書く。影響が無いと判断した場合も、その理由を1行書く。
2. **実装**: 影響があれば、次を同じ PR で更新する。
   - この台帳の該当行（新しいデータなら行を足す。確認日も更新する）
   - プライバシーポリシーの本文（`packages/lp/src/pages/privacy.astro`）と、最終改定日 `revisedOn`。制定日 `enactedOn` は変えない
   - App Privacy の申告（`docs/app-privacy-label.md`）。App Store Connect の回答は手作業で直すので、PR の申し送り事項に書く
   - ポリシーの文面に判断が要る（利用者への告知・同意の取り直しが要るなど）場合は、推奨案で書いたうえで PR の申し送り事項に挙げる
3. **レビュー**: `security-reviewer` が、差分が対象パスに触れていれば台帳・ポリシー・申告と食い違っていないかを確かめる（`change-review` の security の条件に入っている）。

## 3. 台帳

「ポリシー」はポリシーの節番号、「App Privacy」は `docs/app-privacy-label.md` 2.2 のデータの種類。
パスは backend が `packages/backend/src/sanposcape/`、mobile が `packages/mobile/` からの相対。
**未反映**は実装にあるがポリシーに書かれていない（または食い違う）もので、[4. 既知の差分](#4-実装とポリシー申告の既知の差分)に後続の課題を挙げる。

ポリシーはデータを種類ごとに要約して書く（細かい属性や数値を列挙しきらない。ADR-012 の SS-158 追補）。そのため、次の違いを「未反映」と呼ぶ。
同じ種類の中の属性（ピンの訪問状況・アーカイブ・散歩との紐付け、地図のアイコンなど、利用者が自分で登録・操作する値）を列挙しきっていないことは未反映と呼ばない。

- ポリシーに無い種類のデータを取得・送信・保存している
- 送信先・保存先・保存期間・削除の手段が、ポリシーの記述と違う（「削除すると消える」と読めるのに残る、など）
- ポリシーが「しない」「だけ」と書いていることをしている

### 3.1 位置情報

| データ | 取得箇所 | 送信先 | 保存先・保存期間 | 削除の手段 | ポリシー | App Privacy |
| --- | --- | --- | --- | --- | --- | --- |
| 散歩の軌跡（位置の並び） | mobile `src/services/location/`（バックグラウンドのロケーションタスク。精度 Highest・10m ごと）→ `src/features/walk/lib/walkTrackPayload.ts`（小数6桁、重複除去、10,000 点超は間引く。時刻・精度は送らない） | backend `POST /walks`（サインイン時だけ。ゲストの散歩は「サインインして保存」を選んだときだけ送る） | DB `walks.track_points`（JSONB）。削除まで | `DELETE /walks/{id}`、アカウント削除（CASCADE） | 1-1、6、7 | 正確な位置情報 |
| 散歩の日時・時間・距離 | mobile の散歩の store | 同上 | DB `walks.started_at`・`ended_at`・`duration_seconds`・`distance_meters`。削除まで | 同上 | 1-1 | フィットネス |
| 散歩の目的地（名称・座標・Google の場所 ID） | 探索 API の応答（座標は丸めない）→ `src/features/walk/lib/walkCreateRequest.ts` | 同上 | DB `walks.destination_*`。削除まで | 同上 | 1-1 | 正確な位置情報 |
| 散歩中に端末に一時保存する位置 | `src/services/location/sampleBufferStorage.file.ts`（`Paths.cache/walk-location-samples.jsonl`。時刻・緯度経度・精度を生の値で） | 送らない | 端末。散歩の開始・終了時、アプリの起動時、サインアウト時に消す（`backgroundSampleHub.ts`、`src/lib/backgroundLocationCleanup.ts`） | 自動 | 6 | 対象外（端末内） |
| スポット・ルート探索の現在地 | `src/features/walk/lib/placeSearchRequest.ts`・`walkRouteRequest.ts`（小数4桁 ≒ 11m に丸める。周回ルートの目的地は丸めない） | backend `POST /explore/*` のボディ（ゲストも送る）→ backend から Google Places API・Routes API（`integrations/google_maps/`） | backend のメモリのキャッシュに既定 300 秒（`config.py` の `google_maps_cache_ttl_seconds`）。DB・ログには残さない | 自動 | 1-1、3、6 | 収集にあたらない（`app-privacy-label.md` 3.1 の正確な位置情報の注記） |
| ピンの位置の住所の取得（ピン名の初期値。SS-138） | 登録画面を開いたとき・位置を調整したとき。`src/features/pin/lib/pinAddressRequest.ts`（座標は保存するピンと同じ小数6桁）。サインイン時だけ | backend `POST /explore/reverse-geocode` のボディ → backend から Google Geocoding API v4（`integrations/google_maps/client.py`。座標はクエリで送るため、httpx の URL を出すログは `core/logs.py` で止めている） | backend のメモリのキャッシュに既定 300 秒（座標と得られた住所）。DB・ログには残さない。得られた住所は名前欄に入るだけで、利用者が保存したときだけピンの名称として保存される | 自動 | 1-1、3、6 | 収集にあたらない（ピンの座標そのものは「ピン」の行で申告済み） |
| ピン地図の表示範囲 | `src/features/pin/lib/pinFetchBounds.ts`（表示範囲を 25% 広げ、外側へ小数4桁に丸める） | backend `GET /pins` の**クエリ** | DB には保存しない。CloudFront のアクセスログに URL として残る（最長 400 日。infra） | 期間の経過 | 1-1、1-5、6 | 正確な位置情報 |
| 地図に表示する現在地 | `src/services/location/location.real.ts`、`SpotMapView.tsx` の `showsUserLocation` | 送らない（地図 SDK の扱いは 3.6） | 端末のメモリ | — | 1-1 | 対象外（端末内） |
| 地図に表示する向き（端末の方位） | `src/services/location/location.real.ts` の `watchHeading`（`expo-location` の方位センサー。地図を前面で表示している間だけ。SS-169） | 送らない（扇形の図形として地図に描くだけ） | 端末のメモリ | — | 1-1 | 対象外（端末内） |

### 3.2 アカウント・認証

| データ | 取得箇所 | 送信先 | 保存先・保存期間 | 削除の手段 | ポリシー | App Privacy |
| --- | --- | --- | --- | --- | --- | --- |
| Google アカウントの ID・メールアドレス・表示名・プロフィール画像の URL | mobile `src/services/auth/googleSignIn.ts`（ID token だけを backend へ送る）→ backend `auth/providers/google.py` が ID token から取り出す | backend `POST /auth/session` | DB `users.provider_subject`・`email`・`display_name`・`photo_url`。サインインのたびに更新。削除まで | アカウント削除 | 1-2 | ユーザ ID、メールアドレス、名前、写真またはビデオ（画像の URL） |
| Apple アカウントの ID・メールアドレス（非公開リレーの場合あり）・氏名 | mobile `src/services/auth/appleSignIn.ts`・`appleSession.ts`（ID token・nonce・authorization code、初回だけ氏名）→ backend `auth/providers/apple.py` | backend `POST /auth/session` | DB `users`（同上。氏名は未設定のときだけ埋める）。削除まで。端末は送信待ちの氏名を SecureStore（`applePendingDisplayName.secure.ts`）に置き、送信成功・サインアウトで消す | アカウント削除 | **未反映**（1-2） | ユーザ ID、メールアドレス、名前 |
| Apple の refresh token | backend が authorization code を Apple `/auth/token` で交換（`integrations/apple/`、`auth/apple_authorization.py`） | Apple（`/auth/token`、アカウント削除時に `/auth/revoke`） | DB `apple_authorizations.refresh_token`（**平文**。理由は ADR-002 の SS-198 追補）。再サインインで上書き、削除まで | アカウント削除（`users/service.py`。失効させてから CASCADE で削除。Apple の一時障害（タイムアウト・5xx・429 など）では削除せず 503 を返し、利用者の再試行で完了する。恒久的な拒否・設定の不備・鍵の未設定では失効させずに削除する） | **未反映**（1-4・9 の「ハッシュ値だけを保存」と食い違う） | 対象外（データの種類に当たらない） |
| セッションの refresh token | backend が発行 | 端末へ返す | 端末: SecureStore（`tokenStore.secure.ts`）。サーバー: `refresh_tokens.token_hash`（sha256 だけ）。失効・期限切れの行も論理失効のまま残り、アカウント削除で消える | サインアウト（端末）、アカウント削除（サーバー） | 1-4、9 | 対象外（`app-privacy-label.md` 3.2 の認証トークン） |
| アクセストークン | backend が発行 | 端末へ返す。以後 `X-App-Authorization` で送る | 端末のメモリだけ | — | 1-4 | 対象外 |

### 3.3 利用者が登録する情報

| データ | 取得箇所 | 送信先 | 保存先・保存期間 | 削除の手段 | ポリシー | App Privacy |
| --- | --- | --- | --- | --- | --- | --- |
| ピン（名称・メモ・座標・タグ・訪問状況・アーカイブ） | mobile `src/features/pin/lib/pinCreateRequest.ts`（座標は小数6桁）・`pinEditDraft.ts` | backend `POST /pins`・`PATCH /pins/{id}` | DB `pins`・`pin_tags`。削除まで | `DELETE /pins/{id}`、地図の削除、アカウント削除（CASCADE） | 1-3、6、7 | 正確な位置情報、その他のユーザコンテンツ |
| 地図（名称・アイコン） | mobile `src/features/pin/api/sanpoMapApi.ts` | backend `POST /sanpo-maps`・`PATCH` | DB `sanpo_maps`。削除まで | `DELETE /sanpo-maps/{id}`、アカウント削除 | 1-3 | その他のユーザコンテンツ |
| ピンの写真 | mobile `src/services/photo/`（カメラ・OS の写真選択画面。長辺 2048px・JPEG 品質 0.7 に再圧縮し、EXIF は落ちる） | S3 へ presigned POST で直送（`src/features/pin/api/presignedPostUpload.ts`） | S3 `original/`・`thumb/`（SSE-S3。バージョニングは無効（infra のコード上）で、削除は即時の完全削除）。未紐付けの `staging/` は S3 のライフサイクルで消える（infra） | ピン・写真の削除でベストエフォートで消す（`sanpo_maps/photos/cleanup.py`）。アカウント削除では削除予約を入れ、**削除から 30 日（`ACCOUNT_PHOTO_RETENTION_DAYS`）の後**に1日1回の Lambda（`aws_lambda/photo_purge.py`、毎日 JST 04:00）が本人の `staging/`・`original/`・`thumb/` の `pins/<user_id>/` を消す。S3 の失敗・時間切れは翌日に続きから消す（SS-109、ADR-009 決定36） | 1-3、6、7 | 写真またはビデオ |
| 写真の撮影日時 | mobile `src/services/photo/photoTakenAt.ts`（EXIF の撮影日時だけを読む。位置は読まない。EXIF から取れないとき、カメラで撮った写真は撮影直後の時刻、ライブラリの写真は null） | backend `POST /pin-photo-uploads` の `taken_at`（写真を選んだ時点の先行アップロードで送る） | DB `pin_photo_uploads.taken_at`（枠の発行時）→ 紐付けで `pin_photos.taken_at` へ移し、枠の側は NULL に戻す。**紐付けずに終わった枠（登録の破棄・アプリの終了）には、期限切れの枠の掃除（ADR-009 BK-3）が無いためアカウント削除まで残る**。写真の側は削除まで | 写真・ピンの削除、アカウント削除（未紐付けの枠はアカウント削除だけ） | **未反映**（1-3 は「Exif は送信しません」とだけ書いている） | 写真またはビデオ（写真に付随する情報として） |
| アカウント削除後の写真の削除予約（削除したアカウントの内部 ID・削除日時・削除予定日時） | backend `users/service.py`（アカウント削除）→ `sanpo_maps/photos/account_purge.py` | — | DB `account_photo_purges`。写真を消し終えるまで（削除から 30 日 + 処理の持ち越し） | 写真の削除の完了で消える | 7（写真の削除の一部。行そのものは書いていない。内部 ID だけで、利用者と結び付ける情報は残らない） | 対象外（写真の管理情報） |
| 写真のアップロード枠 | backend `sanpo_maps/photos/` | — | DB `pin_photo_uploads`（S3 のキー・サイズ。未紐付けの間は撮影日時も）。紐付け済みの行は写真・ピンを消しても残る。紐付けずに期限切れになった行も掃除（ADR-009 BK-3）が無いため残る。どちらもアカウント削除で消える | アカウント削除 | **未反映**（7 は写真・ピンを消すと画像ファイルも消すとだけ書き、管理情報の行と未紐付けの枠の撮影日時が残ることを書いていない） | 対象外（写真の管理情報） |
| 端末に残る写真の一時ファイル | expo-image-picker・image-manipulator の出力 | — | 端末のキャッシュ領域（消すコードは無い。OS が消す） | OS | — | 対象外（端末内） |
| ピンの写真の表示用キャッシュ | `src/features/pin/components/PinPhotoImage.tsx`（expo-image） | — | 端末のメモリ・ディスク。サインアウトで消す（`src/lib/imageCacheCleanup.ts`） | サインアウト | — | 対象外（端末内） |

### 3.4 アクセスに伴う情報

| データ | 取得箇所 | 送信先 | 保存先・保存期間 | 削除の手段 | ポリシー | App Privacy |
| --- | --- | --- | --- | --- | --- | --- |
| CloudFront のアクセスログ（IP アドレス・日時・URL とクエリ・ステータス・処理時間・UA） | CloudFront（infra） | — | S3（infra 所有）。本番 400 日（5 の注記） | 期間の経過（アカウント削除後も残る） | 1-5、6 | その他の診断データ、パフォーマンスデータ |
| backend のログ（メソッド・パス・ステータス・処理時間・アカウントの内部 ID・S3 のキー。`X-App-Session-Id` の受け口もあるが、mobile はまだ送っていない） | `core/access_log.py`・`core/logs.py`、各 service のログ | CloudWatch Logs | 本番 400 日・dev 30 日（`template.yaml` の `RetentionInDays`） | 同上 | 1-5、6 | その他の診断データ |
| backend の例外ログ | `core/logs.py`（型名・スタックトレース・SQLSTATE。例外のメッセージは local / test だけ） | CloudWatch Logs | 同上 | 同上 | 1-5（「障害の調査用の記録に含まれることがある」） | その他の診断データ |
| backend のトレース（処理時間、`enduser.id` = アカウントの内部 ID。`session.id` の受け口もあるが、mobile はまだ送っていない。IP・UA・クエリは消す） | `core/tracing.py`、`aws_lambda/tracing.py` | X-Ray・CloudWatch（`aws/spans`） | 本番 90 日・dev 30 日（infra の設定。5 の注記） | 同上 | 1-5、6 | パフォーマンスデータ |
| 探索のレート制限のキー（アカウントの内部 ID・IP アドレス） | `maps/rate_limit.py` | — | backend のメモリに 60 秒 | 自動 | 1-5 | 収集にあたらない（すぐ捨てる） |

### 3.5 端末に保存するその他のもの

| データ | 取得箇所 | 送信先 | 保存先・保存期間 | 削除の手段 | ポリシー | App Privacy |
| --- | --- | --- | --- | --- | --- | --- |
| テーマ（外観）の設定 | `src/services/preferences/`（`Paths.document/app-preferences.json`。利用者の識別子は入れない） | 送らない | 端末。アンインストールまで | アンインストール | — | 対象外（端末内） |

### 3.6 端末から第三者へ直接送るもの

| データ | 取得箇所 | 送信先 | 保存先・保存期間 | 削除の手段 | ポリシー | App Privacy |
| --- | --- | --- | --- | --- | --- | --- |
| Google でサインインの SDK が送るもの | `react-native-nitro-google-signin`（iOS は GoogleSignIn ~> 9.0） | Google | Google のポリシーによる | Google のアカウント設定 | 1-6、3 | `app-privacy-label.md` 3.1 の Google Sign-In の行 |
| Apple のサインインの認可 | `expo-apple-authentication`（iOS の AuthenticationServices） | Apple | Apple のポリシーによる | Apple ID の設定 | **未反映**（3） | 申告不要（Apple） |
| 地図データの要求（表示範囲・IP・端末の情報） | `react-native-maps`（Android は Google Maps SDK、iOS は MapKit） | Google（Android）、Apple（iOS） | 各社のポリシーによる | — | 3 | 正確な位置情報（react-native-maps のマニフェスト） |
| 更新の確認（インストールごとの ID・前回の致命的なエラー） | `expo-updates`（`app.json` の `updates.url`） | Expo | 未確認 | — | 1-6、3 | デバイス ID、クラッシュデータ（いずれも紐づかない） |

## 4. 実装とポリシー・申告の既知の差分

| 差分 | 後続 |
| --- | --- |
| Sign in with Apple（SS-197〜199）がポリシーに無い。1-2 が Google だけ、1-4・9 の「ハッシュ値だけを保存」が Apple の refresh token の平文保存と食い違う、3 に Apple のサインインの行が無い、7・8・10 が Google だけを前提にしている | SS-210 |
| 写真の撮影日時（SS-163）を送って保存しているが、ポリシー 1-3 は「Exif は送信しません」とだけ書いている | SS-210 |
| 写真・ピンを消しても、写真のアップロード枠の行（S3 のキー・サイズ）は残る。紐付けずに終わった枠には撮影日時も残る（期限切れの枠の掃除 ADR-009 BK-3 が無い）。いずれもアカウント削除まで。ポリシー 7 には書いていない | SS-210（掃除を入れるなら BK-3） |
| App Privacy の申告がパフォーマンスデータに `session.id`（アプリの起動ごとの乱数）を挙げているが、mobile はまだ `X-App-Session-Id` を送っていない（backend の受け口だけある。ADR-013） | SS-210 |
| App Privacy の申告 3.2 の「認証トークン: サーバーには照合用のハッシュだけを保存」が、Apple の refresh token に当てはまらない | SS-210 |

## 5. この台帳で確かめていないこと

- CloudFront のアクセスログの項目と保持期間、トレース（`aws/spans`）の保持期間、S3 の `staging/` のライフサイクルは infra リポジトリ（sanposcape-infra）の設定で、このリポジトリからは確かめられない。
  保持期間は、SS-158 の PR（#131）の申し送りにある確認結果（sanposcape-infra `e09dcf8` の `live/platform/logging.tf`・`prod.tfvars` の `log_retention_days = 400`、トレースは 90 日）による。
  一方 ADR-012 の SS-159 追補はこれらを「infra 側で未確認」としており、記録が食い違う。400 日はポリシーで「最長 400 日」と言い切った値なので、infra を変えるときは infra 側で実際の値を確かめる。
- 第三者 SDK が送る内容は、各 SDK のプライバシーマニフェストと公開情報による（`app-privacy-label.md` 3.1）。Expo が更新の確認で受け取った情報を保持するかは確認できていない。
- 本番では Apple の鍵が未投入のため、アカウント削除時の Apple の失効が実際に動くかは確認していない（SS-196）。
