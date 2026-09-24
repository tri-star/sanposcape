import { QueryClient } from "@tanstack/react-query";

import { isAppConfigQueryKey } from "@/api/appConfigQueryKey";
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
//
// `/app-config` はユーザー非依存（ADR-008 追補 D2 でダークローンチ＝ユーザー条件付きフラグを
// 不採用としたため、未認証でも認証後でも応答は同じ）。`clear()` で巻き込むと、
// サインアウト直後に「フラグ不明 = 全 OFF」へ落ちる窓ができ、公開済みの機能が一瞬消える。
// クリアの目的（共有端末で前のユーザーのサーバー由来データを残さない。ADR-009 決定6）に
// 照らしても、ユーザーに紐づかない公開設定を消す理由が無い（詳細は ADR-009 の SS-100 追補）。
registerSessionCleanup(() => {
  queryClient.removeQueries({ predicate: (query) => !isAppConfigQueryKey(query.queryKey) });
  // `clear()` はミューテーションキャッシュも消していたため、その挙動は維持する。
  queryClient.getMutationCache().clear();
});
