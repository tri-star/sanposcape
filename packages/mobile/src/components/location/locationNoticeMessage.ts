import { locationErrorMessage } from "@/services/location/locationError";
import type { LocationErrorCode } from "@/services/location/types";

/** 案内を出す画面の文脈。explore=散歩開始（探索）、tracking=散歩中（記録）、map=ピンタブ（地図）。 */
export type LocationNoticeContext = "explore" | "tracking" | "map";

const PERMISSION_DENIED_MESSAGES: Record<LocationNoticeContext, string> = {
  explore:
    "位置情報の利用が許可されていないため、現在地の周辺のスポットを探せません。設定アプリで位置情報の利用を許可すると使えるようになります。",
  tracking:
    "位置情報の利用が許可されていないため、散歩のルートを記録できません。設定アプリで位置情報の利用を許可すると記録できるようになります。",
  map: "位置情報の利用が許可されていないため、現在地は表示されません。ピンは地図を長押しして登録できます。",
};

/**
 * 位置情報の案内の文言を、画面の文脈ごとに決める（純粋。ADR-M-022）。
 * 拒否（permission_denied）は「何ができないか・代わりに何ができるか・設定アプリで変えられること」を
 * 事実として書き、「〜してください」と許可を迫らない（App Review 5.1.1(iv)）。
 * それ以外のコードは文脈によらず従来の共通文言を返す。
 */
export function locationNoticeMessage(
  code: LocationErrorCode,
  context: LocationNoticeContext,
): string {
  if (code === "permission_denied") return PERMISSION_DENIED_MESSAGES[context];
  return locationErrorMessage(code);
}
