#!/usr/bin/env bash
# =============================================================================
# mobile-tools 共通ヘルパー
#
# 各スクリプトから `source "$(dirname "$0")/lib/common.sh"` して使う。
# =============================================================================

REPO_ROOT="$(
  git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null ||
    (cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
)"
export REPO_ROOT

MOBILE_ENV="${REPO_ROOT}/packages/mobile/.env"
BACKEND_ENV="${REPO_ROOT}/packages/backend/.env"
BACKEND_DIR="${REPO_ROOT}/packages/backend"
WORK_DIR="${REPO_ROOT}/tmp/mobile-verify" # .gitignore 対象の tmp/ 配下に置く
METRO_LOG="${WORK_DIR}/metro.log"

# ---------------------------------------------------------------------------
# ログ出力
# ---------------------------------------------------------------------------
info() { printf '==> %s\n' "$*"; }
warn() { printf 'WARN %s\n' "$*" >&2; }
die() {
  printf 'ERROR %s\n' "$*" >&2
  exit 1
}
ok() { printf '  ok   %s\n' "$*"; }
ng() { printf '  NG   %s\n' "$*"; }

# ---------------------------------------------------------------------------
# .env の値を1つ読む（値が無い/ファイルが無い場合は空文字を返して1を返す）
# ---------------------------------------------------------------------------
env_value() {
  local file="$1" key="$2" v
  [[ -f "$file" ]] || return 1
  v="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r')"
  v="${v%\"}"
  v="${v#\"}"
  v="${v%\'}"
  v="${v#\'}"
  [[ -n "$v" ]] || return 1
  printf '%s' "$v"
}

# app.json から値を読む（jq に依存しない）
app_json_value() {
  local key="$1"
  grep -oE "\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]+\"" "${REPO_ROOT}/packages/mobile/app.json" |
    head -n 1 | sed -E 's/.*:[[:space:]]*"([^"]+)"/\1/'
}

APP_ID="${MOBILE_APP_ID:-$(app_json_value package)}"
APP_ID="${APP_ID:-com.sanposcape.app}"
APP_SCHEME="${MOBILE_APP_SCHEME:-$(app_json_value scheme)}"
APP_SCHEME="${APP_SCHEME:-sanposcape}"
METRO_PORT="${METRO_PORT:-8081}"

