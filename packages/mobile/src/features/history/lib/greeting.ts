/**
 * 記録画面ヘッダのあいさつ文。
 * mock（docs/mock/ウォーキングコース検索アプリ.dc.html）の「田中さん、今日も歩きましょう」を再現する。
 * 表示名が無い（未サインイン・Google が name を返さない・空白のみ）場合は名前部分を落とす。
 */
export function buildHistoryGreeting(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim() ?? "";
  if (trimmed === "") {
    return "今日も歩きましょう";
  }

  const nameWithHonorific = trimmed.endsWith("さん") ? trimmed : `${trimmed}さん`;
  return `${nameWithHonorific}、今日も歩きましょう`;
}
