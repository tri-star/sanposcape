import { FIRST_SANPO_MAP_NAME } from "@/features/pin/lib/pinLimits";
import { DEFAULT_SANPO_MAP_ICON } from "@/features/pin/lib/sanpoMapIcon";
import type { SanpoMapIconKey } from "@/features/pin/types";
import type { SanpoMap, SanpoMapSelection } from "@/features/pin/types";

export type SanpoMapChoice = {
  /** testID 接尾辞。既存は id、未作成の既定地図は "default"。 */
  key: string;
  label: string;
  selected: boolean;
  /** まだサーバーに無い（保存時に作られる）。 */
  isDraft: boolean;
  selection: SanpoMapSelection;
  /** 地図のアイコン。draft（未作成の「最初の地図」）は既定アイコン（backend も既定で作る）。 */
  icon: SanpoMapIconKey;
};

export type SanpoMapChoicesState = {
  status: "loading" | "ready" | "error";
  choices: SanpoMapChoice[];
  helper: string | null;
};

const LOADING_HELPER = "地図を読み込んでいます…";
const ERROR_HELPER = "地図の一覧を取得できませんでした。既定の地図に保存します。";

function isSameSelection(a: SanpoMapSelection, b: SanpoMapSelection): boolean {
  if (a.kind === "default" && b.kind === "default") return true;
  return a.kind === "existing" && b.kind === "existing" && a.sanpoMapId === b.sanpoMapId;
}

/**
 * 現在の選択を一覧に照らして解決する。既存地図を指していてその id が一覧に無い
 * （削除された）ときは default に戻す。選択肢の強調表示と候補の取得先の両方がこれを使う。
 */
export function resolveEffectiveSanpoMapSelection(input: {
  maps: readonly SanpoMap[];
  selection: SanpoMapSelection;
}): SanpoMapSelection {
  const selection = input.selection;
  return selection.kind === "existing" && !input.maps.some((map) => map.id === selection.sanpoMapId)
    ? { kind: "default" }
    : selection;
}

/**
 * 「保存先の地図」選択肢を組み立てる。
 *
 * - `isDefault` の地図が無ければ（0件、または招待された地図だけ）、先頭に draft
 *   （未作成の「最初の地図」）を追加する。
 * - 各地図の `selection` は「既定地図は default 選択として表す」（何も触らずに保存したとき
 *   送信内容とハイライトが一致するようにするため）。
 * - `selection`（呼び出し側が保持する現在の選択）が既存地図を指していて、その id が一覧に
 *   無い（削除された）場合は default 扱いに戻す。
 */
export function resolveSanpoMapChoices(input: {
  status: "loading" | "ready" | "error";
  maps: readonly SanpoMap[];
  selection: SanpoMapSelection;
}): SanpoMapChoicesState {
  if (input.status === "loading") {
    return { status: "loading", choices: [], helper: LOADING_HELPER };
  }
  if (input.status === "error") {
    return { status: "error", choices: [], helper: ERROR_HELPER };
  }

  const hasDefaultMap = input.maps.some((map) => map.isDefault);
  const effectiveSelection = resolveEffectiveSanpoMapSelection(input);

  const choices: SanpoMapChoice[] = [];

  if (!hasDefaultMap) {
    const draftSelection: SanpoMapSelection = { kind: "default" };
    choices.push({
      key: "default",
      label: FIRST_SANPO_MAP_NAME,
      isDraft: true,
      icon: DEFAULT_SANPO_MAP_ICON,
      selection: draftSelection,
      selected: isSameSelection(effectiveSelection, draftSelection),
    });
  }

  for (const map of input.maps) {
    const selection: SanpoMapSelection = map.isDefault
      ? { kind: "default" }
      : { kind: "existing", sanpoMapId: map.id };
    choices.push({
      key: map.id,
      label: map.name,
      isDraft: false,
      icon: map.icon,
      selection,
      selected: isSameSelection(effectiveSelection, selection),
    });
  }

  const helper =
    !hasDefaultMap && effectiveSelection.kind === "default"
      ? `このピンを保存すると「${FIRST_SANPO_MAP_NAME}」が作られます`
      : null;

  return { status: "ready", choices, helper };
}

/** 選択中の保存先のアイコン。loading / error・選択なしは既定アイコン（登録画面のプレビュー用）。 */
export function resolveSelectedSanpoMapIcon(state: SanpoMapChoicesState): SanpoMapIconKey {
  return state.choices.find((choice) => choice.selected)?.icon ?? DEFAULT_SANPO_MAP_ICON;
}
