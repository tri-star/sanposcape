import type { SanpoMapChoice, SanpoMapChoicesState } from "@/features/pin/lib/sanpoMapChoices";
import { DEFAULT_SANPO_MAP_ICON } from "@/features/pin/lib/sanpoMapIcon";
import type { SanpoMap } from "@/features/pin/types";

/**
 * ピン編集画面の「地図」欄の判定・文言（SS-175）。
 * 登録画面の `resolveSanpoMapChoices` は「既定地図＝`sanpo_map_id` を送らない」「最初の地図の draft」
 * という登録固有の前提を持つので流用せず、編集専用にここへ集める。
 */
export const PIN_EDIT_SANPO_MAP_TITLE = "地図";
export const PIN_EDIT_SANPO_MAP_LOCKED_HELPER =
  "地図を変更できるのは、ピンを作った人と地図の持ち主だけです";

const LOADING_HELPER = "地図を読み込んでいます…";
const ERROR_HELPER = "地図の一覧を取得できませんでした。地図を変更するには再読み込みしてください。";

/**
 * 実際に送る移動先。次のときは基準値（今の地図）に戻す:
 * - 下書きが基準値と同じ
 * - 一覧が ready でない（loading / error。移動先を確かめられない）
 * - 下書きの地図が一覧に無い（削除された・メンバーでなくなった）
 */
export function resolveEffectivePinEditSanpoMapId(input: {
  status: "loading" | "ready" | "error";
  maps: readonly Pick<SanpoMap, "id">[];
  baselineSanpoMapId: string;
  draftSanpoMapId: string;
}): string {
  if (input.draftSanpoMapId === input.baselineSanpoMapId) return input.baselineSanpoMapId;
  if (input.status !== "ready") return input.baselineSanpoMapId;
  return input.maps.some((map) => map.id === input.draftSanpoMapId)
    ? input.draftSanpoMapId
    : input.baselineSanpoMapId;
}

/**
 * 「地図」欄の状態。
 * - loading: チップ無し・読み込み文言
 * - error: 今の地図だけを選択済みで出す
 * - ready: 一覧の順（backend の並び）で全地図。今の地図が一覧に無ければ先頭に足す
 */
export function resolvePinEditSanpoMapChoices(input: {
  status: "loading" | "ready" | "error";
  maps: readonly SanpoMap[];
  current: { id: string; name: string };
  selectedSanpoMapId: string;
  canChange: boolean;
}): SanpoMapChoicesState {
  if (input.status === "loading") {
    return { status: "loading", choices: [], helper: LOADING_HELPER };
  }

  const toChoice = (
    id: string,
    label: string,
    icon: SanpoMapChoice["icon"],
    selected: boolean,
  ): SanpoMapChoice => ({
    key: id,
    label,
    icon,
    isDraft: false,
    selected,
    selection: { kind: "existing", sanpoMapId: id },
  });

  if (input.status === "error") {
    return {
      status: "error",
      choices: [toChoice(input.current.id, input.current.name, DEFAULT_SANPO_MAP_ICON, true)],
      helper: ERROR_HELPER,
    };
  }

  const choices: SanpoMapChoice[] = [];
  if (!input.maps.some((map) => map.id === input.current.id)) {
    choices.push(
      toChoice(
        input.current.id,
        input.current.name,
        DEFAULT_SANPO_MAP_ICON,
        input.selectedSanpoMapId === input.current.id,
      ),
    );
  }
  for (const map of input.maps) {
    choices.push(toChoice(map.id, map.name, map.icon, map.id === input.selectedSanpoMapId));
  }

  let helper: string | null = null;
  if (!input.canChange) {
    helper = PIN_EDIT_SANPO_MAP_LOCKED_HELPER;
  } else if (input.selectedSanpoMapId !== input.current.id) {
    const selected = choices.find((choice) => choice.selected);
    if (selected !== undefined) helper = `保存すると「${selected.label}」に移動します`;
  }

  return { status: "ready", choices, helper };
}

/**
 * PATCH の成功応答から「移動した先の地図名」を求める。編集を開いた時点の地図と違えば応答の地図名、
 * 同じなら null（A → B に移して部分保存した後、B → A に戻して保存した場合は null）。
 */
export function resolveMovedSanpoMapName(input: {
  originalSanpoMapId: string;
  updated: { sanpoMapId: string; sanpoMapName: string };
}): string | null {
  return input.updated.sanpoMapId === input.originalSanpoMapId ? null : input.updated.sanpoMapName;
}

/** 保存成功後のトースト（flash）。移動したら「ピンを「{name}」に移動しました」、それ以外は「ピンを更新しました」。 */
export function pinEditSavedMessage(movedToSanpoMapName: string | null): string {
  return movedToSanpoMapName === null
    ? "ピンを更新しました"
    : `ピンを「${movedToSanpoMapName}」に移動しました`;
}
