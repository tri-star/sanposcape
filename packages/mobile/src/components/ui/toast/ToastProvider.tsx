import { createContext, useCallback, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

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
 */
export function ToastProvider({ children, testID = "toast-overlay" }: ToastProviderProps) {
  const [state, setState] = useState<ToastQueueState>({ items: [] });
  const insets = useSafeAreaInsets();
  const idCounter = useRef(0);

  const remove = useCallback((id: string) => {
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
      setTimeout(() => remove(item.id), item.durationMs);
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
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: insets.bottom + 16,
          alignItems: "center",
          gap: 8,
        }}
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
  const { theme } = useUnistyles();
  const appearance = resolveToastAppearance(theme, { variant: item.variant });

  return (
    <Pressable
      testID={testID}
      accessibilityRole="alert"
      accessibilityLabel={item.message}
      // タップで早期に閉じられるようにする(自動消滅もするため onPress は必須ではない)
      onPress={onDismiss}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[8],
        maxWidth: "90%",
        paddingHorizontal: theme.spacing[16],
        paddingVertical: theme.spacing[12],
        borderRadius: theme.radius.pill,
        backgroundColor: appearance.backgroundColor,
        boxShadow: theme.shadow.md,
      }}
    >
      <Icon name={appearance.iconName} size={18} color={appearance.iconColor} />
      <Text
        style={{
          flexShrink: 1,
          color: appearance.textColor,
          fontFamily: theme.fontFamily.body,
          ...theme.typography.bodySm,
        }}
      >
        {item.message}
      </Text>
    </Pressable>
  );
}
