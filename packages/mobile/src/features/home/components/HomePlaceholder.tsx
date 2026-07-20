import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

/**
 * 動作確認用の暫定ホーム画面の実体。
 * M2「デザイン取り込み・UI基盤」の後続タスク(SS-2以降)で本来のホーム画面に置き換える。
 *
 * `StyleSheet.create`(Unistyles)はここに置く。`babel.config.js` の Unistyles プラグインは
 * `root: "src"` のみを処理するため、`app/` 配下に置くとテーマ依存の検出が効かず
 * テーマ切替時に再レンダされない(詳細は `docs/design-tokens.md` の規約を参照)。
 */
export function HomePlaceholder() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>sanposcape</Text>
      <Text style={styles.subtitle}>散歩を、もっと自由に。</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[8],
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.fontFamily.heading,
    ...theme.typography.heading,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontFamily: theme.fontFamily.body,
    ...theme.typography.body,
  },
}));
