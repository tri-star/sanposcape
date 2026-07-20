import { useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
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
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = source !== undefined && !imageFailed;
  const initial = getAvatarInitial(name);
  const boxStyle = styles.root({ size });
  const initialStyle = styles.initial({ size });

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={name ?? "アバター"}
      style={boxStyle}
    >
      {showImage ? (
        <Image
          source={source}
          style={{ width: boxStyle.width, height: boxStyle.height }}
          onError={() => setImageFailed(true)}
        />
      ) : initial ? (
        <Text style={initialStyle}>{initial}</Text>
      ) : (
        <Icon name="user" size={initialStyle.fontSize} color={initialStyle.color} />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: (args: { size: AvatarSize }) => {
    const appearance = resolveAvatarAppearance(theme, args);
    return {
      width: appearance.boxSize,
      height: appearance.boxSize,
      borderRadius: appearance.borderRadius,
      backgroundColor: appearance.backgroundColor,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    };
  },
  initial: (args: { size: AvatarSize }) => {
    const appearance = resolveAvatarAppearance(theme, args);
    return {
      color: appearance.initialColor,
      fontFamily: theme.fontFamily.label,
      fontSize: appearance.initialFontSize,
      fontWeight: theme.typography.label.fontWeight,
    };
  },
}));
