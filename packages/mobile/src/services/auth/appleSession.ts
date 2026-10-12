import { isApiError } from "@/api/apiError";
import { sanitizeAppleDisplayName } from "@/services/auth/appleDisplayName";
import type { AppleNonce } from "@/services/auth/appleNonce";
import type { AuthApi } from "@/services/auth/authApi";
import type {
  AppleCredential,
  PendingAppleDisplayName,
  PendingAppleDisplayNameStore,
} from "@/services/auth/types";

export type AppleSessionIssuerDeps = {
  createNonce: () => Promise<AppleNonce>;
  /** Apple のシートを出して資格情報を得る。キャンセルは CodedError("ERR_REQUEST_CANCELED") のまま投げてよい。 */
  requestCredential: (hashedNonce: string) => Promise<AppleCredential>;
  pendingDisplayName: PendingAppleDisplayNameStore;
  api: Pick<AuthApi, "createSession">;
};

/**
 * Apple でのサインイン手順（nonce → Apple のシート → 氏名の保持 → /auth/session → 保持した氏名の破棄）。
 * `createSessionAuthService` の `issueSession` に渡す関数を返す。ネイティブには触れない（すべて DI）。
 * 戻り値は `/auth/session` の生レスポンス（検証と camelCase 化は呼び出し側の toSession が行う）。
 *
 * 秘密（identity token・authorization code・raw nonce・氏名）はログに出さない。
 */
export function createAppleSessionIssuer(deps: AppleSessionIssuerDeps): () => Promise<unknown> {
  const { createNonce, requestCredential, pendingDisplayName, api } = deps;

  async function loadPending(): Promise<PendingAppleDisplayName | null> {
    try {
      return await pendingDisplayName.load();
    } catch {
      return null;
    }
  }

  return async () => {
    const nonce = await createNonce();
    // キャンセルなどの例外はそのまま投げる。ここで失敗したら保持中の氏名には触らない。
    const credential = await requestCredential(nonce.hashed);

    const freshName = sanitizeAppleDisplayName(credential.displayName);
    if (freshName !== null) {
      // Apple が氏名を返すのは初回だけ。送信が失敗しても失わないよう、送る前に保持する。
      try {
        await pendingDisplayName.save({
          appleUserId: credential.user,
          displayName: freshName,
        });
      } catch {
        // 保存できなくても、このリクエストでは送れる。
      }
    }

    const pending = await loadPending();
    // Apple のユーザー識別子が一致するときだけ再送する（別の Apple ID に前の人の氏名を書き込まない）。
    const pendingForThisUser = pending?.appleUserId === credential.user ? pending : null;
    const displayName = freshName ?? pendingForThisUser?.displayName ?? null;

    const send = (name: string | null) =>
      api.createSession({
        provider: "apple",
        idToken: credential.identityToken,
        nonce: nonce.raw,
        // 毎回のサインインで送る（backend が毎回交換して上書きし、交換失敗ユーザーも自己回復する）。
        authorizationCode: credential.authorizationCode,
        displayName: name ?? undefined,
      });

    // 保持中の氏名がこの Apple ユーザーのものか（別ユーザーの保持分には触れない）。
    const ownsPending = freshName !== null || pendingForThisUser !== null;
    const clearOwnedPending = async () => {
      if (!ownsPending) return;
      try {
        await pendingDisplayName.clear();
      } catch {
        // 握りつぶす（サインインの結果は変えない）。
      }
    };

    let response: unknown;
    try {
      response = await send(displayName);
    } catch (error) {
      if (displayName !== null && isApiError(error) && error.status === 422) {
        // 氏名が弾かれ続けると保持 → 再送 → 422 を繰り返し、その Apple ID でサインインできなくなる。
        // 422 はハンドラ前の検証で返るので code は消費されておらず、nonce 検証は状態を持たない。
        // 同じ token / code / nonce で、氏名を外して1回だけ再送する。
        await clearOwnedPending();
        return send(null);
      }
      throw error;
    }

    // 200 の時点で氏名は保存済み（または保存不要）なので消してよい。
    await clearOwnedPending();
    return response;
  };
}
