import type { PinCreate } from "@/api/generated/model";
import { PIN_PHOTOS_PER_REQUEST_MAX } from "@/features/pin/lib/pinLimits";
import { validatePinDraftFields } from "@/features/pin/lib/pinDraftValidation";
import type { PinDraft } from "@/features/pin/types";
import { isValidCoordinate } from "@/lib/geoCoordinate";
import { isUuid } from "@/lib/uuid";
import type { GeoCoordinates } from "@/services/location/types";

const COORDINATE_PRECISION = 1e6;

function roundCoordinate(value: number): number {
  return Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION;
}

/**
 * `PinDraft` + 位置 + 紐付ける写真枠 ID を `POST /pins` の送信ボディに変換する。
 * 送信できない条件では null を返す（既存 `buildWalkCreateRequest` と同じ「送れないなら null」規約。
 * ネットワークに出す前に保存不能と判定する）。
 *
 * null の条件:
 * - フィールドエラー（名前/メモが長すぎる）
 * - 座標が不正（`isValidCoordinate` で弾く）
 * - `clientPinId` が UUID 形式でない
 * - `photoUploadIds.length > PIN_PHOTOS_PER_REQUEST_MAX`（呼び出しの取り違え防止。
 *   `runPinSave` は必ず10枚以下のチャンクで呼ぶ）
 */
export function buildPinCreateRequest(input: {
  clientPinId: string;
  draft: PinDraft;
  location: GeoCoordinates;
  /** runPinSave が最初のチャンクで揃えた枠 ID（0〜10件）。 */
  photoUploadIds: readonly string[];
  clientWalkId: string | null;
}): PinCreate | null {
  const fieldErrors = validatePinDraftFields(input.draft);
  if (fieldErrors.name !== null || fieldErrors.memo !== null) {
    return null;
  }
  if (!isValidCoordinate(input.location)) {
    return null;
  }
  if (!isUuid(input.clientPinId)) {
    return null;
  }
  if (input.photoUploadIds.length > PIN_PHOTOS_PER_REQUEST_MAX) {
    return null;
  }

  const name = input.draft.name.trim();
  const memo = input.draft.memo.trim();

  const request: PinCreate = {
    client_pin_id: input.clientPinId,
    name: name.length > 0 ? name : null,
    memo: memo.length > 0 ? memo : null,
    location: {
      latitude: roundCoordinate(input.location.latitude),
      longitude: roundCoordinate(input.location.longitude),
    },
    tags: [...input.draft.tags],
    photo_upload_ids: [...input.photoUploadIds],
  };

  if (input.draft.sanpoMapSelection.kind === "existing") {
    request.sanpo_map_id = input.draft.sanpoMapSelection.sanpoMapId;
  }
  if (input.clientWalkId !== null && isUuid(input.clientWalkId)) {
    request.client_walk_id = input.clientWalkId;
  }

  return request;
}
