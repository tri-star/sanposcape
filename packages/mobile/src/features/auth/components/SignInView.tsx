import { useRouter } from "expo-router";

import { Button } from "@/components/ui/button/Button";
import { AuthProviderButton } from "@/features/auth/components/AuthProviderButton";
import { AuthScreenLayout } from "@/features/auth/components/AuthScreenLayout";
import { useAuthActions } from "@/features/auth/hooks/useAuthActions";

/**
 * サインイン画面。mock `isLogin` をほぼ1:1で再現する。
 * 「Google でログイン」は押下後に散歩開始画面へ遷移する。
 * ゲスト導線は SS-13 で一旦外した（`useAuthActions` の JSDoc / ADR-009 参照）。
 */
export function SignInView() {
  const router = useRouter();
  const { signInWithGoogle, isSubmitting, toast } = useAuthActions();

  return (
    <AuthScreenLayout
      testID="sign-in-screen"
      heroSubtitle={"いつもの道を、\nちょっと楽しい寄り道に。"}
      heroCaption={"往復の時間を決めるだけ。\n歩いて行けるスポットへ案内します。"}
      toast={toast}
    >
      <AuthProviderButton
        testID="sign-in-google-button"
        disabled={isSubmitting}
        onPress={signInWithGoogle}
      >
        {isSubmitting ? "ログイン中..." : "Google でログイン"}
      </AuthProviderButton>
      <Button
        testID="sign-in-to-sign-up-link"
        variant="ghost"
        size="sm"
        disabled={isSubmitting}
        onPress={() => router.push("/(auth)/sign-up")}
      >
        アカウントを作成する
      </Button>
    </AuthScreenLayout>
  );
}
