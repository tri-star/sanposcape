import { ApiError } from "@/api/apiError";
import {
  createSanpoMap as createSanpoMapRequest,
  listSanpoMaps as listSanpoMapsRequest,
  updateSanpoMap as updateSanpoMapRequest,
} from "@/api/generated/endpoints/sanpo-maps/sanpo-maps";
import type { SanpoMapRead } from "@/api/generated/model";
import { isUuid } from "@/lib/uuid";
import { toSanpoMapIconKey, type SanpoMapIconKey } from "@/features/pin/lib/sanpoMapIcon";
import type { SanpoMap } from "@/features/pin/types";

/** `icon` は SS-171。生成型では必須でも、古い backend・未知の値に備えて必ず検証を通す。 */
export function toSanpoMap(read: SanpoMapRead): SanpoMap {
  return {
    id: read.id,
    name: read.name,
    isDefault: read.is_default,
    role: read.role,
    // pin_count は OpenAPI 上 optional かつ nullable。undefined も null に揃える。
    pinCount: read.pin_count ?? null,
    icon: toSanpoMapIconKey(read.icon),
  };
}

/**
 * `GET /sanpo-maps`。自分が member である地図を全件返す（MVP は件数が少ない前提）。
 * `next_cursor` は MVP では常に null なので無視する（一覧の分割取得は地図管理チケットの範囲）。
 * 常に `expand=pin_count` を付ける（ピン登録画面・ピンタブ・地図一覧でキャッシュを1つに保つため。
 * ADR-M-014）。
 *
 * 素の fetcher（`listSanpoMaps`）を使う理由: `useSanpoMaps` hook 側で queryKey / `enabled` を
 * 制御したいのと、`react-native` を値 import しないので node の vitest でテストできるため。
 */
export async function fetchSanpoMaps(options?: { signal?: AbortSignal }): Promise<SanpoMap[]> {
  const response = await listSanpoMapsRequest(
    { expand: ["pin_count"] },
    { signal: options?.signal },
  );
  if (response.status !== 200) {
    // customFetch は非2xx で ApiError を throw するため通常ここには来ない（型の網羅のため）。
    throw new ApiError(response.status);
  }
  return response.data.items.map(toSanpoMap);
}

/**
 * `POST /sanpo-maps`。`name` は呼び出し側で `validateSanpoMapName` を通した値（trim 済み）。
 * 冪等キーは無いので、この関数も呼び出し側も自動再送しない（customFetch の transientRetry も
 * POST は再送しない）。
 * 作ったばかりの地図にはピンが無いので pinCount は 0 にする（応答の pin_count は null）。
 * `signal` は渡さない（書き込みは画面を離れても中断しない。`usePinSave` の `createPin` と同じ考え方）。
 */
export async function createSanpoMap(input: {
  name: string;
  icon: SanpoMapIconKey;
}): Promise<SanpoMap> {
  // 既定の pin でも明示的に送る。
  const response = await createSanpoMapRequest({ name: input.name, icon: input.icon });
  if (response.status !== 201) {
    throw new ApiError(response.status);
  }
  return { ...toSanpoMap(response.data), pinCount: 0 };
}

/**
 * `PATCH /sanpo-maps/{id}` でアイコンだけを変える（SS-171）。body は `{ icon }` のみ（差分だけ送る。ADR-M-017 と同じ方針）。
 * `sanpoMapId` が UUID でなければ通信せず ApiError(404)（`fetchAllPinsInSanpoMap` と同じ多層防御）。
 * 応答の pin_count は null なので、キャッシュ反映側（`replaceUpdatedSanpoMap`）で既存の件数を残す。
 * `signal` は渡さない（書き込みは画面を離れても中断しない）。
 */
export async function updateSanpoMapIcon(input: {
  sanpoMapId: string;
  icon: SanpoMapIconKey;
}): Promise<SanpoMap> {
  if (!isUuid(input.sanpoMapId)) throw new ApiError(404);
  const response = await updateSanpoMapRequest(input.sanpoMapId, { icon: input.icon });
  if (response.status !== 200) {
    throw new ApiError(response.status);
  }
  return toSanpoMap(response.data);
}
