import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
} from "react-native-nitro-google-signin";

import { getGoogleIosClientId, getGoogleWebClientId } from "@/config/authEnv";
import { AuthError } from "@/services/auth/authError";

/**
 * ネイティブ Google SDK に触れる唯一のファイル。
 * ロジックは `authError.ts` / `createSessionAuthService.ts` 側に寄せてあるため、
 * ここは薄い変換のみに保つ。このファイルはテストしない（ネイティブ依存のため）。
 */

let configured = false;

/**
 * 設定不備（webClientId 未設定）を記録しておき、実際にサインインが試みられた時点で報告する。
 * `configureGoogleSignIn()` は `app/_layout.tsx` のモジュールスコープ（React外・エラーバウンダリ不可）
 * から呼ばれるため、ここで同期 throw すると設定不備のある production ビルドで
 * UIが1フレームも描画される前に全ユーザーがクラッシュしてしまう。
 * `useAuthActions` は `AuthError("configuration")` を専用メッセージへ振り分けるため、
 * 起動を止めなくても診断可能性は失われない。
 */
let configError: AuthError | null = null;

/** アプリ起動時に1回だけ呼ぶ（冪等）。設定不備があっても起動は止めない。 */
export function configureGoogleSignIn(): void {
  if (configured) {
    return;
  }
  configured = true;

  const webClientId = getGoogleWebClientId();
  if (!webClientId) {
    // 起動は止めない。実際にサインインを試みた時点で signInWithGoogle() が報告する。
    configError = new AuthError("configuration", "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set");
    return;
  }

  // google-services.json / GoogleService-Info.plist は使わないため autoDetect は使えない。
  GoogleOneTapSignIn.configure({
    webClientId,
    iosClientId: getGoogleIosClientId(),
  });
}

/** Google のサインインフローを実行し ID token を返す。キャンセルは AuthError("cancelled")。 */
export async function signInWithGoogle(): Promise<string> {
  if (configError) {
    throw configError;
  }

  await GoogleOneTapSignIn.checkPlayServices(); // Android のみ意味を持つ

  let response = await GoogleOneTapSignIn.signIn(); // 保存済み資格情報でのサイレント/One Tap

  if (isNoSavedCredentialFoundResponse(response)) {
    response = await GoogleOneTapSignIn.createAccount(); // 新規アカウント選択
  }
  if (isNoSavedCredentialFoundResponse(response)) {
    response = await GoogleOneTapSignIn.presentExplicitSignIn(); // 明示的なサインインUI
  }

  if (isCancelledResponse(response)) {
    throw new AuthError("cancelled");
  }

  if (!isSuccessResponse(response)) {
    // カスケードを抜けても success でない場合も cancelled 扱いにする。
    throw new AuthError("cancelled");
  }

  // response.data.user は使わない。表示名などは backend が ID token から取り出して返す値
  // （/auth/session のレスポンス）を正とする（クライアントの自己申告を信用しない）。
  return response.data.idToken;
}

/** ネイティブ側の Google セッションを破棄する。 */
export async function signOutFromGoogle(): Promise<void> {
  await GoogleOneTapSignIn.signOut();
}
