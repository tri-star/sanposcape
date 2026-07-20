/**
 * vitest (node環境) 用の lucide-react-native モック。
 *
 * `lucide-react-native` は内部で `react-native-svg` を import しており、
 * Vitest は node_modules 配下のパッケージを既定で外部化(externalize)するため、
 * そのパッケージ内部の import はこのプロジェクトの `resolve.alias`
 * (`react-native-svg` のモック差し替え)を経由せず、Node のネイティブ ESM 解決で
 * 実物の `react-native-svg` → `react-native`(Flow構文)まで読み込まれてしまい、
 * node 環境ではパースできず落ちる。
 *
 * `iconRegistry.ts` の検証(キーの網羅性・kebab-case 等)は実際のアイコンの見た目を
 * 必要としないため、`lucide-react-native` 自体をこの最小スタブに差し替える。
 * ここに無いアイコン名を `iconRegistry.ts` で使うと、このモックが `undefined` を返し
 * `iconRegistry.test.ts` の「全エントリが truthy」テストが失敗して気付ける。
 */
function createNoopIcon(name: string) {
  const component = () => null;
  component.displayName = name;
  return component;
}

export const Activity = createNoopIcon("Activity");
export const AlertTriangle = createNoopIcon("AlertTriangle");
export const ArrowLeft = createNoopIcon("ArrowLeft");
export const Award = createNoopIcon("Award");
export const Bell = createNoopIcon("Bell");
export const Bookmark = createNoopIcon("Bookmark");
export const Calendar = createNoopIcon("Calendar");
export const Check = createNoopIcon("Check");
export const ChevronDown = createNoopIcon("ChevronDown");
export const ChevronRight = createNoopIcon("ChevronRight");
export const Clock = createNoopIcon("Clock");
export const Coffee = createNoopIcon("Coffee");
export const Compass = createNoopIcon("Compass");
export const Flag = createNoopIcon("Flag");
export const Footprints = createNoopIcon("Footprints");
export const Heart = createNoopIcon("Heart");
export const House = createNoopIcon("House");
export const Info = createNoopIcon("Info");
export const Library = createNoopIcon("Library");
export const LogOut = createNoopIcon("LogOut");
export const MapPin = createNoopIcon("MapPin");
export const Minus = createNoopIcon("Minus");
export const Navigation = createNoopIcon("Navigation");
export const Plus = createNoopIcon("Plus");
export const Route = createNoopIcon("Route");
export const Search = createNoopIcon("Search");
export const Settings = createNoopIcon("Settings");
export const Share = createNoopIcon("Share");
export const Star = createNoopIcon("Star");
export const TrainFront = createNoopIcon("TrainFront");
export const Trees = createNoopIcon("Trees");
export const TrendingUp = createNoopIcon("TrendingUp");
export const User = createNoopIcon("User");
export const Users = createNoopIcon("Users");
export const X = createNoopIcon("X");
