/**
 * `import img from "@/assets/images/xxx.png"` を型付きで扱うための宣言。
 * ランタイムは Metro のアセットリゾルバが解決する（バンドラ標準の挙動）。
 */
declare module "*.png" {
  import type { ImageSourcePropType } from "react-native";

  const value: ImageSourcePropType;
  export default value;
}
