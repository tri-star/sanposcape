import { PIN_NAME_MAX_LENGTH } from "@/features/pin/lib/pinLimits";

const NEARBY_SUFFIX = "付近";

/**
 * 住所（と取れれば建物名）から、ピン名の初期値を作る（SS-138）。例: `東京都千代田区丸の内1丁目9-1 テストビル付近`。
 * 位置は長押しやドラッグで決めた点で、住所はその点に最も近いものなので「付近」を付ける。
 *
 * ピン名の上限（`PIN_NAME_MAX_LENGTH`。Unicode code point で数える）を超えるときは、
 * まず建物名を落とし、それでも超えるなら住所の末尾を切り詰めて「付近」を付ける。
 * 住所が無い・空なら null（初期値を入れない）。
 */
export function buildDefaultPinName(input: {
  address: string | null;
  buildingName: string | null;
}): string | null {
  const address = input.address?.trim() ?? "";
  if (address.length === 0) return null;
  const buildingName = input.buildingName?.trim() ?? "";

  if (buildingName.length > 0) {
    const withBuilding = `${address} ${buildingName}${NEARBY_SUFFIX}`;
    if (codePointLength(withBuilding) <= PIN_NAME_MAX_LENGTH) return withBuilding;
  }
  const withoutBuilding = `${address}${NEARBY_SUFFIX}`;
  if (codePointLength(withoutBuilding) <= PIN_NAME_MAX_LENGTH) return withoutBuilding;

  const room = PIN_NAME_MAX_LENGTH - codePointLength(NEARBY_SUFFIX);
  return `${Array.from(address).slice(0, room).join("").trimEnd()}${NEARBY_SUFFIX}`;
}

function codePointLength(text: string): number {
  return Array.from(text).length;
}

export const PIN_NAME_HELPER_DEFAULT = "空欄なら「無題のピン」になります";
export const PIN_NAME_HELPER_LOADING = "この場所の住所を調べています…";
export const PIN_NAME_HELPER_FILLED = "この場所の住所を入れました。自由に書き換えられます";

/**
 * 登録画面の名前欄のヘルパー文言（SS-138）。住所を取得中で名前欄が空のときは取得中、
 * 住所の初期値が入っている（未編集）ときはその旨、それ以外（編集済み・取得できなかった）は既定の案内。
 */
export function pinNameHelperText(input: {
  status: "idle" | "loading" | "ready" | "unavailable";
  isNameDefault: boolean;
  name: string;
}): string {
  if (input.isNameDefault) return PIN_NAME_HELPER_FILLED;
  if (input.status === "loading" && input.name.length === 0) return PIN_NAME_HELPER_LOADING;
  return PIN_NAME_HELPER_DEFAULT;
}
