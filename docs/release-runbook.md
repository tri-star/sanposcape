# リリース運用手順（デプロイとリリースの分離）

> 決定の背景・なぜこの形なのかは
> [ADR-008: デプロイとリリースを分離し、公開はフィーチャーフラグとストアの手動リリースで制御する](./adr/ADR-008-deploy-release-separation.md)
> を参照。本ドキュメントは「どうやるか」だけを扱う。

## ⚠️ 本ドキュメントの成熟度（2026-10-22 時点）

**ここに書かれた手順には、まだ実運用を経ていないものがある**（下の表）。

| 節 | 状態 |
|---|---|
| 2. backend のデプロイ | **実績あり**（dev・prod。prod は 2026-10-01 から稼働し、2026-10-17 に `backend/v0.2.0` をデプロイ） |
| 3. フラグの操作 | backend の読み取り基盤（SS-98）は**dev・prod で稼働**。切り替えワークフロー（SS-99）は**実行済み**（2026-09-22 に dev で初回、2026-10-17 に production で `pin_registration` を ON）。mobile 側の受け皿（SS-100）は**実装済み**（起動時・フォアグラウンド復帰時に `/app-config` を取得し、取得できない場合は全フラグ OFF で動く） |
| 4. mobile の配布 | **実績あり**（dev 向けの `staging` 系と、本番の TestFlight 配信（SS-213。2026-10-17））。Release 作成のワークフローは**未実行**（ストア公開が未実施のため） |
| 5. ストアの設定 | **5.1（App Store）は実際の画面で設定済み**（SS-215。2026-10-19 に「承認後に手動でリリース」を選択）。5.2（Google Play）は**未検証**（公式ドキュメントに基づく記述） |
| 6. OTA | **実装済み・未実行**（SS-103。`mobile-production-update.yml`）。トークンの分離と production channel の保護は設定済み。Release Manager のトークンでの配信は初回の実行まで未確認 |
| 7. API の expand/contract | 規約は確定。backend の配信経路（SS-98）とアプリ側のアップデートの案内（SS-101）は実装済み。**最低サポートバージョンを変える経路は未整備**（§7.3） |
| 8. 引き返す | 8.4（OTA を戻す）は手順のみで**未実行**（eas-cli 25.2.0 のコマンドで記述） |

初回の本番リリース時に実際の画面・挙動を確認し、**差異があれば本ドキュメントを訂正すること。**

## 1. リリースの全体像

「デプロイ」と「リリース」は別の操作である（ADR-008 決定1）。

```
[1] main にマージ          … 機能はフラグ OFF。利用者には見えない
      ↓
[2] backend を prod へデプロイ   … コードは本番にある。まだ見えない
      ↓
[3] mobile を配布（ストア / OTA） … コードは端末にある。まだ見えない
      ↓
[4] 検証                   … フラグ ON の状態を dev で、または本番で自分だけ確認する
      ↓
[5] フラグを ON にする      ← ★ここがリリース
      ↓
[6] フラグを削除する PR      … ここまでやって 1 つの機能追加が完了
                               （mobile が見るフラグは固定値を返す期間を挟む。§3「フラグを追加する / 削除する」）
```

- **[2] と [3] の順序は問わない**（機能をフラグで包んでいる場合。包まない変更で mobile が新しい API を使うなら、[2] を先にする。§7.1）。両方が揃ってから [5] を行えばよい。
  これが「backend と mobile の公開タイミングを揃えられる」ということ。
- **[6] を省かないこと。** 残ったフラグは分岐として永久に残り、
  テストで担保すべき状態数を増やし続ける（ADR-008 決定6）。

### すべての変更をフラグで包む必要はあるか

必要ない。次を目安にする。

| フラグで包む | 包まなくてよい |
|---|---|
| 利用者から見える新機能 | 内部リファクタリング（外形が変わらないもの） |
| 挙動が変わる仕様変更 | 不具合修正（元の仕様に戻すもの） |
| backend と mobile の両方に変更が要る機能 | ドキュメント・CI の変更 |
| 問題が起きたら止めたい機能（外部 API に依存するものなど） | |

判断に迷ったら包む側に寄せる。包まなかった変更を後から止めるには再デプロイしかない。

## 2. backend のデプロイ

手順の詳細は
[packages/backend/docs/deployment.md](../packages/backend/docs/deployment.md) §4.1
「GitHub Actions からのデプロイ」にある。ここでは全体の流れの中での位置づけだけを示す。

1. `.github/workflows/backend-deploy.yml` を `workflow_dispatch` で起動する
   （dev は任意の ref から、prod は main からのみ + Required reviewers の承認）
2. **スキーマ変更を含む場合は、デプロイ後に手元からマイグレーションを実行する。**
   CI はマイグレーションを実行しない（ADR-005 決定9）。Job Summary にコマンドが出る
3. production へのデプロイが成功すると、`release` job が `backend/vX.Y.Z` タグと
   GitHub Release を自動生成する（development では作らない）。番号は git-cliff が算出するが、
   1.0.0 への移行など人が決めるときは、起動時の入力 `release_version`（production のみ）に `X.Y.Z` を指定する

### デプロイとマイグレーションの間に生じる隙間

CI のデプロイ完了からマイグレーション実行までの間、**新しいコードが古いスキーマで動く。**
この隙間を壊さないために、スキーマ変更は expand → contract に分ける（§7）。

