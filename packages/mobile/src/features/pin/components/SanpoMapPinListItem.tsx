import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { Icon } from "@/components/ui/icon/Icon";
import { Tag } from "@/components/ui/tag/Tag";
import { PinPhotoImage } from "@/features/pin/components/PinPhotoImage";
import { PinStatusBadges } from "@/features/pin/components/PinStatusBadges";
import { formatPinCreatedAt, pinDisplayName } from "@/features/pin/lib/pinDetailState";
import { pinStatusAccessibilityLabels, resolvePinStatusBadges } from "@/features/pin/lib/pinStatus";
import { pinRowAccessibilityLabel, summarizePinTags } from "@/features/pin/lib/sanpoMapScreenState";
import type { PinListEntry } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapPinListItemProps = {
  pin: PinListEntry;
  onPress: (pinId: string) => void;
  /** 代表写真の読み込み失敗（URL の失効の可能性）。 */
  onPhotoError: () => void;
  testID: string;
};

const THUMB_SIZE = 64;

/** SanpoMapPinListItem — 地図詳細のピン一覧の1行（SS-121）。サムネイル・名前・日時・タグ。 */
function SanpoMapPinListItemBase({ pin, onPress, onPhotoError, testID }: SanpoMapPinListItemProps) {
  const theme = useTheme();
  const styles = useStyles();
  const displayName = pinDisplayName(pin.name);
  const createdAtLabel = formatPinCreatedAt(pin.createdAt);
  const tags = summarizePinTags(pin.tags);
  const statusBadges = resolvePinStatusBadges(pin, "list");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={pinRowAccessibilityLabel({
        displayName,
        createdAtLabel,
        tags: pin.tags,
        statusLabels: pinStatusAccessibilityLabels(pin, "list"),
      })}
      accessibilityHint="ピンの詳細を開きます"
      onPress={() => onPress(pin.id)}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: theme.colors.neutralPress } : null,
      ]}
      testID={testID}
    >
      {pin.coverPhoto !== null ? (
        <PinPhotoImage
          photoId={pin.coverPhoto.id}
          variant="thumb"
          uri={pin.coverPhoto.thumbnailUrl}
          contentFit="cover"
          onError={onPhotoError}
          style={styles.thumb}
        />
      ) : (
        // 写真なし。PinPhotoImage の null 表示（image-off）は「読めなかった」の意味になるので使わない。
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Icon name="map-pin" size={24} color={theme.colors.textTertiary} />
        </View>
      )}
      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <PinStatusBadges badges={statusBadges} testIDPrefix={`${testID}-status`} />
        {createdAtLabel !== null ? <Text style={styles.metaText}>{createdAtLabel}</Text> : null}
        {tags.visible.length > 0 ? (
          <View style={styles.tags}>
            {tags.visible.map((label, i) => (
              <Tag key={`${i}-${label}`} category="neutral" style={styles.tag}>
                {label}
              </Tag>
            ))}
            {tags.hiddenCount > 0 ? <Text style={styles.metaText}>+{tags.hiddenCount}</Text> : null}
          </View>
        ) : null}
      </View>
      <Icon name="chevron-right" size={18} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

export const SanpoMapPinListItem = memo(SanpoMapPinListItemBase);

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
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  thumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.trackSubtle,
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
  metaText: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
  tag: {
    // 行に並べるので Tag の既定より小さくする。
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
  },
  tags: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
}));
