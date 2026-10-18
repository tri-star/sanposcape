import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import { storeOpenFailedMessage } from "@/features/app-update/lib/updateRequired";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type UpdateRequiredViewProps = {
  /** この OS のストアの URL。null（ストアを持たない OS）ならボタンを出さない。 */
  storeUrl: string | null;
  storeLabel: string;
  /** 直近にストアを開けなかったか。 */
  openFailed: boolean;
  onOpenStore: () => void;
  /** ボタンの下に足す要素（画面カタログのプレビューの「閉じる」だけが使う）。 */
  footer?: ReactNode;
};

const TITLE = "アップデートが必要です";
const DESCRIPTION =
  "お使いのバージョンのアプリはご利用いただけなくなりました。ストアから最新版にアップデートしてください。";

/** アップデートを求める全画面の案内（SS-101）。表示だけを担い、状態は持たない。 */
export function UpdateRequiredView({
  storeUrl,
  storeLabel,
  openFailed,
  onOpenStore,
  footer,
}: UpdateRequiredViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <View testID="update-required" style={styles.root}>
      {/* 文字サイズの拡大時に下部のボタンが画面外へ出ないよう、収まらないときだけスクロールさせる。 */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 44, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.message}>
          <View style={styles.iconCircle}>
            <Icon name="refresh-cw" size={32} color={theme.colors.primary} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {TITLE}
          </Text>
          <Text style={styles.description}>{DESCRIPTION}</Text>
        </View>
        <View style={styles.actions}>
          {storeUrl !== null ? (
            <Button
              testID="update-required-open-store"
              icon="external-link"
              fullWidth
              size="lg"
              onPress={onOpenStore}
            >
              {storeLabel}
            </Button>
          ) : null}
          {openFailed && storeUrl !== null ? (
            <Text testID="update-required-open-failed" style={styles.error}>
              {storeOpenFailedMessage(storeUrl)}
            </Text>
          ) : null}
          {footer}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceTint,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.layout.pageGutter + 14,
    gap: theme.spacing[4],
  },
  message: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceCard,
  },
  title: {
    fontSize: theme.typography.size.xl,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
    textAlign: "center",
  },
  description: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  actions: {
    gap: theme.spacing[3],
  },
  error: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.danger,
  },
}));
