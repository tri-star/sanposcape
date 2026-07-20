import type { ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Button, type ButtonProps } from "@/components/ui/button/Button";
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
  const { theme } = useUnistyles();
  const appearance = resolveDialogAppearance(theme);

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
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: theme.spacing[24],
        }}
      >
        <Pressable
          accessibilityLabel="閉じる"
          accessibilityRole="button"
          onPress={onClose}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: appearance.overlayColor,
          }}
        />
        <View
          // iOS: モーダルであることを支援技術に伝える。Android: importantForAccessibility で同等の効果
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={{
            width: "100%",
            maxWidth: 360,
            borderRadius: appearance.borderRadius,
            backgroundColor: appearance.backgroundColor,
            padding: theme.spacing[24],
            gap: theme.spacing[12],
          }}
        >
          <Text
            style={{
              color: appearance.titleColor,
              fontFamily: theme.fontFamily.heading,
              ...theme.typography.headingSm,
            }}
          >
            {title}
          </Text>
          {message ? (
            <Text
              style={{
                color: appearance.messageColor,
                fontFamily: theme.fontFamily.body,
                ...theme.typography.body,
              }}
            >
              {message}
            </Text>
          ) : null}
          {children}
          {actions.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: theme.spacing[8],
                marginTop: theme.spacing[8],
              }}
            >
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
