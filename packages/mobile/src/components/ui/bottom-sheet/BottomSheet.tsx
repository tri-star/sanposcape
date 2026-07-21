import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles } from "@/theme/makeStyles";

export type BottomSheetProps = {
  open: boolean;
  title?: string;
  children?: ReactNode;
  onClose: () => void;
  testID?: string;
};

/**
 * BottomSheet — 画面下からせり上がるパネル（表示スポットの絞り込み、ピン登録など）。
 * デザイン: Sanpo Design System / components/overlays/BottomSheet
 */
export function BottomSheet({ open, title, children, onClose, testID }: BottomSheetProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable accessibilityLabel="閉じる" style={styles.scrim} onPress={onClose} />
      <View testID={testID} style={[styles.panel, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable accessibilityLabel="閉じる" onPress={onClose} style={styles.handleHitArea}>
          <View style={styles.handle} />
        </Pressable>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          bounces={false}
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((theme) => ({
  scrim: {
    flex: 1,
    backgroundColor: theme.colors.scrim,
  },
  panel: {
    maxHeight: "85%",
    backgroundColor: theme.colors.surfaceCard,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingTop: theme.spacing[3] - 2,
    paddingHorizontal: theme.spacing[5],
    ...theme.shadows.sheet,
  },
  handleHitArea: {
    alignSelf: "center",
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[6],
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.trackStrong,
  },
  title: {
    fontSize: theme.typography.size.lg,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  content: {
    gap: theme.spacing[3],
  },
}));
