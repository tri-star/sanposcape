# iPhone実機 development build 手順

iPhone実機にdevelopment buildをインストールし、WSL2上のMetroへ接続して動作確認する手順をまとめる。
Expo Goは使用せず、EAS Buildで作成したAd Hoc署名付きのdevelopment buildを使用する。

背景となる方針は
[ADR-003](../adr/ADR-003-development-build-and-dev-loop.md)を参照。

## 前提

- Apple Developer Programの有効なメンバーシップがあること
- Expoの`<EXPO_ACCOUNT>`アカウント、または
  `@<EXPO_ACCOUNT>/<EXPO_PROJECT_SLUG>`へのアクセス権があること
- リポジトリルートで`pnpm install`を実行済みであること
- `app.json`の`ios.bundleIdentifier`は`com.sanposcape.app`
- `eas.json`の`development`プロファイルは`developmentClient: true`かつ
  `distribution: internal`

Apple Accountのパスワードや2要素認証コードは、EAS CLIの対話プロンプトへ直接入力する。
チャット、Issue、ドキュメント、Git管理ファイルには記録しない。

## 初回セットアップ

### 1. EASへログインする

```bash
cd packages/mobile
eas login
eas whoami
eas project:info
```

`eas whoami`の出力を`<EXPO_ACCOUNT>`、`eas project:info`に表示されるproject slugを
`<EXPO_PROJECT_SLUG>`として以降の手順で読み替える。
`project:info`が`@<EXPO_ACCOUNT>/<EXPO_PROJECT_SLUG>`を示すことを確認する。

### 2. iPhoneを登録する

```bash
eas device:create
```

1. Expoアカウントとして`<EXPO_ACCOUNT>`を選ぶ。
2. Apple Developer Programへ加入しているApple Accountでログインする。
3. 2要素認証を完了する。
4. 端末登録方法として`Website`を選ぶ。
5. 表示されたURLをiPhoneのSafariで開く。
6. プロファイルをダウンロードし、iPhoneの「設定」からインストールする。

登録結果は次で確認する。複数のApple Teamがある場合は、EASが表示したTeam IDを指定する。

```bash
eas device:list
eas device:list --apple-team-id <APPLE_TEAM_ID>
```

### 3. development buildを作成する

```bash
eas build --platform ios --profile development
```

初回は次の方針で回答する。

- 暗号化: 独自暗号を使っていないため、標準／免除対象の暗号化のみを使用する
- Apple Account: ログインする
- Distribution Certificate: EASで新規作成する
- Provisioning Profile: EASで作成する
- 対象端末: 手順2で登録したiPhoneを選択する

EASが作成した証明書やProvisioning Profileの秘密情報はGitへ保存しない。

### 4. iPhoneへインストールする

ビルド完了後、EASのビルド詳細画面で`Install`を選択し、表示されたQRコードを
登録済みiPhoneで読み取ってインストールする。

Ad Hoc署名のため、ビルド時のProvisioning Profileに含まれている端末だけが
インストールできる。別のiPhoneを追加した場合は、端末登録後に再ビルドまたは再署名する。

### 5. Developer Modeを有効にする

iOS 16以降ではdevelopment buildの起動にDeveloper Modeが必要になる。

1. iPhoneでインストールしたアプリを一度開く。
2. 「設定 → プライバシーとセキュリティ → デベロッパモード」を開く。
3. デベロッパモードをオンにしてiPhoneを再起動する。
4. 再起動後の確認画面で有効化し、パスコードを入力する。

### 6. Hyper-VファイアウォールでMetroを許可する

WSL2のmirrored networkingでは、LANからWSLへの受信通信をHyper-Vファイアウォールが制御する。
Windows PowerShellを**管理者として実行**し、Metro用の受信ルールをPCごとに一度作成する。

まず、WSLの組み込みファイアウォールルールから`VMCreatorId`を取得する。

