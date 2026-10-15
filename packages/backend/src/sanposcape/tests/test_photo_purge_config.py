"""template.yaml の写真の削除（PhotoPurge、SS-109 / ADR-009 決定36）の整合を検証する。

スケジュールのグループ名・ロール・関数名の接頭辞は infra（live/account/backend_scheduler.tf）
との契約で、ずれるとデプロイが AccessDenied になるか、Scheduler が関数を起動できない。
Scheduler 用ロールは `sanposcape-<env>-backend-scheduled-*` の関数をどれでも起動できるので、
定期実行しない関数がこの接頭辞を持たないことも固定する。実行ロールの S3 の許可は、アプリが
消す prefix（`user_photo_prefixes`）と一致していないと、削除が AccessDenied で全て失敗する
（予約が残り続ける）。
"""

import uuid

from sanposcape.config import Settings
from sanposcape.sanpo_maps.photos.photo_keys import user_photo_prefixes
from sanposcape.tests.template_loader import BACKEND_DIR, load_resources

_BUCKET_ARN = "{{resolve:ssm:/sanposcape/${Env}/platform/pin_photos/bucket_arn}}"


def _properties() -> dict:
    return load_resources()["PhotoPurge"]["Properties"]


def _statements() -> list[dict]:
    return [
        statement
        for policy in _properties()["Policies"]
        if isinstance(policy, dict)
        for statement in policy["Statement"]
    ]


def _prefix_patterns() -> list[str]:
    """`user_photo_prefixes` の利用者 ID の部分を `*` にしたもの（`original/pins/*` など）。"""
    user_id = uuid.uuid4()
    return [
        prefix.removesuffix(f"{user_id}/") + "*" for prefix in user_photo_prefixes(user_id=user_id)
    ]


def test_function_and_log_group_names_follow_the_contract() -> None:
    resources = load_resources()
    assert _properties()["FunctionName"] == "sanposcape-${Env}-backend-scheduled-photo-purge"
    assert _properties()["Handler"] == "sanposcape.aws_lambda.photo_purge.handler"
    assert (
        resources["PhotoPurgeLogGroup"]["Properties"]["LogGroupName"]
        == "/aws/lambda/sanposcape-${Env}-backend-scheduled-photo-purge"
    )


def test_schedule_uses_the_group_of_this_stack_and_the_role_owned_by_terraform() -> None:
    resources = load_resources()
    group = resources["BackendScheduleGroup"]
    assert group["Type"] == "AWS::Scheduler::ScheduleGroup"
    # デプロイロールが作れるのはこの名前のグループだけ（infra の ManageBackendScheduleGroup）。
    assert group["Properties"]["Name"] == "sanposcape-${Env}-backend"

    schedule = _properties()["Events"]["Daily"]
    assert schedule["Type"] == "ScheduleV2"
    properties = schedule["Properties"]
    assert properties["GroupName"] == "BackendScheduleGroup"  # !Ref
    assert (
        properties["RoleArn"]
        == "{{resolve:ssm:/sanposcape/${Env}/account/backend_scheduler_role_arn}}"
    )


def test_timeout_leaves_room_after_the_largest_allowed_deadline() -> None:
    """締め切りの後に、実行中の S3 の呼び出し1回分（再試行込み）がはみ出しても収まる。

    既定値ではなく、環境変数で設定できる上限（`le`）で確かめる。上限まで上げても
    Lambda の Timeout を超えないようにするため。
    """
    field = Settings.model_fields["account_photo_purge_deadline_seconds"]
    upper = next(m.le for m in field.metadata if getattr(m, "le", None) is not None)
    assert field.default <= upper
    assert _properties()["Timeout"] >= upper + 30


def test_s3_permissions_cover_exactly_the_prefixes_the_app_deletes() -> None:
    patterns = _prefix_patterns()
    by_action = {statement["Action"]: statement for statement in _statements()}

    listing = by_action["s3:ListBucket"]
    assert listing["Resource"] == _BUCKET_ARN
    assert listing["Condition"]["StringLike"]["s3:prefix"] == patterns

    deleting = by_action["s3:DeleteObject"]
    assert deleting["Resource"] == [f"{_BUCKET_ARN}/{pattern}" for pattern in patterns]

    # この関数は写真を読み書きしない。
    actions = {statement["Action"] for statement in _statements()}
    assert actions == {"secretsmanager:GetSecretValue", "s3:ListBucket", "s3:DeleteObject"}


def test_alarms_watch_the_photo_purge_function() -> None:
    resources = load_resources()
    for logical_id in ("PhotoPurgeErrorsAlarm", "PhotoPurgeNotRunAlarm"):
        dimensions = resources[logical_id]["Properties"]["Dimensions"]
        assert dimensions == [{"Name": "FunctionName", "Value": "PhotoPurge"}]
    # 起動されなかった日（データ無し）を異常として数える。
    assert resources["PhotoPurgeNotRunAlarm"]["Properties"]["TreatMissingData"] == "breaching"


def test_makefile_builds_the_function_from_the_api_artifact() -> None:
    assert "build-PhotoPurge: build-Api" in (BACKEND_DIR / "Makefile").read_text()


def test_only_scheduled_functions_have_the_prefix_the_scheduler_role_can_invoke() -> None:
    """Scheduler 用ロールは `backend-scheduled-*` をどれでも起動できる（infra）。

    定期実行する関数（ScheduleV2 のイベントを持つ）は必ずこの接頭辞を持ち、持たない関数
    （Api・Migrate など）には付けない。付けると Scheduler 経由で任意の入力で起動できる経路になる。
    """
    prefix = "sanposcape-${Env}-backend-scheduled-"
    functions = {
        logical_id: resource["Properties"]
        for logical_id, resource in load_resources().items()
        # 素の AWS::Lambda::Function を足しても検査から漏れないようにする。
        if resource["Type"] in ("AWS::Serverless::Function", "AWS::Lambda::Function")
    }
    assert {"Api", "Migrate", "PhotoPurge"} <= functions.keys()
    for logical_id, properties in functions.items():
        scheduled = any(
            event["Type"] == "ScheduleV2" for event in properties.get("Events", {}).values()
        )
        has_prefix = properties["FunctionName"].startswith(prefix)
        assert scheduled == has_prefix, logical_id
