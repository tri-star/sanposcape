# ADR-004: シークレットの保管先は「消費者」で決め、CI から AWS への認証は OIDC を使う

## 日付

2026-08-22（初版）、2026-09-13 追補（Mapsキー保管先の拡張・ASC API Keyの扱い、SS-79）

## ステータス

採用。既存のシークレット（`EXPO_TOKEN` / `GOOGLE_MAPS_ANDROID_SDK_KEY`）については
**現状の GitHub Secrets 運用を維持する**ことの追認であり、コード変更を伴わない。
CD（SAM/Lambda のビルド・デプロイ）と dev/prod の AWS アカウント分離は**未着手**であり、
本 ADR はそれらを実装する際の前提方針を先に固定するものである。

## コンテキスト

現状、シークレットを扱っているのは `.github/workflows/mobile-e2e.yml` のみで、次の構成になっている。

- `EXPO_TOKEN`（`eas build --local` のアカウント連携）と `GOOGLE_MAPS_ANDROID_SDK_KEY`
  （Maps SDK for Android のキー。[mobile ADR-007](../../packages/mobile/adr/ADR-007-expo-config-and-maps-key-injection.md)
  で `app.config.ts` からネイティブ設定に注入される）を、GitHub の environment `ci-e2e` の
  secret として参照している。
- 本リポジトリは **public** である。そのため secret への到達経路を絞る目的で、
  ジョブに `environment: ci-e2e` を指定し、トリガを `workflow_dispatch` と `schedule` のみに
  限定している（fork PR から到達できない）。
- この設計の背景にある脅威認識は「**GitHub Actions の secret は、ワークフローの改ざんや
  外部から取得したスクリプトの実行によって比較的容易に読み出せる**」というもの。
  そのため保管場所の強度ではなく「どの実行文脈から到達できるか」を制御の主軸に置いている。

ここに、今後の以下の変更が加わる。

- **dev / prod それぞれの AWS アカウントを新設**し、AWS Secrets Manager を利用するようになる。
- **CD の過程で SAM(Lambda) のビルド・デプロイを GitHub Actions で行う**想定。

この状況で「秘密にすべき値は GitHub Actions Secrets と AWS Secrets Manager のどちらで
管理すべきか」「Secrets Manager に寄せた方がセキュリティ面で望ましいか」を決める必要が生じた。

## 決定

### 1. 保管先は「保管場所の強度」ではなく「誰がその値を消費するか」で決める

| 値 | 消費者 | 保管先 |
| --- | --- | --- |
| `EXPO_TOKEN` | GitHub Actions のジョブ自身（ビルド時） | **GitHub Secrets** |
| `GOOGLE_MAPS_ANDROID_SDK_KEY` | APK に焼き込まれエンドユーザー端末で動作 | **GitHub Secrets**（＋ GCP 側のキー制限が防御の本体）。**（SS-79 追補）** EAS のクラウドビルドワーカーも消費者に加わり、**EAS の環境変数（`preview` / `secret`）にも保管**するようになった |
| App Store Connect API Key（`.p8` / Key ID / Issuer ID） | EAS のサーバー（`eas submit` の実行主体） | **（SS-79 追補）EAS の credentials**（GitHub には置かない） |
| Lambda の DB パスワード・サーバ側 API キー等 | Lambda の**実行時** | **AWS Secrets Manager / SSM Parameter Store**（GitHub を一切通さない） |
| AWS へのデプロイ権限 | GitHub Actions | **OIDC で都度発行**（そもそも secret として保管しない） |

**「GitHub の secret を減らすために Secrets Manager を経由させる」ことはしない。**
CI が Secrets Manager から値を読むには結局 CI 側に AWS への認証手段が必要であり、
中継を 1 段増やしても「そのジョブが読める値は、改ざんされたジョブからも読める」という
前提は変わらないため、上記コンテキストの脅威に対する緩和にならない。
有効な制御は引き続き「**到達できる実行文脈を絞る**」ことである。

### 2. `EXPO_TOKEN` は GitHub Secrets に置き続ける

実行時に一切登場しない純粋な CI クレデンシャルであり、Expo 側の資産であるため
AWS アカウント分離とも無関係。AWS に置く理由がない。

### 3. `GOOGLE_MAPS_ANDROID_SDK_KEY` も GitHub Secrets に置き続ける

このキーは standalone APK に焼き込まれる以上、**秘匿性に依存できない**
（配布された APK から抽出可能）。したがって防御の本体は保管場所ではなく
**Google Cloud 側のキー制限**であり、以下を必須の前提とする。

