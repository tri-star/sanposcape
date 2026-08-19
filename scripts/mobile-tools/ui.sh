#!/usr/bin/env bash
# =============================================================================
# ui.sh
#
# エミュレータ上のアプリを操作/観測するための adb ラッパー集。
# adb ラッパー(~/.local/bin/adb)の「実在パスに一致する引数を Windows パスへ変換する」
# 挙動を踏まないように、adb shell へ渡すコマンドは必ず1引数へまとめている。
#
# 使い方:
#   bash scripts/mobile-tools/ui.sh screenshot [出力パス]
#   bash scripts/mobile-tools/ui.sh open [ルート]        # 例: open dev-screens
#   bash scripts/mobile-tools/ui.sh reload
#   bash scripts/mobile-tools/ui.sh restart              # force-stop してから開き直す
#   bash scripts/mobile-tools/ui.sh tap <X> <Y>
#   bash scripts/mobile-tools/ui.sh swipe <X1> <Y1> <X2> <Y2> [ミリ秒]
#   bash scripts/mobile-tools/ui.sh back
#   bash scripts/mobile-tools/ui.sh key <keycode>        # 82 = 開発メニュー
#   bash scripts/mobile-tools/ui.sh text "入力文字列"
#   bash scripts/mobile-tools/ui.sh geo <緯度> <経度>
#   bash scripts/mobile-tools/ui.sh logs [行数]          # Metro のログ
#
# 座標は「実機の物理ピクセル」で渡す。スクリーンショットを縮小して見ている場合は
# 縮小率を掛けて元解像度に戻すこと（例: 923px 表示 / 1440px 実機 → 1.56倍）。
# =============================================================================
set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  sed -n '4,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

cmd="${1:-}"
[[ -n "$cmd" ]] || usage 1
shift || true

case "$cmd" in
screenshot)
  out="${1:-${WORK_DIR}/shot-$(date +%H%M%S).png}"
  mkdir -p "$(dirname "$out")"
  adb_t exec-out screencap -p >"$out" || die "スクリーンショットの取得に失敗"
  printf '%s\n' "$out"
  ;;

open)
  route="${1:-}"
  if [[ -n "$route" ]]; then
    # アプリ内ルートへ直接飛ばす（例: dev-screens / design-system）。
    # dev client が既に Metro に接続している状態で使う。
    adb_t shell am start -a android.intent.action.VIEW -d "${APP_SCHEME}://${route}"
  else
    # dev client に Metro の URL を渡して開く。`Press a` は WSL 構成では使えない。
    adb_t shell am start -a android.intent.action.VIEW \
      -d "exp+${APP_SCHEME}://expo-development-client/?url=http%3A%2F%2Flocalhost%3A${METRO_PORT}"
  fi
  ;;

reload)
  # 開発メニュー経由ではなく Metro に再バンドルさせる。アプリの再起動が最も確実。
  adb_t shell am force-stop "$APP_ID"
  sleep 1
  exec bash "${BASH_SOURCE[0]}" open
  ;;

restart)
  adb_t shell am force-stop "$APP_ID"
  sleep 1
  exec bash "${BASH_SOURCE[0]}" open
  ;;

stop)
  adb_t shell am force-stop "$APP_ID"
  ;;

tap)
  [[ $# -ge 2 ]] || die "使い方: ui.sh tap <X> <Y>"
  adb_shell "input tap $1 $2"
  ;;

swipe)
  [[ $# -ge 4 ]] || die "使い方: ui.sh swipe <X1> <Y1> <X2> <Y2> [ミリ秒]"
  adb_shell "input swipe $1 $2 $3 $4 ${5:-300}"
  ;;

back)
  adb_shell "input keyevent 4"
  ;;

key)
  [[ $# -ge 1 ]] || die "使い方: ui.sh key <keycode>"
  adb_shell "input keyevent $1"
  ;;

text)
  [[ $# -ge 1 ]] || die "使い方: ui.sh text <文字列>"
  # input text は空白を %s で表す
  adb_shell "input text ${1// /%s}"
  ;;

geo)
  [[ $# -ge 2 ]] || die "使い方: ui.sh geo <緯度> <経度>"
  # adb emu geo fix は「経度 緯度」の順なので入れ替えて渡す
  adb_t emu geo fix "$2" "$1"
  ;;

logs)
  tail -n "${1:-40}" "$METRO_LOG"
  ;;

-h | --help | help)
  usage 0
  ;;

*)
  die "不明なコマンド: ${cmd}（ui.sh --help）"
  ;;
esac
