import * as AppleAuthentication from "expo-apple-authentication";
import { Platform, View } from "react-native";

import {
  appleButtonVariantFor,
  shouldShowAppleSignIn,
} from "@/features/auth/lib/appleSignInPresentation";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type AppleSignInButtonProps = {
  /** サインイン画面は "sign-in"（「Appleでサインイン」）、サインアップ画面は "sign-up"（「Appleで登録」）。文言は OS が出す。 */
  kind: "sign-in" | "sign-up";
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
};

const HEIGHT = 54;

/**
 * Apple 公式ボタン（`AppleAuthenticationButton`）の薄いラッパ。iOS 以外は何も描かない。
 * `AuthProviderButton`（Google）と同じ高さ・幅・ピル形に揃える（審査ガイドライン 4.8 の「同等の選択肢」）。
 *
 * 公式ボタンの背景色・borderRadius は `style` で指定できない（Apple のガイドライン違反）。
 * 高さと幅は `style` で必ず指定する（無いと描画されない）。
 * 公式ボタンには `disabled` が無いので、外側の View で不透明度とタップ無効を表現し、
 * `disabled` 中の押下はハンドラ側でも無視する（`pointerEvents` は VoiceOver のダブルタップを止めないため）。
 */
export function AppleSignInButton({
  kind,
  onPress,
  disabled = false,
  testID,
}: AppleSignInButtonProps) {
  const theme = useTheme();
  const styles = useStyles();

  if (!shouldShowAppleSignIn(Platform.OS)) {
    return null;
  }

  const variant = appleButtonVariantFor(theme.name);
  // VoiceOver のダブルタップは pointerEvents に関係なく届くため、disabled 中はここで確実に無視する。
  const handlePress = () => {
    if (disabled) return;
    onPress();
  };

  return (
    // accessible を付けない（付けると子の公式ボタンの読み上げラベル＝OS のローカライズ文言が隠れる）。
    // そのため View に accessibilityState を付けても VoiceOver には伝わらないので付けない。
    <View testID={testID} style={[styles.root, disabled ? styles.disabled : null]}>
      <AppleAuthentication.AppleAuthenticationButton
        // ネイティブのボタンは配色・種別を後から変えても描き直されないことがあるため、変更時に作り直す。
        key={`${variant}-${kind}`}
        buttonType={
          kind === "sign-up"
            ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
            : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
        }
        buttonStyle={
          variant === "white"
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={HEIGHT / 2}
        style={styles.button}
        onPress={handlePress}
      />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    width: "100%",
    height: HEIGHT,
  },
  disabled: {
    opacity: 0.5,
    pointerEvents: "none",
  },
  button: {
    width: "100%",
    height: HEIGHT,
  },
}));
