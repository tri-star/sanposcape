"""template.yaml の監視（ダッシュボード・アラーム）の整合を検証する（ADR-013 / SS-179）。

ダッシュボードの本文は `!Sub` 付きの JSON 文字列で、CloudFormation の外では中身を検証できない。
そこで `!Sub` を展開して `json.loads` が通ることと、クエリ・ディメンションが依存する値
（`OTEL_SERVICE_NAME`、関数名、名前の接頭辞、REPORT 行の形式）が template.yaml とずれないことを
固定する。展開に使う値（関数名・ロググループ名）は template.yaml の定義から作る（テスト側に
同じ文字列を書き写さない）。

見張りの対象外: Q7（タイムアウト / OOM のクエリ）は `@message` の文言で引いていて、ログの形式が
変わっても検知できない。SS-180 でログの形式を変えるときは手で見直す。
"""

import json
import re
from functools import cache

import pytest

from sanposcape.config import _REQUEST_TIME_BUDGET_SECONDS
from sanposcape.tests.template_loader import load_resources, load_template

_ENVS = ["dev", "prod"]
_REGION = "ap-southeast-1"
_IS_PROD = "IsProd"
# Application Signals の Lambda のメトリクスの操作名の接尾辞。サービス単位には LambdaService /
# InternalOperation も含まれるので、ダッシュボードとアラームはこの操作に絞る。
_OPERATION_SUFFIX = "/FunctionHandler"
# prod はアカウントの Lambda 同時実行数クォータ（初期値 10）のまま予約しない。クォータが上がって
# Api に予約を入れたら、予約の値とダッシュボードの水平線を揃える（下のテストが落ちて知らせる）。
_PROD_ACCOUNT_CONCURRENCY_QUOTA = 10
_NO_VALUE = "AWS::NoValue"
_ALARM_LOGICAL_IDS = ["ApiLambdaErrorsAlarm", "ApiLambdaThrottlesAlarm", "ApiFaultsAlarm"]
_SUB_VARIABLE = re.compile(r"\$\{(!)?([^}]+)\}")


def _resolve_if(value: object, env: str) -> object:
    """`!If [IsProd, 本番, dev]` は env に応じた側を選ぶ。`!If` でなければそのまま返す。"""
    if isinstance(value, list) and len(value) == 3 and value[0] == _IS_PROD:
        _condition, if_prod, if_not_prod = value
        return if_prod if env == "prod" else if_not_prod
    return value


def _substitute(template: str, values: dict[str, object]) -> str:
    """`${名前}` を values で置き換える。未知の変数は KeyError、`${!X}` は `${X}` として残す。"""

    def replace(match: re.Match[str]) -> str:
        if match.group(1):
            return "${" + match.group(2) + "}"
        return str(values[match.group(2)])

    return _SUB_VARIABLE.sub(replace, template)


def _expand_sub(body: object, env: str) -> str:
    """`!Sub` の本文（文字列、または [本文, 変数マップ]）を env で展開する。

    `${Api}` などの Ref は、template.yaml の定義から作った値で置き換える。
    """
    if isinstance(body, list):
        template, variable_map = body
        extra = {key: _resolve_if(value, env) for key, value in variable_map.items()}
    else:
        template, extra = body, {}
    return _substitute(template, {**_ref_values(env), **extra})


@cache
def _ref_values(env: str) -> dict[str, str]:
    """Sub が参照する Ref / 疑似パラメータの値。関数名・ロググループ名は template.yaml から作る。"""
    resources = load_resources()
    base = {"Env": env, "AWS::Region": _REGION}
    return {
        **base,
        "Api": _substitute(resources["Api"]["Properties"]["FunctionName"], base),
        "ApiLogGroup": _substitute(resources["ApiLogGroup"]["Properties"]["LogGroupName"], base),
    }


def _service_name() -> str:
    variables = load_resources()["Api"]["Properties"]["Environment"]["Variables"]
    return variables["OTEL_SERVICE_NAME"]


def _dashboard_body() -> object:
    return load_resources()["ApiDashboard"]["Properties"]["DashboardBody"]


@cache
def _dashboard(env: str) -> dict:
    return json.loads(_expand_sub(_dashboard_body(), env))


def _widgets(env: str, widget_type: str) -> list[dict]:
    return [w for w in _dashboard(env)["widgets"] if w["type"] == widget_type]


def _log_widget_queries(env: str) -> list[str]:
    return [w["properties"]["query"] for w in _widgets(env, "log")]


