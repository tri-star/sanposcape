import { QueryClient } from "@tanstack/react-query";

import { registerSessionCleanup } from "@/lib/sessionCleanup";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

// サインアウト時にキャッシュ済みのサーバー由来データ（散歩履歴等）を残さない。
// 共有端末でアカウントを切り替えたときに、前のユーザーのキャッシュが一瞬でも
// 画面に出てしまう事故を防ぐ（`@/lib/sessionCleanup` に登録）。
registerSessionCleanup(() => queryClient.clear());
