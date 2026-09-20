"""AWS AppConfig（boto3 `appconfigdata` 直呼び）を隔離する取得層（transport 層）。

folder-structure.md の方針（外部 API / SDK は `integrations/` に隔離し、差し替え・モック
しやすいようインターフェースを介して公開する）に従う。「AppConfig からどう取るか」だけを
ここに閉じ込め、「どのキーが存在し、どれをクライアントに見せるか」という評価ロジックは
`core/feature_flags.py` の責務にする（ADR-008 追補 D3, SS-98）。

`FlagDocument` / `FlagDocumentSource` をここ（`core` 側ではない）に置いているのは循環 import
を避けるためではなく、`core/runtime_config.py → integrations/aws/secrets.py` という既存の
依存の向きとの一貫性を優先した設計判断（ADR-008 追補 D3 に詳細）。

boto3 は Lambda の python3.12 管理ランタイム同梱前提で、`pyproject.toml` の
`[dependency-groups] dev` にのみ追加している（zip に含めない。`secrets.py` と同じ方針）。

押さえるべき AWS の仕様（公式ドキュメントで確認済み。テストでは再現しない類の罠）:

- `ConfigurationToken` は1回きり。応答の `NextPollConfigurationToken` で必ず置き換える。
  有効期限は最大24時間で、期限切れのトークンで呼ぶと `BadRequestException` になる
  （Lambda のコンテナが24時間以上生き残ることがあるため、セッション張り直しの経路が必須）。
- `Configuration` は `StreamingBody`。クライアントが最新版を持っているときは**空**になる
  （= 変化なし。前回値を保持する）。`.read()` は1回しか効かないため必ず変数で受ける。
- 配信済み構成がまだ無いとき（未配信）の挙動が「空ボディ」か `ResourceNotFoundException`
  かは公式に明記が無いため、両方を「未配信 = 既定値」の系統として扱う。ただし
  `ResourceNotFoundException` は `ClientError` の一種としてログ・バックオフを伴う経路
  （`_handle_fetch_failure`）に倒す一方、初回の空ボディは通常経路として INFO 1回に留める
  （未配信は必ず発生する正常な状態であり、ここを ERROR にすると本物の障害が埋もれるため。
  ADR-008 決定9）。
- IAM のアクション名前空間は `appconfig:`（エンドポイントは `appconfigdata` だが IAM は
  `appconfig:StartConfigurationSession` / `appconfig:GetLatestConfiguration`）。
"""

import json
import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass
from time import monotonic
from typing import Any, Literal, Protocol

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from sanposcape.config import Settings

logger = logging.getLogger(__name__)

FlagSourceKind = Literal["appconfig", "default", "stub"]


@dataclass(frozen=True)
class FlagDocument:
    """AppConfig（または stub）から得たフラグの生データ。

    `values` は `GetLatestConfiguration` が返す簡略 JSON をそのまま dict にしたもの
    （キー -> {"enabled": bool, ...属性}）。評価（どのキーを公開するか等）は持たない。
    """

    values: dict[str, Any]
    kind: FlagSourceKind


class FlagDocumentSource(Protocol):
    def get_document(self) -> FlagDocument: ...


class StubFlagSource:
    """`FEATURE_FLAG_MODE=stub` 用。AppConfig を一切呼ばない。

    `Settings.feature_flag_stub_document` を本番と同じ形式（簡略 JSON）でパースする。
    """

    def __init__(self, settings: Settings) -> None:
        self._document = _parse_stub_document(settings.feature_flag_stub_document)

    def get_document(self) -> FlagDocument:
        return self._document


def _parse_stub_document(raw: str) -> FlagDocument:
    if not raw:
        return FlagDocument({}, kind="stub")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("FEATURE_FLAG_STUB_DOCUMENT is not valid JSON; using an empty document.")
        return FlagDocument({}, kind="stub")
    if not isinstance(parsed, dict):
        logger.warning("FEATURE_FLAG_STUB_DOCUMENT must be a JSON object; using an empty document.")
        return FlagDocument({}, kind="stub")
    return FlagDocument(parsed, kind="stub")


