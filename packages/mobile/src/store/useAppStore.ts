import { create } from "zustand";

/**
 * 横断的なクライアント状態（UI・一時状態）を扱う Zustand ストア。
 * サーバー由来のデータはここに置かず TanStack Query が保持する。
 * M2 以降で実際の状態（オンボーディング完了フラグ等）を追加する。
 */
interface AppState {
  /** 開発用のプレースホルダ状態。実状態の追加時に置き換える。 */
  initialized: boolean;
  setInitialized: (value: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  initialized: false,
  setInitialized: (value) => set({ initialized: value }),
}));
