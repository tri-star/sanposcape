#!/usr/bin/env bash
# =============================================================================
# dev-up.sh
#
# mobile の動作確認環境を1コマンドで立ち上げる（冪等。既に整っている部分は飛ばす）。
#
#   1. エミュレータ起動 + ブート待ち
#   2. adb reverse（Metro 8081 と backend のポート両方）
#   3. backend の docker compose 起動 + マイグレーション
#   4. Metro 起動 + 到達確認
#   5. development build を Metro に接続して起動 + バンドル完了待ち
#
# 使い方:
#   bash scripts/mobile-tools/dev-up.sh [AVD名]
#   MOBILE_AVD=Pixel_6_Pro_API_35 bash scripts/mobile-tools/dev-up.sh
#   SKIP_BACKEND=1 bash scripts/mobile-tools/dev-up.sh   # 画面表示だけ見たいとき
#
# 重要: このスクリプトは Windows 側の cmd.exe/adb.exe を呼び、さらに Metro を
# 「外(Windows→エミュレータ)から到達できる」状態で listen させる必要がある。
# Claude Code から実行する場合は必ずサンドボックス外で実行すること。
# =============================================================================
set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

avd_name="${1:-${MOBILE_AVD:-}}"
api_port="$(backend_port_for_app || true)"
[[ -n "$api_port" ]] || die "backend のポートを解決できません（packages/mobile/.env の EXPO_PUBLIC_BACKEND_API_URL を確認）"

# ---------------------------------------------------------------------------
# 0. Maps キーの確認（ユーザー作業が必要なので何も起動する前に止める）
#
# MAPS_MODE=fake が指定されているか、backend を使わない確認であればスキップする。
# ---------------------------------------------------------------------------
maps_mode="$(env_value "$BACKEND_ENV" MAPS_MODE || printf 'real')"
if [[ "${SKIP_BACKEND:-0}" != "1" && "$maps_mode" != "fake" ]]; then
  info "0/5 Google Maps API キー"
  if ! require_maps_keys; then
    [[ "${ALLOW_MISSING_MAPS_KEY:-0}" == "1" ]] ||
      die "Maps キーの設定後にもう一度実行してください（ALLOW_MISSING_MAPS_KEY=1 で強行できますが、散歩導線は 503 になります）"
    warn "ALLOW_MISSING_MAPS_KEY=1 のため続行します。散歩導線は 503 になります"
  else
    ok "設定済み"
  fi
fi

# ---------------------------------------------------------------------------
# 1. エミュレータ
# ---------------------------------------------------------------------------
info "1/5 エミュレータ"
if ! adb_responsive; then
  adb_recover_hint
  die "adb server が応答しません"
fi
if [[ "$(adb_device_count)" == "0" ]]; then
  if [[ -z "$avd_name" ]]; then
    # start-emulator.sh の DEFAULT_AVD は古くなりがちなので、実在する先頭のAVDを使う。
    avd_name="$(bash "${REPO_ROOT}/scripts/mobile-tools/list-avds.sh" 2>/dev/null | head -n 1)"
    [[ -n "$avd_name" ]] || die "利用可能な AVD がありません（Windows 側の Android SDK / cmd.exe 到達性を確認）"
    info "AVD を自動選択: ${avd_name}"
  fi
  bash "${REPO_ROOT}/scripts/mobile-tools/start-emulator.sh" "$avd_name" || die "エミュレータの起動に失敗"
  ADB_TIMEOUT=600 adb_t wait-for-device
else
  # 同じ AVD を二重起動すると adb server が固まるので、既に居るなら絶対に起動しない。
  ok "既に接続済み"
fi
# コールドブートは実測で5分を超えることがある（API 35 の初回起動など）。
wait_until "${EMULATOR_BOOT_TIMEOUT:-600}" "エミュレータのブート完了" emulator_booted ||
  die "ブートが完了しませんでした（起動途中の可能性があります。もう一度実行してください）"
ok "ブート完了"

app_installed || warn "development build (${APP_ID}) が未インストールです。app-startup-guide.md の A-2（adb install）を実施してください"

# ---------------------------------------------------------------------------
# 2. adb reverse
#
# エミュレータの localhost を Windows 経由で WSL 側へ転送する。
# エミュレータを再起動すると消えるため毎回張り直す（冪等）。
# Metro の 8081 だけでなく、アプリが叩く backend のポートも必要。
# ---------------------------------------------------------------------------
info "2/5 adb reverse"
for port in "$METRO_PORT" "$api_port"; do
  adb_t reverse "tcp:${port}" "tcp:${port}" >/dev/null || die "adb reverse tcp:${port} に失敗"
  ok "tcp:${port}"
