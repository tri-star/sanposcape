import { useQuery } from "@tanstack/react-query";

import { fetchPinMoveTargets } from "@/features/sanpo-map/pin/api/pinEditApi";
import type { UseSanpoMapsResult } from "@/features/sanpo-map/map/hooks/useSanpoMaps";
import type { PinEditBaseline, PinEditDraft } from "@/features/sanpo-map/pin/lib/pinEditDraft";
import {
  filterMovablePinEditSanpoMaps,
  resolveBlockedPinMoveTargetIds,
  resolveDraftSanpoMapReset,
  resolveEffectivePinEditSanpoMapId,
  resolvePinEditSanpoMapChoices,
} from "@/features/sanpo-map/pin/lib/pinEditSanpoMap";
import type { SanpoMapChoicesState } from "@/features/sanpo-map/pin/lib/sanpoMapChoices";
import { pinMoveTargetsQueryKey } from "@/features/sanpo-map/shared/lib/pinQueryKeys";

const MOVE_TARGETS_STALE_TIME_MS = 60_000;

export type UsePinEditSanpoMapOptions = {
  pinId: string | null;
  isSignedIn: boolean;
  sanpoMapsQuery: UseSanpoMapsResult;
  /** 地図を変える権限があるか（権限が分かるまでは false）。 */
  canChangeSanpoMap: boolean;
  /** null = まだ詳細が取れていない。 */
  baseline: PinEditBaseline | null;
  draft: PinEditDraft;
  /** 下書きの地図を基準値へ戻すときに使う（保存エラーの表示は消さない）。 */
  setDraft: (draft: PinEditDraft) => void;
};

export type UsePinEditSanpoMapResult = {
  /** 実際に送る移動先。null = まだ基準値が無い。 */
  effectiveSanpoMapId: string | null;
  /** 地図を `effectiveSanpoMapId` に置き換えた下書き（差分・保存に使う）。 */
  effectiveDraft: PinEditDraft;
  /** 移せない地図（選んでも下書きを変えない。SS-192）。 */
  blockedSanpoMapIds: ReadonlySet<string>;
  /** 「地図」欄の選択肢（SS-175）。 */
  choices: SanpoMapChoicesState;
};

/**
 * ピン編集の「地図」欄（移動先）の状態（SS-175・SS-192）。移動先の候補の取得、移せない地図の除外、
 * 一覧から消えた地図を選んでいた下書きの基準値への戻し、選択肢の組み立てを持つ。判定は `pinEditSanpoMap` に委ねる。
 */
export function usePinEditSanpoMap(options: UsePinEditSanpoMapOptions): UsePinEditSanpoMapResult {
  const { baseline, draft, sanpoMapsQuery, canChangeSanpoMap } = options;

  // 移動先の候補（SS-192）。地図を変えられる人だけが取る。取得中・失敗（古い backend の 404 を含む）は
  // null（不明）で、今までどおり全地図を選べる（保存の 403 move_target_missing_members が守る）。
  const moveTargetsQuery = useQuery({
    queryKey: pinMoveTargetsQueryKey(options.pinId ?? ""),
    queryFn: ({ signal }) => fetchPinMoveTargets(options.pinId as string, { signal }),
    enabled: options.isSignedIn && options.pinId !== null && canChangeSanpoMap,
    staleTime: MOVE_TARGETS_STALE_TIME_MS,
    // GET の一時障害の再送は customFetch の transientRetry が既に行う。
    retry: false,
  });
  const moveTargets = canChangeSanpoMap ? (moveTargetsQuery.data ?? null) : null;
  // 移せない地図は「一覧に無い地図」と同じ扱いにし、選んでいた下書きを今の地図に戻す（SS-192）。
  const blockedSanpoMapIds = resolveBlockedPinMoveTargetIds(moveTargets);
  const movableMaps = filterMovablePinEditSanpoMaps(sanpoMapsQuery.maps, blockedSanpoMapIds);

  // 実際に送る移動先。一覧から消えた地図・移せない地図・一覧が未取得のときは今の地図に戻す（SS-175・SS-192）。
  const effectiveSanpoMapId =
    baseline === null
      ? null
      : resolveEffectivePinEditSanpoMapId({
          status: sanpoMapsQuery.status,
          maps: movableMaps,
          baselineSanpoMapId: baseline.sanpoMapId,
          draftSanpoMapId: draft.sanpoMapId,
        });
  // 下書きの地図が一覧から消えていたら（sanpo_map_not_found で取り直した結果など）基準値へ戻す。
  // 戻さないと、他項目を変えた保存で地図の差分が黙って落ちる（M2）。エラー行は消さない
  // （resetError を通さない）ので「地図を選び直してください」の案内が残る。
  const draftSanpoMapReset =
    baseline === null
      ? null
      : resolveDraftSanpoMapReset({
          status: sanpoMapsQuery.status,
          maps: movableMaps,
          baselineSanpoMapId: baseline.sanpoMapId,
          draftSanpoMapId: draft.sanpoMapId,
        });
  if (draftSanpoMapReset !== null) {
    options.setDraft({ ...draft, sanpoMapId: draftSanpoMapReset });
  }
  const effectiveDraft: PinEditDraft =
    effectiveSanpoMapId === null ? draft : { ...draft, sanpoMapId: effectiveSanpoMapId };

  const choices =
    baseline === null
      ? resolvePinEditSanpoMapChoices({
          status: "loading",
          maps: [],
          current: { id: "", name: "" },
          selectedSanpoMapId: "",
          canChange: false,
        })
      : resolvePinEditSanpoMapChoices({
          status: sanpoMapsQuery.status,
          maps: sanpoMapsQuery.maps,
          current: { id: baseline.sanpoMapId, name: baseline.sanpoMapName },
          selectedSanpoMapId: effectiveDraft.sanpoMapId,
          canChange: canChangeSanpoMap,
          moveTargets,
        });

  return { effectiveSanpoMapId, effectiveDraft, blockedSanpoMapIds, choices };
}
