import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import {
  createSanpoMapInvitation,
  fetchSanpoMapInvitations,
  revokeSanpoMapInvitation,
} from "@/features/pin/api/invitationApi";
import { toInvitationErrorCode, type InvitationErrorCode } from "@/features/pin/lib/invitation";
import { sanpoMapInvitationsQueryKey } from "@/features/pin/lib/pinQueryKeys";
import { resolveQueryLoadStatus, type QueryLoadStatus } from "@/features/pin/lib/queryLoadStatus";
import type { SanpoMapInvitation, SanpoMapInvitationCreated } from "@/features/pin/types";

const EMPTY: SanpoMapInvitation[] = [];

export type UseSanpoMapInvitationsResult = {
  invitations: SanpoMapInvitation[];
  status: QueryLoadStatus;
  retry: () => void;
  /** 発行する。成功したら `onCreated` に URL を渡す（共有シートは呼び出し側で開く）。 */
  create: () => void;
  creating: boolean;
  createErrorCode: InvitationErrorCode | null;
  resetCreate: () => void;
  /** 取り消す。実行中は何もしない。 */
  revoke: (invitationId: string) => void;
  revokingId: string | null;
};

/**
 * 地図の有効な招待リンク（owner。SS-250）の一覧と、発行・取り消しの mutation。
 * 発行・取り消しの成功で一覧を取り直す。発行は自動再試行しない（上限を数えるため）。
 */
export function useSanpoMapInvitations(
  sanpoMapId: string | null,
  options: { enabled: boolean; onCreated: (created: SanpoMapInvitationCreated) => void },
): UseSanpoMapInvitationsResult {
  const queryClient = useQueryClient();
  const enabled = options.enabled && sanpoMapId !== null;
  const onCreatedRef = useRef(options.onCreated);
  onCreatedRef.current = options.onCreated;
  // 連打で発行が2本飛ばないよう、同期的に立てるラッチ（上限の枠を無駄に使わないため）。
  const creatingRef = useRef(false);

  const query = useQuery({
    queryKey: sanpoMapInvitationsQueryKey(sanpoMapId ?? ""),
    queryFn: ({ signal }) => fetchSanpoMapInvitations(sanpoMapId as string, { signal }),
    enabled,
    staleTime: 30_000,
    retry: false,
  });

  const invalidate = useCallback(() => {
    if (sanpoMapId === null) return;
    void queryClient.invalidateQueries({ queryKey: sanpoMapInvitationsQueryKey(sanpoMapId) });
  }, [queryClient, sanpoMapId]);

  const createMutation = useMutation({
    mutationFn: () => createSanpoMapInvitation(sanpoMapId ?? ""),
    onSuccess: (created) => {
      invalidate();
      onCreatedRef.current(created);
    },
    onError: invalidate,
    onSettled: () => {
      creatingRef.current = false;
    },
    retry: false,
  });

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) =>
      revokeSanpoMapInvitation({ sanpoMapId: sanpoMapId ?? "", invitationId }),
    onSettled: invalidate,
    retry: false,
  });

  const { refetch } = query;
  const { mutate: mutateCreate, reset: resetCreate } = createMutation;
  const { mutate: mutateRevoke } = revokeMutation;

  const create = useCallback(() => {
    if (sanpoMapId === null || creatingRef.current) return;
    creatingRef.current = true;
    mutateCreate();
  }, [sanpoMapId, mutateCreate]);

  const revoke = useCallback(
    (invitationId: string) => {
      if (sanpoMapId === null || revokeMutation.isPending) return;
      mutateRevoke(invitationId);
    },
    [sanpoMapId, mutateRevoke, revokeMutation.isPending],
  );

  return {
    invitations: query.data ?? EMPTY,
    status: enabled
      ? resolveQueryLoadStatus({
          isPending: query.isPending,
          isError: query.isError,
          hasData: query.data !== undefined,
        })
      : "ready",
    retry: () => void refetch(),
    create,
    creating: createMutation.isPending,
    createErrorCode: createMutation.isError ? toInvitationErrorCode(createMutation.error) : null,
    resetCreate,
    revoke,
    revokingId: revokeMutation.isPending ? (revokeMutation.variables ?? null) : null,
  };
}
