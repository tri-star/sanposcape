import { Pressable, Text } from "react-native";

import { hitSlopFor } from "@/lib/hitSlop";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type AuthProviderButtonProps = {
  children: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
};

const HEIGHT = 54;

/**
 * 「Google でログイン / 登録」用のカスタムボタン（白面・ピル・薄枠）。
 * `Button` の `outline` は枠色が `borderStrong` になり見た目が異なるため、
 * mock の白面＋薄枠のトーンに近づけるための features 限定コンポーネント。
 * Google ブランドマーク（色付き "G"）は MVP では追加しない（§8.5 で確定）。
 */
export function AuthProviderButton({
  children,
  onPress,
  disabled = false,
  testID,
}: AuthProviderButtonProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={children}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      hitSlop={hitSlopFor(HEIGHT)}
      style={({ pressed }) => [
        styles.root,
        theme.shadows.sm,
        disabled ? styles.disabled : null,
        { transform: [{ scale: pressed && !disabled ? 0.97 : 1 }] },
      ]}
    >
      <Text style={[styles.label, disabled ? styles.disabledLabel : null]}>{children}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    height: HEIGHT,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceCard,
    borderWidth: 1.5,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.pill,
  },
  label: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  disabled: {
    backgroundColor: theme.colors.disabledSurface,
    borderColor: theme.colors.borderSubtle,
  },
  disabledLabel: {
    color: theme.colors.textDisabled,
  },
}));