ただし expand でも隙間は消えない。**既存テーブルに新しい列を足し、その列を読むコード（ORM が
SELECT する列に含まれる）を同時にデプロイすると、デプロイから migrate までの間、そのテーブルを
読む API は `UndefinedColumn` で 500 になる**（マイグレーション Lambda は API と同じ成果物を使うので、
コードより先に流せない）。dev は「デプロイ直後に migrate を invoke する」運用で数分の 500 を許容する。
本番の稼働後は、マイグレーションだけを含む PR を先にマージして先にデプロイ・migrate し、
その後で列を使うコードをデプロイする（ADR-008 決定7 の SS-171 追補、ADR-009 決定31）。

## 3. フラグの操作

> SS-98（backend の読み取り基盤と `/app-config`）と SS-99（切り替えワークフロー）は実装済み。
> 切り替えワークフローは 2026-09-22 に dev で初めて実行し、2026-10-17 に production でも実行した。手順と差異があれば本節を訂正すること。
> 現在のフラグ値・取得状態の確認は `/app-config` を叩けばよい
> （[deployment.md](../packages/backend/docs/deployment.md) §11「フィーチャーフラグ」を参照）。

### 運用上の約束

- **フラグの切り替えは GitHub Actions の `workflow_dispatch`（`.github/workflows/feature-flags.yml`）
  からのみ行う。AWS コンソールから直接操作しない。** Actions の実行履歴を
  「いつ・誰が・何をリリースしたか」の記録にするため（ADR-008 決定6）。
- prod のフラグ切り替えは production Environment の承認を通り、**main からしか起動できない**。
  dev は任意の ref から起動できる（その ref の定義ファイルが使われる）。
- フラグの定義（キー・名前・説明・既定値）は
  [`packages/backend/feature-flags.json`](../packages/backend/feature-flags.json) で管理する。
  キー集合は backend の登録簿（`core/feature_flags.py` の `FEATURE_FLAGS`）+ 予約キー
  `client_requirements` と一致していなければならない（pytest で検査している）。
  ただし、削除の段階1 で固定値に移したキー（下の「フラグを追加する / 削除する」）は定義ファイルに無いので、検査から除く（仕組みは未実装。ADR-008 SS-233 追補 D40）。
- **フラグの現在値の正本は AppConfig**（直近に配信を完了した hosted configuration version）。
  ワークフローは現在値を引き継ぎ、指定した1本だけを書き換えた版を作って `StartDeployment` する。
  定義ファイルに足したキーは既定値（OFF）で入る。定義ファイルから消えたキーは、`prune` を付けて
  実行したときだけ AppConfig から消える（付けなければ値を維持する）。
- **同一 Environment では、前のデプロイのベイク中に次のデプロイを開始できない。**
  ワークフローは環境ごとに直列化し、各 run が配信の完了（ベイク終了）まで待つので、2本続けて起動すると
  後の run は前の run の完了を待ってから動く。ベイクは dev 0 分・prod 1 分（sanposcape-infra の設定）。
- **ただし待機できる run は環境ごとに1つだけ。** 待機中にさらに起動すると、待機していた run は
  **キャンセルされて実行されない**（GitHub の concurrency の仕様）。prod で前の run が承認待ちのまま
  だと待機が長引くので、起動したら必ず run が成功（または「変更なし」）で終わったことを確認する。
- 一度もフラグを取得できていない場合に限り、backend は**全フラグ OFF** で動く（ADR-008 決定9）。
  ただし削除の段階1 で固定値に移したキーは、取得の状態に関わらず固定値を返す（ADR-008 SS-233 追補 D40。仕組みは未実装）。
  一度取得できた後に取得が失敗したときは、直前の値を保つ（決定9-1）。
  「フラグを ON にしたのに反映されない」ときは、まずベイク時間とポーリング間隔（既定60秒）を
  待ったうえで、CloudWatch Logs の AppConfig 取得失敗の ERROR ログを確認する
  （ログの実際の文言は `packages/backend/src/sanposcape/integrations/aws/appconfig.py` で確認すること）。
- mobile は起動時とフォアグラウンド復帰時に `/app-config` を取得し、取得できない場合は
  全フラグ OFF で動く（SS-100。詳細は
  [packages/mobile/docs/architecture-guideline.md](../packages/mobile/docs/architecture-guideline.md)
  「フィーチャーフラグ（`/app-config`）の扱い」）。**フラグ ON は即時には反映されず、
  AppConfig のベイク + backend のポーリング間隔（既定60秒）+ 端末がフォアグラウンドへ戻るまで
  の遅延がある。**

### 事前設定（環境ごとに1回）

| 設定先 | 名前 | 値 |
|---|---|---|
| GitHub Environment `development` / `production` の **Variables** | `AWS_FEATURE_FLAGS_ROLE_ARN` | sanposcape-infra の `mise run output live/platform -raw feature_flags_role_arn`（当該環境で実行） |

- Secrets は不要（OIDC のみ）。AppConfig の ID は SSM `/sanposcape/<env>/platform/appconfig/*` から
  ワークフローが読む（リポジトリにもログにも出さない）。
- Environment は backend のデプロイと共用する（infra のロールの trust が `environment:development` /
  `environment:production` を許す）。production の Required reviewers と Deployment branches（main 限定）が
  そのまま効く。
- 前提: 当該環境の `live/platform`（AppConfig の器・ロール・SSM 契約）が apply 済みであること。
  dev・prod とも apply 済み（prod は 2026-10-17 に production で切り替えを実行した）。

### フラグを切り替える

1. GitHub の Actions →「feature flags (AppConfig)」→ **Run workflow**
   （CLI なら `gh workflow run feature-flags.yml --ref main -f environment=development -f flag=<キー> -f state=on`）
