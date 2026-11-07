import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Keyboard } from "react-native";

import {
  useSanpoMapDelete,
  type UseSanpoMapDeleteResult,
} from "@/features/pin/hooks/map-deletion/useSanpoMapDelete";
import { sanpoMapDeletedMessage } from "@/features/pin/lib/map-deletion/sanpoMapDelete";
import { setFlashMessage } from "@/lib/flashMessage";

export type UseSanpoMapDeleteFlowResult = {
  deletion: UseSanpoMapDeleteResult;
  /** 削除に成功した（地図詳細はこの地図のピン・メンバーを取り直さず、本文を差し替える）。 */
  deleted: boolean;
  dialogOpen: boolean;
  /** 確認ダイアログを開く。名前は一覧のトースト用に、開いた時点で控える。 */
  openDialog: (sanpoMapName: string) => void;
  /** 確認ダイアログを閉じて失敗状態を解除する。 */
  closeDialog: () => void;
  /** 戻るの横取り（`useScreenBack` の `onIntercept`）。ダイアログを開いていれば消費する。 */
  interceptBack: () => boolean;
  /**
   * 画面の `useScreenBack().runOnce` を渡す（描画のたびに呼んでよい）。削除の後の遷移も「戻る以外の遷移」なので
   * 二重発火ラッチを通す。`useScreenBack` はこの hook の `interceptBack` を受けるため、この hook より後に作られる。
   */
  bindRunOnce: (runOnce: (navigate: () => void) => void) => void;
};

/**
 * 地図詳細での地図の削除の画面側の配線（SS-265）。確認ダイアログの開閉・戻るの横取り・成功後の遷移を
 * 地図詳細の本体から分ける。通信とキャッシュは `useSanpoMapDelete`、判定と文言は `lib/map-deletion/`。
 *
 * 成功したら地図一覧まで戻り（消した地図の詳細には戻れない）、一覧で「『…』を削除しました」を出す
 * （SS-249 で地図から抜けたときと同じ）。
 */
export function useSanpoMapDeleteFlow(sanpoMapId: string | null): UseSanpoMapDeleteFlowResult {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const runOnceRef = useRef<((navigate: () => void) => void) | null>(null);
  // 成功の時点では一覧の取り直しで地図が消えていることがあるので、開いたときに控える。
  const mapNameRef = useRef("");

  const deletion = useSanpoMapDelete(sanpoMapId, {
    onDeleted: () => {
      setDialogOpen(false);
      setFlashMessage(sanpoMapDeletedMessage(mapNameRef.current));
      const navigate = () => router.dismissTo("/sanpo-maps");
      if (runOnceRef.current) runOnceRef.current(navigate);
      else navigate();
    },
  });

  const openDialog = useCallback((sanpoMapName: string) => {
    Keyboard.dismiss();
    mapNameRef.current = sanpoMapName;
    setDialogOpen(true);
  }, []);

  const { reset, status } = deletion;
  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    reset();
  }, [reset]);

  const interceptBack = useCallback(() => {
    if (!dialogOpen) return false;
    // 削除中はダイアログを閉じず、バック操作だけ消費する（画面も戻らない）。
    if (status !== "deleting") closeDialog();
    return true;
  }, [dialogOpen, status, closeDialog]);

  const bindRunOnce = useCallback((runOnce: (navigate: () => void) => void) => {
    runOnceRef.current = runOnce;
  }, []);

  return {
    deletion,
    deleted: status === "deleted",
    dialogOpen,
    openDialog,
    closeDialog,
    interceptBack,
    bindRunOnce,
  };
}
