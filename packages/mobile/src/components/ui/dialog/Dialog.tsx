import type { ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { makeStyles } from "@/theme/makeStyles";

export type DialogProps = {
  open: boolean;
  title: string;
  children?: ReactNode;
  onClose: () => void;
  /** 下部に並べるアクション（Button など）。 */
  actions?: ReactNode;
  testID?: string;
};

/**
 * Dialog — 中央に出る確認モーダル（例:「散歩を終了しますか？」）。
 * デザイン: Sanpo Design System / components/overlays/Dialog
 */
export function Dialog({ open, title, children, onClose, actions, testID }: DialogProps) {
  const styles = useStyles();

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="閉じる"
        style={styles.scrim}
        onPress={onClose}
      >
        {/*
          中身のタップではスクリムに伝播させない。
          Pressable にすると本体が1つのボタンとしてアクセシビリティツリーに露出し、
          iOS では子要素（タイトル・本文・アクション）が読み上げから到達できなくなるため、
          View + responder で伝播だけを止める。
        */}
        <View
          testID={testID}
          accessibilityViewIsModal
          onStartShouldSetResponder={() => true}
          style={styles.panel}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <IconButton icon="x" label="閉じる" variant="ghost" size="sm" onPress={onClose} />
          </View>
          {children ? <View style={styles.body}>{children}</View> : null}
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((theme) => ({
  scrim: {
    flex: 1,
    backgroundColor: theme.colors.scrim,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
  },
  panel: {
    width: 320,
    maxWidth: "100%",
    backgroundColor: theme.colors.surfaceCard,
    borderRadius: theme.radius.xl,
    padding: theme.spacing[6],
    gap: 14,
    ...theme.shadows.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  title: {
    flex: 1,
    fontSize: theme.typography.size.xl,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  body: {
    gap: theme.spacing[2],
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing[3] - 2,
    marginTop: 6,
  },
}));