- Application restriction: Android アプリ（パッケージ名 + 署名証明書の SHA-1）
- API restriction: Maps SDK for Android のみ
- 予算アラート / クォータ上限の設定

これらが有効であればキーが露出しても第三者は利用できず、逆にこれらが未設定であれば
Secrets Manager に格納しても APK から抽出されて意味をなさない。
リポジトリにコミットしないのは「リポジトリから機械的に収穫されない」ためであり、
その目的は GitHub Secrets で達成できている。

なお、[mobile ADR-004](../../packages/mobile/adr/ADR-004-e2e-build-ci-strategy.md) の通り
**E2E の preview APK にはこのキーを注入しない**（地図タイルの描画を assert しないため）。
本 ADR はこの方針を変更しない。

### 4. Lambda のランタイム秘密は CD パイプラインに通さない

DB パスワードや外部サービスのサーバ側 API キーは、`template.yaml` のパラメータや
Lambda の環境変数として CI から渡すのではなく、**Lambda が実行ロールで Secrets Manager /
SSM Parameter Store から直接読み出す**設計にする。

これにより CD パイプラインは本番のシークレット値を一度も参照しないため、
「GitHub Actions が侵害されると本番のシークレットが漏れる」という経路自体が消える。
**「Secrets Manager に寄せる」の正しい形はこれ**であり、CI 用 secret の引っ越しではない。

ローテーションが不要な値については、コストの観点から SSM Parameter Store の
SecureString（標準パラメータは無料）も選択肢とする。Secrets Manager は
自動ローテーションが必要な値（RDS の認証情報など）に用いる。

### 5. AWS へのデプロイ認証は OIDC とし、長期アクセスキーを GitHub に置かない

`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` を GitHub Secrets に保管する運用は採らない。
`aws-actions/configure-aws-credentials` の OIDC を用い、GitHub が発行する短期トークンで
IAM ロールを AssumeRole する。GitHub 側に置くのはロール ARN（秘密ではない）のみとする。

IAM ロールの信頼ポリシーでは `token.actions.githubusercontent.com:sub` により
リポジトリ・environment を限定する。

```
"token.actions.githubusercontent.com:sub": "repo:<owner>/<repo>:environment:production"
```

これにより、GitHub の environment による制御と IAM 側の制御が**二重に効く**。
public repo であることを踏まえると、長期キー方式に対する優位は明確である。

### 6. dev / prod は GitHub Environment と AWS アカウントを 1:1 に対応させる

- `development` / `production` の Environment を作成し、それぞれに対応する AWS アカウントの
  OIDC ロール ARN を持たせる。
- `production` には **Required reviewers** と **Deployment branches を main 限定**の設定を付ける。
- 現在 `ci-e2e` で行っている「environment で到達経路を絞る」構造を、そのまま横に広げる形とする。

### 7. 既存の `ci-e2e` に対する補強

- Environment の **Deployment branches を main 限定**にする。
  `workflow_dispatch` は write 権限者が任意ブランチから実行できるため、
  トリガ限定だけでは「main 以外のブランチのワークフロー定義で実行される」経路が残る。
- `.github/workflows/` を **CODEOWNERS** の対象にし、ワークフロー改ざんにレビューを必須にする。

## 検討した選択肢

### 選択肢1: 消費者に応じて GitHub Secrets と AWS Secrets Manager を使い分ける（採用）

- **概要**: CI 自身が消費する値は GitHub、実行時に消費する値は AWS。AWS への認証は OIDC。
- **メリット**:
  - 各シークレットが「使われる場所の最も近く」に置かれ、経路が最短になる。
  - 本番のランタイム秘密が CI を通過しないため、CI 侵害時の被害範囲が本番から切り離される。
  - OIDC により GitHub 側の長期クレデンシャルがゼロになる。
- **デメリット**:
  - 保管先が 2 箇所に分かれるため、「どこにあるか」の判断基準をドキュメント化する必要がある
    （本 ADR がその役割を担う）。

### 選択肢2: すべて AWS Secrets Manager に寄せ、GitHub Secrets は極小化する

- **概要**: `EXPO_TOKEN` や Maps SDK キーも Secrets Manager に格納し、CI は実行時に取得する。
- **メリット**:
  - シークレットの一覧・監査が AWS に集約される。CloudTrail で `GetSecretValue` を追跡でき、
    ローテーションも一元化できる。
  - IAM ポリシーでシークレット単位の粒度の細かいアクセス制御ができる。
