import { describeError } from "@/lib/diagnosticLog";
import type { AuthErrorCode, AuthProvider } from "@/services/auth";

/** サインインの失敗のログに使う AuthError の部分（呼び出し側が `isAuthError` で絞り込んで渡す）。 */
type SignInFailureAuthError = { code: AuthErrorCode; message: string; cause?: unknown };

/**
 * サインインの失敗を `logDiagnostic("auth.sign-in.failed", …)` に載せる内容を作る（純粋。SS-82）。
 *
 * 載せるのは provider・分類したコード・AuthError の message（推定した SDK のコード、キャンセルならどの段で返ったか）・
 * 元の例外の name と message の1行目だけ。**トークン・メールアドレス・氏名は載せない**:
 * `ApiError` の `body`（`/auth/session` の応答はトークンとメールアドレスを含みうる）や SDK の応答は渡さない。
 * message の1行目だけにするのは、Android の SDK の例外がスタックトレース付きで来るため（ADR-002 SS-82 追補）。
 */
export function buildSignInFailureLogDetail(input: {
  provider: AuthProvider;
  authError: SignInFailureAuthError | null;
  error: unknown;
}): Record<string, unknown> {
  const { provider, authError } = input;
  const { errorName, errorMessage } = describeError(authError?.cause ?? input.error);
  return {
    provider,
    code: authError?.code ?? null,
    message: authError === null ? null : firstLine(authError.message),
    errorName,
    errorMessage: firstLine(errorMessage),
  };
}

function firstLine(message: string): string {
  const index = message.indexOf("\n");
  return index === -1 ? message : message.slice(0, index);
}
