import {
  Activity,
  AlertTriangle,
  Award,
  ArrowLeft,
  Bell,
  Bookmark,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Coffee,
  Compass,
  Flag,
  Footprints,
  Heart,
  House,
  Info,
  Library,
  LogOut,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Route,
  Search,
  Settings,
  Share,
  Star,
  TrainFront,
  Trees,
  TrendingUp,
  User,
  Users,
  X,
} from "lucide-react-native";

/**
 * アプリで使う Lucide アイコンの許可リスト。
 * `lucide-react-native` はこのファイル以外から import してはならない
 * (バンドルサイズの棚卸しのため、単一入口に集約する)。
 *
 * 収録アイコンは DesignSync が未接続のため DS の `components/core/Icon.d.ts` を
 * 直接確認できておらず、現時点で必要になったもの・想定される用途から選定した暫定セット。
 * 今後 DesignSync が利用可能になった時点で DS の実際のアイコン一覧と突き合わせること。
 */
export const ICON_REGISTRY = {
  activity: Activity,
  "alert-triangle": AlertTriangle,
  "arrow-left": ArrowLeft,
  award: Award,
  bell: Bell,
  bookmark: Bookmark,
  calendar: Calendar,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  clock: Clock,
  coffee: Coffee,
  compass: Compass,
  flag: Flag,
  footprints: Footprints,
  heart: Heart,
  home: House,
  info: Info,
  library: Library,
  "log-out": LogOut,
  "map-pin": MapPin,
  minus: Minus,
  navigation: Navigation,
  plus: Plus,
  route: Route,
  search: Search,
  settings: Settings,
  share: Share,
  star: Star,
  train: TrainFront,
  trees: Trees,
  "trending-up": TrendingUp,
  user: User,
  users: Users,
  x: X,
} as const;

export type IconName = keyof typeof ICON_REGISTRY;

/** 未知の文字列が IconName かどうかを判定する(コンポーネント外部からの動的な値の検証用) */
export function isIconName(value: string): value is IconName {
  return Object.hasOwn(ICON_REGISTRY, value);
}
