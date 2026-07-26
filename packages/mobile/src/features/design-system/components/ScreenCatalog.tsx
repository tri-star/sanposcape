import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/card/Card";
import { Icon, type IconName } from "@/components/ui/icon/Icon";
import { DEFAULT_WALK_GOAL, SAMPLE_WALK_RESULT } from "@/features/walk/data/defaults";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

type CatalogLink = {
  key: string;
  label: string;
  description: string;
  icon: IconName;
  onPress: () => void;
};

/**
 * 開発確認用の画面カタログ（Storybook相当）。
 * RN の render/snapshot テストが書けない制約の代替として、各主要画面をスタブデータ付きで
 * 直接開くための導線を1画面に集約する。`testID` は Maestro からの将来利用も想定して付与する。
 */
export function ScreenCatalog() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const links: CatalogLink[] = [
    {
      key: "sign-in",
      label: "サインイン",
      description: "Google/ゲストで開始する画面",
      icon: "user",
      onPress: () => router.push("/(auth)/sign-in"),
    },
    {
      key: "sign-up",
      label: "サインアップ",
      description: "新規登録画面",
      icon: "user",
      onPress: () => router.push("/(auth)/sign-up"),
    },
    {
      key: "walk-start",
      label: "散歩開始",
      description: "スポット選択〜散歩を始める導線",
      icon: "footprints",
      onPress: () => router.push("/walk-start"),
    },
    {
      key: "walk-active",
      label: "散歩中",
      description: `既定ゴール: ${DEFAULT_WALK_GOAL.name}（往復${DEFAULT_WALK_GOAL.time}分）`,
      icon: "navigation",
      onPress: () =>
        router.push({
          pathname: "/(tabs)",
          params: {
            goalName: DEFAULT_WALK_GOAL.name,
            goalTimeMin: String(DEFAULT_WALK_GOAL.time),
            goalDistKm: DEFAULT_WALK_GOAL.dist.toFixed(1),
          },
        }),
    },
    {
      key: "walk-summary",
      label: "散歩サマリ",
      description: "代表的なスタブ結果で単独表示",
      icon: "flag",
      onPress: () =>
        router.push({
          pathname: "/walk-summary",
          params: {
            elapsedSec: String(SAMPLE_WALK_RESULT.elapsedSec),
            distKm: SAMPLE_WALK_RESULT.distKm,
            steps: String(SAMPLE_WALK_RESULT.steps),
            goalName: SAMPLE_WALK_RESULT.goalName,
          },
        }),
    },
    {
      key: "history",
      label: "記録",
      description: "週/月タブ・歩数進捗",
      icon: "bar-chart-2",
      onPress: () => router.push("/(tabs)/history"),
    },
    {
      key: "search",
      label: "検索（準備中）",
      description: "プレースホルダ画面",
      icon: "search",
      onPress: () => router.push("/(tabs)/search"),
    },
    {
      key: "settings",
      label: "設定",
      description: "ログアウト導線（サインイン後に確認）",
      icon: "settings-2",
      onPress: () => router.push("/settings"),
    },
    {
      key: "design-system",
      label: "デザインシステム",
      description: "トークン/UIプリミティブの一覧",
      icon: "sliders-horizontal",
      onPress: () => router.push("/design-system"),
    },
  ];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + theme.spacing[4],
            paddingBottom: insets.bottom + theme.spacing[10],
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.title}>画面カタログ</Text>
          <Text style={styles.subtitle}>
            スタブデータ付きで各画面を直接開いて表示確認できます（開発用）
          </Text>
        </View>

        <View style={styles.list}>
          {links.map((link) => (
            <Pressable
              key={link.key}
              accessibilityRole="button"
              accessibilityLabel={`${link.label}。${link.description}`}
              testID={`catalog-link-${link.key}`}
              onPress={link.onPress}
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
            >
              <Card style={styles.row}>
                <View style={styles.rowIcon}>
                  <Icon name={link.icon} size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{link.label}</Text>
                  <Text style={styles.rowDescription}>{link.description}</Text>
                </View>
                <Icon name="chevron-right" size={18} color={theme.colors.textTertiary} />
              </Card>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
  },
  content: {
    paddingHorizontal: theme.layout.pageGutter,
    gap: theme.spacing[6],
  },
  title: {
    fontSize: theme.typography.size["2xl"],
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    marginTop: theme.spacing[1],
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  list: {
    gap: theme.spacing[2] + 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  rowDescription: {
    marginTop: 2,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
}));
