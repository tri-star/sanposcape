"""template.yaml の監視（ダッシュボード・アラーム）の整合を検証する（ADR-013 / SS-179）。

ダッシュボードの本文は `!Sub` 付きの JSON 文字列で、CloudFormation の外では中身を検証できない。
そこで `!Sub` を仮の値で展開して `json.loads` が通ることと、クエリ・ディメンションが依存する値
（`OTEL_SERVICE_NAME`、名前の接頭辞、REPORT 行の形式）が template.yaml とずれないことを固定する。
"""

import json
import re
from pathlib import Path

import yaml

_BACKEND_DIR = Path(__file__).resolve().parents[3]
_ENV = "dev"
_API_NAME = f"sanposcape-{_ENV}-backend-api"
# デプロイロールの許可（infra の ManageBackendMonitoring）の接頭辞と一致させる。
_NAME_PREFIX = f"sanposcape-{_ENV}-backend-"
_SUB_VALUES = {
    "Env": _ENV,
    "Api": _API_NAME,
    "ApiLogGroup": f"/aws/lambda/{_API_NAME}",
    "AWS::Region": "ap-southeast-1",
}
_ALARM_LOGICAL_IDS = ["ApiLambdaErrorsAlarm", "ApiLambdaThrottlesAlarm", "ApiFaultsAlarm"]


class _CloudFormationLoader(yaml.SafeLoader):
    """`!Sub` / `!Ref` などの CloudFormation の短縮タグを、中身のまま読む。"""


def _construct_tag(loader: yaml.SafeLoader, tag_suffix: str, node: yaml.Node) -> object:
    if isinstance(node, yaml.ScalarNode):
        return loader.construct_scalar(node)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node, deep=True)
    return loader.construct_mapping(node, deep=True)


_CloudFormationLoader.add_multi_constructor("!", _construct_tag)


def _template() -> dict:
    return yaml.load((_BACKEND_DIR / "template.yaml").read_text(), _CloudFormationLoader)


def _resources() -> dict:
    return _template()["Resources"]


def _service_name() -> str:
    variables = _resources()["Api"]["Properties"]["Environment"]["Variables"]
    return variables["OTEL_SERVICE_NAME"]


def _resolve_if_for_dev(value: object) -> str:
    """変数マップの値。`!If [IsProd, 本番, dev]` は dev 側（検証の既定の環境）を選ぶ。"""
    if isinstance(value, list):
        _condition, _if_true, if_false = value
        return str(if_false)
    return str(value)


def _expand_sub(body: object) -> str:
    """`!Sub` の本文（文字列、または [本文, 変数マップ]）を仮の値で展開する。"""
    if isinstance(body, list):
        template, extra = body
        values = {
            **_SUB_VALUES,
            **{key: _resolve_if_for_dev(value) for key, value in extra.items()},
        }
    else:
        template, values = body, _SUB_VALUES
    return re.sub(r"\$\{([^}!]+)\}", lambda m: values[m.group(1)], template)


def _dashboard() -> dict:
    body = _resources()["ApiDashboard"]["Properties"]["DashboardBody"]
    return json.loads(_expand_sub(body))


def _log_widget_queries() -> list[str]:
    return [
        widget["properties"]["query"]
        for widget in _dashboard()["widgets"]
        if widget["type"] == "log"
    ]


def _spans_queries() -> list[str]:
    return [q for q in _log_widget_queries() if q.startswith("SOURCE 'aws/spans'")]


def _report_queries() -> list[str]:
    return [q for q in _log_widget_queries() if "@type = 'REPORT'" in q]


def test_dashboard_body_expands_to_valid_json_without_leftover_variables() -> None:
    body = _resources()["ApiDashboard"]["Properties"]["DashboardBody"]
    expanded = _expand_sub(body)

    assert "${" not in expanded
    assert _dashboard()["widgets"]


def test_dashboard_sub_variables_are_all_defined() -> None:
    """Sub の変数マップ以外の変数は、既知の Ref だけを使う（未知の参照は展開時に KeyError）。"""
    body = _resources()["ApiDashboard"]["Properties"]["DashboardBody"]
    template = body[0] if isinstance(body, list) else body
    used = set(re.findall(r"\$\{([^}!]+)\}", template))
    defined = set(_SUB_VALUES) | (set(body[1]) if isinstance(body, list) else set())

    assert used <= defined


