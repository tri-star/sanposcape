import { create } from "zustand";

import type { ActiveWalk } from "@/features/walk/types";

type ActiveWalkState = {
  activeWalk: ActiveWalk | null;
  startWalk: (walk: ActiveWalk) => void;
  endWalk: () => void;
};

/**
 * 「今どの散歩をしているか」を画面をまたいで保持するストア。
 * `docs/folder-structure.md` の使い分けに従い、サーバー由来データ（ルート本体）は入れない
 * （ルートは `useWalkRoute` が TanStack Query で保持する）。`walk` 機能に閉じるため
 * `src/store/` ではなく feature 内に置く。
 *
 * 永続化（AsyncStorage / SecureStore）はしない。アプリを落としたら散歩は終わる
 * （M5 の保存機能で扱う課題）。
 *
 * 画面外（`ScreenCatalog` のような非 React コンテキスト）からは
 * `useActiveWalkStore.getState().startWalk(...)` を使える。
 */
export const useActiveWalkStore = create<ActiveWalkState>((set) => ({
  activeWalk: null,
  startWalk: (walk) => set({ activeWalk: walk }),
  endWalk: () => set({ activeWalk: null }),
}));