2. `environment` / `flag`（`feature-flags.json` にあるキー）/ `state`（`on` / `off`）を選ぶ
3. production の場合は承認する
4. run が **成功で終わったこと**（キャンセルされていないこと）と、Job Summary の「変更前 → 変更後」・
   配信番号を確認する。既に同じ値なら「変更なし」で何もしない
5. 数分後に `/app-config` で反映を確認する:
   `curl -s https://app-api.<env>.sanposcape.com/app-config | jq`（`config_source` が `appconfig` になっていること）

初回（その環境に一度も配信していない状態）は、定義ファイルの既定値に指定の1本を反映した版が最初の版になる。

### 「配信中の版 #N が削除されていて現在値を読めません」で失敗したとき

直近に配信を完了した版が、ワークフロー外（infra の資格情報）で削除されている。典型例は
sanposcape-infra の `live/platform/README.md`「dev での動作確認」の手順で、テスト用の版を配信したあと
その版を消すため、配信記録だけが残る。ワークフローのロールは版を削除できないので、通常の運用では起きない。

現在値が分からないため、ワークフローは既定では何もせずに失敗する。**消された版の中身が
本番の値ではない**（疎通確認用だった等）と分かっている場合に限り、`from_defaults` を付けて再実行する。
定義ファイルの既定値（全フラグ OFF）に、指定した1本だけを反映した版が配信される。
他に ON にしていたフラグがあれば、続けて1本ずつ ON にし直す。
定義ファイルに無いキー（[互換性台帳](./compat-ledger.md)で「固定値で返している」キー）の値は、この版には引き継がれず、ワークフローからは戻せない。
固定値を返す backend が動いている間は影響しないが、段階1 より前の backend へ戻す手段は無くなる（§8.2）。

### フラグを追加する / 削除する

- **追加**: 登録簿（`FEATURE_FLAGS`）と `feature-flags.json` の両方にキーを足す PR を出す
  （既定値は必ず `enabled: false`）。マージ・デプロイ後にワークフローで ON にする。
- **mobile が見るフラグ（`audience: "client"`）を本番で ON にしたら**、[互換性台帳](./compat-ledger.md)に行を足す。
  この時点から、削除に2段階が要る（下）。
- **削除**: 登録簿の公開範囲（`audience`）と本番の現在値で手順が分かれる（ADR-008 SS-233 追補 D40）。
  - **backend だけが見るフラグ（`audience: "backend"`）**、または**本番で現在 OFF のフラグ**（一度も ON にしなかった・
    OFF に戻して機能ごと廃止する）: 分岐・登録簿・`feature-flags.json` からキーを消す PR を1つ出す。
  - **mobile が見るフラグ（`audience: "client"`）で、本番で現在 ON のもの**: 2段階で消す。mobile は `/app-config` の未知のキーを OFF として扱うため、
    backend がキーを返さなくなると、配布済みのアプリから公開済みの機能が消える。
    1. backend の分岐と `feature-flags.json` のキーを消し、登録簿ではそのキーを固定値 `true` を返すキーに移す（AppConfig の取得の状態に関わらず返す）。
       mobile の分岐・キー定数（`src/config/featureFlags.ts`）・テストも同じ PR で消してよい（後の PR でもよい）。
       台帳の行を「固定値で返している」に更新する。**AppConfig の値はまだ `prune` しない**（下）。
    2. 最低サポートバージョン（iOS・Android とも）が、分岐を消したコードを**ストアのバイナリに埋め込んだ**最初の version 以上になったら（§7.3）、
       固定値を消して台帳の行を外す。台帳に他の「固定値で返している」行が残っていなければ、AppConfig の値も `prune` で消す。OTA で分岐の無い JS を届けた version は数えない
       （OTA を当てていない端末や、埋め込みの JS へ戻した端末（§8.4）に分岐が残るため）。

    > 固定値を返す仕組みはまだ実装していない。最初に mobile が見るフラグを消す課題（`pin_registration`）で実装する。
- AppConfig の値は、**削除の PR を当該環境の backend にデプロイした後で** `prune` を付けて何かを切り替えたときに消える。
  `prune` を付けない切り替えでは値を維持する（main が稼働中の backend より先行していても、古い
  backend が読んでいる ON のフラグを消さないため）。残っていても新しい backend は未知キーとして無視する。
  - **[互換性台帳](./compat-ledger.md)に「固定値で返している」行がある間は、どのフラグの切り替えでも `prune` を付けない。**
    `prune` はキーを指定できず、定義ファイルに無いキーをまとめて消すので、別のフラグを消すための `prune` でも固定値のキーの値が消える。
    段階1 より前の backend へ戻した（§8.2）とき、戻した backend は AppConfig の値を読む。値が消えていると `false` になって配布済みのアプリから機能が消え、
    prod の切り替えは main の定義ファイル（キーが無い）からしか起動できないので、ワークフローで戻せない。
    その間に消した backend だけのフラグの値は AppConfig に残るが、新しい backend は未知キーとして無視するので害は無い。台帳の固定値の行が無くなってから、まとめて `prune` する。

### 現行の kill switch（AppConfig 移行前）

`GOOGLE_MAPS_LOOP_ROUTE_ENABLED`（周回ルートの緊急停止）は、まだ AppConfig ではなく
Lambda の環境変数である。操作手順は
[deployment.md](../packages/backend/docs/deployment.md) §7「周回ルートの kill switch」を参照。
**手元から環境変数を更新した場合、次の `sam deploy` で巻き戻る**点に注意すること。

## 4. mobile の配布

手順の詳細は
[packages/mobile/docs/build-profiles.md](../packages/mobile/docs/build-profiles.md)
「配布手順」にある。

