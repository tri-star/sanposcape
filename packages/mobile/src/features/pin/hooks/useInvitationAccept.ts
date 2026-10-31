import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { acceptInvitation, fetchInvitationPreview } from "@/features/pin/api/invitationApi";
import { toInvitationErrorCode, type InvitationErrorCode } from "@/features/pin/lib/invitation";
import {
  PINS_QUERY_ROOT,
  SANPO_MAPS_QUERY_KEY,
  invitationPreviewQueryKey,
} from "@/features/pin/lib/pinQueryKeys";
import type { InvitationPreview, SanpoMap } from "@/features/pin/types";

export type UseInvitationAcceptResult = {
  preview: InvitationPreview | null;
  previewStatus: "loading" | "ready" | "error";
  previewErrorCode: InvitationErrorCode | null;
  retryPreview: () => void;
  accept: () => void;
  accepting: boolean;
  acceptErrorCode: InvitationErrorCode | null;
};

/**
 * 招待の受諾画面（SS-250）のサーバー状態。preview を取り、「参加する」で受諾する。
 * トークンはメモリ（ルートパラメータとクエリのキー）にだけ置く。preview は自動では取り直さない（期限切れの判定は
 * 受諾のときに backend が行う）。受諾に成功したら地図一覧・ピンを取り直してから `onAccepted` を呼ぶ。
 */
export function useInvitationAccept(
  token: string | null,
  options: { signedIn: boolean; onAccepted: (sanpoMap: SanpoMap) => void },
): UseInvitationAcceptResult {
  const queryClient = useQueryClient();
  const onAcceptedRef = useRef(options.onAccepted);
  onAcceptedRef.current = options.onAccepted;
  const acceptingRef = useRef(false);

  const query = useQuery({
    queryKey: invitationPreviewQueryKey(token ?? "", options.signedIn),
    queryFn: ({ signal }) => fetchInvitationPreview(token as string, { signal }),
    enabled: token !== null,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () => acceptInvitation(token ?? ""),
    onSuccess: async (sanpoMap) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: PINS_QUERY_ROOT }),
      ]);
      onAcceptedRef.current(sanpoMap);
    },
    onSettled: () => {
      acceptingRef.current = false;
    },
    retry: false,
  });

  const { refetch } = query;
  const { mutate } = mutation;
  const accept = useCallback(() => {
    if (token === null || acceptingRef.current) return;
    acceptingRef.current = true;
    mutate();
  }, [token, mutate]);

  const previewStatus =
    query.data !== undefined ? "ready" : query.isError || token === null ? "error" : "loading";

  return {
    preview: query.data ?? null,
    previewStatus,
    previewErrorCode:
      token === null ? "not_found" : query.isError ? toInvitationErrorCode(query.error) : null,
    retryPreview: () => void refetch(),
    accept,
    accepting: mutation.isPending,
    acceptErrorCode: mutation.isError ? toInvitationErrorCode(mutation.error) : null,
  };
}
