/**
 * デザインで使用する Lucide アイコンの登録簿。
 *
 * キーはデザイン（Sanpo Design System）側の kebab-case 名と一致させている。
 * バンドルサイズを抑えるため barrel（`lucide-react-native`）ではなく
 * `lucide-react-native/icons/<name>` の個別 import を使う。
 *
 * NOTE: Lucide v1 でリネームされたアイコンは、旧名がエイリアスとして残っているだけで
 * ファイル名は新名になっている（例: `alert-circle` → `circle-alert`）。
 * 個別 import では**ファイル名（新名）**を指定する必要がある。
 *
 * 新しいアイコンを使うときはここに1行足す。
 */
import BatteryFull from "lucide-react-native/icons/battery-full";
import BookOpen from "lucide-react-native/icons/book-open";
import Building2 from "lucide-react-native/icons/building-complex";
import Calendar from "lucide-react-native/icons/calendar";
import Camera from "lucide-react-native/icons/camera";
import Cat from "lucide-react-native/icons/cat";
import BarChart2 from "lucide-react-native/icons/chart-no-axes-column";
import Check from "lucide-react-native/icons/check";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import AlertCircle from "lucide-react-native/icons/circle-alert";
import CheckCircle2 from "lucide-react-native/icons/circle-check";
import XCircle from "lucide-react-native/icons/circle-x";
import Clock from "lucide-react-native/icons/clock";
import CloudRain from "lucide-react-native/icons/cloud-rain";
import Coffee from "lucide-react-native/icons/coffee";
import Croissant from "lucide-react-native/icons/croissant";
import Crosshair from "lucide-react-native/icons/crosshair";
import ExternalLink from "lucide-react-native/icons/external-link";
import Flag from "lucide-react-native/icons/flag";
import Flower2 from "lucide-react-native/icons/flower-2";
import Footprints from "lucide-react-native/icons/footprints";
import ImageOff from "lucide-react-native/icons/image-off";
import ImagePlus from "lucide-react-native/icons/image-plus";
import Info from "lucide-react-native/icons/info";
import Landmark from "lucide-react-native/icons/landmark";
import Leaf from "lucide-react-native/icons/leaf";
import MapIcon from "lucide-react-native/icons/map";
import MapPin from "lucide-react-native/icons/map-pin";
import Maximize2 from "lucide-react-native/icons/maximize-2";
import MessageCircle from "lucide-react-native/icons/message-circle";
import Mountain from "lucide-react-native/icons/mountain";
import Navigation from "lucide-react-native/icons/navigation";
import Pause from "lucide-react-native/icons/pause";
import Pencil from "lucide-react-native/icons/pencil";
import Play from "lucide-react-native/icons/play";
import Plus from "lucide-react-native/icons/plus";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Search from "lucide-react-native/icons/search";
import SearchX from "lucide-react-native/icons/search-x";
import Settings2 from "lucide-react-native/icons/settings-2";
import ShoppingBag from "lucide-react-native/icons/shopping-bag";
import ShoppingCart from "lucide-react-native/icons/shopping-cart";
import Signal from "lucide-react-native/icons/signal";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import Square from "lucide-react-native/icons/square";
import Store from "lucide-react-native/icons/store";
import Sun from "lucide-react-native/icons/sun";
import Tag from "lucide-react-native/icons/tag";
import TrainFront from "lucide-react-native/icons/train-front";
import Trash2 from "lucide-react-native/icons/trash";
import TreePine from "lucide-react-native/icons/tree-pine";
import Trees from "lucide-react-native/icons/trees";
import Undo2 from "lucide-react-native/icons/undo-2";
import User from "lucide-react-native/icons/user";
import Utensils from "lucide-react-native/icons/utensils";
import Wifi from "lucide-react-native/icons/wifi";
import X from "lucide-react-native/icons/x";

export const ICONS = {
  "alert-circle": AlertCircle,
  "bar-chart-2": BarChart2,
  "battery-full": BatteryFull,
  "book-open": BookOpen,
  "building-2": Building2,
  calendar: Calendar,
  camera: Camera,
  cat: Cat,
  leaf: Leaf,
  "cloud-rain": CloudRain,
  mountain: Mountain,
  sun: Sun,
  check: Check,
  "check-circle-2": CheckCircle2,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  clock: Clock,
  coffee: Coffee,
  croissant: Croissant,
  crosshair: Crosshair,
  "external-link": ExternalLink,
  flag: Flag,
  "flower-2": Flower2,
  footprints: Footprints,
  "image-off": ImageOff,
  "image-plus": ImagePlus,
  info: Info,
  landmark: Landmark,
  map: MapIcon,
  "map-pin": MapPin,
  "maximize-2": Maximize2,
  "message-circle": MessageCircle,
  navigation: Navigation,
  pause: Pause,
  pencil: Pencil,
  play: Play,
  plus: Plus,
  "refresh-cw": RefreshCw,
  search: Search,
  "search-x": SearchX,
  "settings-2": Settings2,
  "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart,
  signal: Signal,
  "sliders-horizontal": SlidersHorizontal,
  square: Square,
  store: Store,
  tag: Tag,
  "train-front": TrainFront,
  "trash-2": Trash2,
  "tree-pine": TreePine,
  trees: Trees,
  "undo-2": Undo2,
  user: User,
  utensils: Utensils,
  wifi: Wifi,
  x: X,
  "x-circle": XCircle,
} as const;

export type IconName = keyof typeof ICONS;
