"""AWS Secrets Manager からシークレットを取得する薄いラッパー。

boto3 呼び出しをここに隔離する（folder-structure.md: 外部API連携は `integrations/` に
隔離し、差し替え・モックしやすいようインターフェースを介して公開する方針）。
「どのシークレットキーをどの環境変数に写すか」というマッピングは、この層の関心事ではなく
`sanposcape.core.runtime_config` の責務。

boto3 はランタイム同梱版（Lambda の python3.12 管理ランタイム）を前提とし、zip には
同梱しない（`pyproject.toml` では `[dependency-groups] dev` にのみ追加している）。
"""

import json
import logging
from functools import lru_cache

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


@lru_cache(maxsize=4)
def get_secret_json(secret_arn: str) -> dict[str, str]:
    """Secrets Manager から JSON 形式のシークレットを取得し、dict へパースして返す。

    プロセス内でキャッシュする（`lru_cache`）。Lambda の実行環境はモジュールを
    再利用するため、コールドスタート 1 回につき API 呼び出しは最大 1 回になる
    （ウォーム中は 0 回）。TTL は設けていない。シークレットをローテーションしても、
    既存の Lambda 実行環境が再生成されるまで古い値を保持し続ける点は受容リスクとして
    ADR-005 に記載している（再デプロイで確実に反映させる）。

    ★ シークレットの値は絶対にログへ出さない。例外メッセージにも含めない。
    """
    client = boto3.client("secretsmanager")
    try:
        response = client.get_secret_value(SecretId=secret_arn)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code", "")
        if error_code == "ResourceNotFoundException":
            # prod はシークレットの器のみ存在し値が未投入のことがある
            # （docs/deployment.md §7 参照）。
            # ARN・値のどちらも出さず、切り分けのヒントだけをログに残す。
            logger.error(
                "secretsmanager.get_secret_value returned ResourceNotFoundException; "
                "the secret may not have a value put yet"
            )
        raise
    return json.loads(response["SecretString"])
