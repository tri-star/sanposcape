import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { useScreenBack } from "@/hooks/useScreenBack";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/**
 * SanpoMapListView — 地図一覧（`/sanpo-maps`）の暫定画面（SS-146）。
 * ピンタブの「地図一覧」ボタンの遷移先。SS-121 で本実装に差し替える暫定で、同じファイル名・ルートのまま置き換える。
 * testID `sanpo-map-list-screen` / `sanpo-map-list-back` は E2E（`pin-map.yaml`）が使うので維持すること。
 * 認証もフラグも見ない（フラグはルートがガードする。何も通信しない）。
 */
export function SanpoMapListView() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const back = useScreenBack({ fallbackHref: "/(tabs)/pins" });

  return (
    <View
      testID="sanpo-map-list-screen"
      style={[styles.root, { paddingTop: insets.top + theme.spacing[2] }]}
    >
      <View style={styles.header}>
        <IconButton
          icon="chevron-left"
          label="戻る"
          variant="ghost"
          onPress={back.goBack}
          testID="sanpo-map-list-back"
        />
        <Text accessibilityRole="header" style={styles.title}>
          地図一覧
        </Text>
      </View>
      <Card style={styles.card} testID="sanpo-map-list-placeholder">
        <Icon name="map" size={28} color={theme.colors.primary} />
        <Text style={styles.description}>地図の一覧と管理は準備中です</Text>
      </Card>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
    paddingHorizontal: theme.layout.pageGutter,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  title: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  card: {
    marginTop: theme.spacing[4],
    gap: theme.spacing[3],
  },
  description: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
}));
