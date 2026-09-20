import { useAppConfigBootstrap } from "@/hooks/useAppConfigBootstrap";

/**
 * UI を持たない配線コンポーネント。`useAppConfigBootstrap()` を1回だけ呼ぶ。
 *
 * コンポーネントにしている理由: hook は `QueryClientProvider` の**内側**でしか使えないが、
 * `app/_layout.tsx` の `RootLayout` 本体は Provider の外側にあるため、
 * hook を直接呼べない（`AuthGate` が `useAuthSessionBootstrap()` を持つのと同じ理由）。
 *
 * `null` を返す。`<Stack>` を包まないこと（children を条件付きで差し替えると
 * ナビゲータが再生成される。`AuthGate` の JSDoc 参照）。
 */
export function AppConfigBootstrap(): null {
  useAppConfigBootstrap();
  return null;
}
