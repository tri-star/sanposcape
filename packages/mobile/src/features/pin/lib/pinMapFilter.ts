/**
 * 地図に描く登録済みピンの絞り込み（SS-174。ADR-M-021 の SS-174 追補）。
 * ピンタブと散歩中のナビタブの地図で共有する（状態は `usePinMapFilterStore`）。
 */
export type PinMapFilter = {
  /** アーカイブ済みのピンも表示するか。 */
  includeArchived: boolean;
  /** 未訪問のピンを表示するか。 */
  showUnvisited: boolean;
  /** 訪問済みのピンを表示するか。 */
  showVisited: boolean;
};

/** 訪問状況のチェックボックスの項目。 */
export type PinVisitFilterOption = "unvisited" | "visited";

/** 既定: アーカイブ済みは出さない・未訪問と訪問済みは両方出す（課題の指定）。 */
export const DEFAULT_PIN_MAP_FILTER: PinMapFilter = {
  includeArchived: false,
  showUnvisited: true,
  showVisited: true,
};

/** `GET /pins` に送る絞り込みの条件。キーが無いものは「両方」（backend は絞らない）。 */
export type PinListFilterParams = {
  archived?: false;
  visited?: boolean;
};

export function isDefaultPinMapFilter(filter: PinMapFilter): boolean {
  return (
    filter.includeArchived === DEFAULT_PIN_MAP_FILTER.includeArchived &&
    filter.showUnvisited === DEFAULT_PIN_MAP_FILTER.showUnvisited &&
    filter.showVisited === DEFAULT_PIN_MAP_FILTER.showVisited
  );
}

/**
 * 絞り込み → `GET /pins` のクエリ。絞らない項目はキーごと作らない（`undefined` も入れない。
 * queryKey の比較と Orval の URL ビルダーの両方で「無い」ことを明確にするため）。
 *
 * - アーカイブ: 出さない → `archived: false`、出す → キー無し（両方）。
 * - 訪問状況: 両方 → キー無し、未訪問だけ → `visited: false`、訪問済みだけ → `visited: true`。
 *   両方外れた状態は `setPinVisitFilterOption` が作らせないが、万一渡されたら「両方」として扱う
 *   （何も出ない地図より、条件が効いていない地図のほうが害が小さい）。
 */
export function toPinListFilterParams(filter: PinMapFilter): PinListFilterParams {
  const params: PinListFilterParams = {};
  if (!filter.includeArchived) params.archived = false;
  if (filter.showVisited && !filter.showUnvisited) params.visited = true;
  if (filter.showUnvisited && !filter.showVisited) params.visited = false;
  return params;
}

export function isPinVisitFilterOptionChecked(
  filter: PinMapFilter,
  option: PinVisitFilterOption,
): boolean {
  return option === "visited" ? filter.showVisited : filter.showUnvisited;
}

/**
 * その項目のチェックを外せるか。訪問状況は少なくとも1つ選んだままにする
 * （両方外すと何も出ない地図になり、取得条件も作れないため）。チェックを付ける操作は常にできる。
 */
export function canUncheckPinVisitFilterOption(
  filter: PinMapFilter,
  option: PinVisitFilterOption,
): boolean {
  return option === "visited" ? filter.showUnvisited : filter.showVisited;
}

/**
 * 訪問状況の項目を切り替えた後の絞り込み。最後の1つを外す操作は無視して元の値（同じ参照）を返す。
 * 値が変わらないときも同じ参照を返す（store の再レンダーを起こさない）。
 */
export function setPinVisitFilterOption(
  filter: PinMapFilter,
  option: PinVisitFilterOption,
  checked: boolean,
): PinMapFilter {
  if (isPinVisitFilterOptionChecked(filter, option) === checked) return filter;
  if (!checked && !canUncheckPinVisitFilterOption(filter, option)) return filter;
  return option === "visited"
    ? { ...filter, showVisited: checked }
    : { ...filter, showUnvisited: checked };
}
