import {
  LegalDocumentLink,
  type LegalDocumentLinkProps,
} from "@/components/legal/LegalDocumentLink";
import { PRIVACY_POLICY_LABEL, PRIVACY_POLICY_URL } from "@/config/legalLinks";

export type PrivacyPolicyLinkProps = Pick<LegalDocumentLinkProps, "testID" | "align">;

/** プライバシーポリシー（LP の `/privacy/`）へのリンク。SS-158。 */
export function PrivacyPolicyLink(props: PrivacyPolicyLinkProps) {
  return <LegalDocumentLink {...props} url={PRIVACY_POLICY_URL} label={PRIVACY_POLICY_LABEL} />;
}
