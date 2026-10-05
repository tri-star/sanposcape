import type { PinUpdate } from "@/api/generated/model";
import type { SanpoMapChoice, SanpoMapChoicesState } from "@/features/pin/lib/sanpoMapChoices";
import { DEFAULT_SANPO_MAP_ICON } from "@/features/pin/lib/sanpoMapIcon";
import type { PinDetail, SanpoMap } from "@/features/pin/types";

/**
 * ピン編集画面の「地図」欄の判定・文言（SS-175）。
 * 登録画面の `resolveSanpoMapChoices` は「既定地図＝`sanpo_map_id` を送らない」「最初の地図の draft」
 * という登録固有の前提を持つので流用せず、編集専用にここへ集める。
 */
export const PIN_EDIT_SANPO_MAP_TITLE = "地図";
export const PIN_EDIT_SANPO_MAP_LOCKED_HELPER =
  "地図を変更できるのは、ピンを作った人と地図の持ち主だけです";
export const PIN_EDIT_SANPO_MAP_LOADING_HELPER = "地図を読み込んでいます…";
/**
 * 一覧の取得失敗。権限が無い（canChange=false）場合も同じ文言にする: 失敗中は role が不明で
 * editor 扱いのため権限判定が正しくない可能性があり、再読み込みで回復しうる（SS-175 M1）。
 */
export const PIN_EDIT_SANPO_MAP_ERROR_HELPER =
  "地図の一覧を取得できませんでした。再読み込みしてください。";

/** 権限が無いときの案内。スクリーンリーダーに今の地図が伝わるよう地図名を添える（M5）。 */
export function pinEditSanpoMapLockedHelper(currentName: string): string {
  return `${PIN_EDIT_SANPO_MAP_LOCKED_HELPER}（現在の地図: 「${currentName}」）`;
}

/** 移動の案内（選択が今の地図と違うとき）。 */
export function pinEditSanpoMapMoveHelper(selectedName: string): string {
  return `保存すると「${selectedName}」に移動します`;
}

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
 * 下書きの地図を基準値へ戻すべきか（SS-175 M2）。`ready` の一覧に下書きの地図が無い
 * （`sanpo_map_not_found` で取り直した結果、削除された・メンバーでなくなった）とき、戻す先の地図 ID を返す。
 * 戻さないとき null。loading / error は「確かめられない」だけなので触らない。
 * 送信・表示は `resolveEffectivePinEditSanpoMapId` で今の地図に戻っているが、下書きに消えた ID が
 * 残ると、他項目を変えた保存で地図の差分が黙って落ちるため、下書き自体を揃える。
 */
export function resolveDraftSanpoMapReset(input: {
  status: "loading" | "ready" | "error";
  maps: readonly Pick<SanpoMap, "id">[];
  baselineSanpoMapId: string;
  draftSanpoMapId: string;
}): string | null {
  if (input.status !== "ready") return null;
  if (input.draftSanpoMapId === input.baselineSanpoMapId) return null;
  return input.maps.some((map) => map.id === input.draftSanpoMapId)
    ? null
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
    return { status: "loading", choices: [], helper: PIN_EDIT_SANPO_MAP_LOADING_HELPER };
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
      helper: PIN_EDIT_SANPO_MAP_ERROR_HELPER,
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
    helper = pinEditSanpoMapLockedHelper(input.current.name);
  } else if (input.selectedSanpoMapId !== input.current.id) {
    const selected = choices.find((choice) => choice.selected);
    if (selected !== undefined) helper = pinEditSanpoMapMoveHelper(selected.label);
  }

  return { status: "ready", choices, helper };
}

/**
 * 編集画面の寿命の間に成功した PATCH の記録（SS-175 M3）。`usePinEditSave` が持ち、保存の成功・
 * アンマウントで地図一覧を取り直すか、トーストに出す移動先を求めるための唯一の情報源にする。
 */
export type PinEditUpdateRecord = {
  /** `sanpo_map_id` を載せた PATCH が1回でも成功した（部分保存を含む。保存ごとに戻さない）。 */
  sanpoMapChangeSent: boolean;
  /** 最後に成功した PATCH の応答。写真の段だけが残った再保存でも前回の応答が残る。 */
  lastUpdated: PinDetail | null;
};

export const INITIAL_PIN_EDIT_UPDATE_RECORD: PinEditUpdateRecord = {
  sanpoMapChangeSent: false,
  lastUpdated: null,
};

/** PATCH の成功を記録に足す（純粋関数）。 */
export function recordPinEditUpdate(
  record: PinEditUpdateRecord,
  input: { request: Pick<PinUpdate, "sanpo_map_id">; updated: PinDetail },
): PinEditUpdateRecord {
  return {
    sanpoMapChangeSent: record.sanpoMapChangeSent || input.request.sanpo_map_id !== undefined,
    lastUpdated: input.updated,
  };
}

/**
 * 地図一覧（pin_count・並び順）を取り直すか。移動を送ったことがあれば、A → B → A と戻して
 * 最終的な地図が同じでも、backend が移動先の `mark_used()` で並びを変えるので取り直す。
 */
export function shouldInvalidateSanpoMapsAfterSave(record: PinEditUpdateRecord): boolean {
  return record.sanpoMapChangeSent;
}

/**
 * 移動のトーストに出す移動先の地図名。編集を開いた時点の地図と、最後に成功した PATCH 応答の地図を
 * 比べる（A → B に移して部分保存した後の再保存は B、B → A に戻して保存した場合は null）。
 * PATCH が一度も成功していなければ null。
 */
export function resolveMovedSanpoMapName(input: {
  originalSanpoMapId: string;
  lastUpdated: Pick<PinDetail, "sanpoMapId" | "sanpoMapName"> | null;
}): string | null {
  const { lastUpdated } = input;
  if (lastUpdated === null || lastUpdated.sanpoMapId === input.originalSanpoMapId) return null;
  return lastUpdated.sanpoMapName;
}

/** 保存成功後のトースト（flash）。移動したら「ピンを「{name}」に移動しました」、それ以外は「ピンを更新しました」。 */
export function pinEditSavedMessage(movedToSanpoMapName: string | null): string {
  return movedToSanpoMapName === null
    ? "ピンを更新しました"
    : `ピンを「${movedToSanpoMapName}」に移動しました`;
}
