import { Text, View } from "react-native";

import { makeStyles } from "@/theme/makeStyles";

export type PinClusterBubbleProps = {
  count: number;
};

/** 件数の桁で円を大きくする（多いまとまりほど目立たせる）。 */
export function pinClusterBubbleSize(count: number): number {
  if (count < 10) return 36;
  if (count < 100) return 42;
  return 48;
}

/**
 * PinClusterBubble — 地図上のピンのまとまり（SS-243）。件数を入れた円で、地図をまたいでまとめるので
 * 地図のアイコンの色ではなく、アプリの主色で描く。`Marker` の子として使う（中心を座標に合わせる）。
 */
export function PinClusterBubble({ count }: PinClusterBubbleProps) {
  const styles = useStyles();
  const size = pinClusterBubbleSize(count);
  return (
    <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.count} numberOfLines={1} allowFontScaling={false}>
        {count}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  bubble: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    borderWidth: 3,
    borderColor: theme.colors.onPrimary,
  },
  count: {
    color: theme.colors.onPrimary,
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
  },
}));
