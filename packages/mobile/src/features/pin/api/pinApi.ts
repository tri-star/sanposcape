import { ApiError } from "@/api/apiError";
import {
  addPinPhotos as addPinPhotosRequest,
  createPin as createPinRequest,
} from "@/api/generated/endpoints/pins/pins";
import type { PinCreate, PinPhotosAdd, PinRead } from "@/api/generated/model";
import type { SavedPin } from "@/features/pin/types";
import { isUuid } from "@/lib/uuid";

export function toSavedPin(read: PinRead): SavedPin {
  return {
    id: read.id,
    sanpoMapId: read.sanpo_map.id,
    sanpoMapName: read.sanpo_map.name,
    photoCount: read.photo_count,
  };
}

/** `PinRead.photos` から実際に紐付いた upload_id を抽出する（応答喪失からの再開の判定に使う）。 */
function attachedUploadIdsOf(read: PinRead): string[] {
  return read.photos.map((photo) => photo.upload_id);
}

/**
 * `POST /pins`。201（新規）と 200（`client_pin_id` の冪等再送。内容が違っても既存を返す）の
 * 両方を成功とする。
 *
 * `attachedUploadIds` は応答の `photos[].upload_id`（実際に紐付いた枠）。再送時は今回送った ID と
 * 一致しないことがある（backend は再送の内容を無視して既存ピンを返すため。`runPinSave` はこの
 * 応答を見て次にどの写真を送るか決める＝送った ID を信用しない）。`photos` は先頭10件だが、
 * `POST /pins` で紐付くのは最大10枚なので作成時点の紐付けは全部入る。
 *
 * `signal` は渡さない（`saveWalk` と同じ理由: 保存中に画面を離れても送信を中断させないため）。
 */
export async function createPin(
  request: PinCreate,
): Promise<{ pin: SavedPin; attachedUploadIds: string[] }> {
  const response = await createPinRequest(request);
  if (response.status === 201 || response.status === 200) {
    return {
      pin: toSavedPin(response.data),
      attachedUploadIds: attachedUploadIdsOf(response.data),
    };
  }
  // customFetch は非2xx で ApiError を throw するため通常ここには来ない（型の網羅のため）。
  throw new ApiError(response.status);
}

/**
 * `POST /pins/{pin_id}/photos`。同じピンに紐付け済みの枠の再送は成功扱い（冪等）。
 * `attachedUploadIds` は応答の `items[].upload_id`。
 *
 * `pinId` は `isUuid` で検証してから URL パスへ埋める（サーバー由来の値だが Orval の URL
 * ビルダーはエスケープしないため。`src/lib/uuid.ts` の `isUuid` の JSDoc を参照）。
 * `photoUploadIds` は1〜10件のみ許容する。範囲外は呼び出し側の取り違えとして
 * 通信せずに `ApiError(422)` を投げる。
 */
export async function addPinPhotos(
  pinId: string,
  photoUploadIds: readonly string[],
): Promise<{ photoCount: number; attachedUploadIds: string[] }> {
  if (!isUuid(pinId)) {
    throw new ApiError(422, "Invalid pinId");
  }
  if (photoUploadIds.length < 1 || photoUploadIds.length > 10) {
    throw new ApiError(422, "photoUploadIds must contain 1-10 items");
  }

  const body: PinPhotosAdd = { photo_upload_ids: [...photoUploadIds] };
  const response = await addPinPhotosRequest(pinId, body);
  if (response.status === 200) {
    return {
      photoCount: response.data.photo_count,
      attachedUploadIds: response.data.items.map((item) => item.upload_id),
    };
  }
  throw new ApiError(response.status);
}