```powershell
Get-NetFirewallHyperVRule |
  Where-Object DisplayName -Like "WslCore*" |
  Select-Object -ExpandProperty VMCreatorId -Unique
```

表示された1つの値を`<WSL_VM_CREATOR_ID>`として、次のコマンドへ指定する。

```powershell
New-NetFirewallHyperVRule `
  -Name "SanposcapeMetro" `
  -DisplayName "Sanposcape Expo Metro" `
  -Direction Inbound `
  -VMCreatorId "<WSL_VM_CREATOR_ID>" `
  -Protocol TCP `
  -LocalPorts 8081-8090 `
  -RemoteAddresses LocalSubnet
```

このルールはローカルサブネットからのTCP 8081〜8090だけを許可する。
すでに同名のルールがある場合、再作成は不要。

## 毎回の開発ループ

iPhoneをPCと同じLANに属するWi-Fiへ接続し、WSL2上のMetroをLANへ公開する。
ゲストWi-Fiなど、端末間通信を遮断するAP isolation / client isolationが有効なネットワークは使用しない。

```bash
# リポジトリルートで実行
pnpm --filter mobile exec expo start --dev-client --host lan
```

Metroに表示されるURLが`http://<PC_LAN_IP>:8081`のようなLANアドレスになっていることを確認する。
8081が使用中の場合は、Expoの確認に`yes`と回答して次のポートを使用し、そのターミナルに表示された
QRコードを読み取る。`<PC_LAN_IP>`は`hostname -I`で表示される、
iPhoneと同じLANに属するIPv4アドレスへ読み替える。

1. Metroが表示するQRコードをiPhoneのカメラで読み取る。
2. 表示されたdevelopment build用リンクを開く。
3. または、`sanposcape`のdevelopment buildを開き、Development Serversから起動中のサーバーを選ぶ。
4. JS、TypeScript、スタイルの変更はFast Refreshで確認する。

Androidでは`adb reverse`によって端末側のlocalhostをMetroへ転送できるため
`--host localhost`を使用する。iPhoneには同等の転送がないため`--host lan`を使用する。
日々の具体的な起動・確認手順は[モバイルアプリ 起動手順ガイド](./app-startup-guide.md)を参照。

## 再ビルドが必要な変更

次を変更した場合はdevelopment buildを作り直す。

- ネイティブ依存の追加、削除、更新
- `app.json`のiOSネイティブ設定
- config plugin
- Expo SDKやReact Nativeの更新

JS、TypeScript、スタイル、画像だけの変更では通常は再ビルド不要。

## backendへ接続する場合

iPhoneから見た`localhost`はiPhone自身を指す。backend接続が必要な画面を確認する場合、
`EXPO_PUBLIC_BACKEND_API_URL`にはiPhoneから到達できるLANアドレスまたは公開した
Tunnel URLを設定する。

## トラブルシュート

- Apple Developer Programへの新規加入・更新直後は、Apple側の端末処理に24〜72時間かかり、
  初回ビルドが失敗する場合がある。
- インストールできない場合は、対象iPhoneのUDIDがProvisioning Profileに含まれているか確認する。
- development buildがMetroを見つけられない場合は、iPhoneとPCが同じLANか、
  手順6のHyper-Vファイアウォールルールが有効か、
  Wi-FiのAP isolation / client isolationが有効でないかを確認する。
- LAN経路を利用できない環境に限り、
  `pnpm --filter mobile exec expo start --dev-client --tunnel`をフォールバックとして使用する。
  `@expo/ngrok`のインストールを求められた場合は許可する。
- Developer Modeの項目が見つからない場合は、development buildをインストールして一度起動してから
  設定アプリを確認する。

## 参考

- [Expo: iOS実機用development build](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/)
- [Expo: iOS Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/)
- [Apple: Bundle ID](https://developer.apple.com/help/glossary/bundle-id/)
- [Microsoft: WSLのmirrored networkingとHyper-Vファイアウォール](https://learn.microsoft.com/windows/wsl/networking#mirrored-mode-networking)
