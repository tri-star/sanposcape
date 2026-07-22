import { type ImageStyle, StyleSheet, type TextStyle, type ViewStyle } from "react-native";

import type { Theme } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/**
 * テーマを受け取ってスタイルを組み立てるファクトリから、hook を作る。
 *
 * ライト/ダークの2種類しかないため、生成結果はテーマ名をキーにキャッシュして
 * 再レンダリングのたびに `StyleSheet.create` が走らないようにしている。
 *
 * @example
 * const useStyles = makeStyles((theme) => ({
 *   root: { backgroundColor: theme.colors.surfaceCard },
 * }));
 *
 * function Card() {
 *   const styles = useStyles();
 *   return <View style={styles.root} />;
 * }
 */
export function makeStyles<T extends NamedStyles>(factory: (theme: Theme) => T): () => T {
  const cache = new Map<Theme["name"], T>();

  return function useStyles(): T {
    const theme = useTheme();
    const cached = cache.get(theme.name);
    if (cached) return cached;

    const created = StyleSheet.create(factory(theme));
    cache.set(theme.name, created);
    return created;
  };
}
