import type { LocationPrecision } from "@/services/location/types";

export type ApproximateLocationContext = "explore" | "tracking";

/** 大まかな位置の案内を出すか。approximate のときだけ true（null=権限なし・不明は出さない）。 */
export function shouldShowApproximateLocationNotice(precision: LocationPrecision | null): boolean {
  return precision === "approximate";
}

const MESSAGES: Record<ApproximateLocationContext, string> = {
  explore:
    "「正確な位置情報」がオフのため、現在地が大きくずれることがあります。スポットとルートは目安としてご覧ください。",
  tracking:
    "「正確な位置情報」がオフのため、ルートや距離が正しく記録されないことがあります。記録は続けています。",
};

/** 案内の文言。「設定アプリでオンにできる」ことは「設定を開く」ボタンで示す。 */
export function approximateLocationNoticeMessage(context: ApproximateLocationContext): string {
  return MESSAGES[context];
}
