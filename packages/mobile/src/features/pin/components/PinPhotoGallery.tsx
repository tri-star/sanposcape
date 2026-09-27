import { Pressable, Text, useWindowDimensions, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { PinPhotoImage } from "@/features/pin/components/PinPhotoImage";
import type { PinPhoto } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type PinPhotoGalleryProps = {
  photos: readonly PinPhoto[];
  photoCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  /** 写真ページの取得失敗時の文言（null なら出さない）。 */
  loadMoreErrorMessage: string | null;
  onOpen: (index: number) => void;
  onLoadMore: () => void;
  onImageError: () => void;
  testID: string;
};

const COLUMN_COUNT = 2;
const TILE_ASPECT_RATIO = 4 / 3;

/** PinPhotoGallery — 詳細画面のサムネイルの2列グリッド（モックの `detailPhotos`）。 */
export function PinPhotoGallery({
  photos,
  photoCount,
  hasMore,
  isLoadingMore,
  loadMoreErrorMessage,
  onOpen,
  onLoadMore,
  onImageError,
  testID,
}: PinPhotoGalleryProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { width: windowWidth } = useWindowDimensions();

  const contentWidth = windowWidth - theme.layout.pageGutter * 2;
  const tileWidth = (contentWidth - theme.spacing[2] * (COLUMN_COUNT - 1)) / COLUMN_COUNT;
  const tileHeight = tileWidth / TILE_ASPECT_RATIO;

  return (
    <View testID={testID} style={styles.root}>
      <View style={styles.heading}>
        <Text style={styles.headingText}>写真</Text>
        <Text style={styles.count}>{photoCount} 枚</Text>
      </View>

      {photos.length === 0 ? (
        <Text style={styles.empty} testID={`${testID}-empty`}>
          写真はありません
        </Text>
      ) : (
        <View style={styles.grid}>
          {photos.map((photo, index) => (
            <Pressable
              key={photo.id}
              accessibilityRole="imagebutton"
              accessibilityLabel={`写真${index + 1}を拡大表示`}
              onPress={() => onOpen(index)}
              testID={`${testID}-${index}`}
              style={[styles.tile, { width: tileWidth, height: tileHeight }]}
            >
              <PinPhotoImage
                photoId={photo.id}
                variant="thumb"
                uri={photo.thumbnailUrl}
                contentFit="cover"
                style={styles.tileImage}
                onError={onImageError}
              />
            </Pressable>
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
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    backgroundColor: theme.colors.trackSubtle,
  },
  tileImage: {
    width: "100%",
    height: "100%",
  },
  errorText: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.danger,
  },
}));
