#!/usr/bin/env bash
# =============================================================================
# dev-doctor.sh
#
# mobile の実機(エミュレータ)動作確認に必要な前提が揃っているかを読み取り専用で診断する。
# 何も起動・変更しない。「なぜ動かないのか」を最初に切り分けるために使う。
#
# 使い方: bash scripts/mobile-tools/dev-doctor.sh
# 終了コード: 0=すべてOK / 1=未達の項目あり
# =============================================================================
set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

failures=0
check() { # check <説明> <コマンド...>
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    ok "$label"
  else
    ng "$label"
    failures=$((failures + 1))
  fi
}

api_port="$(backend_port_for_app || true)"

echo "--- 環境 ---"
printf '  repo      %s\n' "$REPO_ROOT"
printf '  app id    %s\n' "$APP_ID"
printf '  scheme    %s\n' "$APP_SCHEME"
printf '  metro     localhost:%s\n' "$METRO_PORT"
printf '  backend   localhost:%s\n' "${api_port:-unknown}"

echo "--- 設定ファイル ---"
check "packages/mobile/.env が存在する" test -f "$MOBILE_ENV"
check "packages/backend/.env が存在する" test -f "$BACKEND_ENV"
for key in EXPO_PUBLIC_BACKEND_API_URL EXPO_PUBLIC_AUTH_MODE EXPO_PUBLIC_LOCATION_MODE; do
  check "mobile .env: ${key} が設定されている" env_value "$MOBILE_ENV" "$key"
done
# サーバキーは実行時に効く（未設定なら /explore/places がログ無しで 503）。
# Android SDK キーは APK に焼き込まれるため、ローカルが空でも既存ビルドでは地図が出る。
check "backend .env: GOOGLE_MAPS_SERVER_API_KEY が設定されている（ユーザー作業）" \
  env_value "$BACKEND_ENV" GOOGLE_MAPS_SERVER_API_KEY
if env_value "$MOBILE_ENV" GOOGLE_MAPS_ANDROID_SDK_KEY >/dev/null; then
  ok "mobile .env: GOOGLE_MAPS_ANDROID_SDK_KEY が設定されている"
else
  printf '  --   mobile .env: GOOGLE_MAPS_ANDROID_SDK_KEY が空（既存 APK に焼き込み済みなら地図は出る。再ビルド時のみ必要）\n'
fi

echo "--- Windows 側ツール (adb / emulator) ---"
# adb ラッパーは cmd.exe 経由で %LOCALAPPDATA% を解決するため、
# Claude Code のサンドボックス内では空文字になり必ず失敗する。
if adb_t version >/dev/null 2>&1; then
  ok "adb が Windows の adb.exe に到達している"
  adb_t version 2>/dev/null | sed -n 's/^Installed as/  path  Installed as/p'
else
  ng "adb が使えない（サンドボックス内で実行していないか / Android SDK の場所を確認）"
  failures=$((failures + 1))
fi
if avds="$(bash "${REPO_ROOT}/scripts/mobile-tools/list-avds.sh" 2>/dev/null)" && [[ -n "$avds" ]]; then
  ok "AVD 一覧を取得できる"
  printf '  avds  %s\n' "$(printf '%s' "$avds" | tr '\n' ' ')"
else
  ng "AVD 一覧を取得できない（cmd.exe 経由の %LOCALAPPDATA% 解決に失敗）"
  failures=$((failures + 1))
fi

echo "--- エミュレータ ---"
# adb server は同じ AVD の多重起動などで固まることがある。
# その場合 `adb version`（ローカル完結）は通るのに `adb devices` が返らない。
if adb_responsive; then
  ok "adb server が応答している"
else
  ng "adb server が応答しない"
  failures=$((failures + 1))
  adb_recover_hint
fi
check "エミュレータが接続されている" test "$(adb_device_count)" != "0"
check "ブートが完了している (sys.boot_completed=1)" emulator_booted
check "development build がインストールされている (${APP_ID})" app_installed
if reverses="$(adb_t reverse --list 2>/dev/null)"; then
  for port in "$METRO_PORT" "${api_port:-}"; do
    [[ -n "$port" ]] || continue
    if printf '%s' "$reverses" | grep -q "tcp:${port} tcp:${port}"; then
      ok "adb reverse tcp:${port} が張られている"
    else
      ng "adb reverse tcp:${port} が無い（エミュレータ再起動で消える）"
      failures=$((failures + 1))
    fi
  done
fi

echo "--- backend ---"
api_container_running() { dc ps --status running --services 2>/dev/null | grep -qx api; }
check "api コンテナが起動している" api_container_running
check "ホストから /health に到達できる" backend_up "${api_port:-0}"

echo "--- Metro ---"
# サンドボックス内で起動した Metro は listen していても外から到達できない。
# ここが NG かつプロセスは動いているように見える場合、サンドボックス外で起動し直すこと。
check "ホストから localhost:${METRO_PORT}/status に到達できる" metro_up

echo
if ((failures > 0)); then
  echo "未達: ${failures} 件 → bash scripts/mobile-tools/dev-up.sh で立ち上げ直せます"
  exit 1
fi
echo "すべてOK: 動作確認を開始できます"
