import type {
  PinListItemRead,
  PinPhotoPageRead,
  PinPhotoRead,
  PinRead,
} from "@/api/generated/model";
import { isAllowedUploadUrl } from "@/features/pin/lib/presignedPostForm";
import type { PinDetail, PinPhoto, PinPhotoPage, PinSummary } from "@/features/pin/types";
import { isValidCoordinate } from "@/lib/geoCoordinate";

/**
 * `PinPhotoRead` を表示用の `PinPhoto` に変換する。`thumbnailUrl` / `originalUrl` は
 * `isAllowedUploadUrl`（直送と同じ許可規則: https は常に可、http は backend と同一 origin
 * だけ = `STORAGE_MODE=fake`）を通す。理由: 想定外の平文 URL を読み込まない多層防御
 * （SS-118。presignedPostForm.ts の JSDoc も参照）。
 */
export function toPinPhoto(read: PinPhotoRead, options: { apiBaseUrl: string }): PinPhoto {
  const thumbnailUrl =
    read.thumbnail !== null && isAllowedUploadUrl(read.thumbnail.url, options)
      ? read.thumbnail.url
      : null;
  const originalUrl =
    read.original_url !== null && isAllowedUploadUrl(read.original_url, options)
      ? read.original_url
      : null;

  return {
    id: read.id,
    position: read.position,
    thumbnailUrl,
    originalUrl,
    width: read.width,
    height: read.height,
  };
}

/** `location` が `isValidCoordinate` を満たさなければ null（Marker に渡す直前の防波堤）。 */
export function toPinSummary(read: PinListItemRead): PinSummary | null {
  if (!isValidCoordinate(read.location)) {
    return null;
  }
  return {
    id: read.id,
    sanpoMapId: read.sanpo_map_id,
    name: read.name,
    location: { latitude: read.location.latitude, longitude: read.location.longitude },
  };
}

export function toPinDetail(read: PinRead, options: { apiBaseUrl: string }): PinDetail {
  return {
    id: read.id,
    name: read.name,
    memo: read.memo,
    location: { latitude: read.location.latitude, longitude: read.location.longitude },
    tags: read.tags.map((tag) => ({ id: tag.id, label: tag.label })),
    photos: read.photos.map((photo) => toPinPhoto(photo, options)),
    photoCount: read.photo_count,
    sanpoMapName: read.sanpo_map.name,
    createdAt: read.created_at,
  };
}

export function toPinPhotoPage(
  read: PinPhotoPageRead,
  options: { apiBaseUrl: string },
): PinPhotoPage {
  return {
    items: read.items.map((photo) => toPinPhoto(photo, options)),
    photoCount: read.photo_count,
    nextCursor: read.next_cursor,
  };
}

/**
 * 複数地図から取得したピン一覧をマージする。`undefined`（まだ取得できていない地図）は無視する。
 * `id` で重複排除（最初に出たものを残す）。`truncated` はいずれかの `hasMore` が true なら true。
 */
export function mergeRegisteredPinPages(
  pages: ReadonlyArray<{ pins: PinSummary[]; hasMore: boolean } | undefined>,
): { pins: PinSummary[]; truncated: boolean } {
  const seen = new Set<string>();
  const pins: PinSummary[] = [];
  let truncated = false;

  for (const page of pages) {
    if (page === undefined) continue;
    if (page.hasMore) truncated = true;
    for (const pin of page.pins) {
      if (seen.has(pin.id)) continue;
      seen.add(pin.id);
      pins.push(pin);
    }
  }

  return { pins, truncated };
}

/**
 * `useQueries` の1件分の結果から `useRegisteredPins` が必要とする値だけを抜き出した形
 * （`@tanstack/react-query` の型を直接 import せず、この feature が必要とする最小の形で
 * 自前定義する。`combineRegisteredPinListQueries` を node の Vitest でテストできるように
 * するため）。
 */
export type PinListQueryOutcome = {
  data: { pins: PinSummary[]; hasMore: boolean } | undefined;
  isPlaceholderData: boolean;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
};

export type CombinedPinListQueries = {
  pins: PinSummary[];
  /** いずれかの地図がプレースホルダを含めて打ち切られていれば true（表示用）。 */
  truncated: boolean;
  /**
   * プレースホルダを除いた「現在の取得範囲に対する」打ち切り判定。`resolvePinFetchBounds` の
   * 再取得判定にのみ使う（パン直後の一瞬だけ古い bounds の truncated が紛れ込むのを避けるため
   * `isPlaceholderData` の結果は無視する）。
   */
  settledTruncated: boolean;
  anyPending: boolean;
  firstError: unknown;
  /** 全地図の再取得を発火する（`useSanpoMaps` の再試行と合わせて `retry()` から呼ぶ）。 */
  refetchAll: () => void;
};

/**
 * `useQueries({ queries, combine })` の `combine` に渡す純粋関数（SS-118 ローカルレビュー
 * ARCH-W1 / QA-W2）。
 *
 * **モジュールレベルの安定した関数参照のまま `combine` に渡すこと**（hook 内でラップした
 * インライン関数にしない）。`@tanstack/query-core` は `combine` の関数参照とクエリの内部状態が
 * 両方とも前回から変わっていなければ再計算自体をスキップし、変わったときも
 * `replaceEqualDeep` で戻り値を構造共有するため、クエリの実データが変わらない限り
 * この関数の戻り値（`pins` 配列を含む）の参照が安定する。`WalkActiveView` は経過時間で
 * 毎秒再レンダーされるため、ここで参照を安定させないと `RegisteredPinMarkers` の
 * `React.memo` が無効化される。
 *
 * `retry()` から呼ぶ `refetchAll` をここで作ることで、`useRegisteredPins` 側は
 * `useQueries` の生の結果配列を持ち回さずに済む（stale closure の温床にしない。QA-W2）。
 */
export function combineRegisteredPinListQueries(
  outcomes: readonly PinListQueryOutcome[],
): CombinedPinListQueries {
  const merged = mergeRegisteredPinPages(outcomes.map((outcome) => outcome.data));
  const settledTruncated = outcomes.some(
    (outcome) => outcome.data !== undefined && !outcome.isPlaceholderData && outcome.data.hasMore,
  );

  return {
    pins: merged.pins,
    truncated: merged.truncated,
    settledTruncated,
    anyPending: outcomes.some((outcome) => outcome.isPending),
    firstError: outcomes.find((outcome) => outcome.isError)?.error,
    refetchAll: () => {
      for (const outcome of outcomes) {
        void outcome.refetch();
      }
    },
  };
}
