import {
  LegalDocumentLink,
  type LegalDocumentLinkProps,
} from "@/components/legal/LegalDocumentLink";
import { TERMS_LABEL, TERMS_URL } from "@/config/legalLinks";

export type TermsLinkProps = Pick<LegalDocumentLinkProps, "testID" | "align">;

/** 利用規約（LP の `/terms/`）へのリンク。SS-187。 */
export function TermsLink(props: TermsLinkProps) {
  return <LegalDocumentLink {...props} url={TERMS_URL} label={TERMS_LABEL} />;
}
