import { create } from "zustand";

import { runSessionCleanup } from "@/lib/sessionCleanup";
// `AuthUser` は型のみ import する。`@/services/auth`（バレル）を実行時 import すると、
// `getAuthMode()` の結果次第で `expo-secure-store` / `react-native-nitro-google-signin` に
// 到達し、node 環境の vitest（このストアのテスト）が壊れる。`import type` はトランスパイルで
// 消えるため安全（SS-13 / ADR-009）。
import type { AuthUser } from "@/services/auth/types";

/**
 * 認証セッションの状態。
 * - loading: 起動時のセッション復元中。まだ「認証済み/未認証」を判定してはいけない。
 * - authenticated: 自前セッショントークンを保持している。
 * - guest: トークン非保持（＝未認証）。ADR-002 決定6 の「ゲスト」はこの状態を指す。
 *          MVP ではゲートで弾く（将来のゲスト散歩ではこの状態のまま探索を許可する）。
 */
export type AuthSessionStatus = "loading" | "authenticated" | "guest";

/** 復元が終わった後の状態（loading を含まない）。遷移先の判定はこれだけを受け取る。 */
export type ResolvedAuthSessionStatus = Exclude<AuthSessionStatus, "loading">;

type AuthSessionState = {
  status: AuthSessionStatus;
  /** 認証済みのときのユーザー。guest / loading では null。 */
  user: AuthUser | null;
  /** サービス層の通知・起動時復元の結果を反映する唯一のアクション。 */
  setSession: (user: AuthUser | null) => void;
};

/**
 * アプリ全体で唯一の「認証セッション状態」の置き場（SS-13 / ADR-009）。
 *
 * UI（features / app）はここだけを見る。`authService.getCurrentUser()` を直接呼ばない。
 * ゲスト＝トークン非保持（ADR-002 決定6）であり、`AuthService` のメソッドとしては表現しない。
 *
 * 書き込み経路は次の2つだけ:
 * 1. `services/auth/index.ts` が `onSessionChange` として配線するコールバック
 *    （サインイン/サインアウト/401→refresh失敗のすべてがここを通る）。
 * 2. `features/auth/hooks/useAuthSessionBootstrap.ts`（起動時のセッション復元）。
 *
 * **不変条件**: `status === "authenticated"` ⟺ `user !== null`。
 *              `status === "guest"` ⟺ `user === null`。
 *
 * **このストア自身を `registerSessionCleanup()` に登録してはいけない**。
 * このストアは「クリアされる側のデータ」ではなく「セッション状態そのもの」であり、
 * `loading` に戻すと `AuthGate` がスプラッシュへ送り返してしまう
 * （`runSessionCleanup()` はこのストアの `setSession(null)` から呼ばれる側であって、
 * 呼ばれる対象に含めてはいけない）。
 *
 * 永続化はしない（`persist` ミドルウェアを使わない）。永続化されているのは refresh token だけで、
 * それは `services/auth/tokenStore.secure.ts` の責務。
 */
export const useAuthSessionStore = create<AuthSessionState>((set, get) => ({
  status: "loading",
  user: null,
  setSession: (user) => {
    const previous = get().status;
    set({ status: user === null ? "guest" : "authenticated", user });
    // authenticated → guest（サインアウト / refresh token 失効）でだけ後始末する。
    // loading → guest（起動時に復元できなかった）では走らせない（消すものが無く、
    // Query キャッシュを無意味に捨てるだけになるため）。
    if (previous === "authenticated" && user === null) {
      runSessionCleanup();
    }
  },
}));