done

# ---------------------------------------------------------------------------
# 3. backend
# ---------------------------------------------------------------------------
if [[ "${SKIP_BACKEND:-0}" == "1" ]]; then
  info "3/5 backend (SKIP_BACKEND=1 のためスキップ)"
else
  info "3/5 backend"
  if backend_up "$api_port"; then
    ok "既に healthy (localhost:${api_port}/health)"
  else
    dc up -d --build >/dev/null 2>&1 || die "docker compose up に失敗（dc logs で確認）"
    wait_until 180 "backend の /health" backend_up "$api_port" || die "backend が healthy になりません"
    ok "起動完了"
  fi
  dc exec -T api uv run alembic upgrade head >/dev/null 2>&1 || die "マイグレーションに失敗"
  ok "マイグレーション適用済み"
fi

# ---------------------------------------------------------------------------
# 4. Metro
#
# --host localhost が必須。これが無いと Metro は LAN IP を配信し、
# エミュレータから届かず白画面 / java.net.ConnectException になる。
# ---------------------------------------------------------------------------
info "4/5 Metro"
if metro_up; then
  ok "既に起動済み (localhost:${METRO_PORT})"
else
  : >"$METRO_LOG"
  # setsid + stdin を閉じる + disown まで揃えて完全に切り離す。
  # nohup と & だけだと Metro が呼び出し元のプロセスグループを掴んだままになり、
  # このスクリプトが終了しても呼び出し元（CI や Claude Code の Bash ツール）が
  # パイプの EOF を待ち続けて返ってこない。
  (
    cd "$REPO_ROOT" &&
      setsid pnpm --filter mobile exec expo start --dev-client --host localhost \
        >"$METRO_LOG" 2>&1 </dev/null &
    disown
  )
  if ! wait_until 180 "Metro の /status" metro_up; then
    tail -n 20 "$METRO_LOG" >&2
    die "Metro に到達できません。サンドボックス内で起動していると listen していても外から見えません（ログ: ${METRO_LOG}）"
  fi
  ok "起動完了 (ログ: ${METRO_LOG})"
fi

# ---------------------------------------------------------------------------
# 5. アプリを開く
#
# `Press a` は Expo が WSL 側に Android SDK を見つけられず失敗するので使わない。
# dev client に Metro の URL を直接渡す。
# ---------------------------------------------------------------------------
info "5/5 development build を開く"
# grep -c はマッチ0件でも "0" を出力したうえで終了コード1を返す。
# `|| echo 0` を付けると出力が "0\n0" になり、算術比較が壊れる。
count_bundled() {
  local n
  n="$(grep -c "Bundled" "$METRO_LOG" 2>/dev/null || true)"
  printf '%s' "${n:-0}"
}
bundled_before="$(count_bundled)"
# 既に前面で動いているとインテントが素通りし（Activity not started）、再バンドルも
# 現在地の取り直しも起きない。dev-up は「既知の状態に揃える」ためのものなので必ず開き直す。
bash "$(dirname "${BASH_SOURCE[0]}")/ui.sh" restart >/dev/null || die "アプリの起動に失敗"

if [[ -s "$METRO_LOG" ]]; then
  bundle_advanced() {
    (($(count_bundled) > bundled_before))
  }
  if wait_until 180 "バンドル完了" bundle_advanced; then
    ok "$(grep "Bundled" "$METRO_LOG" | tail -n 1)"
  else
    warn "バンドルログを検出できませんでした。${METRO_LOG} と ui.sh screenshot で状態を確認してください"
  fi
else
  # このスクリプト以外の手段で起動された Metro はここにログを書かないため、
  # 完了判定ができない。画面で確認する。
  warn "Metro のログが ${METRO_LOG} に無いためバンドル完了を待てません（別プロセスで起動された Metro を利用中）"
  warn "  ui.sh screenshot で画面を確認してください"
fi

echo
echo "準備完了:"
echo "  Metro    http://localhost:${METRO_PORT}  (ログ: ${METRO_LOG})"
echo "  backend  http://localhost:${api_port}"
echo "  画面確認 bash scripts/mobile-tools/ui.sh screenshot"
