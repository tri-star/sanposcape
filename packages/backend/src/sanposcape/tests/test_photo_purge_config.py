"""template.yaml の写真の削除（PhotoPurge、SS-109 / ADR-009 決定35）の整合を検証する。

スケジュールのグループ・ロール・関数名は infra（live/account/backend_scheduler.tf）との契約で、
ずれるとデプロイが AccessDenied になるか、Scheduler が関数を起動できない。実行ロールの S3 の
許可は、アプリが消す prefix（`user_photo_prefixes`）と一致していないと、削除が AccessDenied で
全て失敗する（予約が残り続ける）。
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
    assert _properties()["FunctionName"] == "sanposcape-${Env}-backend-photo-purge"
    assert _properties()["Handler"] == "sanposcape.aws_lambda.photo_purge.handler"
    assert (
        resources["PhotoPurgeLogGroup"]["Properties"]["LogGroupName"]
        == "/aws/lambda/sanposcape-${Env}-backend-photo-purge"
    )


def test_schedule_uses_the_group_and_role_owned_by_terraform() -> None:
    schedule = _properties()["Events"]["Daily"]
    assert schedule["Type"] == "ScheduleV2"
    properties = schedule["Properties"]
    assert properties["GroupName"] == "sanposcape-${Env}-backend"
    assert (
        properties["RoleArn"]
        == "{{resolve:ssm:/sanposcape/${Env}/account/backend_scheduler_role_arn}}"
    )


def test_timeout_leaves_room_after_the_app_deadline() -> None:
    """締め切りの後に、実行中の S3 の呼び出し1回分（再試行込み）がはみ出しても収まる。"""
    deadline = Settings.model_fields["account_photo_purge_deadline_seconds"].default
    assert _properties()["Timeout"] >= deadline + 30


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
