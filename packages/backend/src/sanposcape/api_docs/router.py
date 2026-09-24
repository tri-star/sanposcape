from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from scalar_fastapi import AgentScalarConfig, get_scalar_api_reference

# jsDelivr 上の @scalar/api-reference のバージョンを固定する。
#
# 理由: scalar-fastapi の既定値（`scalar_js_url` 未指定）はバージョン指定なしの URL
# （`.../npm/@scalar/api-reference`）で、CDN が配る最新版がそのまま読み込まれる。
# これは scalar-fastapi の対応バージョンと食い違うおそれがあるため固定する。
# 1.67.0 は、この router が使う scalar-fastapi 1.9.0 と同じ日（2026-08-28）にリリースされた
# @scalar/api-reference の版で、1.9.0 が想定する設定（telemetry / agent.disabled 等）との
# 組み合わせの実績が一番確かなため選んでいる。
#
# 版を上げるときは、この定数だけを書き換える（テスト（tests/test_router.py）もここを参照する）。
# 上げる前に、jsDelivr の該当バージョンの URL をブラウザで開いて中身が存在することを確認し、
# `/docs` を実際に開いて表示が崩れていないことを目視で確認してから変えること。
#
# 受け入れたリスク（SRI 非対応、ローカルレビュー G）: scalar-fastapi の
# `get_scalar_api_reference()` には `<script>` タグへ `integrity` 属性（Subresource
# Integrity）を付けるオプションが無いため、jsDelivr 上のファイルが差し替えられても
# ここでは検知できない。版を固定しても CDN 自体への信頼は残る。次の理由から、
# このリスクは意図的に受け入れる:
#   1. 本番（ENV=production）では `/docs` 自体が存在しない（main.py 参照）ため、
#      影響範囲は local/staging に限られる。
#   2. 以前の既定の Swagger UI（FastAPI 既定の docs_url）も、同じ jsDelivr の
#      `swagger-ui-dist` を SRI なしで読み込んでおり、リスクの性質は変わらない。
SCALAR_JS_URL = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.67.0"

# `include_in_schema=False`: `/docs` 自体を OpenAPI スキーマ（openapi.yaml）に載せない。
# mobile の Orval はこの openapi.yaml からクライアント・MSW モックを生成するため、
# ドキュメント UI の存在が生成物に影響しないようにするため。
router = APIRouter(include_in_schema=False)


@router.get("/docs")
def scalar_api_reference(request: Request) -> HTMLResponse:
    """Scalar による API ドキュメント UI。

    本番（`ENV=production`）では登録されない（main.py の `create_app()` を参照。
    許可リスト方式で `settings.env in ("local", "test", "staging")` のときだけ
    このルーターを include する）。

    `openapi_url` / `title` はここで `request.app` から取ることで、main.py の値と
    自動的に揃える（router が app を import しなくて済む）。

    telemetry と Scalar の Agent 機能は、それぞれ別の理由で明示的に無効化する。
    - `telemetry=False`: Scalar 社への利用状況の送信（API Client 経由でリクエストを
      送ったかどうかの記録）を止める。API の利用実態を外部に送らないため。
    - `agent=AgentScalarConfig(disabled=True)`: Scalar の Agent 機能（AI エージェントに
      よる API 実行支援）を止める。有効にすると `/openapi.json` の内容（API 仕様）が
      Scalar 側（外部）へ渡りうるため。
    """
    return get_scalar_api_reference(
        openapi_url=request.app.openapi_url,
        title=request.app.title,
        scalar_js_url=SCALAR_JS_URL,
        telemetry=False,
        agent=AgentScalarConfig(disabled=True),
    )
