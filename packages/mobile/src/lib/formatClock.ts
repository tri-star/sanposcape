/**
 * 経過秒数を `HH:MM:SS` 形式の文字列に整形する純粋関数。
 * 散歩中/散歩終了サマリなど、ストップウォッチ表示で共通して使う（mock の `fmt`）。
 */
export function formatClock(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) {
    throw new Error("totalSec must be a non-negative finite number");
  }
  const sec = Math.floor(totalSec);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
