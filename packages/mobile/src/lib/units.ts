import { toNonNegative } from "@/lib/numberGuard";

/**
 * メートル → km（小数1桁）。散歩ルート・散歩記録の距離表示で共通に使う
 * （元は `features/walk/lib/walkRoute.ts`。SS-20 で `features/history` からも使うため
 * `src/lib` へ昇格した）。
 */
export function toKilometers(meters: number): number {
  return Math.round(toNonNegative(meters) / 100) / 10;
}
