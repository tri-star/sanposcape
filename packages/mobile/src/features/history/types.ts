import type { GeoCoordinates } from "@/services/location/types";

/** 履歴画面の期間タブ。 */
export type Period = "week" | "month";

/**
 * 履歴一覧の1件。表示ラベルまで lib の純粋関数で確定させ、コンポーネント側では整形しない
 * （RN のレンダリングテストが書けないため、表示文言の検証を Vitest に寄せる）。
 */
export type WalkHistoryItem = {
  /** サーバーの walk id（詳細取得・遷移に使う）。 */
  id: string;
  /** started_at の生 ISO 文字列（並び順・キーの安定性のために保持）。 */
  startedAt: string;
  /** 「8月2日(日)」。年が現在と異なる場合は「2025年8月2日(土)」。パース不能なら「日時不明」。 */
  dateLabel: string;
  /** 「14:30」。パース不能なら空文字。 */
  timeLabel: string;
  /** 目的地名。空なら「目的地」。 */
  destinationName: string;
  /** 「32分」「1時間5分」。 */
  durationLabel: string;
  /** 小数1桁の km。 */
  distanceKm: number;
};

/** 履歴詳細（軌跡付き）。 */
export type WalkDetail = {
  id: string;
  startedAt: string;
  dateLabel: string;
  /** 「14:30 – 15:02」。パース不能なら空文字。 */
  timeRangeLabel: string;
  destinationName: string;
  destination: GeoCoordinates;
  /** 「00:32:14」（formatClock）。 */
  elapsedLabel: string;
  distanceKm: number;
  /** 「12'30"/km」。算出不能なら「—」。 */
  paceLabel: string;
  /** 妥当な座標だけを残した軌跡。0〜2点のこともある。 */
  track: GeoCoordinates[];
};
