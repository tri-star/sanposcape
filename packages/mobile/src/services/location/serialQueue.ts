/**
 * 渡した非同期処理を到着順に1つずつ実行するキュー。前の処理が失敗しても次は実行する。
 *
 * 背景記録の開始と停止を直列化するために使う。例えば「起動時の停止」が遅れて解決し、
 * 直後に始めた散歩の記録を止めてしまう、という競合を防ぐ（ADR-M-018）。
 */
export function createSerialQueue(): <T>(operation: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = tail.then(operation, operation);
    tail = run.catch(() => undefined);
    return run;
  };
}
