import { useRouter } from "expo-router";

import { Button } from "@/components/ui/button/Button";
import { AuthProviderButton } from "@/features/auth/components/AuthProviderButton";
import { AuthScreenLayout } from "@/features/auth/components/AuthScreenLayout";
import { useAuthActions } from "@/features/auth/hooks/useAuthActions";

/**
 * サインアップ画面。mock に直接該当なし。`isLogin` の様式を流用した新規登録画面。
 * 「Google で登録」は押下後に散歩開始画面へ遷移する。
 * ゲスト導線は SS-13 で一旦外し、SS-57 で復活した（ADR-009 SS-57 追補参照）。
 */
export function SignUpView() {
  const router = useRouter();
  const { signUpWithGoogle, continueAsGuest, isSubmitting, toast } = useAuthActions();

  return (
    <AuthScreenLayout
      testID="sign-up-screen"
      heroSubtitle={"新しいアカウントで、\n散歩をもっと楽しく。"}
      heroCaption={"往復の時間を決めるだけ。\n歩いて行けるスポットへ案内します。"}
      toast={toast}
    >
      <AuthProviderButton
        testID="sign-up-google-button"
        disabled={isSubmitting}
        onPress={signUpWithGoogle}
      >
        {isSubmitting ? "登録中..." : "Google で登録"}
      </AuthProviderButton>
      <Button
        testID="sign-up-guest-button"
        variant="ghost"
        size="md"
        fullWidth
        disabled={isSubmitting}
        onPress={continueAsGuest}
      >
        ゲストで試す
      </Button>
      <Button
        testID="sign-up-to-sign-in-link"
        variant="ghost"
        size="sm"
        disabled={isSubmitting}
        onPress={() => router.replace("/(auth)/sign-in")}
      >
        すでにアカウントをお持ちですか？ サインイン
      </Button>
    </AuthScreenLayout>
  );
}
