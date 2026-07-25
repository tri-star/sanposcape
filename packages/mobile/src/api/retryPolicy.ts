/** 「401 のとき refresh してリトライするか」の判定を純粋関数にする。 */
export type RetryDecisionInput = {
  status: number;
  /** 最初のリクエストで Bearer を送っていたか。 */
  hadToken: boolean;
  /** すでに1回リトライ済みか。 */
  alreadyRetried: boolean;
};

/** 401 かつ トークン送信済み かつ 未リトライ のときだけ true。 */
export function shouldRefreshAndRetry(input: RetryDecisionInput): boolean {
  return input.status === 401 && input.hadToken && !input.alreadyRetried;
}
