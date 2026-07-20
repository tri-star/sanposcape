import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles, StyleSheet } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon/Icon";
import {
  dequeueToast,
  enqueueToast,
  type ToastItem,
  type ToastQueueState,
  type ToastVariant,
} from "@/components/ui/toast/toastQueue";
import { resolveToastAppearance } from "@/components/ui/toast/toastStyles";

export type ShowToastOptions = {
  variant?: ToastVariant;
  durationMs?: number;
};

export type ToastContextValue = {
  show: (message: string, options?: ShowToastOptions) => void;
};

/** `useToast.ts` から参照する。Provider の外側で呼ぶと `null` のまま渡り、useToast 側で例外にする */
export const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 3000;
const MAX_VISIBLE = 3;

export type ToastProviderProps = {
  children: ReactNode;
  /** トースト表示領域の testID。個々のトーストは `${testID}-item-<id>` になる */
  testID?: string;
};

/**
 * Toast(スナックバー)の表示制御。`app/_layout.tsx` で `SafeAreaProvider` の内側に配線する。
 * `Tooltip` の代替としても使う想定(モバイルに hover が無いため)。
 *
 * キュー状態は Context + `useState` で保持する(横断的なクライアント状態は Zustand という規約の
 * 例外)。理由: Toast のキューは「表示中の Provider ツリーの生存期間」だけに閉じたローカル UI 状態で、
 * 画面をまたいで参照・永続化する必要が無い。Zustand に載せると「サーバー由来ではない横断状態」の
 * 定義上は該当しうるが、実体は `<ToastProvider>` 1箇所からしか書き込まれず、他の store のような
 * 複数箇所からの読み書きが発生しないため、Context のままの方が責務が明確になると判断した
 * (D-1。詳細は ADR-005 参照)。
 */
export function ToastProvider({ children, testID = "toast-overlay" }: ToastProviderProps) {
  const [state, setState] = useState<ToastQueueState>({ items: [] });
  const insets = useSafeAreaInsets();
  const idCounter = useRef(0);
  // アンマウント時に保留中の setTimeout を確実に止めるため、発火済みタイマーを保持する(C-5)。
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timersAtMount = timers.current;
    return () => {
      for (const timer of timersAtMount.values()) {
        clearTimeout(timer);
      }
      timersAtMount.clear();
    };
  }, []);

  const remove = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setState((prev) => dequeueToast(prev, id));
  }, []);

  const show = useCallback(
    (message: string, options?: ShowToastOptions) => {
      idCounter.current += 1;
      const item: ToastItem = {
        id: `toast-${idCounter.current}`,
        message,
        variant: options?.variant ?? "info",
        durationMs: options?.durationMs ?? DEFAULT_DURATION_MS,
      };
      setState((prev) => enqueueToast(prev, item, MAX_VISIBLE));
      const timer = setTimeout(() => remove(item.id), item.durationMs);
      timers.current.set(item.id, timer);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View
        testID={testID}
        pointerEvents="box-none"
        accessibilityLiveRegion="polite"
        style={[styles.overlay, { bottom: insets.bottom + 16 }]}
      >
        {state.items.map((item) => (
          <ToastCard
            key={item.id}
            item={item}
            onDismiss={() => remove(item.id)}
            testID={`${testID}-item-${item.id}`}
          />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

function ToastCard({
  item,
  onDismiss,
  testID,
}: {
  item: ToastItem;
  onDismiss: () => void;
  testID?: string;
}) {
  // `useUnistyles()` は Icon の `name`/`color` prop(ネイティブ `style` ではない)を得るためだけに使う。
  // 背景・文字色等の見た目は StyleSheet.create 側で解決する。
  const { theme } = useUnistyles();
  const args = { variant: item.variant };
  const appearance = resolveToastAppearance(theme, args);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="alert"
      accessibilityLabel={item.message}
      // タップで早期に閉じられるようにする(自動消滅もするため onPress は必須ではない)
      onPress={onDismiss}
      style={styles.card(args)}
    >
      <Icon name={appearance.iconName} size={18} color={appearance.iconColor} />
      <Text style={styles.message(args)}>{item.message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 8,
  },
  card: (args: { variant: ToastVariant }) => {
    const appearance = resolveToastAppearance(theme, args);
    return {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing[8],
      maxWidth: "90%",
      paddingHorizontal: theme.spacing[16],
      paddingVertical: theme.spacing[12],
      borderRadius: theme.radius.pill,
      backgroundColor: appearance.backgroundColor,
      boxShadow: theme.shadow.md,
    };
  },
  message: (args: { variant: ToastVariant }) => {
    const appearance = resolveToastAppearance(theme, args);
    return {
      flexShrink: 1,
      color: appearance.textColor,
      fontFamily: theme.fontFamily.body,
      ...theme.typography.bodySm,
    };
  },
}));
