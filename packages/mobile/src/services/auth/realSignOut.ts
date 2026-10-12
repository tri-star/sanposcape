/**
 * real のサインアウト時の後始末（`createSessionAuthService` の `onSignOut` に渡す）。
 * Google のネイティブセッション破棄と、保留中の Apple の氏名（個人情報）の消去を両方試み、
 * どちらの失敗も握りつぶして他方を止めない。アカウント削除成功後のセッション破棄も
 * `authService.signOut()` を経由するので、ここで一緒に消える。
 * ネイティブには触れない（すべて DI）。
 */
export function createRealSignOutHandler(deps: {
  signOutFromGoogle: () => Promise<void>;
  clearPendingAppleDisplayName: () => Promise<void>;
}): () => Promise<void> {
  return async () => {
    // async 関数で包み、同期 throw も reject として扱う。
    await Promise.allSettled([
      (async () => deps.signOutFromGoogle())(),
      (async () => deps.clearPendingAppleDisplayName())(),
    ]);
  };
}
