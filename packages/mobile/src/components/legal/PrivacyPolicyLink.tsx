import { Pressable, Text, View } from "react-native";

import { Icon } from "@/components/ui/icon/Icon";
import { PRIVACY_POLICY_LABEL, PRIVACY_POLICY_URL } from "@/config/legalLinks";
import { useOpenExternalUrl } from "@/hooks/useOpenExternalUrl";
import { externalUrlOpenFailedMessage } from "@/lib/externalUrl";
import { MIN_TOUCH_TARGET } from "@/lib/hitSlop";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type PrivacyPolicyLinkProps = {
  /** 必須。設定画面・サインイン・サインアップで別の値を渡す（例: "settings-privacy-policy-link"）。 */
  testID: string;
  /** 行内の揃え。設定のカードは "start"（既定）、認証画面の下部は "center"。 */
  align?: "start" | "center";
};

/**
 * プライバシーポリシー（LP の公開ページ）へのリンク。SS-158。
 * `features/settings` と `features/auth` の2機能から使うため `src/components/legal/` に置く。
 * 開く手段・フォールバック・URL を本番固定にする理由は ADR-M-019。
 * 開く先は固定なので `onPress` は受けない（内部に必ずハンドラを持つ）。
 */
export function PrivacyPolicyLink({ testID, align = "start" }: PrivacyPolicyLinkProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { failedUrl, open } = useOpenExternalUrl();
  const centered = align === "center";

  return (
    <View style={centered ? styles.centerRoot : undefined}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={PRIVACY_POLICY_LABEL}
        accessibilityHint="ウェブページを開きます"
        onPress={() => open(PRIVACY_POLICY_URL)}
        testID={testID}
        style={({ pressed }) => [
          styles.link,
          centered && styles.linkCenter,
          pressed && styles.linkPressed,
          { transform: [{ scale: pressed ? 0.97 : 1 }] },
        ]}
      >
        <Text style={styles.linkLabel}>{PRIVACY_POLICY_LABEL}</Text>
        <Icon name="external-link" size={16} color={theme.colors.textLink} />
      </Pressable>
      {failedUrl !== null ? (
        <Text
          testID={`${testID}-error`}
          selectable
          accessibilityLiveRegion="polite"
          style={[styles.error, centered && styles.errorCenter]}
        >
          {externalUrlOpenFailedMessage(failedUrl)}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  centerRoot: {
    alignItems: "center",
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: theme.spacing[1],
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.md,
  },
  linkCenter: {
    alignSelf: "center",
  },
  linkPressed: {
    backgroundColor: theme.colors.primaryTint,
  },
  linkLabel: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textLink,
    textDecorationLine: "underline",
  },
  error: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.danger,
  },
  errorCenter: {
    textAlign: "center",
  },
}));
