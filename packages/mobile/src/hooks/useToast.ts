import { useCallback, useEffect, useRef, useState } from "react";

export type UseToastResult = {
  visible: boolean;
  message: string;
  show: (message: string) => void;
};

/**
 * 一時的なトースト表示を管理する汎用 hook（機能非依存）。
 * 「押せるのに何も起きない」を避けるため、非スコープの操作には
 * このトーストを使って結果を明示する（例:「準備中」）。
 *
 * 配置について: 現状は `walk`（`WalkStartView`/`WalkActiveView`）と `auth`
 * （`useAuthActions`）の複数 feature から使われており機能非依存な内容のため
 * `src/hooks/` に置いている。今後さらに利用箇所が増えて共通パターンが固まった場合は、
 * 表示側（`ToastOverlay`）とあわせて昇格/整理の要否を再確認すること。
 */
export function useToast(durationMs = 1900): UseToastResult {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (nextMessage: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setMessage(nextMessage);
      setVisible(true);
      timerRef.current = setTimeout(() => setVisible(false), durationMs);
    },
    [durationMs],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { visible, message, show };
}
