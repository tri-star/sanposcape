/**
 * ピンの訪問状況・アーカイブの表示（バッジ・文言・読み上げ）と、登録時の初期値の判定（SS-173。ADR-M-021）。
 * 純粋関数だけを置く（`react-native` を値 import しない。Vitest でテストする）。
 */
export type PinStatus = { visited: boolean; archived: boolean };

/** Badge の tone に代入できる値だけを使う（components を import しない）。 */
export type PinStatusBadge = {
  key: "visited" | "unvisited" | "archived";
  label: string;
  tone: "success" | "neutral" | "warning";
};

export const PIN_VISITED_LABEL = "訪問済み";
export const PIN_UNVISITED_LABEL = "未訪問";
export const PIN_ARCHIVED_LABEL = "アーカイブ済み";
/** 詳細でアーカイブ済みのときに出す一文。 */
export const PIN_ARCHIVED_NOTICE = "アーカイブ済みのピンです。地図には表示されません。";
/** 編集・登録のスイッチのラベルと案内文。 */
export const PIN_VISITED_SWITCH_LABEL = "訪問済み";
export const PIN_ARCHIVE_SWITCH_LABEL = "アーカイブする";
export const PIN_ARCHIVE_HELPER =
  "アーカイブしたピンは地図に表示されなくなります。地図一覧の各地図からは開けます。";
export const PIN_ARCHIVE_LOCKED_HELPER =
  "アーカイブは、ピンを作った人と地図の持ち主だけが変更できます";
export const PIN_REGISTER_VISITED_HELPER = "これから行ってみたい場所なら、オフにして登録します";

/**
 * 状態バッジの並び。
 * - "detail": 訪問状況は常に出す（訪問済み=success / 未訪問=neutral）。アーカイブ済みなら warning を後ろに足す。
 * - "list": 既定の状態（未訪問・未アーカイブ）は出さない（行の情報量を抑える）。訪問済み → アーカイブ済みの順。
 */
export function resolvePinStatusBadges(
  status: PinStatus,
  context: "detail" | "list",
): PinStatusBadge[] {
  const badges: PinStatusBadge[] = [];
  if (status.visited) {
    badges.push({ key: "visited", label: PIN_VISITED_LABEL, tone: "success" });
  } else if (context === "detail") {
    badges.push({ key: "unvisited", label: PIN_UNVISITED_LABEL, tone: "neutral" });
  }
  if (status.archived) {
    badges.push({ key: "archived", label: PIN_ARCHIVED_LABEL, tone: "warning" });
  }
  return badges;
}

/** 読み上げ用の状態ラベル（バッジと同じ内容・順序）。 */
export function pinStatusAccessibilityLabels(
  status: PinStatus,
  context: "detail" | "list",
): string[] {
  return resolvePinStatusBadges(status, context).map((badge) => badge.label);
}

/**
 * 登録画面の「訪問済み」の初期値。散歩中の登録（clientWalkId あり）は true、
 * ピンタブの地図の長押しからの登録（なし）は false（ADR-M-021 D6）。
 */
export function resolveInitialVisited(input: { clientWalkId: string | null }): boolean {
  return input.clientWalkId !== null;
}
