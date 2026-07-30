import { Pressable, Text, View } from "react-native";

import { Icon } from "@/components/ui/icon/Icon";
import type { CategoryMeta, SpotCandidate } from "@/features/walk/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";
import { withAlpha } from "@/theme/withAlpha";

export type SpotCardProps = {
  spot: SpotCandidate;
  meta: CategoryMeta;
  selected: boolean;
  onPress: () => void;
  testID?: string;
};

/**
 * SpotCard — 「歩いて行けるスポット」の横スクロールカード。
 * デザイン: mock `isStart` の reachable カード。
 */
export function SpotCard({ spot, meta, selected, onPress, testID }: SpotCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const categoryColor = theme.map[meta.mapColorKey];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.root,
        selected ? styles.rootSelected : styles.rootUnselected,
        { transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.tint, { backgroundColor: withAlpha(categoryColor, 0.16) }]}>
          <Icon name={meta.icon} size={13} color={categoryColor} />
        </View>
        <Text style={styles.category}>{meta.label}</Text>
      </View>
      <Text numberOfLines={2} style={styles.name}>
        {spot.name}
      </Text>
      <Text style={styles.meta}>
        往復 <Text style={styles.metaStrong}>{spot.roundTripMinutes}</Text>分・約
        {spot.roundTripKm.toFixed(1)}km
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    width: 132,
    padding: theme.spacing[3],
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceCard,
  },
  rootSelected: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
    ...theme.shadows.sm,
  },
  rootUnselected: {
    borderWidth: 2,
    borderColor: "transparent",
    ...theme.shadows.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: theme.spacing[2],
  },
  tint: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.xs + 1,
    alignItems: "center",
    justifyContent: "center",
  },
  category: {
    fontSize: theme.typography.size["2xs"],
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textTertiary,
  },
  name: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  meta: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textSecondary,
  },
  metaStrong: {
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
}));
