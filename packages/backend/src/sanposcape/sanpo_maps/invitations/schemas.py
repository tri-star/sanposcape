import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from sanposcape.sanpo_maps.models import SanpoMapIcon

#: トークンは `secrets.token_urlsafe(32)`（43 文字の base64url）。受け取る側は余裕を持たせつつ、
#: 長い文字列でハッシュの計算を空回りさせないよう上限を置く。
INVITATION_TOKEN_MAX_LENGTH = 128

InvitationToken = Annotated[
    str,
    Field(min_length=16, max_length=INVITATION_TOKEN_MAX_LENGTH, pattern=r"^[A-Za-z0-9_-]+$"),
]


class SanpoMapInvitationCreatedRead(BaseModel):
    """`POST /sanpo-maps/{id}/invitations` の応答（ADR-009 決定39）。
    `token` と `url` はこの1回だけ返す。
    """

    id: uuid.UUID
    token: str
    # `<招待リンクの前半>#<token>`。owner が OS の共有シートでそのまま送る。
    url: str
    created_at: datetime
    expires_at: datetime


class SanpoMapInvitationRead(BaseModel):
    """有効な招待リンク1件（一覧用。トークンは返さない）。"""

    id: uuid.UUID
    created_at: datetime
    expires_at: datetime


class SanpoMapInvitationListRead(BaseModel):
    # 作った日時の新しい順。有効なもの（未使用・未取り消し・期限内）だけ。
    items: list[SanpoMapInvitationRead]


class InvitationTokenRequest(BaseModel):
    """`POST /invitations/preview`・`POST /invitations/accept` のボディ。トークンは path・クエリに
    載せない（アクセスログに残さないため。ADR-009 決定13 と同じ考え方）。
    """

    model_config = ConfigDict(extra="forbid")

    token: InvitationToken


class InvitationSanpoMapPreviewRead(BaseModel):
    name: str
    icon: SanpoMapIcon


class InvitationPreviewRead(BaseModel):
    """招待の中身（サインイン前でも見られる。ポリシー 1-8）。"""

    sanpo_map: InvitationSanpoMapPreviewRead
    # 招待した人（地図の持ち主）の表示名。未設定は null（mobile が「メンバー」と出す）。
    inviter_display_name: str | None
    expires_at: datetime
    # サインインしていれば、その地図との関係（`member` ならすでに参加している）。ゲストは `none`。
    membership: Literal["none", "member"]
    # `membership` が `member` のときだけ地図の ID（「地図を開く」用）。それ以外は null。
    sanpo_map_id: uuid.UUID | None


class InvitationNotFoundErrorRead(BaseModel):
    """使えない招待（理由を区別しない, ADR-009 決定39）の 404。"""

    detail: str
    code: Literal["invitation_not_found"]


class InvitationLimitErrorRead(BaseModel):
    """招待の上限の 409（ADR-009 決定39）。"""

    detail: str
    code: Literal["invitation_limit_exceeded", "member_limit_reached"]


class FeatureDisabledErrorRead(BaseModel):
    """フラグ `map_invitation` が OFF のときの 403。"""

    detail: str
    code: Literal["feature_disabled"]
