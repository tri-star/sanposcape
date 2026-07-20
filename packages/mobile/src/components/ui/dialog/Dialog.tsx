import type { ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { Button, type ButtonProps } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import { resolveDialogAppearance } from "@/components/ui/dialog/dialogStyles";

export type DialogAction = {
  label: string;
  onPress: () => void;
  variant?: ButtonProps["variant"];
};

export type DialogProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  children?: ReactNode;
  /** 既定は右側(配列の最後)が primary。最大2つを推奨 */
  actions?: DialogAction[];
  /** 破壊的操作の確認用。true で primary アクションを danger にする */
  destructive?: boolean;
  testID?: string;
};

const MAX_RECOMMENDED_ACTIONS = 2;

/** RN の Modal(transparent, animationType="fade")の上に DS のスタイルを載せる */
export function Dialog({
  visible,
  onClose,
  title,
  message,
  children,
  actions = [],
  destructive = false,
  testID,
}: DialogProps) {
  if (__DEV__ && actions.length > MAX_RECOMMENDED_ACTIONS) {
    console.warn(
      `Dialog: actions は最大${MAX_RECOMMENDED_ACTIONS}つを推奨します(現在 ${actions.length}件)`,
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.overlayContainer}>
        <Pressable
          accessibilityLabel="閉じる"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.overlay}
        />
        <View
          // iOS: モーダルであることを支援技術に伝える。Android: importantForAccessibility で同等の効果
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={styles.panel}
        >
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            {/* DS: 閉じるアイコン x 20、text-tertiary */}
            <Pressable
              accessibilityLabel="閉じる"
              accessibilityRole="button"
              onPress={onClose}
              testID={testID ? `${testID}-close` : undefined}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Icon name="x" size={20} color={styles.closeIcon.color} />
            </Pressable>
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {children}
          {actions.length > 0 ? (
            <View style={styles.actions}>
              {actions.map((action, index) => {
                const isPrimary = index === actions.length - 1;
                const variant =
                  action.variant ?? (isPrimary ? (destructive ? "danger" : "primary") : "ghost");
                return (
                  <Button
                    key={action.label}
                    label={action.label}
                    variant={variant}
                    onPress={action.onPress}
                    testID={testID ? `${testID}-action-${index}` : undefined}
                  />
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => {
  const appearance = resolveDialogAppearance(theme);
  return {
    overlayContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing[24],
    },
    overlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: appearance.overlayColor,
    },
    // DS: パネル幅 320(最大 88%)、パディング 24・要素間 14(design/components/DS-COMPONENT-SPECS.md)
    panel: {
      width: 320,
      maxWidth: "88%",
      borderRadius: appearance.borderRadius,
      backgroundColor: appearance.backgroundColor,
      padding: theme.spacing[24],
      gap: 14,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing[8],
    },
    title: {
      flex: 1,
      color: appearance.titleColor,
      fontFamily: theme.fontFamily.heading,
      ...theme.typography.headingSm,
    },
    closeIcon: { color: theme.colors.textTertiary },
    message: {
      color: appearance.messageColor,
      fontFamily: theme.fontFamily.body,
      ...theme.typography.body,
    },
    // DS: アクション行の間隔 10、上マージン 6
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 6,
    },
  };
});