1. **`version` を上げるかを判断する。** リリース単位でのみ上げ、上げるのは公開済みの version の次の本番 TestFlight ビルド（§4.1）の直前に限る。
   リリースの直後に次の版へ先に上げない。`runtimeVersion.policy: "appVersion"` のため、`version` は OTA の互換境界そのものであり
   （上げると既存端末は新 version 向けの OTA を受け取らなくなる）、§6.1 の OTA は main の `version` の本番ビルドへ配るので、
   先に上げると公開中の版へ OTA を出せなくなる（ADR-006 の SS-230 追補）。それまでの staging のビルドは公開済みの version のまま配り、
   設定画面のバージョンの行（ビルド番号・チャネル）で見分ける
2. 上げる場合は、`app.json` の `version` だけを変更する PR を出してマージする。前回の `mobile/v*` タグ以降の `packages/mobile` のコミットに
   破壊的変更（`feat!:` や `BREAKING CHANGE:`）があれば major、`feat` があれば minor、それ以外だけなら patch を上げる（cliff.toml の `[bump]` と同じ規則）
3. `.github/workflows/mobile-release-build.yml` を `workflow_dispatch` で起動する
4. ビルド番号（iOS の `buildNumber` / Android の `versionCode`）は **EAS サーバーが自動で採番する**。
   手で上げる PR は不要（ADR-006 の SS-89 追補）

**`version` を上げる PR と配布ビルドは必ずセットで計画すること。**
`version` を上げたまま配布しないと、その version 向けの OTA の配信先が存在しない状態になる。

### 4.1 本番アプリ（iOS）: TestFlight からストア公開まで

dev 向けの配布（上の 3.）とは別のワークフローを使う。初回の実行前の準備は
[build-profiles.md](../packages/mobile/docs/build-profiles.md)「本番の TestFlight 配信」にある。

1. `app.json` の `version` が公開済みの version（`mobile/v*` タグがあるもの）より大きいことを確かめる。
   同じか低ければ上の 1.〜2. で上げる（公開済みの最新の version 以下ではワークフローがビルド前に失敗し、
   エラーに上の 2. の規則での次の version の候補が出る）
2. `.github/workflows/mobile-production-testflight.yml` を main で `workflow_dispatch` する
   → ビルドと TestFlight への提出まで進む。**タグ・Release はまだ作らない**。
   dev 向けの `mobile-release-build.yml` の iOS ビルドの実行中は起動しない（EAS の同時実行は1で、順番待ちの時間も
   ジョブのタイムアウト 180 分に含まれる。超えるとビルドは EAS 上で続いて枠を消費するが、BUILD_ID が出ず提出もされない）
3. Job Summary の **BUILD_ID** を控える。**リリースノートのプレビュー**はストアの「新機能」欄の下書きにする（§5.3）
4. TestFlight で確認し、問題なければ App Store Connect で審査に提出し、承認後に公開する（§5.1）
5. **公開した後に** `.github/workflows/mobile-production-release.yml` を BUILD_ID を入力にして main で `workflow_dispatch` する
   → 先に `resolve` job がビルドを検査し、Job Summary に作成するタグ・version・**buildNumber**・コミットを出して、
   `release` job が `production` Environment の承認待ちになる
6. App Store Connect で**公開したビルドの version・ビルド番号**が Summary の値と一致することを確かめてから承認する
   → ビルドのコミットにタグ `mobile/v<version>` と GitHub Release が作られる（再ビルドはしない）。
   一致しなければ承認せずに却下し、正しい BUILD_ID で起動し直す

Release 作成のワークフローは、承認の前に、BUILD_ID が本番の iOS ストア向けの完了済みビルド（bundle ID `com.sanposcape.app`）であること、そのコミットが main にあり
`app.json` の `version` がビルドの version と一致することを確かめる。同じタグが同じコミットに既にあれば何もしない（再実行してよい）。
TestFlight に上げたが公開しなかったビルドには、タグを作らない（公開したビルドの BUILD_ID だけを渡す）。

## 5. ストアの設定（公開時期の制御）

> ⚠️ **5.1（App Store）は、SS-215（2026-10-19）で実際の画面で設定した。5.2（Google Play）は未検証**で、公式ドキュメントに基づく記述である。
> Google Play は初回の本番リリース時に実際の画面で確認し、差異があれば訂正すること。
> 5.1 も、実際に審査を通して公開するときに差異があれば訂正すること。
> 画面の名称・配置は各社の変更で変わり得る。

### 5.1 App Store（iOS）: 手動でリリース

審査の通過と公開を切り離し、承認後も自分のタイミングで公開できるようにする。

1. App Store Connect でアプリを開き、対象のバージョンを選ぶ
2. 「バージョンのリリース」（Version Release）の節で
   **「App Review による承認後に手動でこのバージョンをリリースする」** を選ぶ
   - 既定は「自動的にリリースする」であり、そのままだと**承認された瞬間に公開される**
   - 「自動的に段階的リリースを行う」と組み合わせると、公開開始後 7 日かけて配信先を広げられる
3. 審査に提出する
4. 承認後、公開したいタイミングで「このバージョンをリリース」を押す
5. 公開した後に、§4.1 の 5.〜6. で `mobile/vX.Y.Z` タグと GitHub Release を作る

### 5.2 Google Play（Android）: 公開の管理と段階的公開

1. **公開の管理（Managed publishing）を有効にする**
   - Play Console の「公開の概要」（Publishing overview）で有効にする
   - 有効にすると、審査を通過した変更が**自分で公開するまで保留される**
