import { memo } from "react";
import { Text, useWindowDimensions, View } from "react-native";

import { Badge } from "@/components/ui/badge/Badge";
import { Button } from "@/components/ui/button/Button";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { PinPhotoImage } from "@/features/pin/components/PinPhotoImage";
import type { PinEditExistingPhoto } from "@/features/pin/hooks/usePinEdit";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type PinEditExistingPhotosProps = {
  items: readonly PinEditExistingPhoto[];
  photoCount: number;
  markedCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreErrorMessage: string | null;
  onToggleDeletion: (photoId: string) => void;
  onLoadMore: () => void;
  onImageError: () => void;
  /** 保存中は削除の印の付け外しを止める。 */
  disabled?: boolean;
  testID: string;
};

/** グリッドの列数。タイルサイズの計算にも使う（`PinPhotoGrid` と同じ）。 */
const COLUMN_COUNT = 4;

type TileProps = {
  entry: PinEditExistingPhoto;
  index: number;
  tileSize: number;
  disabled: boolean;
  onToggleDeletion: (photoId: string) => void;
  onImageError: () => void;
  testID: string;
};

const ExistingPhotoTile = memo(function ExistingPhotoTile({
  entry,
  index,
  tileSize,
  disabled,
  onToggleDeletion,
  onImageError,
  testID,
}: TileProps) {
  const styles = useStyles();
  const photoNumber = index + 1;
  const { photo, markedForDeletion, deletable } = entry;

  // 操作できるボタンを持つタイルはボタン側にラベルがある（タイル全体を accessible にすると
  // 中のボタンに届かなくなる）。ボタンを持たない2つの場合だけ、タイル自身が状態を読み上げる。
  const hasNoButton = disabled || (!markedForDeletion && !deletable);
  const label = markedForDeletion
    ? `写真${photoNumber}（削除予定）`
    : deletable
      ? `写真${photoNumber}`
      : `写真${photoNumber}（削除できません）`;

  return (
    <View
      style={[styles.tile, { width: tileSize, height: tileSize }]}
      accessible={hasNoButton}
      accessibilityLabel={hasNoButton ? label : undefined}
      testID={testID}
    >
      <PinPhotoImage
        photoId={photo.id}
        variant="thumb"
        uri={photo.thumbnailUrl}
        contentFit="cover"
        style={styles.tileImage}
        onError={onImageError}
      />

      {markedForDeletion ? (
        <View style={styles.markedOverlay} testID={`${testID}-marked`}>
          <Badge tone="danger">削除</Badge>
        </View>
      ) : null}

      {!disabled && markedForDeletion ? (
        <IconButton
          icon="undo-2"
          label={`写真${photoNumber}の削除を取り消す`}
          size="sm"
          variant="surface"
          style={styles.actionButton}
          onPress={() => onToggleDeletion(photo.id)}
          testID={`${testID}-undo`}
        />
      ) : null}

      {!disabled && !markedForDeletion && deletable ? (
        <IconButton
          icon="x"
          label={`写真${photoNumber}を削除`}
          size="sm"
          variant="surface"
          style={styles.actionButton}
          onPress={() => onToggleDeletion(photo.id)}
          testID={`${testID}-remove`}
        />
      ) : null}
    </View>
  );
});

/**
 * PinEditExistingPhotos — 登録済みの写真に「削除の印」を付けるグリッド（SS-119）。
 * 印は保存まで保留され（キャンセルすれば何も消えない）、押し間違えは元に戻せる。
 */
export function PinEditExistingPhotos({
  items,
  photoCount,
  markedCount,
  hasMore,
  isLoadingMore,
  loadMoreErrorMessage,
  onToggleDeletion,
  onLoadMore,
  onImageError,
  disabled = false,
  testID,
}: PinEditExistingPhotosProps) {
  const styles = useStyles();
  const { width: windowWidth } = useWindowDimensions();
  const theme = useTheme();

  const contentWidth = windowWidth - theme.layout.pageGutter * 2;
  const tileSize = (contentWidth - theme.spacing[2] * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

  return (
    <View testID={testID} style={styles.root}>
      <View style={styles.heading}>
        <Text style={styles.headingText}>登録済みの写真</Text>
        <Text style={styles.count}>{photoCount} 枚</Text>
      </View>
      {markedCount > 0 ? (
        <Text style={styles.caption} testID={`${testID}-marked-caption`}>
          {`${markedCount} 枚を削除します（保存で確定）`}
        </Text>
      ) : null}

      {items.length === 0 ? (
        <Text style={styles.empty} testID={`${testID}-empty`}>
          写真はありません
        </Text>
      ) : (
        <View style={styles.grid}>
          {items.map((entry, index) => (
            <ExistingPhotoTile
              key={entry.photo.id}
              entry={entry}
              index={index}
              tileSize={tileSize}
              disabled={disabled}
              onToggleDeletion={onToggleDeletion}
              onImageError={onImageError}
              testID={`${testID}-${index}`}
            />
          ))}
        </View>
      )}

      {hasMore ? (
        <Button
          variant="secondary"
          disabled={isLoadingMore}
          onPress={onLoadMore}
          testID={`${testID}-more`}
        >
          {isLoadingMore ? "読み込み中…" : "もっと見る"}
        </Button>
      ) : null}

      {loadMoreErrorMessage ? <Text style={styles.errorText}>{loadMoreErrorMessage}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    marginHorizontal: theme.layout.pageGutter,
    gap: theme.spacing[2],
  },
  heading: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  headingText: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textSecondary,
  },
  count: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
  },
  caption: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.danger,
  },
  empty: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textTertiary,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  tile: {
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.trackSubtle,
  },
  tileImage: {
    width: "100%",
    height: "100%",
  },
  markedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.scrim,
  },
  actionButton: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  errorText: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.danger,
  },
}));
