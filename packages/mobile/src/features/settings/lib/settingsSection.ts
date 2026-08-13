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
