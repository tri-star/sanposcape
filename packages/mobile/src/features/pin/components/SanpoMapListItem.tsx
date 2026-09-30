import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { Badge } from "@/components/ui/badge/Badge";
import { Icon } from "@/components/ui/icon/Icon";
import { formatSanpoMapPinCount } from "@/features/pin/lib/sanpoMapScreenState";
import type { SanpoMap } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapListItemProps = {
  map: SanpoMap;
  /** タップされた地図の id を渡す（親は useCallback 1つで済む）。 */
  onPress: (sanpoMapId: string) => void;
  testID: string;
};

/** SanpoMapListItem — 地図一覧の1行（SS-121）。地図名・ピン件数・既定/招待の印。 */
function SanpoMapListItemBase({ map, onPress, testID }: SanpoMapListItemProps) {
  const theme = useTheme();
  const styles = useStyles();
  const pinCountLabel = formatSanpoMapPinCount(map.pinCount);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`地図「${map.name}」を開く`}
      onPress={() => onPress(map.id)}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: theme.colors.neutralPress } : null,
      ]}
      testID={testID}
    >
      <Icon name="map" size={22} color={theme.colors.primary} />
      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={2}>
          {map.name}
        </Text>
        <View style={styles.meta}>
          {pinCountLabel !== null ? <Text style={styles.metaText}>{pinCountLabel}</Text> : null}
          {map.isDefault ? <Badge tone="info">既定の地図</Badge> : null}
          {map.role === "editor" ? <Badge tone="neutral">招待された地図</Badge> : null}
        </View>
      </View>
      <Icon name="chevron-right" size={18} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

export const SanpoMapListItem = memo(SanpoMapListItemBase);

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
    backgroundColor: theme.colors.surfaceCard,
    borderRadius: theme.radius.lg,
    ...theme.shadows.sm,
  },
  main: {
    flex: 1,
    gap: theme.spacing[1],
  },
  name: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  metaText: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
}));
