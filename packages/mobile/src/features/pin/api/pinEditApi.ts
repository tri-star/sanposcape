import { ApiError, isApiError } from "@/api/apiError";
import {
  deletePin as deletePinRequest,
  deletePinPhoto as deletePinPhotoRequest,
  updatePin as updatePinRequest,
} from "@/api/generated/endpoints/pins/pins";
import type { PinUpdate } from "@/api/generated/model";
import { toPinDetail } from "@/features/pin/lib/pinRead";
import type { PinDetail } from "@/features/pin/types";
import { isUuid } from "@/lib/uuid";

export type PinDeleteResult = {
  /** 404 だった（既に削除済み／存在しない）。呼び出し側は成功と同じ扱いでよい。 */
  alreadyDeleted: boolean;
};

/**
 * `PATCH /pins/{pin_id}`。応答の PinRead を PinDetail に変換して返す。
 *
 * pinId が UUID でなければ通信せず `ApiError(422)`。404 にしない理由: 404 は呼び出し側で
 * 「ピンが削除された」と解釈するため、不正 id と区別する（`walkDeleteApi.ts` と同じ理由）。
 * `signal` は受け取らない（画面離脱で送信を止めない。`saveWalk` / `createPin` と同じ）。
 * 非2xx は `customFetch` が `ApiError(status, msg, body)` で throw する（409 の `body.code` は残る）。
 * 404 は `body.code` が `pin_not_found`（ピン無し）か `sanpo_map_not_found`（移動先の地図無し）かで
 * 意味が分かれる。呼び出し側は `getApiErrorCode` で読み分ける（`pinEditError.ts`）。
 */
export async function updatePin(
  pinId: string,
  request: PinUpdate,
  options: { apiBaseUrl: string },
): Promise<PinDetail> {
  if (!isUuid(pinId)) {
    throw new ApiError(422, "pinId is not a UUID");
  }
  const response = await updatePinRequest(pinId, request);
  if (response.status !== 200) {
    throw new ApiError(response.status);
  }
  return toPinDetail(response.data, { apiBaseUrl: options.apiBaseUrl });
}

/** 404 を「既に無い」として成功に読み替えて削除を実行する（ADR-009 決定21・伝達事項）。 */
async function runDelete(request: () => Promise<{ status: number }>): Promise<PinDeleteResult> {
  try {
    const response = await request();
    // customFetch は非2xx で throw するため通常ここには来ない（型の網羅のため）。
    if (response.status !== 204) {
      throw new ApiError(response.status);
    }
    return { alreadyDeleted: false };
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      return { alreadyDeleted: true };
    }
    throw error;
  }
}

/** `DELETE /pins/{pin_id}`。204 → { alreadyDeleted:false }、404 → { alreadyDeleted:true }。他は throw。 */
export async function deletePin(pinId: string): Promise<PinDeleteResult> {
  if (!isUuid(pinId)) {
    throw new ApiError(422, "pinId is not a UUID");
  }
  return runDelete(() => deletePinRequest(pinId));
}

/** `DELETE /pins/{pin_id}/photos/{photo_id}`。204/404 を成功扱い。両 id とも UUID 検証（不正は 422）。 */
export async function deletePinPhoto(pinId: string, photoId: string): Promise<PinDeleteResult> {
  if (!isUuid(pinId) || !isUuid(photoId)) {
    throw new ApiError(422, "pinId / photoId is not a UUID");
  }
  return runDelete(() => deletePinPhotoRequest(pinId, photoId));
}
