import { authServiceReal } from "@/services/auth/auth.real";
import { authServiceStub } from "@/services/auth/auth.stub";
import type { AuthService } from "@/services/auth/types";

export type { AuthMethod, AuthService } from "@/services/auth/types";

/**
 * real / stub の選択。
 * 実 OAuth の実装が別タスクのため、既定は stub。`EXPO_PUBLIC_USE_AUTH_STUB=false` を
 * 明示したときのみ real を使う（real は未実装のため、指定しても throw する）。
 */
const useStub = process.env.EXPO_PUBLIC_USE_AUTH_STUB !== "false";

export const authService: AuthService = useStub ? authServiceStub : authServiceReal;
