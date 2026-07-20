import { useState } from "react";
import { Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { Image } from "expo-image";

import { Icon } from "@/components/ui/icon/Icon";
import {
  getAvatarInitial,
  resolveAvatarAppearance,
  type AvatarSize,
} from "@/components/ui/avatar/avatarStyles";

export type AvatarProps = {
  source?: { uri: string };
  /** source が無い / 読み込み失敗時のフォールバック表示に使う */
  name?: string;
  size?: AvatarSize;
  testID?: string;
};

export function Avatar({ source, name, size = "md", testID }: AvatarProps) {
  const { theme } = useUnistyles();
  const [imageFailed, setImageFailed] = useState(false);
  const appearance = resolveAvatarAppearance(theme, { size });
  const showImage = source !== undefined && !imageFailed;
  const initial = getAvatarInitial(name);

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={name ?? "アバター"}
      style={{
        width: appearance.boxSize,
        height: appearance.boxSize,
        borderRadius: appearance.borderRadius,
        backgroundColor: appearance.backgroundColor,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {showImage ? (
        <Image
          source={source}
          style={{ width: appearance.boxSize, height: appearance.boxSize }}
          onError={() => setImageFailed(true)}
        />
      ) : initial ? (
        <Text
          style={{
            color: appearance.initialColor,
            fontFamily: theme.fontFamily.label,
            fontSize: appearance.initialFontSize,
            fontWeight: theme.typography.label.fontWeight,
          }}
        >
          {initial}
        </Text>
      ) : (
        <Icon name="user" size={appearance.initialFontSize} color={appearance.initialColor} />
      )}
    </View>
  );
}