def _spans_queries(env: str) -> list[str]:
    return [q for q in _log_widget_queries(env) if q.startswith("SOURCE 'aws/spans'")]


def _report_queries(env: str) -> list[str]:
    return [q for q in _log_widget_queries(env) if "@type = 'REPORT'" in q]


def _metric_rows(env: str, namespace: str) -> list[list]:
    return [
        row
        for widget in _widgets(env, "metric")
        for row in widget["properties"]["metrics"]
        if row and row[0] == namespace
    ]


def _dimensions(row: list) -> dict[str, str]:
    """メトリクス行 [名前空間, 名前, 次元名, 値, ..., {オプション}] の次元を dict にする。"""
    pairs = [item for item in row[2:] if not isinstance(item, dict)]
    return dict(zip(pairs[0::2], pairs[1::2], strict=True))


@pytest.mark.parametrize("env", _ENVS)
def test_dashboard_body_expands_to_valid_json_without_leftover_variables(env: str) -> None:
    expanded = _expand_sub(_dashboard_body(), env)

    assert "${" not in expanded
    assert _dashboard(env)["widgets"]


def test_every_variable_in_the_dashboard_sub_map_is_used() -> None:
    template, variable_map = _dashboard_body()
    used = {match.group(2) for match in _SUB_VARIABLE.finditer(template) if not match.group(1)}

    assert set(variable_map) <= used


@pytest.mark.parametrize("env", _ENVS)
def test_every_widget_fits_in_the_24_column_grid(env: str) -> None:
    for widget in _dashboard(env)["widgets"]:
        assert widget["x"] + widget["width"] <= 24, widget["properties"].get("title")


def test_dashboard_service_name_is_the_otel_service_name() -> None:
    _template, variable_map = _dashboard_body()

    assert variable_map["ServiceName"] == _service_name()


@pytest.mark.parametrize("env", _ENVS)
def test_spans_queries_select_only_the_lambda_local_root_server_span_of_this_service(
    env: str,
) -> None:
    queries = _spans_queries(env)

    assert queries
    for query in queries:
        assert f"`resource.attributes.service.name` = '{_service_name()}'" in query
        assert "kind = 'SERVER'" in query
        assert "`attributes.aws.span.kind` = 'LOCAL_ROOT'" in query


@pytest.mark.parametrize("env", _ENVS)
def test_application_signals_metrics_are_scoped_to_the_function_handler_operation(
    env: str,
) -> None:
    rows = _metric_rows(env, "ApplicationSignals")  # AWS/ApplicationSignals ではない

    assert rows
    for row in rows:
        assert _dimensions(row) == {
            "Environment": env,
            "Operation": _ref_values(env)["Api"] + _OPERATION_SUFFIX,
            "Service": _service_name(),
        }


@pytest.mark.parametrize("env", _ENVS)
def test_faults_alarm_watches_the_same_dimensions_as_the_dashboard(env: str) -> None:
    properties = load_resources()["ApiFaultsAlarm"]["Properties"]
    # Value は !Ref Env なら "Env"、!Sub なら本文。Ref は env に置き換えて比べる。
    dimensions = {
        d["Name"]: (env if d["Value"] == "Env" else _expand_sub(d["Value"], env))
        for d in properties["Dimensions"]
    }

    assert properties["Namespace"] == "ApplicationSignals"
    assert properties["MetricName"] == "Fault"
    rows = _metric_rows(env, "ApplicationSignals")
    dashboard_dimensions = {_frozen(_dimensions(row)) for row in rows}
    assert dashboard_dimensions == {_frozen(dimensions)}


def _frozen(dimensions: dict[str, str]) -> frozenset[tuple[str, str]]:
    return frozenset(dimensions.items())


def test_lambda_alarms_watch_the_api_function() -> None:
    for logical_id in ("ApiLambdaErrorsAlarm", "ApiLambdaThrottlesAlarm"):
        properties = load_resources()[logical_id]["Properties"]
        assert properties["Namespace"] == "AWS/Lambda"
        assert properties["Dimensions"] == [{"Name": "FunctionName", "Value": "Api"}]


def test_lambda_dashboard_widgets_watch_the_api_function() -> None:
    for env in _ENVS:
        rows = _metric_rows(env, "AWS/Lambda")

        assert rows
        for row in rows:
            assert _dimensions(row)["FunctionName"] == _ref_values(env)["Api"]


