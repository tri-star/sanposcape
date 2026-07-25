/**
 * 同一の非同期処理が同時に呼ばれた場合、実行中の Promise を共有する（single-flight）。
 * 完了（成功・失敗どちらでも）後の呼び出しは新しく実行される。
 * 認証以外（例: 位置情報の権限要求）でも使える機能非依存の汎用ユーティリティ。
 */
export function createSingleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return () => {
    if (inFlight) {
      return inFlight;
    }

    // fn() が同期的に throw した場合も inFlight を残さないよう Promise.resolve().then で包む。
    inFlight = Promise.resolve()
      .then(fn)
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
}
