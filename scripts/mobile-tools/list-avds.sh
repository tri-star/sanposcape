#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# list-avds.sh
#
# WSL2からWindows側のAndroid SDKに登録されているAVD(Android Virtual Device)の
# 一覧を取得する。
# =============================================================================

resolve_emulator_exe() {
  local win_localappdata
  win_localappdata="$(cmd.exe /d /c 'echo %LOCALAPPDATA%' 2>/dev/null | tr -d '\r')"
  echo "$(wslpath -u "$win_localappdata")/Android/Sdk/emulator/emulator.exe"
}

emulator_exe="$(resolve_emulator_exe)"

if [[ ! -f "$emulator_exe" ]]; then
  echo "エラー: emulator.exe が見つかりません: ${emulator_exe}" >&2
  echo "Windows側のAndroid SDKの場所を確認してください（Android Studio > SDK Manager > Android SDK Location）。" >&2
  exit 1
fi

# Windows の emulator.exe 出力は行末に CR(\r) が付くため除去する
# （付いたままだと呼び出し側の grep -qx 等の完全一致が失敗する）
"$emulator_exe" -list-avds | tr -d '\r'
