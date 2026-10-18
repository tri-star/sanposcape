import { LegalConsentNotice } from "@/components/legal/LegalConsentNotice";
import { Button } from "@/components/ui/button/Button";
import { AppleSignInButton } from "@/features/auth/components/AppleSignInButton";
import { AuthProviderButton } from "@/features/auth/components/AuthProviderButton";
import { AuthScreenLayout } from "@/features/auth/components/AuthScreenLayout";
import { useAuthActions } from "@/features/auth/hooks/useAuthActions";

/**
 * サインイン画面。mock `isLogin` をほぼ1:1で再現する。
 * 「Google でログイン」は押下後に散歩開始画面へ遷移する。
 * ゲスト導線は SS-13 で一旦外し、SS-57 で復活した（ADR-M-009 SS-57 追補参照）。
 * SS-199 で iOS だけ Apple のボタンを Google の上に追加した。
 * SS-221 で「アカウントを作成する」導線とサインアップ画面を削除した（サインインは Google / Apple のみ）。
 * SS-158 でプライバシーポリシーへのリンクを末尾に追加し、SS-187 で利用規約への同意の文言とリンクに置き換えた。
 */
export function SignInView() {
  const {
    signInWithGoogle,
    signInWithApple,
    continueAsGuest,
    isSubmitting,
    submittingProvider,
    toast,
  } = useAuthActions();

  return (
    <AuthScreenLayout
      testID="sign-in-screen"
      heroSubtitle={"いつもの道を、\nちょっと楽しい寄り道に。"}
      heroCaption={"往復の時間を決めるだけ。\n歩いて行けるスポットへ案内します。"}
      toast={toast}
    >
      <AppleSignInButton
        testID="sign-in-apple-button"
        disabled={isSubmitting}
        onPress={signInWithApple}
      />
      <AuthProviderButton
        testID="sign-in-google-button"
        disabled={isSubmitting}
        onPress={signInWithGoogle}
      >
        {submittingProvider === "google" ? "ログイン中..." : "Google でログイン"}
      </AuthProviderButton>
      <Button
        testID="sign-in-guest-button"
        variant="ghost"
        size="md"
        fullWidth
        disabled={isSubmitting}
        onPress={continueAsGuest}
      >
        ゲストで試す
      </Button>
      <LegalConsentNotice testIDPrefix="sign-in" />
    </AuthScreenLayout>
  );
}
