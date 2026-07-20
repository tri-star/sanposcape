/**
 * 分数を「◯時間◯分」形式の日本語文字列に整形する純粋関数。
 * 散歩の所要時間表示などで利用する（ロジックは Vitest でテスト可能に保つ）。
 */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error("minutes must be a non-negative finite number");
  }
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (hours === 0) return `${mins}分`;
  if (mins === 0) return `${hours}時間`;
  return `${hours}時間${mins}分`;
}
