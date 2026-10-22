#!/usr/bin/env bash
#
# EAS の production 環境に、eas.json の build.production.env と同じ名前の変数が無いことを確かめる
# （mobile-production-update.yml の prepare と publish から呼ぶ。ADR-008 D36）。
#
# eas update は EAS の環境変数を process.env（GITHUB_ENV に書いた eas.json の値）より優先する。本番ビルドの eas build は逆に
# eas.json を優先するので、同じ名前の変数が EAS 側にあると OTA の JS だけがその値で作られ、fingerprint にも Summary にも現れない。
# 承認を待つ間に変数が足されうるので、prepare に加えて publish の eas update の直前でも呼ぶ。
#
# 使い方（packages/mobile で、EXPO_TOKEN を与えて実行する）:
#   ../../.github/scripts/check-eas-env-overlap.sh <変数名の一覧を書くファイル>
# 重なりがあれば exit 1。値は出さない（一覧に書くのは「名前 (scope, 更新日時)」だけ）。
# 更新日時を出すのは、名前が同じまま値だけ書き換えられた変数に承認者が気づけるようにするため。

set -euo pipefail

names_file="$1"
tmp_dir="${RUNNER_TEMP:-$(mktemp -d)}"
: > "$names_file"

for scope in project account; do
  out="$tmp_dir/eas-env-$scope.out"
  err="$tmp_dir/eas-env-$scope.stderr.log"
  set +e
  pnpm exec eas env:list production --format long --scope "$scope" > "$out" 2> "$err"
  status=$?
  set -e
  if [ "$status" -ne 0 ]; then
    echo "::error::EAS の環境変数の一覧（eas env:list, ${scope}）の取得が失敗しました（exit ${status}）。ログ（URL は伏せ字）:"
    sed -E 's#https://[^[:space:]"]*#https://<redacted>#g' "$err"
    rm -f "$out"
    exit "$status"
  fi
  plain=$(sed -E 's/\x1b\[[0-9;]*m//g' "$out")
  rm -f "$out"
  # 出力の形が eas-cli の更新で変わると、名前が1件も取れないまま通ってしまう。見出しの行が無ければ止める。
  if ! grep -qx 'Environment: production' <<< "$plain"; then
    echo "::error::eas env:list（${scope}）の出力の形が想定と違います（「Environment: production」の行がありません）。eas-cli の更新で変わった可能性があります"
    exit 1
  fi
  # long 形式の各変数は「ID <UUID>」の行の直後の「Name <名前>」の行で始まり、値（複数行になりうる）はその後に来る。
  # ID 行の直後の Name 行からだけ名前を取るので、値の続きの行を名前と取り違えない。値の行は読まない。
  # 名前は EAS が受け付ける \w+（小文字・数字始まりを含む）。更新日時は表示用。
  awk -v scope="$scope" '
    /^ID[[:space:]]+[0-9a-f-]{36}$/ { want_name = 1; next }
    want_name && /^Name[[:space:]]+[A-Za-z0-9_]+$/ { if (name != "") print name " (" scope ", 更新 " updated ")"; name = $2; updated = "?"; want_name = 0; next }
    { want_name = 0 }
    name != "" && /^Updated at[[:space:]]+/ { sub(/^Updated at[[:space:]]+/, ""); if (updated == "?") updated = $0 }
    END { if (name != "") print name " (" scope ", 更新 " updated ")" }
  ' <<< "$plain" >> "$names_file"
done

overlap=$(jq -r '.build.production.env | keys[]' eas.json \
  | grep -Fxf - <(sed 's/ (.*)$//' "$names_file") | sort -u | paste -sd, - || true)
if [ -n "$overlap" ]; then
  echo "::error::EAS の production 環境に、eas.json の build.production.env と同じ名前の変数があります: ${overlap}。OTA の JS だけがその値で作られるため配信しません。EAS 側の変数を消すか、eas.json と揃えてから起動し直してください（ADR-008 D36）"
  exit 1
fi
echo "EAS の production 環境の変数（名前）:"
cat "$names_file"
