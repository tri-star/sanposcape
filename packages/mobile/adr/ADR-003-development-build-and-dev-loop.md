# ADR-003: モバイルは development build を前提とし、Fast Refresh で開発する

## 日付

2026-07-19

## コンテキスト

当初、mobile の動作確認は **Expo Go** で行う想定だった（`expo start` → Expo Go アプリで確認）。しかし技術スタック確定後、次が判明した。

- **Unistyles v3** は Nitro（ネイティブ C++/JSI）に依存し、**Expo Go では動作しない**。
  （※ Unistyles は後に [ADR-005](./ADR-005-styling-without-unistyles.md) で撤去したが、`react-native-maps` と
  アイコン描画の `react-native-svg` がネイティブモジュールのため、**本 ADR の結論は変わらない**。）
- **react-native-maps** もネイティブモジュールで、**Expo Go では動作しない**。

つまり本アプリは、スタイルと地図という中核の2要素がいずれもネイティブ依存であり、**Expo Go では成立しない**。動作確認の方法を決め直す必要がある。同時に「Expo Go のような手軽な HMR 体験を失いたくない」という要望がある。

- 開発環境は WSL2。ローカルの Android エミュレータ/実機は Windows 側で動作させる想定。

## 決定

- **development build（`expo-dev-client` を含むデバッグ版アプリ）を前提とする**。Expo Go は使わない。
- ローカル開発ループ:
  1. **EAS で Android の development build(APK) を1回作成**し、Windows 側のエミュレータ/実機にインストールする。
  2. 以降は **`expo start --dev-client`** で Metro に接続し、**Fast Refresh** で JS/スタイル/ロジックを即時反映（＝Expo Go 同等の体験）。
  3. **再ビルドが必要なのはネイティブが変わるときだけ**（native 依存の追加/削除・`app.json` のネイティブ設定・config plugin・SDK 更新）。JS のみの変更では再ビルド不要。
- WSL2 上の Metro に端末を到達させる: 実機は `adb reverse tcp:8081 tcp:8081`、難しい場合は `expo start --dev-client --tunnel`。
- エントリは `index.ts`（Unistyles 撤去後は起動前処理の差し込み口として残している。[ADR-005](./ADR-005-styling-without-unistyles.md)）。

## 検討した選択肢

### 選択肢1: development build + Fast Refresh（採用）

- **概要**: ネイティブは焼き込み、JS は Metro から取得。dev-client 経由で起動。
- **メリット**: Unistyles/地図が動く。**Fast Refresh は Expo Go と同等**で、日常のループはほぼ変わらない。再ビルドはネイティブ変更時のみ。
- **デメリット**: 初回とネイティブ変更時にビルドが要る。WSL2↔端末の到達設定（adb reverse / tunnel）が要る。

### 選択肢2: Expo Go を維持し、スタイル/地図をネイティブ非依存に置き換える

- **概要**: Unistyles をやめ StyleSheet 等に、地図も Expo Go 対応手段に変更。
- **メリット**: Expo Go の手軽さを維持。
- **デメリット**: そもそも **react-native-maps が必須のためこの案では中核が成立しない**。長期の技術選定（[ADR-002](./ADR-002-mobile-tech-stack.md)）を曲げることになる。

### 選択肢3: 毎回フルビルドして実機確認（HMRなし）

- **概要**: 変更のたびにビルドして確認。
- **メリット**: 構成が単純。
- **デメリット**: 反復が遅く、開発体験が著しく悪い。非現実的。

## 決定理由

- react-native-maps が必須である以上、**この app は Expo Go では動かない**。よって development build は選択ではなく前提。
- development build でも **Metro/Fast Refresh はそのまま効く**ため、「Expo Go 同等の体験」を維持できる。失うのは Expo Go アプリを入れるだけの手軽さと、初回/ネイティブ変更時のビルド時間のみ。
- ビルドは EAS を使うことで、ローカルにネイティブtoolchainを完全整備しなくても APK を得られる（WSL2 環境と相性が良い）。

## 影響

### ポジティブな影響

- Unistyles・react-native-maps が動作し、[ADR-002](./ADR-002-mobile-tech-stack.md) の技術選定を活かせる。
- 日常の開発ループは Fast Refresh で Expo Go 同等。
- dev build はチームで使い回せる（各自インストールするだけ）。

### ネガティブな影響・トレードオフ

- Expo Go の「アプリを入れるだけ」の手軽さは失われる。
- 初回およびネイティブ変更時にビルド時間が発生する。
- WSL2↔Windows 端末の到達設定（`adb reverse` / `--tunnel`）が必要。

### 移行・対応が必要な事項

- `expo-dev-client` を導入済み。`eas.json` に `development` プロファイルを用意済み。
- EAS アカウント連携・Android クレデンシャルの用意（ユーザーが実施）。
- E2E は development build ではなく standalone な preview ビルドを使う（[ADR-004](./ADR-004-e2e-build-ci-strategy.md)）。

## 関連情報

- [ADR-002: モバイル技術スタック](./ADR-002-mobile-tech-stack.md)
- [ADR-004: E2E ビルド・CI 戦略](./ADR-004-e2e-build-ci-strategy.md)
- [ADR-005: スタイルは Unistyles をやめる](./ADR-005-styling-without-unistyles.md)
- [mobile ローカル環境構築手順](../docs/local-env.md)