2. **段階的公開（staged rollout）で配信先の割合を指定する**
   - 製品版（Production）トラックのリリースを作成するとき、公開する割合を指定する
   - 小さい割合（例: 数 %）から始め、問題が無ければ引き上げる
3. 問題が見つかった場合は、割合の引き上げを止める（§8.3）

### 5.3 「新機能」欄の下書き

`mobile-production-testflight.yml` の Job Summary に出るリリースノートのプレビューを、
ストアの「新機能」欄の下書きにする（ADR-008 決定4）。中身は公開後に `mobile/vX.Y.Z` の GitHub Release の本文になるものと同じ
（前回の `mobile/v*` タグ以降の `packages/mobile/**` のコミット）。開発者向けの文面なので、利用者向けに書き直してから貼る。

### 5.4 App Store の App Privacy（プライバシー栄養ラベル）

入力する内容と根拠は [App Privacy の申告内容](./app-privacy-label.md) にまとめてある。
回答は審査なしでいつでも更新できるので、データの扱いを変えたら同文書の「見直すタイミング」に従って更新する。
回答はバージョンごとではなくアプリに 1 つなので、サポート中のすべてのアプリの挙動の和集合で書く（§7.5）。

## 6. OTA（EAS Update）

> **実装済み・未実行**（SS-103）。初回の実行で挙動が違えば、この節を訂正すること。

**OTA は「配信」の手段であって「リリース」の手段ではない**（ADR-008 決定8）。
OTA で届けてよい利用者向けの変更は次のいずれかに限る。

1. 既に公開済みの機能に対する不具合修正
2. **フラグ OFF の状態で入る新機能**（ダークローンチ。公開はフラグ ON で行う）

守るべき制約:

- OTA が届く範囲は**同一 `expo.version` の端末のみ**。`version` を上げた端末には届かない
- OTA は**ストア審査を経ず即時に届く**。そのため配信は `workflow_dispatch` +
  production Environment の承認に限定する
- **channel の付け替えでリリースを制御しない。** channel は `eas.json` の既存の割り当てを
  そのまま使い、公開の制御はフラグで行う
- ネイティブモジュールや config plugin の変更を含む場合は OTA で配れない（§6.1 の fingerprint の比較で止まる）。
  次のリリースで `version` を上げ（§4 の 1.〜2.）、ネイティブバイナリをストアで配布する。
  変更が main に入った時点では `version` を上げない（上げると公開中の版へ OTA を出せなくなる。ADR-006 の SS-230 追補）

### 6.1 本番へ OTA を配信する

`.github/workflows/mobile-production-update.yml` を main で `workflow_dispatch` する。
入力は `message`（OTA の内容。EAS の update 一覧に出る）だけ。

1. **prepare job が承認の前に検査する。** 失敗したら配信できない状態なので、理由を直してから起動し直す。
   - Expo の `production` channel が protected でなければ失敗する。Owner が手元で `pnpm exec eas channel:protect production` を実行してから起動し直す
     （project を別のアカウントへ移すと保護が外れる）
   - EAS の production 環境に、`eas.json` の `build.production.env` と同じ名前の変数があれば失敗する。
     `eas update` では EAS 側の値が勝ち、OTA の JS だけがその値で作られるため。EAS 側の変数を消すか、`eas.json` と揃える。
     承認を待つ間に足された場合に備えて、publish job も配信の直前に同じ検査をする。
     さらに、承認者が見た変数の一覧（名前・更新日時）から配信の直前までに変わっていれば、publish job は失敗する（変わった内容を確かめて起動し直す）
   - `app.json` の `version`（= runtimeVersion）の本番ビルド（production channel・ストア向け・完了済みの最新）をプラットフォームごとに探す。
     本番ビルドが無いプラットフォームには配信しない（届く端末が無い）。どちらにも無ければ失敗する
   - そのビルドと今のコミットの**ネイティブの fingerprint を比べ、違えば失敗する**。
     ネイティブの変更を含んでいるので OTA では配れない。`version` を上げてストアで配布する（§4）。
     lockfile の変更（依存の配置の変化）・`.gitignore`・app config の変更だけでも fingerprint は変わることがあり、その場合もストアで配布する
   - ビルドのコミットが今のコミットの祖先でなければ失敗する（ビルドに入った変更を巻き戻すことになるため）
2. **prepare の Job Summary を読んでから、publish job を承認する**（`production` Environment の承認）。
   Summary には次が出る。
   - 配信先のビルド（BUILD_ID・buildNumber・コミット）
   - そのビルドのコミットから今までの、OTA の JS に入りうるコミットの一覧（`packages/mobile` に加えて `packages/backend/openapi.yaml`・`pnpm-lock.yaml` など）。
     **一覧の中身が「公開済み機能の不具合修正」と「フラグ OFF の新機能」だけ**であることを確かめる
   - OTA の JS に入る EAS の production 環境の変数の名前と更新日時。見覚えの無い変数や、心当たりの無い最近の更新があれば承認しない
     （値だけを書き換えられても名前には現れないため、更新日時で見る）

   比べる相手は「最新の本番ビルド」で、利用者に公開したビルドとは限らない。公開したビルドより後に同じ version で作ったビルドがあると、
   一覧の起点もそちらになり、公開ビルドとの間のコミットは一覧に出ない。承認するとすぐに配信が始まる。
3. publish job が `eas update --channel production --environment production` を実行する。
   Job Summary に update group の ID が出る（ロールバックで使う。§8.4）。
   端末に届くのは、アプリが次に起動して新しい update を取得した後になる。

トークンと権限（ADR-008 D34）:

- Expo の `production` channel は **protected**。publish・ロールバック・channel の編集ができるのは Release Manager 以上だけで、
  CI では `production` Environment の Secret の `EXPO_TOKEN`（robot user `github-actions-ota-production`）だけがそれにあたる。
- リポジトリ Secret の `EXPO_TOKEN`（robot user `github-actions-build`、Developer）はビルド・提出・E2E 用で、本番 channel には出せない。
- どちらかのトークンが漏れたら、expo.dev の Access tokens で無効化し、同じ robot user で発行し直して Secret を差し替える。

fingerprint の比較で失敗したとき:

- Job Summary には違う項目（app config・ネイティブ依存のパスなど）だけが出る（中身はログに出さない）。
  中身は手元で次のように確かめる（`APP_VARIANT` などは `eas.json` の `build.production.env` を与える）。

  ```sh
  cd packages/mobile
  set -a; eval "$(jq -r '.build.production.env | to_entries[] | "\(.key)=\(.value|@sh)"' eas.json)"; set +a
  pnpm exec eas fingerprint:compare --build-id <BUILD_ID> --environment production
  ```

- Summary の「違う項目」が取得できなかった旨だけになっている場合は、ビルドの fingerprint の source（EAS 側の保存は期限付き）が期限切れの可能性がある。
  判定（ハッシュの比較）はこの影響を受けない。
- **1.0.0 の本番ビルド（BUILD_ID `b293641d…`、2026-10-18）は、OTA を配信できない。**
  その後に変わった `owner`（Organization への移管。ADR-006 の SS-103 追補）・eas-cli の追加による依存の配置・`packages/mobile/.gitignore` の差で、
  fingerprint が一致しないため。どれもアプリの動きには影響しないが、確かめようがないので、次の本番ビルド（§4.1）から配信できるようにする。

## 7. API の expand / contract

配布済みの mobile ビルドは更新されないまま backend を叩き続ける。
API の変更は常に 2 段階に分ける（ADR-008 決定7）。

### 7.1 expand（追加する）

- 新しいフィールドは**任意（optional）**にする。必須フィールドの追加は既存クライアントを壊す
- 既存のエンドポイントを置き換える場合は、FastAPI の `deprecated=True` を付けて**残す**
  - **意味とスキーマは変えない。** 「残っているが挙動が変わっている」が最も危険
  - 実例: `/explore/routes/walking`（SS-33 で `/explore/routes/loop` に置き換えたが、
    配布済みビルドの互換のため維持している）
- レスポンスから**フィールドを消さない**。列挙値に新しい値を足す場合は、
  古いクライアントが未知の値をどう扱うかを確認する
- 次の変更も配布済みのアプリを壊す。mobile CI が落ちても、mobile を直して CI が通れば済むわけではない（直した mobile は新しい版にしか載らない）
  - リクエストの任意の項目を必須にする、受け付ける値を狭める（長さ・範囲・列挙値）
  - 応答のフィールドを null 許容にする、型・単位・意味を変える
  - エラーの応答（ステータスコード・`code`）を変える
  - 認証の要否を変える
- 応答に required のフィールドを足すのは壊さない（古いクライアントは無視する）。Orval の関数の形が変わるだけの変更（クエリの無い GET に**任意の**クエリを足す）も、通信の上では壊さない（必須のクエリなら古いアプリは 422 になる）
- 本来は必須にしたいが、配布済みのアプリのために任意にした項目、置き換えて非推奨にしたエンドポイントは、[互換性台帳](./compat-ledger.md)に行を足す
- mobile が新しいエンドポイント・フィールドを使う変更は、フラグで包むか、backend を prod にデプロイしてから mobile を配布する（§1 の [2] と [3] の順序を問わないのはフラグで包んだときだけ）

### 7.2 移行

新しいクライアントを配布し、古いクライアントが十分に減るのを待つ。

### 7.3 contract（削除する）

> 判断材料となる最低サポートバージョンの**backend の配信経路（`/app-config` の
> `minimum_supported_versions`）は実装済み（SS-98）**、**アプリ側のアップデートの案内も実装済み
> （SS-101）**。ただし**最低サポートバージョンを変える経路（フラグ切り替えワークフローの入力）が
> まだ無い**（ADR-008 SS-101 追補 D33）。最初の contract の前に整える。AWS コンソールから直接変えない。

- `/app-config` が返す**最低サポートバージョン**を下回るアプリには、閉じられない全画面の案内が出て
  ストアへ誘導される（SS-101）。ただし散歩中と、保存されていない散歩をまだ保存できる間（サマリ画面・
  保存のためのサインイン）は出ない（ADR-008 SS-101 追補 D29〜D31）
  - 値は ASCII の `X.Y.Z` で入れる（形式不正は `null` 扱いで、案内は出ない）
  - 古い挙動を持たない最初の版は、**ストアのバイナリに埋め込んだ** version で数える。OTA で直した JS を届けた version は数えない
    （OTA を当てていない端末や、埋め込みの JS へ戻した端末（§8.4）に古い挙動が残るため）
  - 最低サポートバージョンは「これ未満を締め出す」値で、iOS / Android で別に持つ。上げる前に、その
    バージョン以上のビルドが両方のストアで公開済みであることを確かめる（公開前に上げると、
    ストアにアップデートが無いまま全利用者がふさがれる）
- そのバージョン以上のクライアントだけが残ったと言える状態になってから、
  古いフィールド / エンドポイントを削除する
- 最低サポートバージョンを上げたら、[互換性台帳](./compat-ledger.md)の「最低サポートバージョン」が条件の行を見て、条件を満たしたものを片付ける
  （mobile が見るフラグの固定値・非推奨の API・リクエストの必須化など）