# EXPO_PUBLIC_BACKEND_API_URL からポートを取り出す。
# アプリは localhost:<port> を叩くので、このポートも adb reverse が必要になる。
backend_port_for_app() {
  local url
  url="$(env_value "$MOBILE_ENV" EXPO_PUBLIC_BACKEND_API_URL || true)"
  if [[ "$url" =~ :([0-9]+) ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  env_value "$BACKEND_ENV" BACKEND_API_PORT
}

# ---------------------------------------------------------------------------
# Google Maps API キー
#
# キーの発行・API有効化・課金設定はユーザーにしかできない作業なので、
# 何かを起動する前にここで確認する。
#
# 2つのキーは性質が違う:
#   - GOOGLE_MAPS_SERVER_API_KEY (backend)  … api コンテナが起動時に読む実行時の設定。
#       未設定だと UnconfiguredGoogleMapsProvider が選ばれ、/explore/places は
#       ログを一切残さず 503 を返す。原因を追えないので必ずここで止める。
#   - GOOGLE_MAPS_ANDROID_SDK_KEY (mobile)  … app.config.ts 経由で APK に焼き込む
#       ネイティブ設定。インストール済みの development build が既に持っていれば、
#       ローカルの .env が空でも地図は描画される。効いてくるのは再ビルド時だけなので警告に留める。
# ---------------------------------------------------------------------------
require_maps_keys() {
  if ! env_value "$MOBILE_ENV" GOOGLE_MAPS_ANDROID_SDK_KEY >/dev/null; then
    warn "packages/mobile/.env の GOOGLE_MAPS_ANDROID_SDK_KEY が空です。"
    warn "  インストール済みの development build に焼き込み済みなら地図は表示されます。"
    warn "  APK を作り直す場合はユーザーに設定を依頼してください。"
  fi

  env_value "$BACKEND_ENV" GOOGLE_MAPS_SERVER_API_KEY >/dev/null && return 0

  cat >&2 <<'EOF'

────────────────────────────────────────────────────────────
packages/backend/.env の GOOGLE_MAPS_SERVER_API_KEY が未設定です。
これはユーザーによる設定が必要です。

未設定のまま進むと、スポット検索は必ず 503 になります
（アプリには「地図サービスに接続できませんでした」と表示され、
  backend のログには何の手掛かりも残りません）。

対応:
  1. Google Cloud で Places API (New) と Routes API を有効化し、APIキーを発行する
  2. packages/backend/.env の GOOGLE_MAPS_SERVER_API_KEY に設定する
  3. api コンテナを作り直す（コンテナは作成時の環境変数を保持するため、
     .env を書き換えただけでは反映されない）:
       docker compose --project-directory packages/backend -f packages/backend/compose.yaml up -d --force-recreate api

キー無しで確認できる範囲:
  - backend に依存しない画面のみ:  SKIP_BACKEND=1 bash scripts/mobile-tools/dev-up.sh
  - 合成データで散歩導線まで試す:  packages/backend/.env に MAPS_MODE=fake を設定して
                                   api コンテナを作り直す（Google へは一切リクエストしない）
────────────────────────────────────────────────────────────
EOF
  return 1
}

# ---------------------------------------------------------------------------
# docker compose（backend）
# ---------------------------------------------------------------------------
dc() {
  docker compose --project-directory "$BACKEND_DIR" -f "${BACKEND_DIR}/compose.yaml" "$@"
}

# ---------------------------------------------------------------------------
# adb
#
# 注意: ~/.local/bin/adb は Windows の adb.exe ラッパーで、「実在するパスに一致する
# 引数」を Windows パスへ変換する。そのため `adb shell pm list packages` のように
# 引数を分けて渡すと、リポジトリルートでは `packages/` ディレクトリと解釈されて壊れる。
# adb shell に渡すコマンドは必ず1つの引数へまとめること（adb_shell を使う）。
# ---------------------------------------------------------------------------
# Windows 側の adb server はエミュレータの多重起動などで固まることがある。
# その状態だと `adb devices` すら返らず、待機ループが無言で止まり続ける。
# 必ず timeout を挟んで「ハングは失敗として扱う」ようにする。
ADB_TIMEOUT="${ADB_TIMEOUT:-30}"
adb_t() { timeout "$ADB_TIMEOUT" adb "$@"; }

adb_shell() { adb_t shell "$*"; }

# Windows の adb.exe は行末に CR を付けるため、除去しないと $2 が "device\r" になり
# 完全一致の判定が必ず外れる（list-avds.sh が tr -d '\r' しているのと同じ理由）。
adb_device_count() {
  adb_t devices 2>/dev/null | tr -d '\r' | awk 'NR>1 && $2=="device"' | wc -l | tr -d ' '
}

# adb 自体が応答するか。false なら固まっているので復旧が必要。
adb_responsive() { adb_t devices >/dev/null 2>&1; }

adb_recover_hint() {
  cat >&2 <<'EOF'
adb server が応答しません。Windows 側の adb.exe が固まっています。
次の順で復旧してください。

  cd /mnt/c && cmd.exe /d /c "taskkill /F /IM adb.exe"
  adb devices          # daemon が起動し直る。device になるまで数十秒かかることがある

エミュレータが offline のまま戻らない場合は、エミュレータのウィンドウを閉じてから
dev-up.sh を実行し直してください。
EOF
}

emulator_booted() {
  [[ "$(adb_device_count)" != "0" ]] || return 1
  [[ "$(adb_shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]
}

app_installed() {
  adb_shell "pm list packages ${APP_ID}" 2>/dev/null | grep -q "package:${APP_ID}"
}

# ---------------------------------------------------------------------------
# 到達性チェック
# ---------------------------------------------------------------------------
metro_up() {
  curl -sS -m 3 -o /dev/null "http://localhost:${METRO_PORT}/status" 2>/dev/null
}

backend_up() {
  local port="$1"
  [[ -n "$port" ]] || return 1
  curl -sS -m 5 -o /dev/null "http://localhost:${port}/health" 2>/dev/null
}

# 条件が真になるまで待つ: wait_until <秒> <説明> <コマンド...>
wait_until() {
  local timeout="$1" label="$2"
  shift 2
  local elapsed=0
  while ! "$@" >/dev/null 2>&1; do
    if ((elapsed >= timeout)); then
      return 1
    fi
    sleep 2
    elapsed=$((elapsed + 2))
    if ((elapsed % 20 == 0)); then
      info "待機中 (${elapsed}s): ${label}"
    fi
  done
  return 0
}

mkdir -p "$WORK_DIR"
