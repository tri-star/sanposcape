#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# initialize-dotenv.sh
#
# 空きポートを自動検出し、.env.example のプレースホルダを置換して .env を生成する
# =============================================================================

# ---------------------------------------------------------------------------
# サーバー定義（追加はここに足すだけ）
# 配列のインデックス順に 基準ポート+0, +1, +2, ... が割り当てられる
# ---------------------------------------------------------------------------
PORT_NAMES=(
  BACKEND_API_PORT
  DB_PORT
  FRONTEND_DEV_PORT
  STORYBOOK_DEV_PORT
)

# ---------------------------------------------------------------------------
# ポート検索パラメータ
# 10000〜19000 の範囲内で 100 番単位のランダムな開始ポートを選び、
# そこから順に（範囲末尾に達したら先頭へ折り返して）空きポートを探す
# ---------------------------------------------------------------------------
PORT_RANGE_MIN=10000
PORT_RANGE_MAX=19000
PORT_STEP=100

# ---------------------------------------------------------------------------
# 指定ポートが使用中かどうかを判定する
# 戻り値: 0 = 使用中, 1 = 空いている
# ---------------------------------------------------------------------------
is_port_in_use() {
  local port="$1"

  # ss が使えればそちらを優先
  if command -v ss &>/dev/null; then
    if ss -tlnH 2>/dev/null | awk '{print $4}' | grep -qE "(:|^)${port}$"; then
      return 0
    fi
    # ss の -H オプションが無い環境向けフォールバック
    if ss -tln 2>/dev/null | tail -n +2 | awk '{print $4}' | grep -qE "(:|^)${port}$"; then
      return 0
    fi
  fi

  # lsof が使えれば併用
  if command -v lsof &>/dev/null; then
    if lsof -iTCP:"$port" -sTCP:LISTEN -P -n &>/dev/null; then
      return 0
    fi
  fi

  return 1
}

# ---------------------------------------------------------------------------
# ランダムな開始ポートの決定
# PORT_RANGE_MIN 〜 PORT_RANGE_MAX の範囲内で PORT_STEP 単位の値をランダムに選ぶ
# ---------------------------------------------------------------------------
random_start_port() {
  local range_count=$(( (PORT_RANGE_MAX - PORT_RANGE_MIN) / PORT_STEP + 1 ))
  local random_index=$(( RANDOM % range_count ))
  echo $(( PORT_RANGE_MIN + random_index * PORT_STEP ))
}

# ---------------------------------------------------------------------------
# 基準ポートの決定
# ランダムな開始ポートから PORT_STEP 刻みで、PORT_NAMES の個数分
# （基準ポート〜基準ポート+N-1）がすべて空いている範囲を探す。
# PORT_RANGE_MAX を超えたら PORT_RANGE_MIN に折り返して探索を続ける
# ---------------------------------------------------------------------------
find_base_port() {
  local need="${#PORT_NAMES[@]}"
  local range_count=$(( (PORT_RANGE_MAX - PORT_RANGE_MIN) / PORT_STEP + 1 ))
  local range_span=$(( PORT_RANGE_MAX - PORT_RANGE_MIN + PORT_STEP ))
  local start_base
  start_base="$(random_start_port)"
  echo "検索開始ポート: ${start_base}" >&2

  local i base
  for (( i = 0; i < range_count; i++ )); do
    base=$(( start_base + i * PORT_STEP ))
    if (( base > PORT_RANGE_MAX )); then
      base=$(( base - range_span ))
    fi

    local all_free=true
    for (( offset = 0; offset < need; offset++ )); do
      if is_port_in_use $(( base + offset )); then
        all_free=false
        break
      fi
    done

    if [[ "$all_free" == true ]]; then
      echo "$base"
      return 0
    fi
  done

  echo "エラー: 空きポート範囲が見つかりませんでした" >&2
  return 1
}

# ---------------------------------------------------------------------------
# プロジェクトルートの検索（.git ディレクトリまたは .git ファイルを探す）
# ---------------------------------------------------------------------------
find_project_root() {
  local dir
  dir="$(cd "$(dirname "$0")" && pwd)"

  while [[ "$dir" != "/" ]]; do
    if [[ -d "$dir/.git" || -f "$dir/.git" ]]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done

  echo "エラー: プロジェクトルート (.git) が見つかりませんでした" >&2
  return 1
}

# ---------------------------------------------------------------------------
# メイン処理
# ---------------------------------------------------------------------------
main() {
  # 基準ポートの決定
  echo "空きポートを検索中..."
  local base_port
  base_port="$(find_base_port)"
  echo "基準ポート: ${base_port}"

  # ポート割り当てを表示 & 連想配列に格納
  declare -A port_map
  for (( i = 0; i < ${#PORT_NAMES[@]}; i++ )); do
    local name="${PORT_NAMES[$i]}"
    local port=$(( base_port + i ))
    port_map["$name"]="$port"
    echo "  ${name} = ${port}"
  done

  # プロジェクトルートの特定
  local project_root
  project_root="$(find_project_root)"
  echo "プロジェクトルート: ${project_root}"

  # プロジェクト名（ディレクトリ名）を COMPOSE_PROJECT_NAME として使用
  local compose_project_name
  compose_project_name="$(basename "$project_root")"
  echo "  COMPOSE_PROJECT_NAME = ${compose_project_name}"

  # .env.example の検索
  local env_examples
  env_examples=()
  while IFS= read -r -d '' file; do
    env_examples+=("$file")
  done < <(find "$project_root/packages" -name '.env.example' -print0 2>/dev/null)

  if [[ ${#env_examples[@]} -eq 0 ]]; then
    echo "警告: ${project_root}/packages 配下に .env.example が見つかりませんでした"
    exit 0
  fi

  # 各 .env.example を処理
  for example_file in "${env_examples[@]}"; do
    local target_dir
    target_dir="$(dirname "$example_file")"
    local env_file="${target_dir}/.env"

    echo "処理中: ${example_file}"

    # .env.example の内容をコピーしてプレースホルダを置換
    local content
    content="$(cat "$example_file")"

    for name in "${PORT_NAMES[@]}"; do
      content="$(printf '%s' "$content" | sed "s/{%${name}%}/${port_map[$name]}/g")"
    done

    # COMPOSE_PROJECT_NAME プレースホルダも置換
    content="$(printf '%s' "$content" | sed "s/{%COMPOSE_PROJECT_NAME%}/${compose_project_name}/g")"

    # .env を出力（先頭に COMPOSE_PROJECT_NAME を付与）
    {
      echo "COMPOSE_PROJECT_NAME=${compose_project_name}"
      printf '%s\n' "$content"
    } > "$env_file"
    echo "  -> ${env_file} を生成しました"
  done

  echo "完了"
}

main "$@"
