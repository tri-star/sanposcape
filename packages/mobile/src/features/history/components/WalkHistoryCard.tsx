import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import type { WalkHistoryItem } from "@/features/history/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type WalkHistoryCardProps = {
  item: WalkHistoryItem;
  onPress: () => void;
  testID?: string;
};

/** WalkHistoryCard — 履歴一覧・記録タブの「最近の散歩」で使う1行。 */
export function WalkHistoryCard({ item, onPress, testID }: WalkHistoryCardProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.dateLabel} ${item.timeLabel} ${item.destinationName} ${item.distanceKm.toFixed(1)}km ${item.durationLabel} の散歩の詳細`}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <Card style={styles.row}>
        <View style={styles.iconCircle}>
          <Icon name="footprints" size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.center}>
          <Text numberOfLines={1} style={styles.destination}>
            {item.destinationName}
          </Text>
          <Text style={styles.dateTime}>{`${item.dateLabel} ${item.timeLabel}`}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.distance}>{`${item.distanceKm.toFixed(1)}km`}</Text>
          <Text style={styles.duration}>{item.durationLabel}</Text>
        </View>
        <Icon name="chevron-right" size={18} color={theme.colors.textTertiary} />
      </Card>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
  },
  destination: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  dateTime: {
    marginTop: 2,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
  right: {
    alignItems: "flex-end",
  },
  distance: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  duration: {
    marginTop: 2,
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textTertiary,
  },
}));
