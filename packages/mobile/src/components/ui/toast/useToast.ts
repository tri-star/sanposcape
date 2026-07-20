import { useContext } from "react";

import { ToastContext, type ToastContextValue } from "@/components/ui/toast/ToastProvider";

/**
 * `const { show } = useToast()` で呼ぶ。`ToastProvider`(`app/_layout.tsx` に配線済み)の
 * 内側でのみ使用できる。外側で呼ぶと例外を投げる(無言で無視すると気付きにくいため)。
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context === null) {
    throw new Error("useToast は ToastProvider の内側でのみ使用できます");
  }
  return context;
}
