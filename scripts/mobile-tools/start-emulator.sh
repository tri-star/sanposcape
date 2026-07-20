#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# start-emulator.sh
#
# WSL2からWindows側のAndroid Emulatorを起動する。
# 使い方: start-emulator.sh [AVD名]
#   AVD名を省略した場合は DEFAULT_AVD を使用する。
# =============================================================================

# ---------------------------------------------------------------------------
# デフォルトAVD（変更したい場合はここを書き換える）
# ---------------------------------------------------------------------------
DEFAULT_AVD="Pixel_4_API_33"

usage() {
  cat <<EOF
使い方: $(basename "$0") [AVD名]

WSL2からWindows側のAndroid Emulatorを起動する。
AVD名を省略した場合は "${DEFAULT_AVD}" を使用する。

例:
  $(basename "$0")                  # ${DEFAULT_AVD} を起動
  $(basename "$0") Pixel_8_API_35   # 指定したAVDを起動
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

avd_name="${1:-$DEFAULT_AVD}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# 指定AVDが有効なAVD一覧に含まれるか確認する
# （Start-Processは非同期起動のため、事前チェックで入力ミスを早期に検出する）
# ---------------------------------------------------------------------------
available_avds="$("${script_dir}/list-avds.sh")"

if ! printf '%s\n' "$available_avds" | grep -qx "$avd_name"; then
  echo "エラー: AVD '${avd_name}' が見つかりません。" >&2
  echo "利用可能なAVD一覧:" >&2
  printf '%s\n' "$available_avds" >&2
  exit 1
fi

resolve_emulator_exe_win() {
  local win_localappdata
  win_localappdata="$(cmd.exe /d /c 'echo %LOCALAPPDATA%' 2>/dev/null | tr -d '\r')"
  wslpath -w "$(wslpath -u "$win_localappdata")/Android/Sdk/emulator/emulator.exe"
}

emulator_exe_win="$(resolve_emulator_exe_win)"

echo "起動中: ${avd_name}"
powershell.exe -NoProfile -Command \
  "Start-Process -FilePath '${emulator_exe_win}' -ArgumentList @('-avd','${avd_name}')"
