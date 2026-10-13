import { create } from "zustand";

import {
  DEFAULT_PIN_MAP_FILTER,
  setPinVisitFilterOption,
  type PinMapFilter,
  type PinVisitFilterOption,
} from "@/features/pin/lib/pinMapFilter";

type PinMapFilterState = {
  filter: PinMapFilter;
  setIncludeArchived: (includeArchived: boolean) => void;
  /** 最後の1つを外す操作は無視する（`setPinVisitFilterOption`）。 */
  setVisitOption: (option: PinVisitFilterOption, checked: boolean) => void;
};

/**
 * 地図に描く登録済みピンの絞り込み（SS-174）。ピンタブと散歩中のナビタブの地図で共有する
 * （どちらで変えても両方の地図に効く。画面ごとに持つと、どちらで何を選んだか分かりにくいため）。
 *
 * **永続化しない**（アプリの再起動で既定に戻る）。課題は既定値を指定しているだけで保存を求めておらず、
 * 端末の設定（`services/preferences`。ADR-M-016）の保存形式を広げるほどの理由が無いため（ADR-M-021 の SS-174 追補）。
 * ユーザーのデータではないので、サインアウトでも消さない（`registerSessionCleanup` に登録しない）。
 */
export const usePinMapFilterStore = create<PinMapFilterState>((set) => ({
  filter: DEFAULT_PIN_MAP_FILTER,
  setIncludeArchived: (includeArchived) =>
    set((state) =>
      state.filter.includeArchived === includeArchived
        ? state
        : { filter: { ...state.filter, includeArchived } },
    ),
  setVisitOption: (option, checked) =>
    set((state) => {
      const filter = setPinVisitFilterOption(state.filter, option, checked);
      return filter === state.filter ? state : { filter };
    }),
}));
