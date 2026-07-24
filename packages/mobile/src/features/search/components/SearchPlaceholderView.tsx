import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon/Icon";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/**
 * 検索タブの静的プレースホルダ。
 * ピン検索（mock `isSearch`）は別タスク（ピン機能）に送るため、
 * 本タスクでは「準備中」の空状態のみを表示する（§8.5 で確定）。
 */
export function SearchPlaceholderView() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <View testID="search-placeholder-screen" style={[styles.root, { paddingTop: insets.top }]}>
      <Icon name="search-x" size={40} color={theme.colors.textTertiary} />
      <Text style={styles.title}>ピン検索は準備中です</Text>
      <Text style={styles.caption}>もうしばらくお待ちください。</Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surfaceApp,
    paddingHorizontal: theme.layout.pageGutter,
  },
  title: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  caption: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textTertiary,
  },
}));