@pytest.mark.parametrize("env", _ENVS)
def test_dashboard_and_alarm_names_start_with_the_prefix_allowed_to_the_deploy_role(
    env: str,
) -> None:
    """デプロイロール（infra の ManageBackendMonitoring）の許可の接頭辞に合わせる。"""
    resources = load_resources()
    names = [resources["ApiDashboard"]["Properties"]["DashboardName"]] + [
        resources[logical_id]["Properties"]["AlarmName"] for logical_id in _ALARM_LOGICAL_IDS
    ]

    assert len(names) == len(_ALARM_LOGICAL_IDS) + 1
    for name in names:
        assert _expand_sub(name, env).startswith(f"sanposcape-{env}-backend-"), name


def test_alarms_notify_the_platform_topic_and_only_prod_has_actions_enabled() -> None:
    topic = "{{resolve:ssm:/sanposcape/${Env}/platform/alerting/topic_arn}}"
    for logical_id in _ALARM_LOGICAL_IDS:
        properties = load_resources()[logical_id]["Properties"]

        assert properties["AlarmActions"] == [topic]
        assert properties["OKActions"] == [topic]
        assert properties["ActionsEnabled"] == [_IS_PROD, True, False]
        assert _resolve_if(properties["ActionsEnabled"], "prod") is True
        assert _resolve_if(properties["ActionsEnabled"], "dev") is False


def test_dashboard_name_is_exported_as_an_output() -> None:
    assert load_template()["Outputs"]["DashboardName"]["Value"] == "ApiDashboard"


@pytest.mark.parametrize("env", _ENVS)
def test_function_name_and_log_group_name_agree(env: str) -> None:
    """ダッシュボードの `${Api}` と `${ApiLogGroup}`（template.yaml から展開）が同じ関数を指す。"""
    values = _ref_values(env)

    assert values["Api"] == f"sanposcape-{env}-backend-api"
    assert values["ApiLogGroup"] == f"/aws/lambda/{values['Api']}"


@pytest.mark.parametrize("env", _ENVS)
def test_concurrency_limit_line_matches_the_reserved_concurrency(env: str) -> None:
    _template, variable_map = _dashboard_body()
    limit = int(_resolve_if(variable_map["ConcurrencyLimit"], env))
    api_properties = load_resources()["Api"]["Properties"]
    reserved = _resolve_if(api_properties["ReservedConcurrentExecutions"], env)

    if reserved == _NO_VALUE:
        # 予約が無いときの上限はアカウントのクォータ。
        assert limit == _PROD_ACCOUNT_CONCURRENCY_QUOTA
    else:
        assert limit == int(reserved)
    lines = [
        annotation["value"]
        for widget in _widgets(env, "metric")
        if widget["properties"]["metrics"][0][1] == "ConcurrentExecutions"
        for annotation in widget["properties"]["annotations"]["horizontal"]
    ]
    assert lines == [limit]


def test_duration_annotations_match_the_time_budget_and_the_lambda_timeout() -> None:
    """Duration の水平線は config.py の時間予算と Globals の Timeout の二重持ち。ずれたら落ちる。"""
    timeout_seconds = load_template()["Globals"]["Function"]["Timeout"]
    duration_widgets = [
        w for w in _widgets("dev", "metric") if w["properties"]["metrics"][0][1] == "Duration"
    ]

    assert len(duration_widgets) == 1
    lines = [a["value"] for a in duration_widgets[0]["properties"]["annotations"]["horizontal"]]
    assert lines == [_REQUEST_TIME_BUDGET_SECONDS * 1000, timeout_seconds * 1000]


def test_report_queries_follow_the_log_format_of_the_function() -> None:
    """SS-180 は LogFormat を Text のままにした（アプリが JSON を出す）。

    将来 LogFormat: JSON にしたら、REPORT 系のクエリも platform.report の形式に直す。

    LoggingConfig は Api に直接置いても Globals.Function に置いても効くので、両方を見る。
    """
    api_logging = load_resources()["Api"]["Properties"].get("LoggingConfig", {})
    global_logging = load_template()["Globals"]["Function"].get("LoggingConfig", {})
    queries = _report_queries("dev")

    if "JSON" in (api_logging.get("LogFormat"), global_logging.get("LogFormat")):
        assert not queries, (
            "LoggingConfig.LogFormat が JSON になった。REPORT 行は type = 'platform.report' / "
            "record.metrics.* の形式に変わる。メモリ・コールドスタートのクエリを直すこと (SS-180)"
        )
    else:
        assert queries


@pytest.mark.parametrize("env", _ENVS)
def test_report_queries_target_the_api_log_group(env: str) -> None:
    for query in _report_queries(env):
        assert query.startswith(f"SOURCE '{_ref_values(env)['ApiLogGroup']}'")
