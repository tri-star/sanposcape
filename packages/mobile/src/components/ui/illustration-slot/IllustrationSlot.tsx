import { View } from "react-native";
import { useUnistyles, StyleSheet } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon/Icon";
import {
  resolveIllustrationSlotAppearance,
  type IllustrationSlotKind,
  type IllustrationSlotSize,
} from "@/components/ui/illustration-slot/illustrationSlotStyles";

export type IllustrationSlotProps = {
  /** 用途の識別子。将来ここで実アセットに分岐する */
  kind: IllustrationSlotKind;
  /** 既定 "md" */
  size?: IllustrationSlotSize;
  testID?: string;
};

/**
 * 実イラストアセットが未提供のため(DS の readme に「イラストは参照画像からの切り出し1点のみ」と
 * 明記)、イラスト枠をこのコンポーネントに閉じ込める。
 * light/dark 共通で「tint パネル + Lucide アイコン」方式を採用する(決定事項。dark では
 * イラストを使わない DS の代替パターンを light にも適用した)。
 * 実アセット入手後は、このコンポーネントの中身だけを差し替えればよい。
 *
 * `useUnistyles()` は Icon の props(iconName・size・color)を得るためだけに使う。
 * 枠の見た目(サイズ・角丸・背景)は StyleSheet.create 側で解決する。
 */
export function IllustrationSlot({ kind, size = "md", testID }: IllustrationSlotProps) {
  const { theme } = useUnistyles();
  const args = { kind, size };
  const appearance = resolveIllustrationSlotAppearance(theme, args);

  return (
    <View
      testID={testID}
      // 装飾目的のプレースホルダのため、スクリーンリーダーからは隠す
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.box(args)}
    >
      <Icon name={appearance.iconName} size={appearance.iconSize} color={appearance.iconColor} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  box: (args: { kind: IllustrationSlotKind; size: IllustrationSlotSize }) => {
    const appearance = resolveIllustrationSlotAppearance(theme, args);
    return {
      width: appearance.boxSize,
      height: appearance.boxSize,
      borderRadius: appearance.borderRadius,
      backgroundColor: appearance.tintColor,
      alignItems: "center",
      justifyContent: "center",
    };
  },
}));
