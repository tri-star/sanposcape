/**
 * 地図名・ピン名の絞り込み（端末で行う。ADR-M-014 D1）。
 * 照合規則: 前後の空白を除き、連続する空白（全角空白を含む `\s`）を1つにまとめ、小文字化した
 * 文字列同士の部分一致。かな・全角半角の同一視はしない（`String.prototype.normalize` は使わない。
 * ADR-M-013 のタグ候補の絞り込み・backend の `ILIKE` と揃える）。
 */

/** 前後の空白を除き、連続する空白を1つにまとめ、小文字化する。 */
export function normalizeNameQuery(input: string): string {
  return input.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * name が正規化済みの query を部分一致で含むか。query が空なら常に true。
 * name が null・空白のみなら（query が空でない限り）false。
 */
export function matchesNameQuery(name: string | null, normalizedQuery: string): boolean {
  if (normalizedQuery === "") return true;
  if (name === null) return false;
  const normalizedName = normalizeNameQuery(name);
  if (normalizedName === "") return false;
  return normalizedName.includes(normalizedQuery);
}

function filterByName<T>(
  items: readonly T[],
  query: string,
  getName: (item: T) => string | null,
): readonly T[] {
  const normalized = normalizeNameQuery(query);
  if (normalized === "") return items;
  return items.filter((item) => matchesNameQuery(getName(item), normalized));
}

/** 地図を名前で絞る。順序は保つ。query が空なら入力をそのまま返す（同じ参照）。 */
export function filterSanpoMapsByName<T extends { name: string }>(
  maps: readonly T[],
  query: string,
): readonly T[] {
  return filterByName(maps, query, (map) => map.name);
}

/** ピンを名前で絞る。順序は保つ。名前の無いピンは query が空でなければ一致しない。 */
export function filterPinsByName<T extends { name: string | null }>(
  pins: readonly T[],
  query: string,
): readonly T[] {
  return filterByName(pins, query, (pin) => pin.name);
}
