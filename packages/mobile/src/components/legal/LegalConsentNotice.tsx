import { Text, View } from "react-native";

import { PrivacyPolicyLink } from "@/components/legal/PrivacyPolicyLink";
import { TermsLink } from "@/components/legal/TermsLink";
import { makeStyles } from "@/theme/makeStyles";

export type LegalConsentNoticeProps = {
  /** testID の接頭辞。"sign-in" なら "sign-in-terms-link" / "sign-in-privacy-policy-link"。 */
  testIDPrefix: string;
};

/**
 * サインイン・サインアップ画面の下部に出す、利用規約とプライバシーポリシーへの同意の文言とリンク。SS-187。
 * チェックボックスは付けず、文言とリンクの表示だけにする（ゲストで試す場合も同じ画面で表示される）。
 */
export function LegalConsentNotice({ testIDPrefix }: LegalConsentNoticeProps) {
  const styles = useStyles();

  return (
    <View style={styles.root}>
      <Text style={styles.text}>
        下記の利用規約とプライバシーポリシーに同意のうえ、ご利用ください。
      </Text>
      <View style={styles.links}>
        <TermsLink testID={`${testIDPrefix}-terms-link`} align="center" />
        <PrivacyPolicyLink testID={`${testIDPrefix}-privacy-policy-link`} align="center" />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    alignItems: "center",
    gap: theme.spacing[1],
  },
  text: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  links: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "flex-start",
    columnGap: theme.spacing[2],
  },
}));
