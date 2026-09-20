# リリース運用手順（デプロイとリリースの分離）

> 決定の背景・なぜこの形なのかは
> [ADR-008: デプロイとリリースを分離し、公開はフィーチャーフラグとストアの手動リリースで制御する](./adr/ADR-008-deploy-release-separation.md)
> を参照。本ドキュメントは「どうやるか」だけを扱う。

## ⚠️ 本ドキュメントの成熟度（2026-09-20 時点）

**ここに書かれた手順の大半はまだ実運用を経ていない。**

| 節 | 状態 |
|---|---|
| 2. backend のデプロイ | **実績あり**（dev のみ。prod スタックは未作成） |
| 3. フラグの操作 | backend の読み取り基盤（SS-98）は**実装済み**（dev への実デプロイでの検証は未実施）。**切り替えワークフロー（SS-99）は未実装**。mobile 側の受け皿（SS-100）は**実装済み**（起動時・フォアグラウンド復帰時に `/app-config` を取得し、取得できない場合は全フラグ OFF で動く） |
| 4. mobile の配布 | **実績あり**（dev 向けの `staging` 系のみ。ストア公開は未実施） |
| 5. ストアの設定 | **未検証**（公式ドキュメントに基づく記述。本番のストアレコードが未作成で確認できない） |
| 6. OTA | **未実装**（SS-103 が未着手） |
| 7. API の expand/contract | 規約は確定。backend の配信経路（SS-98）は実装済み。アプリ側のアップデート促進（SS-101）は未実装 |
| 8. 引き返す | フラグ・OTA に依存する手順は未実装 |

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
```

- **[2] と [3] の順序は問わない。** 両方が揃ってから [5] を行えばよい。
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
   GitHub Release を自動生成する（development では作らない）

### デプロイとマイグレーションの間に生じる隙間

CI のデプロイ完了からマイグレーション実行までの間、**新しいコードが古いスキーマで動く。**
この隙間を壊さないために、スキーマ変更は expand → contract に分ける（§7）。

## 3. フラグの操作

> SS-98（backend の読み取り基盤と `/app-config`）は完了済み。
> **SS-99（切り替えワークフロー）は未実装**。完了後に、確定した手順でここを書き直すこと。
> 現在のフラグ値・取得状態の確認は `/app-config` を叩けばよい
> （[deployment.md](../packages/backend/docs/deployment.md) §11「フィーチャーフラグ」を参照）。

現時点で確定している運用上の約束だけを記す。

- **フラグの切り替えは GitHub Actions の `workflow_dispatch` からのみ行う。
  AWS コンソールから直接操作しない。** Actions の実行履歴を
  「いつ・誰が・何をリリースしたか」の記録にするため（ADR-008 決定6）。
- prod のフラグ切り替えは production Environment の承認を通る。
- フラグの定義（名前・説明・既定値）は本リポジトリ内のファイルで管理する。
  ワークフローがその値から hosted configuration version を作成して `StartDeployment` する。
- **同一 Environment では、前のデプロイのベイク中に次のデプロイを開始できない。**
  prod はベイク時間を数分置く設計のため、連続してフラグを切り替える場合は待ち時間が生じる。
- フラグが読めない場合、backend は**全フラグ OFF** で動く（ADR-008 決定9）。
  「フラグを ON にしたのに反映されない」ときは、AppConfig の取得自体が失敗している可能性を疑う。
- mobile は起動時とフォアグラウンド復帰時に `/app-config` を取得し、取得できない場合は
  全フラグ OFF で動く（SS-100。詳細は
  [packages/mobile/docs/architecture-guideline.md](../packages/mobile/docs/architecture-guideline.md)
  「フィーチャーフラグ（`/app-config`）の扱い」）。**フラグ ON は即時には反映されず、
  AppConfig のベイク + backend のポーリング間隔（既定60秒）+ 端末がフォアグラウンドへ戻るまで
  の遅延がある。**

### 現行の kill switch（AppConfig 移行前）

`GOOGLE_MAPS_LOOP_ROUTE_ENABLED`（周回ルートの緊急停止）は、まだ AppConfig ではなく
Lambda の環境変数である。操作手順は
[deployment.md](../packages/backend/docs/deployment.md) §7「周回ルートの kill switch」を参照。
**手元から環境変数を更新した場合、次の `sam deploy` で巻き戻る**点に注意すること。

## 4. mobile の配布

手順の詳細は
[packages/mobile/docs/build-profiles.md](../packages/mobile/docs/build-profiles.md)
「配布手順」にある。

1. **`version` を上げるかを判断する。** リリース単位でのみ上げる。
   `runtimeVersion.policy: "appVersion"` のため、`version` は OTA の互換境界そのものである
   （上げると既存端末は新 version 向けの OTA を受け取らなくなる）
2. 上げる場合は、`app.json` の `version` だけを変更する PR を出してマージする
3. `.github/workflows/mobile-release-build.yml` を `workflow_dispatch` で起動する
4. ビルド番号（iOS の `buildNumber` / Android の `versionCode`）は **EAS サーバーが自動で採番する**。
   手で上げる PR は不要（ADR-006 の SS-89 追補）

**`version` を上げる PR と配布ビルドは必ずセットで計画すること。**
`version` を上げたまま配布しないと、その version 向けの OTA の配信先が存在しない状態になる。

## 5. ストアの設定（公開時期の制御）

> ⚠️ **未検証。** 本番のストアレコードが未作成のため、以下は各社の公式ドキュメントに基づく記述である。
> 初回の本番リリース時に実際の画面で確認し、差異があれば訂正すること。
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

### 5.2 Google Play（Android）: 公開の管理と段階的公開

1. **公開の管理（Managed publishing）を有効にする**
   - Play Console の「公開の概要」（Publishing overview）で有効にする
   - 有効にすると、審査を通過した変更が**自分で公開するまで保留される**
2. **段階的公開（staged rollout）で配信先の割合を指定する**
   - 製品版（Production）トラックのリリースを作成するとき、公開する割合を指定する
   - 小さい割合（例: 数 %）から始め、問題が無ければ引き上げる
3. 問題が見つかった場合は、割合の引き上げを止める（§8.3）

### 5.3 「新機能」欄の下書き

SS-102 の実装後は、`mobile/vX.Y.Z` の GitHub Release 用に生成した CHANGELOG を
ストアの「新機能」欄の下書きとしても使う（ADR-008 決定4）。

## 6. OTA（EAS Update）

> **未実装**。SS-103（本番配信ワークフローの追加、`EXPO_TOKEN` の Environment Secret 化）の
> 完了後に、確定した手順でここを書き直すこと。

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
- ネイティブモジュールや config plugin の変更を含む場合は OTA で配れない。
  `version` を上げて互換境界を切り、ネイティブバイナリを配布する

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

### 7.2 移行

新しいクライアントを配布し、古いクライアントが十分に減るのを待つ。

### 7.3 contract（削除する）

> 判断材料となる最低サポートバージョンの**backend の配信経路（`/app-config` の
> `minimum_supported_versions`）は実装済み（SS-98）**。**アプリ側のアップデート促進は未実装
> （SS-101）**。

- `/app-config` が返す**最低サポートバージョン**を下回るアプリにはアップデートを促す（SS-101）
- そのバージョン以上のクライアントだけが残ったと言える状態になってから、
  古いフィールド / エンドポイントを削除する

### 7.4 DB スキーマにも同じ原則を適用する

マイグレーションは手動であり、デプロイ完了からマイグレーション実行までの間は
新しいコードが古いスキーマで動く（§2）。

| | expand | contract |
|---|---|---|
| 列 | 追加（NULL 許容 / 既定値つき） | 削除 |
| 制約 | ― | NOT NULL 化・一意制約の追加 |
| 列名の変更 | 新しい列を足して両方に書く | 古い列を消す |

expand と contract は**別のデプロイに分ける**。

## 8. 引き返す

問題の種類によって手段が異なる。**上にあるものほど速く、影響が小さい。**

### 8.1 フラグを OFF にする（最優先）

> 未実装（SS-99）。

フラグで包んだ機能であれば、これが最も速い。再デプロイもストアの操作も不要。
AppConfig のデプロイ中であれば `StopDeployment` で止められる。

### 8.2 backend を再デプロイする

フラグで包んでいない変更はこれになる。`backend-deploy.yml` を前のコミットで起動する。

- **マイグレーションは自動では戻らない。** 前方互換を壊すスキーマ変更を入れていた場合、
  コードだけ戻しても動かない。これが expand → contract を守る理由である（§7.4）
- 過去のコミットへ戻すデプロイでは、`release` job はタグを作らずにスキップする
  （最新タグがその SHA の祖先でないため。番号の衝突を避ける仕様）

### 8.3 ストアの公開を止める

> 未検証（§5 の注記参照）。

- **Google Play**: 段階的公開の割合の引き上げを止める。既に配信された端末は戻らない
- **App Store**: 段階的リリース中であれば一時停止できる。公開済みのバージョンは取り下げられるが、
  既にインストールされた端末からは消えない

**どちらも「既に更新した利用者の端末を元に戻す」ことはできない。**
戻す必要がある場合は、修正した新しいバージョンを配布するしかない。

### 8.4 OTA を戻す

> 未実装（SS-103）。

同一 `runtimeVersion` 内の JS の変更であれば、前の update へ戻す
（`eas update:rollback`、または前のコミットから再度 `eas update` を出す）。
端末が次回の起動時に新しい manifest を取得するまでは反映されない。

## 9. リリースのチェックリスト

```
[ ] 機能はフラグで包まれているか（包まない判断をしたなら、その理由が説明できるか）
[ ] フラグ OFF の状態で、既存の挙動が変わっていないことを確認したか
[ ] API を変更した場合、配布済みの古いビルドが壊れないか（§7.1）
[ ] スキーマ変更を含む場合、expand と contract を別のデプロイに分けたか
[ ] backend を prod へデプロイし、マイグレーションを実行したか
[ ] mobile の version を上げる必要があったか。上げたなら配布ビルドまで行ったか
[ ] backend / mobile の両方が配布済みになっているか
[ ] フラグを ON にしたか（← ここがリリース）
[ ] 公開後の様子を確認したか
[ ] フラグを削除する PR を出したか（← ここまでで完了）
```

## 関連情報

- [ADR-008: デプロイとリリースを分離し、公開はフィーチャーフラグとストアの手動リリースで制御する](./adr/ADR-008-deploy-release-separation.md)
  —— 本手順の根拠
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
