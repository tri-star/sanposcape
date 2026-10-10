import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { PinPhotoImage } from "@/features/pin/components/PinPhotoImage";
import { PinPhotoZoomView } from "@/features/pin/components/PinPhotoZoomView";
import {
  resolveViewerNav,
  resolveViewerPhotoDate,
  viewerCounterLabel,
} from "@/features/pin/lib/pinPhotoViewer";
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
 * RN `Modal` を使わず `position: absolute` の View にする（ADR-M-011 D7 と同じ理由:
 * `Modal` は Android のハードウェアバックを `onRequestClose` で先取りし、`useScreenBack` の
 * `onIntercept` が届かなくなる）。前後の移動はボタンのみ（スワイプは入れない）。原本はピンチで
 * 1〜4倍に拡大でき、拡大中はドラッグで動かせる（`PinPhotoZoomView`。SS-153）。前後に移動すると
 * 倍率は1に戻る。上部にカウンタと撮影日時（無ければアップロード日時。SS-163）を出す。
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
  const photoDate = photo ? resolveViewerPhotoDate(photo) : null;
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
      // 表示中は背後の画面へフォーカスを移さない（iOS。Android は PinDetailView が背後を隠す）。
      accessibilityViewIsModal
      // 写真ビューアは両テーマで暗背景にする（テーマの用途名では表現できないため、
      // ここだけ意図的に palette を直接使う）。
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: theme.palette.ink900 }]}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + theme.spacing[2] }]}>
        <View style={styles.topInfo}>
          <Text
            style={[styles.counter, { color: theme.colors.onColor }]}
            testID="pin-photo-viewer-counter"
          >
            {viewerCounterLabel(index, photoCount)}
          </Text>
          {photoDate !== null ? (
            <Text
              style={[styles.date, { color: theme.colors.onColor }]}
              numberOfLines={1}
              testID="pin-photo-viewer-date"
            >
              {photoDate.label}
            </Text>
          ) : null}
        </View>
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
            <PinPhotoZoomView
              // 写真が変わったら作り直して倍率を1に戻す（前後移動・件数変化による index の収め直し）。
              // 同じ写真の URL の取り直し（読み込み失敗時）では作り直さず、拡大状態を保つ。
              key={photo.id}
              contentWidth={photo.width}
              contentHeight={photo.height}
              testID="pin-photo-viewer-zoom"
            >
              <PinPhotoImage
                photoId={photo.id}
                variant="original"
                uri={photo.originalUrl}
                placeholderUri={photo.thumbnailUrl}
                contentFit="contain"
                style={styles.image}
                onError={onImageError}
              />
            </PinPhotoZoomView>
          ) : (
            <View style={styles.unavailableWrap}>
              {photo.thumbnailUrl !== null ? (
                <PinPhotoImage
                  photoId={photo.id}
                  variant="thumb"
                  uri={photo.thumbnailUrl}
                  contentFit="contain"
                  style={styles.image}
                  onError={onImageError}
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

      <View style={[styles.navRow, { paddingBottom: insets.bottom + theme.spacing[4] }]}>
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
  topInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: theme.spacing[3],
    gap: theme.spacing[1],
  },
  date: {
    fontSize: theme.typography.size.xs,
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
  },
}));
