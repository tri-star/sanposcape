import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";

import { hasAnyNameComponent, joinNameComponents } from "@/services/auth/appleDisplayName";
import { AuthError } from "@/services/auth/authError";
import type { AppleCredential } from "@/services/auth/types";

/**
 * expo-apple-authentication に触れる唯一のファイル（`googleSignIn.ts` と同じく薄い変換だけ。テストしない）。
 * Apple のサインインシートを出し、backend へ送る資格情報を返す。
 * キャンセルは CodedError("ERR_REQUEST_CANCELED") のまま投げる（`toAuthError` が cancelled に分類する）。
 *
 * - `signOutAsync` は使わない（サインインのシートが出るため。Expo も使わずアプリ側のデータを消すことを推奨）。
 * - `credential.email` は使わない（メールは backend が ID token から取り出す。端末の自己申告を信用しない）。
 */
export async function requestAppleCredential(hashedNonce: string): Promise<AppleCredential> {
  if (Platform.OS !== "ios") {
    // UI は iOS 以外でボタンを出さないので、ここに来るのは設計違反のとき。
    throw new AuthError("configuration", "Sign in with Apple is only available on iOS");
  }

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  // signInAsync は3つのどれかが欠けると自身で ERR_REQUEST_FAILED を投げる。型の都合の確認だけ行う。
  const { user, identityToken, authorizationCode, fullName } = credential;
  if (!user || identityToken === null || authorizationCode === null) {
    throw new AuthError("unknown", "Apple credential is incomplete");
  }

  let displayName: string | null = null;
  if (fullName !== null && hasAnyNameComponent(fullName)) {
    try {
      displayName = AppleAuthentication.formatFullName(fullName);
    } catch {
      displayName = joinNameComponents(fullName);
    }
  }

  // 氏名のサニタイズはここではしない（appleSession.ts の責務）。
  return { user, identityToken, authorizationCode, displayName };
}
