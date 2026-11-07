import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { Icon } from "@/components/ui/icon/Icon";
import { SanpoMapIconBadge } from "@/features/pin/components/SanpoMapIconBadge";
import type { TagSummary } from "@/features/pin/lib/tag/pinTagIndex";
import {
  formatTagPinCount,
  TAG_ROW_MAX_SANPO_MAPS,
  tagRowAccessibilityLabel,
} from "@/features/pin/lib/tag/tagScreenState";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type TagListItemProps = {
  tag: TagSummary;
  /** タップされたタグの表記を渡す（親は useCallback 1つで済む）。 */
  onPress: (label: string) => void;
  testID: string;
};

const SANPO_MAP_BADGE_SIZE = 18;

/**
 * TagListItem — タグ一覧の1行（SS-245）。表記・ピン件数・使われている地図（アイコン + 名前。先頭3件と残りの件数）。
 * 地図をまたいで同じタグを1行にまとめるので、地図で見分けられるようにする。
 */
function TagListItemBase({ tag, onPress, testID }: TagListItemProps) {
  const theme = useTheme();
  const styles = useStyles();
  const visibleMaps = tag.sanpoMaps.slice(0, TAG_ROW_MAX_SANPO_MAPS);
  const hiddenMapCount = tag.sanpoMaps.length - visibleMaps.length;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tagRowAccessibilityLabel(tag)}
      accessibilityHint="このタグが付いたピンの一覧を開きます"
      onPress={() => onPress(tag.label)}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: theme.colors.neutralPress } : null,
      ]}
      testID={testID}
    >
      <View style={styles.iconWrap}>
        <Icon name="tag" size={18} color={theme.colors.textSecondary} />
      </View>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text style={styles.label} numberOfLines={1}>
            {tag.label}
          </Text>
          <Text style={styles.count}>{formatTagPinCount(tag.pinCount)}</Text>
        </View>
        <View style={styles.maps}>
          {visibleMaps.map((map) => (
            <View key={map.id} style={styles.map}>
              <SanpoMapIconBadge icon={map.icon} size={SANPO_MAP_BADGE_SIZE} />
              <Text style={styles.metaText} numberOfLines={1}>
                {map.name}
              </Text>
            </View>
          ))}
          {hiddenMapCount > 0 ? <Text style={styles.metaText}>ほか{hiddenMapCount}件</Text> : null}
        </View>
      </View>
      <Icon name="chevron-right" size={18} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

export const TagListItem = memo(TagListItemBase);

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    marginBottom: theme.spacing[2],
    backgroundColor: theme.colors.surfaceCard,
    borderRadius: theme.radius.lg,
    ...theme.shadows.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.trackSubtle,
  },
  main: {
    flex: 1,
    gap: theme.spacing[1],
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing[2],
  },
  label: {
    flexShrink: 1,
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  count: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
  maps: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: theme.spacing[2],
    rowGap: theme.spacing[1],
  },
  map: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    maxWidth: "100%",
  },
  metaText: {
    flexShrink: 1,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
}));
