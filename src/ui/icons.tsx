/*
 * UI icon set — Lucide (https://lucide.dev), MIT-licensed open-source icons,
 * replacing the previous hand-drawn pixel set. The Icon component keeps the
 * same { name, size, title } API so every call site is unchanged; each name
 * maps to a Lucide glyph drawn as a 24px-grid stroke icon in currentColor.
 *
 * Pure presentational module — no sim imports.
 */
import {
  Activity,
  Apple,
  BookOpen,
  Brain,
  Clock,
  Copy,
  Crosshair,
  Download,
  Droplet,
  Eye,
  FileText,
  Fish,
  Flag,
  Footprints,
  GitFork,
  Grid3x3,
  Hammer,
  HeartPulse,
  Home,
  Map,
  MapPinned,
  MessageCircle,
  Move,
  Package,
  Pause,
  PawPrint,
  Play,
  RefreshCcw,
  Route,
  ShoppingBasket,
  SkipForward,
  Sun,
  Target,
  Tent,
  TriangleAlert,
  Users,
  Waves,
  type LucideIcon,
} from "lucide-react";

export type IconName =
  | "people"
  | "food"
  | "water"
  | "season"
  | "move"
  | "scout"
  | "memory"
  | "knowledge"
  | "status"
  | "time"
  | "risk"
  | "fission"
  | "focus"
  | "hunting"
  | "fishing"
  | "gathering"
  | "activity"
  | "basketry"
  | "storage"
  | "craft"
  | "settle"
  | "camp"
  | "route"
  | "range"
  | "lineage"
  | "pressure"
  | "founding"
  | "rest"
  | "return"
  | "uncertain"
  | "play"
  | "pause"
  | "step"
  | "talk"
  | "animal"
  | "warning"
  | "region"
  | "ford"
  | "copy"
  | "download"
  | "file";

const ICONS: Record<IconName, LucideIcon> = {
  people: Users,
  food: Apple,
  water: Droplet,
  season: Sun,
  move: Move,
  scout: Eye,
  memory: Brain,
  knowledge: BookOpen,
  status: HeartPulse,
  time: Clock,
  risk: TriangleAlert,
  fission: GitFork,
  focus: Crosshair,
  hunting: Target,
  fishing: Fish,
  gathering: ShoppingBasket,
  activity: Footprints,
  basketry: Grid3x3,
  storage: Package,
  craft: Hammer,
  settle: Tent,
  camp: Home,
  route: Route,
  range: Map,
  lineage: GitFork,
  pressure: TriangleAlert,
  founding: Flag,
  rest: HeartPulse,
  return: RefreshCcw,
  uncertain: TriangleAlert,
  play: Play,
  pause: Pause,
  step: SkipForward,
  talk: MessageCircle,
  animal: PawPrint,
  warning: TriangleAlert,
  region: MapPinned,
  ford: Waves,
  copy: Copy,
  download: Download,
  file: FileText,
};

export function Icon({
  name,
  size = 16,
  title,
}: {
  readonly name: IconName;
  readonly size?: number;
  readonly title?: string;
}) {
  const Glyph = ICONS[name] ?? Activity;

  return (
    <Glyph
      size={size}
      strokeWidth={2}
      role={title === undefined ? "presentation" : "img"}
      aria-label={title}
      aria-hidden={title === undefined ? true : undefined}
      style={{ display: "block", flex: "0 0 auto" }}
    />
  );
}