- **デメリット**:
  - **CI が Secrets Manager を読むには結局 CI 側に AWS への認証手段が必要**で、
    「改ざんされたワークフローから読める」という当初の懸念は解消しない。
  - Expo 用のトークンなど AWS と無関係な資産まで AWS に依存させることになり、
    CI が AWS の可用性・権限設定に引きずられる。
  - 公開される前提の Maps SDK キーを秘匿ストアに置くことで、
    「秘匿されているから安全」という誤った安心を生む（実際の防御は GCP のキー制限）。
  - Secrets Manager は 1 シークレットあたり月額課金が発生する。

### 選択肢3: すべて GitHub Secrets に置く（AWS の長期アクセスキーを含む）

- **概要**: CD でも `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` を GitHub Secrets に置く。
- **メリット**: 設定が単純で、OIDC プロバイダや信頼ポリシーの構築が不要。
- **デメリット**:
  - 長期クレデンシャルが public repo の CI 上に常駐し、漏洩時の有効期間が無制限になる。
  - ローテーションが手作業になる。
  - 本番のランタイム秘密まで CI を通過させることになり、CI 侵害の影響が本番に直結する。

## 決定理由

- **保管場所を変えても脅威モデルが変わらない**ことが判断の中心にある。ユーザーが挙げた
  「ワークフロー改ざんや外部スクリプトから secret を読み出せる」という懸念は、
  Secrets Manager に移しても（そのジョブが読める権限を持つ以上）そのまま残る。
  したがって「保管先の変更」ではなく「**CI にそもそも渡さない**」「**認証を短期化する**」
  という 2 つの構造的な対策を採るのが有効と判断した。
- Maps SDK キーは、その性質上（クライアント配布物に埋め込まれる）秘匿性を防御の前提に
  できない。ここに保管先強化のコストを払うより、GCP 側のキー制限を確実にする方が
  費用対効果が高い。
- OIDC は「長期クレデンシャルをゼロにする」という点で、他のどの施策よりも効果が大きく、
  かつ実装コストが低い。public repo である本リポジトリでは優先度が最も高い。
- MVP 段階のコストも判断材料とした。ローテーション不要な値に対して
  Secrets Manager の月額課金を払う必要はなく、SSM Parameter Store で足りる。

## 影響

### ポジティブな影響

- CD 実装時に「この値はどこに置くか」を都度議論する必要がなくなる。
- 本番の AWS アカウントに対して、GitHub 側に長期クレデンシャルが存在しない状態を
  最初から作れる（後から移行するより安価）。
- 本番のランタイム秘密が CI ログ・CI 実行環境に一度も現れないため、
  CI の侵害と本番データの侵害が分離される。

### ネガティブな影響・トレードオフ

- シークレットの保管先が GitHub / AWS の 2 箇所に分かれる。どちらにあるかを
  判断する基準を参照できないと混乱するため、本 ADR の表を参照点とする必要がある。
- OIDC プロバイダの登録・IAM ロールの信頼ポリシー設計という初期構築コストが発生する。
- Lambda が実行時に Secrets Manager / SSM を呼ぶため、コールドスタート時に
  わずかな遅延が加わる（実行内でのキャッシュで緩和する）。

### 移行・対応が必要な事項

以下は本 ADR では方針決定のみで、実施は別タスクとする。

- [x] `GOOGLE_MAPS_ANDROID_SDK_KEY` について、GCP 側の Application restriction
      （パッケージ名 + 署名証明書 SHA-1）・API restriction・予算アラートの設定状況を確認する。
      **未設定の場合はこれが最優先の対応事項**となる。
      **（SS-79 追補）開発用識別子 `com.sanposcape.app.dev` については設定済み**（開発用 GCP
      プロジェクトの制限を本番の組から上書きする形で更新した）。**本番識別子用は別の GCP
      プロジェクトで登録し直す必要があり未完了**（`production` を使い始める段の対応事項）。
- [ ] `ci-e2e` Environment の Deployment branches を main 限定に設定する（未設定の場合）。
- [ ] `.github/workflows/` を CODEOWNERS の対象にする。
- [ ] AWS アカウント新設時に、各アカウントへ GitHub OIDC プロバイダを登録し、
      `development` / `production` Environment に対応する IAM ロールを作成する。
- [ ] `production` Environment に Required reviewers を設定する。
- [ ] SAM の `template.yaml` を作る際、Lambda 実行ロールに対象シークレットへの
      `secretsmanager:GetSecretValue` / `ssm:GetParameter` を最小権限で付与し、
      シークレット値を CFn パラメータや環境変数として渡さない構成にする。

## SS-79 追補: Mapsキー保管先の拡張とApp Store Connect API Keyの扱い