def test_every_widget_fits_in_the_24_column_grid() -> None:
    for widget in _dashboard()["widgets"]:
        assert widget["x"] + widget["width"] <= 24, widget["properties"].get("title")


def test_spans_queries_select_only_the_lambda_local_root_server_span_of_this_service() -> None:
    queries = _spans_queries()

    assert queries
    for query in queries:
        assert f"`resource.attributes.service.name` = '{_service_name()}'" in query
        assert "kind = 'SERVER'" in query
        assert "`attributes.aws.span.kind` = 'LOCAL_ROOT'" in query


def test_application_signals_metrics_use_the_service_name_and_the_unprefixed_namespace() -> None:
    metric_rows = [
        row
        for widget in _dashboard()["widgets"]
        if widget["type"] == "metric"
        for row in widget["properties"]["metrics"]
        if row and isinstance(row[0], str) and "ApplicationSignals" in row[0]
    ]

    assert metric_rows
    for row in metric_rows:
        assert row[0] == "ApplicationSignals"  # AWS/ApplicationSignals ではない
        pairs = [item for item in row[2:] if not isinstance(item, dict)]
        dimensions = dict(zip(pairs[0::2], pairs[1::2], strict=True))
        assert dimensions["Service"] == _service_name()
        assert dimensions["Environment"] == _ENV


def test_faults_alarm_watches_the_same_service_as_the_dashboard() -> None:
    properties = _resources()["ApiFaultsAlarm"]["Properties"]
    dimensions = {d["Name"]: d["Value"] for d in properties["Dimensions"]}

    assert properties["Namespace"] == "ApplicationSignals"
    assert properties["MetricName"] == "Fault"
    assert dimensions["Service"] == _service_name()
    assert dimensions["Environment"] == "Env"  # !Ref Env


def test_lambda_alarms_watch_the_api_function() -> None:
    for logical_id in ("ApiLambdaErrorsAlarm", "ApiLambdaThrottlesAlarm"):
        properties = _resources()[logical_id]["Properties"]
        assert properties["Namespace"] == "AWS/Lambda"
        assert properties["Dimensions"] == [{"Name": "FunctionName", "Value": "Api"}]


def test_dashboard_and_alarm_names_start_with_the_prefix_allowed_to_the_deploy_role() -> None:
    resources = _resources()
    names = [resources["ApiDashboard"]["Properties"]["DashboardName"]] + [
        resources[logical_id]["Properties"]["AlarmName"] for logical_id in _ALARM_LOGICAL_IDS
    ]

    assert len(names) == 4
    for name in names:
        assert _expand_sub(name).startswith(_NAME_PREFIX), name


def test_alarms_notify_the_platform_topic_and_only_prod_has_actions_enabled() -> None:
    for logical_id in _ALARM_LOGICAL_IDS:
        properties = _resources()[logical_id]["Properties"]
        topic = "{{resolve:ssm:/sanposcape/${Env}/platform/alerting/topic_arn}}"

        assert properties["AlarmActions"] == [topic]
        assert properties["OKActions"] == [topic]
        assert properties["ActionsEnabled"] == ["IsProd", True, False]


def test_dashboard_name_is_exported_as_an_output() -> None:
    assert _template()["Outputs"]["DashboardName"]["Value"] == "ApiDashboard"


def test_report_queries_follow_the_log_format_of_the_function() -> None:
    """SS-180 が LogFormat: JSON にしたら、REPORT 系のクエリも platform.report の形式に直す。"""
    logging_config = _resources()["Api"]["Properties"].get("LoggingConfig", {})
    queries = _report_queries()

    if logging_config.get("LogFormat") == "JSON":
        assert not queries, (
            "LoggingConfig.LogFormat が JSON になった。REPORT 行は type = 'platform.report' / "
            "record.metrics.* の形式に変わる。メモリ・コールドスタートのクエリを直すこと (SS-180)"
        )
    else:
        assert queries


def test_report_queries_target_the_api_log_group() -> None:
    for query in _report_queries():
        assert query.startswith(f"SOURCE '{_SUB_VALUES['ApiLogGroup']}'")
