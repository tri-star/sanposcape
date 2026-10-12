import type { Theme } from "@/theme/tokens";

/** Apple のボタンは iOS だけに出す（ADR-002 SS-195 追補: Android には出さない。web も出さない）。 */
export function shouldShowAppleSignIn(platformOs: string): boolean {
  return platformOs === "ios";
}

export type AppleButtonVariant = "black" | "white";

/**
 * Human Interface Guidelines: 明るい背景には黒、暗い背景には白のボタン。
 * サインイン画面の背景は theme.colors.surfaceTint（light は薄い青、dark は濃紺）。
 */
export function appleButtonVariantFor(themeName: Theme["name"]): AppleButtonVariant {
  return themeName === "dark" ? "white" : "black";
}