決定1（保管先は「誰が消費するか」で決める）と決定3
（`GOOGLE_MAPS_ANDROID_SDK_KEY` は GitHub Secrets に置き続ける）の**範囲を拡張**する。

### `GOOGLE_MAPS_ANDROID_SDK_KEY` の保管先に EAS の環境変数が加わる

`GOOGLE_MAPS_ANDROID_SDK_KEY` の保管先に **EAS の環境変数（`preview` / `secret`）が加わる**。
GitHub Secrets からの撤去ではなく、**消費者が増えた**ことへの対応である（消費者 = EAS の
クラウドビルドワーカー。`.github/workflows/mobile-release-build.yml` が使う `staging` /
`staging-apk` のビルドはシェル環境変数を受け取れないため）。決定1 の原則
（消費者で決める）に沿った拡張であり、原則そのものは変えていない。

詳細（visibility を `secret` にした理由・E2E への影響）は
[packages/mobile/adr/ADR-007](../../packages/mobile/adr/ADR-007-expo-config-and-maps-key-injection.md)
の SS-79 追補を参照。

**未実施（2026-09-13 時点）**: `secret` visibility への変更自体はまだ実行していない
（EAS アカウント操作のためユーザー作業）。現状は `sensitive` のままである。実施状況の記録は
`packages/mobile/docs/build-profiles.md` の実測欄を参照。

### 訂正: 「E2E の preview APK にはこのキーを注入しない」は誤り（SS-44 / SS-78 以降）

決定3 の本文および下記「関連情報」に**「E2E の preview APK にはこのキーを注入しない」という
記述が残っているが、SS-44 / SS-78 以降は事実と異なる**。SS-44 で `GOOGLE_MAPS_ANDROID_SDK_KEY`
未注入時に Maps SDK 初期化の RuntimeException でアプリがクラッシュすることが判明したため、
`.github/workflows/mobile-e2e.yml` は `ci-e2e` environment の GitHub Secrets からこのキーを
`preview` ビルドへ注入するようになっている（`GOOGLE_MAPS_ANDROID_SDK_KEY` は maps-required な
Maestro フローの前提であり、地図タイルの描画自体は assert しないが、キーが無いと起動時点で
落ちるため必須になった）。詳細は
[mobile ADR-004 の SS-44 / SS-78 追補](../../packages/mobile/adr/ADR-004-e2e-build-ci-strategy.md)
と `packages/mobile/adr/ADR-007` を参照。

### App Store Connect API Key は GitHub Secrets に置かない

App Store Connect API Key（`.p8` / Key ID / Issuer ID）は **GitHub Secrets に置かない。**
消費者は EAS のサーバー（`eas submit` の実行主体）であり、**EAS の credentials に保管させる**。
GitHub 側に増える秘密は無く、`EXPO_TOKEN` だけで CI（`mobile-release-build.yml`）が
`eas submit` まで実行できる。

これも決定1 の原則の適用結果であり、`.p8` をランナーのファイルシステムへ書き出す手間と
漏洩面を持ち込まないためでもある。ASC API Key は Apple Developer Team 単位で発行できる
ため技術的には本番用アプリレコードにも同じキーを使い回せるが、**SS-79 では開発用として
チームキーを1本発行し、本番用は本番配布を開始する段で別途発行する方針**にした（権限を
用途ごとに分け、開発用の作業で本番配布のキーが不要に露出しないようにするため）。

## 関連情報

- [ADR-001: 地図・POI・ルーティング基盤に Google Maps Platform を採用し backend 経由で利用する](./ADR-001-map-poi-google-maps-platform.md)
  — mobile の SDK key と backend の server key を分離する決定
- [mobile ADR-004: E2E のビルド・CI 戦略](../../packages/mobile/adr/ADR-004-e2e-build-ci-strategy.md)
  — E2E（`preview`）のビルド・CI 戦略。Maps SDK キーは SS-44 以降 `ci-e2e` の GitHub Secrets
  から注入する（上記「訂正」を参照。「注入しない」は SS-44 以前の話）
- [mobile ADR-007: Expo 設定と Maps SDK キーの注入](../../packages/mobile/adr/ADR-007-expo-config-and-maps-key-injection.md)
  — `app.config.ts` によるキー注入と `EXPO_PUBLIC_` を付けない理由
- `.github/workflows/mobile-e2e.yml` — 現行の `ci-e2e` environment の利用箇所
- [Configuring OpenID Connect in Amazon Web Services (GitHub Docs)](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [API キーの使用を制限する (Google Maps Platform)](https://developers.google.com/maps/api-security-best-practices)
