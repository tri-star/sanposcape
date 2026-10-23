/** ピンの位置の住所（SS-212）。DB には保存せず、ピン詳細を開いたときに backend で逆ジオコーディングする。 */
export type PinAddress = {
  /** 都道府県から番地までの住所（例: `東京都千代田区丸の内2丁目4-1`）。 */
  address: string;
  /** 取れたときだけの建物名。 */
  buildingName: string | null;
};

export type PinAddressStatus = "loading" | "ready" | "unavailable";

/** 住所が無い・取得できなかったときの表示。 */
export const PIN_ADDRESS_UNAVAILABLE_LABEL = "-";
export const PIN_ADDRESS_LOADING_LABEL = "住所を調べています…";

/** 応答の住所・建物名を表示用に整える。住所が無い・空なら null（建物名だけでは住所として出さない）。 */
export function toPinAddress(input: {
  address: string | null;
  buildingName: string | null;
}): PinAddress | null {
  const address = input.address?.trim() ?? "";
  if (address.length === 0) return null;
  const buildingName = input.buildingName?.trim() ?? "";
  return { address, buildingName: buildingName.length > 0 ? buildingName : null };
}

/**
 * ピン詳細に出す住所の文字列。取得中は案内、住所が無い・失敗は「-」。
 * 建物名は取れたときだけ住所の後ろに付ける。
 */
export function pinAddressText(input: {
  status: PinAddressStatus;
  address: PinAddress | null;
}): string {
  if (input.status === "loading") return PIN_ADDRESS_LOADING_LABEL;
  if (input.address === null) return PIN_ADDRESS_UNAVAILABLE_LABEL;
  const { address, buildingName } = input.address;
  return buildingName !== null ? `${address} ${buildingName}` : address;
}
