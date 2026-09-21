import { Image } from "expo-image";
import { memo } from "react";
import { ActivityIndicator, Text, useWindowDimensions, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { canRetryPhotoUpload, photoUploadErrorMessage } from "@/features/pin/lib/photoUploadError";
import { photoGridCaption } from "@/features/pin/lib/photoDraft";
import type { PhotoDraftSummary } from "@/features/pin/lib/photoDraft";
import type { PhotoDraftItem } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";
import type { PhotoSource } from "@/services/photo/types";

export type PinPhotoGridProps = {
  items: PhotoDraftItem[];
  summary: PhotoDraftSummary;
  onAdd: (source: PhotoSource) => void;
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
  /** 保存中は写真の追加・削除・再試行を止める。 */
  disabled?: boolean;
  testID: string;
};

/** グリッドの列数。タイルサイズの計算にも使う。 */
const COLUMN_COUNT = 4;

/** 表示中の failed アイテムから、重複を除いたエラー文言の一覧を作る。 */
function distinctFailedMessages(items: readonly PhotoDraftItem[]): string[] {
  const seen = new Set<string>();
  const messages: string[] = [];
  for (const item of items) {
    if (item.status !== "failed" || item.errorCode === null) continue;
    if (item.errorCode === "too_many_pending") continue;
    if (seen.has(item.errorCode)) continue;
    seen.add(item.errorCode);
    messages.push(photoUploadErrorMessage(item.errorCode));
  }
  return messages;
}

type PinPhotoTileProps = {
  item: PhotoDraftItem;
  index: number;
  tileSize: number;
  disabled: boolean;
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
  testID: string;
};

/**
 * 写真タイル1枚分。`React.memo` で「変化した写真だけが再レンダーされる」ようにする
 * （ローカルレビュー MR6）。`photoDraftReducer` は変化していないアイテムの参照を保つため
 * （`state.map` で同一 localId 以外はそのまま返す）、`item` を丸ごと props にする
 * デフォルトの浅い比較で正しくスキップされる。
 */
const PinPhotoTile = memo(function PinPhotoTile({
  item,
  index,
  tileSize,
  disabled,
  onRemove,
  onRetry,
  testID,
}: PinPhotoTileProps) {
  const theme = useTheme();
  const styles = useStyles();
  const photoNumber = index + 1;

  return (
    <View style={[styles.tile, { width: tileSize, height: tileSize }]} testID={testID}>
      <Image
        source={{ uri: item.previewUri }}
        style={styles.tileImage}
        contentFit="cover"
        recyclingKey={item.localId}
      />

      {item.status === "processing" || item.status === "uploading" ? (
        <View style={styles.scrim}>
          <ActivityIndicator color={theme.colors.onColor} />
        </View>
      ) : null}

      {item.status === "waiting" ? (
        <View
          style={styles.badge}
          accessible
          accessibilityLabel={`写真${photoNumber}: 保存時に送信`}
          testID={`${testID}-waiting`}
        >
          <Icon name="clock" size={12} color={theme.colors.onColor} />
        </View>
      ) : null}

      {item.status === "attached" ? (
        <View
          style={[styles.badge, styles.badgeSuccess]}
          accessible
          accessibilityLabel={`写真${photoNumber}: 送信済み`}
        >
          <Icon name="check" size={12} color={theme.colors.onColor} />
        </View>
      ) : null}

      {item.status === "failed" ? (
        <View style={styles.failedOverlay}>
          <Icon name="alert-circle" size={20} color={theme.colors.onColor} />
          {!disabled && item.errorCode !== null && canRetryPhotoUpload(item.errorCode) ? (
            <IconButton
              icon="refresh-cw"
              label={`写真${photoNumber}を再試行`}
              size="sm"
              variant="filled"
              onPress={() => onRetry(item.localId)}
              testID={`${testID}-retry`}
            />
          ) : null}
        </View>
      ) : null}

      {!disabled && item.status !== "attached" ? (
        <IconButton
          icon="x"
          label={`写真${photoNumber}を削除`}
          size="sm"
          variant="surface"
          style={styles.removeButton}
          onPress={() => onRemove(item.localId)}
          testID={`${testID}-remove`}
        />
      ) : null}
    </View>
  );
});

/** PinPhotoGrid — 写真の4列グリッドと撮影/選択ボタン。 */
export function PinPhotoGrid({
  items,
  summary,
  onAdd,
  onRemove,
  onRetry,
  disabled = false,
  testID,
}: PinPhotoGridProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { width: windowWidth } = useWindowDimensions();
  const caption = photoGridCaption(summary);
  const failedMessages = distinctFailedMessages(items);

  // タイルの実ピクセルサイズを計算する（MR6: expo-image に明示的な描画サイズを与え、
  // 長辺2048pxの実写真をタイル解像度までダウンサンプリングしてデコードさせるため）。
  // 4列 + 列間の gap(theme.spacing[2]) 3本ぶんを引いてから等分する。
  const contentWidth = windowWidth - theme.layout.pageGutter * 2;
  const tileSize = (contentWidth - theme.spacing[2] * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

  return (
    <View testID={testID} style={styles.root}>
      <View style={styles.heading}>
        <Text style={styles.headingText}>写真</Text>
        <Text style={styles.count}>{summary.total} 枚</Text>
      </View>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}

      {items.length > 0 ? (
        <View style={styles.grid}>
          {items.map((item, index) => (
            <PinPhotoTile
              key={item.localId}
              item={item}
              index={index}
              tileSize={tileSize}
              disabled={disabled}
              onRemove={onRemove}
              onRetry={onRetry}
              testID={`${testID}-${index}`}
            />
          ))}
        </View>
      ) : null}

      {failedMessages.length > 0 ? (
        <Text style={styles.failedText}>{failedMessages.join(" / ")}</Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          variant="secondary"
          icon="camera"
          disabled={disabled}
          onPress={() => onAdd("camera")}
          testID={`${testID}-camera`}
        >
          撮影する
        </Button>
        <Button
          variant="secondary"
          icon="image-plus"
          disabled={disabled}
          onPress={() => onAdd("library")}
          testID={`${testID}-library`}
        >
          写真を選ぶ
        </Button>
      </View>
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
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.scrim,
  },
  badge: {
    position: "absolute",
    left: 4,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.textSecondary,
  },
  badgeSuccess: {
    backgroundColor: theme.colors.success,
  },
  failedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
    backgroundColor: theme.colors.dangerTint,
  },
  removeButton: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  failedText: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.danger,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
}));