- 最低サポートバージョンを上げたら、[データ取扱い台帳](./privacy/data-inventory.md)の「6. 古いアプリのための記述（contract 待ち）」を見て、
  条件を満たした古い挙動の記述をポリシー・App Privacy の申告・台帳から消す（§7.5）

### 7.4 DB スキーマにも同じ原則を適用する

マイグレーションは手動であり、デプロイ完了からマイグレーション実行までの間は
新しいコードが古いスキーマで動く（§2）。

| | expand | contract |
|---|---|---|
| 列 | 追加（NULL 許容 / 既定値つき） | 削除 |
| 制約 | ― | NOT NULL 化・一意制約の追加 |
| 列名の変更 | 新しい列を足して両方に書く | 古い列を消す |

expand と contract は**別のデプロイに分ける**。contract を後に回した列（後で NOT NULL にする・消す）は、[互換性台帳](./compat-ledger.md)に行を足す
（条件は「全環境の backend」。古いアプリが原因で残すなら「最低サポートバージョン」）。

- **NOT NULL でも server default があれば expand として扱える。** 古いコードの INSERT が
  通るため（列に NULL を許す必要はない）。既存行は default で埋まる。PostgreSQL 11 以降では、
  定数の default 付き `ADD COLUMN` はテーブルの書き換えを起こさない。
- **列追加でも隙間は残る。** 新しい列を読むコードを、その列を作るマイグレーションより先に
  動かすと、デプロイから migrate までの間に 500（`UndefinedColumn`）が出る。本番稼働後は
  「マイグレーションだけの PR を先に出す → migrate → 列を使うコードを出す」の順にする（§2）。
- **テーブル追加（expand）も、migrate を先に流すのが推奨。** 新しいテーブルを読み書きするコードを
  先にデプロイすると、そのテーブルを触る経路だけが `UndefinedTable` になる（他の API は影響を受けない）。
  例: SS-198 の `apple_authorizations`。先行デプロイした場合の影響は、Apple ユーザーのアカウント削除が
  500 になること、および code 付きの Apple サインインで refresh token が保存されないこと
  （保存は SAVEPOINT で囲んでおり、サインイン自体は成功する）。Google / dev ユーザーはテーブルを読まない。

### 7.5 プライバシーポリシー・App Privacy の申告にも同じ原則を適用する

配布済み・審査中のアプリは、ポリシーを直しても古い挙動のまま動き続ける（OTA でも直せないことがある。§6.1）。
そのため、ポリシー（`/privacy/`）と App Privacy の申告は**サポート中のすべてのアプリの挙動の和集合**で書く（SS-231）。
規則の正本は[データ取扱い台帳](./privacy/data-inventory.md)の「2.1」「2.2」で、ここではリリースの流れの中での順序だけを示す。

| | expand（書き足す） | contract（消す） |
|---|---|---|
| いつ | 新しい取得・送信・保存・目的を利用者に届ける（フラグ ON・ストアの公開・OTA）より前か同時 | 古い挙動を持つアプリが使えなくなった後（最低サポートバージョンを上げ、そのバージョン以上のクライアントだけが残ったと言える状態になった後。§7.3） |
| 何を | ポリシー・申告・台帳に新しい挙動を書き足し、本番の LP にデプロイする（古い挙動の記述は残す） | 台帳の「6. 古いアプリのための記述（contract 待ち）」の条件を満たした記述を消す |

- これにより、本番の LP は**いつでも main からデプロイできる**。ポリシーの改定を理由に LP のデプロイを止めなくて済む。
- **利用者に不利な改定は、施行日を付けて事前に公開する**（目安は公開から 30 日後。台帳 2.2）。新しい挙動を届けるのは施行日の後にする。
  フラグで包んだ機能なら、ポリシーの施行日を待ってからフラグを ON にする。ストアの公開も同じ。
- 例（SS-212 → SS-231）: ピンの住所を「登録画面で引いて名前の初期値にする」から「ピン詳細で引いて表示する」に変えたが、
  審査中の 1.0.0 は古い挙動のまま。ポリシーには両方を書き、1.0.0 を締め出してから古い方を消す。

## 8. 引き返す

問題の種類によって手段が異なる。**上にあるものほど速く、影響が小さい。**

### 8.1 フラグを OFF にする（最優先）

フラグで包んだ機能であれば、これが最も速い。再デプロイもストアの操作も不要。
§3「フラグを切り替える」の手順で `state=off` にする。

- prod はベイク（1 分）の間は次の配信を始められない。ワークフローは前の run の完了を待ってから
  配信するので、ON にした直後に OFF を起動してよい（ベイク終了後に OFF が配信される）。
  ただし待機中の OFF の run は、その後に別の run を起動するとキャンセルされる（§3）。緊急停止中は
  他の切り替えを起動せず、OFF の run が成功したことを確認する。
- `StopDeployment` はワークフローに組み込んでいない。コンソールから止めるのは運用上の約束（§3）に反するため、
  止める必要が生じたら逆の値でワークフローを起動する。

### 8.2 backend を再デプロイする

フラグで包んでいない変更はこれになる。`backend-deploy.yml` を前のコミットで起動する。

- **マイグレーションは自動では戻らない。** 前方互換を壊すスキーマ変更を入れていた場合、
  コードだけ戻しても動かない。これが expand → contract を守る理由である（§7.4）
- 過去のコミットへ戻すデプロイでは、`release` job はタグを作らずにスキップする
  （最新タグがその SHA の祖先でないため。番号の衝突を避ける仕様）
