import { StyleSheet, View } from "react-native";

import { Toast } from "@/components/ui/toast/Toast";

export type ToastOverlayProps = {
  message: string;
  visible: boolean;
  /** 画面下端からのオフセット（通常は `insets.bottom + 余白`）。 */
  bottom: number;
  testID?: string;
};

/**
 * ToastOverlay — `Toast` を画面下部に絶対配置するための定型ラッパー。
 * `useToast()` の状態と組み合わせて使う（`WalkStartView` / `WalkActiveView` /
 * `AuthScreenLayout` などで重複していたレイアウトを共通化した）。
 * `pointerEvents="none"` でタップを下に透過させる（Toast自体は非操作要素）。
 */
export function ToastOverlay({ message, visible, bottom, testID }: ToastOverlayProps) {
  return (
    <View testID={testID} pointerEvents="none" style={[styles.wrap, { bottom }]}>
      <Toast message={message} visible={visible} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
});
