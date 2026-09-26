import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { PinPhotoImage } from "@/features/pin/components/PinPhotoImage";
import { resolveViewerNav, viewerCounterLabel } from "@/features/pin/lib/pinPhotoViewer";
import type { PinPhoto } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type PinPhotoViewerProps = {
  photos: readonly PinPhoto[];
  index: number;
  photoCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  onChangeIndex: (index: number) => void;
  onLoadMore: () => void;
  onClose: () => void;
  onImageError: () => void;
};

/**
 * PinPhotoViewer — 原本の全画面表示（モックの lightbox。SS-118）。
 *
 * RN `Modal` を使わず `position: absolute` の View にする（ADR-011 D7 と同じ理由:
 * `Modal` は Android のハードウェアバックを `onRequestClose` で先取りし、`useScreenBack` の
 * `onIntercept` が届かなくなる）。スワイプ・ピンチズームは入れない（スコープ外。前後移動は
 * ボタンのみ、モックどおり）。
 */
export function PinPhotoViewer({
  photos,
  index,
  photoCount,
  hasMore,
  isLoadingMore,
  onChangeIndex,
  onLoadMore,
  onClose,
  onImageError,
}: PinPhotoViewerProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  const photo = photos[index];
  const nav = resolveViewerNav({
    index,
    loadedCount: photos.length,
    hasMore,
    isLoadingMore,
  });

  const handleNext = () => {
    if (nav.next === "go") {
      onChangeIndex(index + 1);
    } else if (nav.next === "load-more") {
      onLoadMore();
    }
  };

  return (
    <View
      testID="pin-photo-viewer"
      // 写真ビューアは両テーマで暗背景にする（テーマの用途名では表現できないため、
      // ここだけ意図的に palette を直接使う）。
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: theme.palette.ink900 }]}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + theme.spacing[2] }]}>
        <Text
          style={[styles.counter, { color: theme.colors.onColor }]}
          testID="pin-photo-viewer-counter"
        >
          {viewerCounterLabel(index, photoCount)}
        </Text>
        <IconButton
          icon="x"
          label="閉じる"
          variant="surface"
          onPress={onClose}
          testID="pin-photo-viewer-close"
        />
      </View>

      <View style={styles.body}>
        {photo ? (
          photo.originalUrl !== null ? (
            <PinPhotoImage
              photoId={photo.id}
              variant="original"
              uri={photo.originalUrl}
              placeholderUri={photo.thumbnailUrl}
              contentFit="contain"
              style={styles.image}
              onError={onImageError}
            />
          ) : (
            <View style={styles.unavailableWrap}>
              {photo.thumbnailUrl !== null ? (
                <PinPhotoImage
                  photoId={photo.id}
                  variant="thumb"
                  uri={photo.thumbnailUrl}
                  contentFit="contain"
                  style={styles.image}
                />
              ) : null}
              <Text
                style={[styles.unavailableText, { color: theme.colors.onColor }]}
                testID="pin-photo-viewer-original-unavailable"
              >
                元の写真を表示できません
              </Text>
            </View>
          )
        ) : null}
      </View>

      <View style={styles.navRow}>
        <IconButton
          icon="chevron-left"
          label="前の写真"
          variant="surface"
          disabled={!nav.canPrev}
          onPress={() => onChangeIndex(index - 1)}
          testID="pin-photo-viewer-prev"
        />
        <IconButton
          icon="chevron-right"
          label="次の写真"
          variant="surface"
          disabled={nav.next === "disabled"}
          onPress={handleNext}
          testID="pin-photo-viewer-next"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.layout.pageGutter,
  },
  counter: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  unavailableWrap: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
  },
  unavailableText: {
    fontSize: theme.typography.size.sm,
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: theme.layout.pageGutter,
    paddingBottom: theme.spacing[4],
  },
}));
