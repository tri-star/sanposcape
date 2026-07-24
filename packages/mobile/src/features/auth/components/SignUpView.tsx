import { useRouter } from "expo-router";

import { Button } from "@/components/ui/button/Button";
import { AuthProviderButton } from "@/features/auth/components/AuthProviderButton";
import { AuthScreenLayout } from "@/features/auth/components/AuthScreenLayout";
import { useAuthActions } from "@/features/auth/hooks/useAuthActions";

/**
 * サインアップ画面。mock に直接該当なし。`isLogin` の様式を流用した新規登録画面。
 * 「Google で登録」「ゲストで試す」は静的スタブで、押下後は散歩開始画面へ遷移する。
 */
export function SignUpView() {
  const router = useRouter();
  const { signUpWithGoogle, continueAsGuest, toast } = useAuthActions();

  return (
    <AuthScreenLayout
      testID="sign-up-screen"
      heroSubtitle={"新しいアカウントで、\n散歩をもっと楽しく。"}
      heroCaption={"往復の時間を決めるだけ。\n歩いて行けるスポットへ案内します。"}
      toast={toast}
    >
      <AuthProviderButton testID="sign-up-google-button" onPress={signUpWithGoogle}>
        Google で登録
      </AuthProviderButton>
      <Button testID="sign-up-guest-button" variant="ghost" fullWidth onPress={continueAsGuest}>
        ゲストで試す
      </Button>
      <Button
        testID="sign-up-to-sign-in-link"
        variant="ghost"
        size="sm"
        onPress={() => router.back()}
      >
        すでにアカウントをお持ちですか？ サインイン
      </Button>
    </AuthScreenLayout>
  );
}
