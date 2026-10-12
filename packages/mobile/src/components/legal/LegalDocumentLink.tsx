import { Pressable, Text, View } from "react-native";

import { Icon } from "@/components/ui/icon/Icon";
import { useOpenExternalUrl } from "@/hooks/useOpenExternalUrl";
import { externalUrlOpenFailedMessage } from "@/lib/externalUrl";
import { MIN_TOUCH_TARGET } from "@/lib/hitSlop";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type LegalDocumentLinkProps = {
  /** 必須。画面ごとに別の値を渡す（例: "settings-privacy-policy-link"）。 */
  testID: string;
  /** 開く法的文書の URL（`config/legalLinks.ts` の定数を渡す）。 */
  url: string;
  /** リンクの表示名（`config/legalLinks.ts` の定数を渡す。画面ごとに言い換えない）。 */
  label: string;
  /** 行内の揃え。設定のカードは "start"（既定）、認証画面の下部は "center"。 */
  align?: "start" | "center";
};

/**
 * 法的文書（LP の公開ページ）へのリンク。SS-158 でプライバシーポリシー用に作り、SS-187 で利用規約にも使えるよう汎用化した。
 * `features/settings` と `features/auth` の2機能から使うため `src/components/legal/` に置く。
 * 開く手段・フォールバック・URL を本番固定にする理由は ADR-M-020。
 * 開く先は固定なので `onPress` は受けない（内部に必ずハンドラを持つ）。
 */
export function LegalDocumentLink({ testID, url, label, align = "start" }: LegalDocumentLinkProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { failedUrl, open } = useOpenExternalUrl();
  const centered = align === "center";

  return (
    <View style={centered ? styles.centerRoot : undefined}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        accessibilityHint="ウェブページを開きます"
        onPress={() => open(url)}
        testID={testID}
        style={({ pressed }) => [
          styles.link,
          centered && styles.linkCenter,
          pressed && styles.linkPressed,
          { transform: [{ scale: pressed ? 0.97 : 1 }] },
        ]}
      >
        <Text style={styles.linkLabel}>{label}</Text>
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