- mobile が見るフラグを固定値に移した（§3 の削除の段階1）コミットより前へ戻すと、戻した backend は AppConfig の値でそのフラグを返す。
  台帳に固定値の行がある間は `prune` しない規則（§3）を守っていれば値は残っている。戻す前に、[互換性台帳](./compat-ledger.md)の「固定値で返している」行の値が AppConfig に残っているかを確かめる

### 8.3 ストアの公開を止める

> 未検証（§5 の注記参照）。

- **Google Play**: 段階的公開の割合の引き上げを止める。既に配信された端末は戻らない
- **App Store**: 段階的リリース中であれば一時停止できる。公開済みのバージョンは取り下げられるが、
  既にインストールされた端末からは消えない

**どちらも「既に更新した利用者の端末を元に戻す」ことはできない。**
戻す必要がある場合は、修正した新しいバージョンを配布するしかない。

### 8.4 OTA を戻す

> 手順のみで未実行（SS-103。eas-cli 25.2.0 のコマンドで記述）。

`production` channel は protected なので、戻す操作も Release Manager 以上の権限が要る。
Release Manager のトークンは CI の `production` Environment にしか置いていないため、**Expo の Owner が手元で実行する**
（ワークフローは用意していない）。端末が次に起動して新しい update を取得するまでは反映されない。

```sh
cd packages/mobile
set -a; eval "$(jq -r '.build.production.env | to_entries[] | "\(.key)=\(.value|@sh)"' eas.json)"; set +a

# 戻し先の update group を探す（ひとつ前の group の ID を控える）
pnpm exec eas update:list --branch production --runtime-version <version>

# ひとつ前の update を、新しい update として出し直す
pnpm exec eas update:republish --group <ひとつ前の group の ID> --message "rollback: <理由>"

# まだ OTA を一度も当てていない状態（ストアのバイナリに入っている JS）へ戻す場合
pnpm exec eas update:roll-back-to-embedded --channel production --runtime-version <version> --platform <ios|android> --message "rollback: <理由>"
```

- 前のコミットから OTA を出し直す方法（§6.1 のワークフロー）は使えない。ワークフローは main の先頭からしか配信しない。
  コードで直す場合は、main で revert してからワークフローを起動する。
- ネイティブの互換を壊した update は、端末が起動直後に落ちて次の update を取得できないことがある。
  その場合は修正したバイナリをストアで配布するしかない（§8.3）。§6.1 の fingerprint の比較はこれを防ぐためにある。

## 9. リリースのチェックリスト

```
[ ] 機能はフラグで包まれているか（包まない判断をしたなら、その理由が説明できるか）
[ ] フラグ OFF の状態で、既存の挙動が変わっていないことを確認したか
[ ] API を変更した場合、配布済みの古いビルドが壊れないか（§7.1）
[ ] スキーマ変更を含む場合、expand と contract を別のデプロイに分けたか
[ ] 互換のために残したもの（非推奨の API・後で必須にする項目・後で NOT NULL にする列）を互換性台帳に足したか
[ ] データの扱いを変える場合、ポリシー・申告に新しい挙動を書き足し（古い挙動は残す）、本番の LP に出したか（§7.5）
[ ] それが利用者に不利な改定なら、施行日を過ぎたか（§7.5）
[ ] backend を prod へデプロイし、マイグレーションを実行したか
[ ] mobile の version を上げる必要があったか。上げたなら配布ビルドまで行ったか
[ ] OTA で配る場合、中身が「公開済み機能の不具合修正」と「フラグ OFF の新機能」だけか（§6）
[ ] backend / mobile の両方が配布済みになっているか
[ ] フラグを ON にしたか（← ここがリリース。mobile が見るフラグなら互換性台帳に行を足したか。§3）
[ ] 公開後の様子を確認したか
[ ] フラグを削除する PR を出したか（← ここまでで完了。本番で ON の mobile が見るフラグは固定値に移し、互換性台帳の行を更新したか。§3）
[ ] 最低サポートバージョンを上げたなら、互換性台帳とデータ取扱い台帳の「contract 待ち」を片付けたか（§7.3）
```

## 関連情報

- [ADR-008: デプロイとリリースを分離し、公開はフィーチャーフラグとストアの手動リリースで制御する](./adr/ADR-008-deploy-release-separation.md)
  —— 本手順の根拠
- [互換性台帳](./compat-ledger.md) —— 互換のために残しているものと、片付けてよい条件の一覧
- [ADR-005: backend は Lambda Function URL(AWS_IAM) + CloudFront で公開し、SAM で zip デプロイする](./adr/ADR-005-backend-serverless-deployment-lambda-function-url.md)
- [ADR-006: mobile アプリの配信は EAS（Expo ホスト）に委ねる](./adr/ADR-006-mobile-app-delivery-eas-hosted.md)
- [packages/backend/docs/deployment.md](../packages/backend/docs/deployment.md)
  —— backend のデプロイ手順・タグと Release・トラブルシュート
- [packages/mobile/docs/build-profiles.md](../packages/mobile/docs/build-profiles.md)
  —— ビルドプロファイル・配布手順・`version` の運用ルール
- [App Store Connect: バージョンのリリース (Apple 公式ドキュメント)](https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update)
- [段階的リリース (Apple 公式ドキュメント)](https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases)
- [公開の管理 (Google Play Console ヘルプ)](https://support.google.com/googleplay/android-developer/answer/9859654)
- [段階的な公開 (Google Play Console ヘルプ)](https://support.google.com/googleplay/android-developer/answer/6346149)
- [EAS Update のロールバック (Expo 公式ドキュメント)](https://docs.expo.dev/eas-update/rollbacks/)