class UnconfiguredFlagSource:
    """`APPCONFIG_*` の ID が1本でも未設定のときの安全な既定。AWS を一切呼ばない
    （`UnconfiguredGoogleMapsProvider` と同じ「構造的に外部通信が起きない」設計）。
    """

    _DOCUMENT = FlagDocument({}, kind="default")

    def get_document(self) -> FlagDocument:
        return self._DOCUMENT


class AppConfigFlagSource:
    """boto3 `appconfigdata` を直接呼ぶ実装。

    実行環境（Lambda のコンテナ、または長生きする uvicorn プロセス）ごとにセッションを
    1回開き、次回トークンと `NextPollIntervalInSeconds` を保持する。ポーリング間隔内は
    キャッシュした前回値を返す（API 呼び出し 0 回）。
    """

    def __init__(
        self,
        settings: Settings,
        client: Any | None = None,
        now: Callable[[], float] = monotonic,
    ) -> None:
        self._application_id = settings.appconfig_application_id
        self._environment_id = settings.appconfig_environment_id
        self._configuration_profile_id = settings.appconfig_configuration_profile_id
        self._poll_interval_seconds = settings.appconfig_poll_interval_seconds
        self._error_backoff_seconds = settings.appconfig_error_backoff_seconds
        self._client = client or boto3.client(
            "appconfigdata",
            config=Config(
                connect_timeout=settings.appconfig_connect_timeout_seconds,
                read_timeout=settings.appconfig_read_timeout_seconds,
                # SDK 側のリトライに任せない。失敗しても次回以降はバックオフ中に即座に
                # 既定値を返すため、1リクエスト内で粘る価値が無い
                # （最悪ケースは Start + Get の2呼び出し x タイムアウト秒）。
                retries={"max_attempts": 1, "mode": "standard"},
            ),
        )
        self._now = now
        self._lock = threading.Lock()
        self._token: str | None = None
        self._document: FlagDocument | None = None
        self._next_poll_at: float = float("-inf")
        self._logged_not_yet_deployed = False

    def get_document(self) -> FlagDocument:
        """絶対に例外を送出しない。呼び出し元（/app-config）を落とさないため、
        失敗はすべてここで吸収し、既定値または前回値にフォールバックする（ADR-008 決定9）。
        """
        with self._lock:
            if self._document is not None and self._now() < self._next_poll_at:
                return self._document
            return self._refresh()

    def _refresh(self) -> FlagDocument:
        try:
            return self._fetch_once()
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "")
            if error_code == "BadRequestException":
                # トークン期限切れ（24時間）または不正。セッションを張り直して
                # 同一呼び出し内で1回だけ再試行する。
                logger.warning(
                    "AppConfig configuration token was rejected; starting a new session."
                )
                self._token = None
                try:
                    return self._fetch_once()
                except (ClientError, BotoCoreError, ValueError) as retry_exc:
                    return self._handle_fetch_failure(retry_exc)
            return self._handle_fetch_failure(exc)
        except (BotoCoreError, ValueError) as exc:
            return self._handle_fetch_failure(exc)

    def _fetch_once(self) -> FlagDocument:
        # `get_document()` の docstring どおり例外を外へ出さない不変条件を守るため、
        # レスポンスの必須キーは `[]` で直接アクセスせず `.get()` + 明示チェックにする。
        # 欠落は本来起こらないはずの応答異常だが、素の `[]` アクセスだと `KeyError` が
        # 送出され、呼び出し元 `_refresh()` の except（ClientError/BotoCoreError/ValueError）
        # を素通りして `/app-config` を 500 にしてしまう。`ValueError` に正規化することで
        # 既存の「ValueError はパース失敗」という分類に合流させ、同じフォールバック経路
        # （`_handle_fetch_failure`）に倒す。
        if self._token is None:
            session = self._client.start_configuration_session(
                ApplicationIdentifier=self._application_id,
                EnvironmentIdentifier=self._environment_id,
                ConfigurationProfileIdentifier=self._configuration_profile_id,
                RequiredMinimumPollIntervalInSeconds=self._poll_interval_seconds,
            )
            initial_token = session.get("InitialConfigurationToken")
            if not initial_token:
                raise ValueError(
                    "AppConfig start_configuration_session response is missing "
                    "InitialConfigurationToken"
                )
            self._token = initial_token
        response = self._client.get_latest_configuration(ConfigurationToken=self._token)
        next_token = response.get("NextPollConfigurationToken")
        if not next_token:
            raise ValueError(
                "AppConfig get_latest_configuration response is missing NextPollConfigurationToken"
            )
        # ConfigurationToken は1回きり。応答の NextPollConfigurationToken で必ず置き換える。
        self._token = next_token
        self._next_poll_at = self._now() + response.get(
            "NextPollIntervalInSeconds", self._poll_interval_seconds
        )
        configuration = response.get("Configuration")
        if configuration is None:
            raise ValueError("AppConfig get_latest_configuration response is missing Configuration")
        # StreamingBody は1回しか読めない。必ずローカル変数で受ける。
        body = configuration.read()
        if not body:
            if self._document is None:
                # 初回デプロイ直後は必ず未配信。通常経路として INFO 1回だけ記録する
                # （ERROR にすると本物の障害（AccessDenied 等）が埋もれる。ADR-008 決定9）。
                if not self._logged_not_yet_deployed:
                    logger.info("AppConfig has no deployed configuration yet; using default flags.")
                    self._logged_not_yet_deployed = True
                self._document = FlagDocument({}, kind="default")
            # 変化なし: 前回値をそのまま保持する。
            return self._document
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError as exc:
            raise ValueError("AppConfig configuration is not valid JSON") from exc
        if not isinstance(parsed, dict):
            raise ValueError("AppConfig configuration must be a JSON object")
        self._document = FlagDocument(parsed, kind="appconfig")
        return self._document

    def _handle_fetch_failure(self, exc: Exception) -> FlagDocument:
        # 値・ARN は出さない。例外の型名だけを記録する。
        logger.error("Failed to fetch AppConfig configuration: %s", type(exc).__name__)
        self._next_poll_at = self._now() + self._error_backoff_seconds
        if self._document is None:
            self._document = FlagDocument({}, kind="default")
        return self._document


