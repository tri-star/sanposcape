import type { AuthSessionStatus } from "@/store/useAuthSessionStore";

/**
 * `SettingsView` が出す3つの節。`AuthSessionStatus`（`"loading" | "authenticated" | "guest"`）と
 * 1:1 対応するが、あえて別の型として持つことで「View 側は3値のうちどれかで分岐する」ことを
 * 型で強制する（`status === "authenticated"` の boolean へ潰すと `loading` と `guest` の区別が
 * 消え、セッション復元中に一瞬サインイン導線が出てしまう。PR #50 Copilot レビュー指摘）。
 */
export type SettingsSectionKind = "loading" | "authenticated" | "guest";

/**
 * 認証セッションの `status` から、設定画面に出す節を決める（純粋関数）。
 * `default` 節で `never` チェックをかけているため、`AuthSessionStatus` に値が増えたときは
 * ここが型エラーになって気づける。
 */
export function resolveSettingsSection(status: AuthSessionStatus): SettingsSectionKind {
  switch (status) {
    case "loading":
      return "loading";
    case "authenticated":
      return "authenticated";
    case "guest":
      return "guest";
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}

/**
 * アカウント削除の導線を出してよい節か。
 * - authenticated: 出す。
 * - guest: 出さない。トークン非保持＝削除するアカウントが特定できず、押しても
 *   `DELETE /users/me` が 401 になるだけ（「押せるのに必ず失敗する」導線を作らない。ログアウトを
 *   guest に出さないのと同じ判断＝ ADR-009 SS-57 追補）。
 * - loading: 出さない。セッション復元中はまだ authenticated/guest を判定してはいけない
 *   （PR #50 Copilot 指摘）。破壊的操作なので「復元完了前に一瞬出る」を特に避ける。
 *
 * `.tsx` に条件を書かずここに置くのは、この repo の Vitest ではコンポーネントのレンダリング
 * テストが書けないため（`docs/architecture-guideline.md`）。`canDeleteWalk`（history）と同じ手法。
 */
export function canDeleteAccount(section: SettingsSectionKind): boolean {
  return section === "authenticated";
}
