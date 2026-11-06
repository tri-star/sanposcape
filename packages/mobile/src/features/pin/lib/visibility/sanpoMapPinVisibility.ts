import type { SanpoMapUpdateErrorCode } from "@/features/pin/lib/sanpoMapError";
import type { SanpoMap } from "@/features/pin/types";

/**
 * 地図単位のピンの表示・非表示（SS-266）の純粋関数。
 *
 * 選択は自分のメンバーシップの `pinsVisible`（backend の `sanpo_map_members.pins_visible`）に保存され、
 * ピンタブと散歩中のナビタブの地図の両方に効く。フラグ `map_pin_visibility` が OFF の間は
 * `pinsVisible` を見ず、すべての地図のピンを出す（`enabled: false`）。
 */

/** ピンを取りに行く地図。非表示の地図は `GET /pins` 自体を呼ばない（上限の件数を表示する地図に使う）。 */
export function selectPinsVisibleSanpoMaps(
  maps: readonly SanpoMap[],
  enabled: boolean,
): readonly SanpoMap[] {
  if (!enabled) return maps;
  return maps.some((map) => !map.pinsVisible) ? maps.filter((map) => map.pinsVisible) : maps;
}

/** 非表示にしている地図の数（「絞り込み中」の判定に使う）。`enabled: false` なら常に 0。 */
export function countHiddenSanpoMaps(maps: readonly SanpoMap[], enabled: boolean): number {
  if (!enabled) return 0;
  return maps.reduce((count, map) => (map.pinsVisible ? count : count + 1), 0);
}

/**
 * 一覧キャッシュの1件の `pinsVisible` だけを書き換える（楽観的な更新と、失敗したときの戻し）。
 * ほかの項目と並び順は変えない。値が変わらなければ old をそのまま返す。old が undefined なら undefined。
 * 元の配列は変更しない。
 */
export function setSanpoMapPinsVisible(
  old: readonly SanpoMap[] | undefined,
  sanpoMapId: string,
  pinsVisible: boolean,
): SanpoMap[] | undefined {
  if (old === undefined) return undefined;
  if (!old.some((map) => map.id === sanpoMapId && map.pinsVisible !== pinsVisible)) {
    return old as SanpoMap[];
  }
  return old.map((map) => (map.id === sanpoMapId ? { ...map, pinsVisible } : map));
}

const PIN_VISIBILITY_ERROR_MESSAGES: Record<SanpoMapUpdateErrorCode, string> = {
  unauthorized: "サインインし直してから、もう一度お試しください。",
  // backend はメンバーなら role を問わず受け付けるので、通常は返らない。
  forbidden: "この地図の表示を切り替えられませんでした。",
  not_found: "この地図は見つかりませんでした。削除されたか、メンバーから外れた可能性があります。",
  invalid_request: "表示を切り替えられませんでした。アプリを最新にしてお試しください。",
  network: "通信に失敗しました。電波状況を確認して、もう一度お試しください。",
  server: "サーバーで問題が発生しました。時間をおいてお試しください。",
  unknown: "表示を切り替えられませんでした。もう一度お試しください。",
};

/** 切り替えに失敗したときの案内（シートの「表示する地図」の節に出す）。 */
export function sanpoMapPinVisibilityErrorMessage(code: SanpoMapUpdateErrorCode): string {
  return PIN_VISIBILITY_ERROR_MESSAGES[code];
}