def build_flag_document_source(settings: Settings) -> FlagDocumentSource:
    """`FEATURE_FLAG_MODE` / `APPCONFIG_*` からどの `FlagDocumentSource` を使うかを決める。

    `MAPS_MODE` の `build_google_maps_provider()` と同じ順序: まず stub を明示指定した
    実行を優先判定し、その次に ID の有無で Unconfigured にフォールバックする。
    """
    if settings.feature_flag_mode == "stub":
        logger.warning("FEATURE_FLAG_MODE=stub: no AppConfig request will be made.")
        return StubFlagSource(settings)
    if not (
        settings.appconfig_application_id
        and settings.appconfig_environment_id
        and settings.appconfig_configuration_profile_id
    ):
        # local/test では「未設定」が既存開発者の .env や CI で最も起きやすい正常な状態
        # （UnconfiguredFlagSource は AWS を一切呼ばない安全な既定）であり、ここを ERROR に
        # すると pytest 実行のたびにログが積み上がり、ERROR ベースのアラームの誤検知の
        # 温床になる。staging/production では設定漏れの検知性を保つため ERROR のままにする。
        if settings.env in ("local", "test"):
            logger.warning("APPCONFIG_* is not configured; all feature flags are OFF.")
        else:
            logger.error("APPCONFIG_* is not configured; all feature flags are OFF.")
        return UnconfiguredFlagSource()
    return AppConfigFlagSource(settings)
