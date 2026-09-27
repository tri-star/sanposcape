import { Image, type ImageStyle } from "expo-image";
import type { StyleProp } from "react-native";
import { View } from "react-native";

import { Icon } from "@/components/ui/icon/Icon";
import { pinPhotoCacheKey, type PinPhotoVariant } from "@/features/pin/lib/pinPhotoCache";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type PinPhotoImageProps = {
  photoId: string;
  variant: PinPhotoVariant;
  /** null（未生成・ストレージ障害・許可されない URL）ならプレースホルダ。 */
  uri: string | null;
  /** 原本の読み込み中に先に出すサムネイル（`variant="original"` のとき）。 */
  placeholderUri?: string | null;
  contentFit: "cover" | "contain";
  style?: StyleProp<ImageStyle>;
  onError?: () => void;
  testID?: string;
};

/**
 * PinPhotoImage — 閲覧用の写真表示を expo-image に一本化するラッパ（SS-118）。
 * キャッシュキー（`photo.id` + variant。presigned URL は応答ごとに変わるため URL をキーにしない。
 * mobile ADR-010 決定8）・プレースホルダ・失敗時の通知をここに閉じる。
 * サインアウト時のキャッシュ消去は `src/lib/imageCacheCleanup.ts` に分離している
 * （このコンポーネントが一度も読み込まれないまま出たサインアウトでも消去を保証するため。
 * SS-118 ローカルレビュー SEC-M1）。
 */
export function PinPhotoImage({
  photoId,
  variant,
  uri,
  placeholderUri,
  contentFit,
  style,
  onError,
  testID,
}: PinPhotoImageProps) {
  const theme = useTheme();
  const styles = useStyles();

  if (uri === null) {
    return (
      <View
        style={[styles.placeholder, { backgroundColor: theme.colors.trackSubtle }, style]}
        testID={testID}
      >
        <Icon name="image-off" size={24} color={theme.colors.textTertiary} />
      </View>
    );
  }

  return (
    <Image
      testID={testID}
      source={{ uri, cacheKey: pinPhotoCacheKey(photoId, variant) }}
      placeholder={
        placeholderUri
          ? { uri: placeholderUri, cacheKey: pinPhotoCacheKey(photoId, "thumb") }
          : undefined
      }
      recyclingKey={pinPhotoCacheKey(photoId, variant)}
      cachePolicy="memory-disk"
      contentFit={contentFit}
      onError={onError}
      accessibilityIgnoresInvertColors
      style={style}
    />
  );
}

const useStyles = makeStyles(() => ({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
}));
