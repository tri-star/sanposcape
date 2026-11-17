export type QueryLoadStatus = "loading" | "ready" | "error";

/**
 * TanStack Query の状態から画面用の読み込み状態を決める（SS-121）。
 * 表示できるデータがあるなら、再取得の失敗では画面を error にしない（表示中の一覧を消さない）。
 * error になるのは「データが無いまま失敗した」ときだけ。
 */
export function resolveQueryLoadStatus(input: {
  isPending: boolean;
  isError: boolean;
  hasData: boolean;
}): QueryLoadStatus {
  if (input.hasData) return "ready";
  if (input.isError) return "error";
  if (input.isPending) return "loading";
  return "ready";
}
