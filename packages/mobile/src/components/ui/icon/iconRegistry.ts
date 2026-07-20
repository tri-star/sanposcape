import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Award,
  ArrowLeft,
  Bell,
  Bookmark,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
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
  TreePine,
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
 * `MapPin` のカテゴリアイコン(tree-pine/coffee/book-open/train-front)は
 * `design/components/DS-COMPONENT-SPECS.md` の MapPin 表と突き合わせ済み(B-6)。
 * それ以外は DesignSync 未接続時に現時点で必要になったもの・想定される用途から選定した暫定セット。
 * 今後 DS の実際のアイコン一覧と突き合わせること。
 */
export const ICON_REGISTRY = {
  activity: Activity,
  "alert-circle": AlertCircle,
  "alert-triangle": AlertTriangle,
  "arrow-left": ArrowLeft,
  award: Award,
  bell: Bell,
  bookmark: Bookmark,
  "book-open": BookOpen,
  calendar: Calendar,
  check: Check,
  "check-circle-2": CheckCircle2,
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
  "train-front": TrainFront,
  "tree-pine": TreePine,
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
