import { ApiError } from "@/api/apiError";
import { listSanpoMaps as listSanpoMapsRequest } from "@/api/generated/endpoints/sanpo-maps/sanpo-maps";
import type { SanpoMapRead } from "@/api/generated/model";
import type { SanpoMap } from "@/features/pin/types";

export function toSanpoMap(read: SanpoMapRead): SanpoMap {
  return {
    id: read.id,
    name: read.name,
    isDefault: read.is_default,
    role: read.role,
  };
}

/**
 * `GET /sanpo-maps`。自分が member である地図を全件返す（MVP は件数が少ない前提）。
 * `next_cursor` は MVP では常に null なので無視する（一覧の分割取得は地図管理チケットの範囲）。
 * `expand` は使わない（`pin_count` は地図管理画面 SS-121 で使う）。
 *
 * 素の fetcher（`listSanpoMaps`）を使う理由: `useSanpoMaps` hook 側で queryKey / `enabled` を
 * 制御したいのと、`react-native` を値 import しないので node の vitest でテストできるため。
 */
export async function fetchSanpoMaps(options?: { signal?: AbortSignal }): Promise<SanpoMap[]> {
  const response = await listSanpoMapsRequest(undefined, { signal: options?.signal });
  if (response.status !== 200) {
    // customFetch は非2xx で ApiError を throw するため通常ここには来ない（型の網羅のため）。
    throw new ApiError(response.status);
  }
  return response.data.items.map(toSanpoMap);
}
