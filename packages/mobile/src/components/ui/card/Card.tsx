import type { ReactNode } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";

import { makeStyles } from "@/theme/makeStyles";

export type CardProps = {
  children: ReactNode;
  /** 内側の余白。既定は `--space-4`(16)。 */
  padding?: number;
  /** true（既定）は影付き、false は hairline のボーダー。 */
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Card — 白い基本サーフェス。統計・リスト行・地図上のパネルなど広く使う。
 * デザイン: Sanpo Design System / components/data/Card
 */
export function Card({ children, padding, elevated = true, style, testID }: CardProps) {
  const styles = useStyles();

  return (
    <View
      testID={testID}
      style={[
        styles.base,
        elevated ? styles.elevated : styles.outlined,
        padding === undefined ? null : { padding },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  base: {
    backgroundColor: theme.colors.surfaceCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing[4],
  },
  elevated: theme.shadows.sm,
  outlined: {
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.borderSubtle,
  },
}));
