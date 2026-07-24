import { Image, Text, View } from "react-native";

import walkerImage from "@/assets/images/walker.png";
import { Icon } from "@/components/ui/icon/Icon";
import { makeStyles } from "@/theme/makeStyles";
import { letterSpacing, lineHeight } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

export type AuthHeroProps = {
  /** キャッチコピー（2行想定）。 */
  subtitle?: string;
  /** 補足文。 */
  caption?: string;
};

/** walker.png の実サイズ（242x120）に基づくアスペクト比。 */
const WALKER_ASPECT_RATIO = 242 / 120;
const WALKER_WIDTH = 210;

/**
 * ロゴ「Sanpo」＋イラスト＋キャッチの共通ヘッダー。
 * スプラッシュ / サインイン / サインアップで共有する（mock `isLogin` 上部を再現）。
 * デザイン: docs/mock の `isLogin` ブロック。イラストはライトのみ（DS readme のイラスト原則）。
 */
export function AuthHero({ subtitle, caption }: AuthHeroProps) {
  const theme = useTheme();
  const styles = useStyles();
  const isDark = theme.name === "dark";

  return (
    <View style={styles.root}>
      {isDark ? (
        <View style={styles.illustrationTint}>
          <Icon name="footprints" size={48} color={theme.colors.primary} />
        </View>
      ) : (
        <Image
          source={walkerImage}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          style={styles.illustration}
        />
      )}
      <Text style={styles.wordmark}>Sanpo</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    alignItems: "center",
  },
  illustration: {
    width: WALKER_WIDTH,
    height: WALKER_WIDTH / WALKER_ASPECT_RATIO,
    marginBottom: theme.spacing[6],
  },
  illustrationTint: {
    width: 132,
    height: 132,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceTintStrong,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing[6],
  },
  wordmark: {
    fontSize: theme.typography.size["5xl"],
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.primary,
    letterSpacing: letterSpacing(theme.typography.size["5xl"], theme.typography.tracking.tight),
  },
  subtitle: {
    marginTop: theme.spacing[3] + 2,
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
    textAlign: "center",
    lineHeight: lineHeight(theme.typography.size.md, theme.typography.leading.relaxed),
  },
  caption: {
    marginTop: theme.spacing[3],
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: lineHeight(theme.typography.size.sm, theme.typography.leading.relaxed),
  },
}));
