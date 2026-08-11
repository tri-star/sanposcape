---
name: android-emulator
description: WSL2からWindows側のAndroid Emulatorを起動したり、有効なAVD一覧を確認したりする際に使用します。「エミュレータを起動して」「AVD一覧を見せて」「Pixel_8_API_35で起動して」のようなリクエストで使用します。mobile(Expo)のdevelopment buildをエミュレータで動作確認する前段の準備として使います。
allowed-tools: Bash
---

# Android Emulator (WSL2 → Windows) 起動スキル

WSL2上のClaude Codeから、Windows側にインストールされたAndroid Emulatorを操作するスキルです。
本プロジェクトのmobile development buildは、エミュレータ/adb serverをWindows側で動作させる構成を前提としています（[ADR-003](../../../packages/mobile/adr/ADR-003-development-build-and-dev-loop.md)、[local-env.md](../../../packages/mobile/docs/local-env.md)）。

## 前提条件

- Windows側にAndroid Studio/Android SDKがインストール済みであること（`%LOCALAPPDATA%\Android\Sdk` を想定）
- WSL2から `cmd.exe` / `powershell.exe` が実行できること（WSL2のデフォルト設定でそのまま動作する）

## できること

### 1. 有効なAVD一覧を取得する

```bash
bash scripts/mobile-tools/list-avds.sh
```

Windows側の `emulator.exe -list-avds` の結果をそのまま表示します。

### 2. Android Emulatorを起動する

```bash
bash scripts/mobile-tools/start-emulator.sh              # デフォルトAVD(Pixel_4_API_33)を起動
bash scripts/mobile-tools/start-emulator.sh <AVD名>       # AVDを指定して起動
bash scripts/mobile-tools/start-emulator.sh --help        # 使い方を表示
```

- デフォルトのAVD名は `Pixel_4_API_33` です。
- デフォルト値を変更したい場合は `scripts/mobile-tools/start-emulator.sh` 冒頭の `DEFAULT_AVD` を書き換えてください。
- 指定したAVD名が一覧に存在しない場合は、利用可能なAVD一覧を表示してエラー終了します。
- エミュレータはWindows側で非同期に(`Start-Process`で)起動するため、起動完了まで数十秒〜数分かかります。`bash scripts/mobile-tools/adb devices`（後述のadbラッパー、または `~/.local/bin/adb` にセットアップ済みの `adb devices`）で `device` 状態になるまで待ってください。

## 起動後の次のステップ

1. WSL2からWindows版adbを使えるようにする（初回のみ、[local-env.md](../../../packages/mobile/docs/local-env.md) の「WSL2 から Windows 版 adb を使う」参照）
2. `adb devices` でエミュレータが見えることを確認
3. `adb reverse tcp:8081 tcp:8081` でMetroへのポート転送を設定
4. `pnpm --filter mobile exec expo start --dev-client` を起動し、development buildを開く
