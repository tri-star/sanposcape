import type { SanpoMap } from "@/features/pin/types";

/**
 * 作った地図を一覧キャッシュに差し込む（再取得が返るまでの間も一覧に出すため）。
 * サーバーの並び（自分の既定地図 → updated_at DESC）に合わせ、
 * - created.isDefault なら先頭
 * - そうでなければ先頭から続く isDefault の地図の直後
 * に入れる。同じ id が既にあれば変えずにそのまま返す。old が undefined なら [created]。
 * 元の配列は変更しない。
 */
export function insertCreatedSanpoMap(
  old: readonly SanpoMap[] | undefined,
  created: SanpoMap,
): SanpoMap[] {
  if (old === undefined) return [created];
  if (old.some((map) => map.id === created.id)) return [...old];
  if (created.isDefault) return [created, ...old];

  let index = 0;
  while (index < old.length && old[index]!.isDefault) {
    index += 1;
  }
  return [...old.slice(0, index), created, ...old.slice(index)];
}
