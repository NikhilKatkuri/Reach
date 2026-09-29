/**
 * Icon registry.
 *
 * `phosphor-react-native` v3 ships each glyph as a separate named component
 * (`BusIcon`, `CheckCircleIcon`, …) rather than one polymorphic `Icon` with a
 * `name` string. That is better for tree-shaking and for types, but it means
 * the name→component mapping has to live somewhere — so it lives here, once.
 *
 * The map is keyed by the semantic names in `src/constants/icons.ts`. Adding
 * an icon is a two-line change: add the file name to `PHOSPHOR_IMPORTS` and
 * add the entry to `ICONS`.
 */
import {
  ArrowsLeftRightIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUUpLeftIcon,
  BellIcon,
  BicycleIcon,
  BuildingsIcon,
  BellRingingIcon,
  BusIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CaretRightIcon,
  CaretUpIcon,
  ChartBarIcon,
  ChartLineIcon,
  ChartLineUpIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleNotchIcon,
  ClockCounterClockwiseIcon,
  ClockIcon,
  CloudIcon,
  CloudRainIcon,
  DotsThreeVerticalIcon,
  DatabaseIcon,
  DropIcon,
  DownloadSimpleIcon,
  FlagCheckeredIcon,
  FlagIcon,
  GearSixIcon,
  GitBranchIcon,
  GraphIcon,
  InfoIcon,
  KeyIcon,
  LightningIcon,
  HouseLineIcon,
  MapPinIcon,
  MapTrifoldIcon,
  PathIcon,
  PencilSimpleIcon,
  PersonSimpleWalkIcon,
  PlayIcon,
  PlusIcon,
  QuestionIcon,
  ScooterIcon,
  ShareNetworkIcon,
  SignpostIcon,
  SparkleIcon,
  StackIcon,
  SunHorizonIcon,
  SunIcon,
  TableIcon,
  TargetIcon,
  TaxiIcon,
  ThermometerIcon,
  TrainIcon,
  TrafficSignalIcon,
  TrashIcon,
  UploadSimpleIcon,
  UsersThreeIcon,
  WarningIcon,
  WindIcon,
  XIcon,
  type Icon as PhosphorIconType,
  type IconWeight,
} from 'phosphor-react-native';
import { type ComponentType } from 'react';
import { type TransportMode } from '@/src/types/schemas';

/** Props every Reach icon accepts. */
export interface ReachIconProps {
  readonly size?: number;
  readonly color?: string;
  readonly weight?: IconWeight;
  readonly testID?: string;
  /** Screen-reader label. Icons are decorative by default. */
  readonly accessibilityLabel?: string;
}

/** Semantic icon names used across the app. */
export const ICONS = {
  // Tabs
  today: SunHorizonIcon,
  history: ClockCounterClockwiseIcon,
  templates: MapTrifoldIcon,
  insights: ChartLineUpIcon,
  settings: GearSixIcon,

  // Actions
  plus: PlusIcon,
  pencilSimple: PencilSimpleIcon,
  trash: TrashIcon,
  arrowLeft: ArrowLeftIcon,
  arrowRight: ArrowRightIcon,
  check: CheckIcon,
  checkCircle: CheckCircleIcon,
  x: XIcon,
  undo: ArrowUUpLeftIcon,
  share: ShareNetworkIcon,
  download: DownloadSimpleIcon,
  upload: UploadSimpleIcon,
  dots: DotsThreeVerticalIcon,
  caretRight: CaretRightIcon,
  caretDown: CaretDownIcon,
  caretUp: CaretUpIcon,
  clock: ClockIcon,

  // Status
  warning: WarningIcon,
  info: InfoIcon,
  question: QuestionIcon,
  spinner: CircleNotchIcon,
  cloudRain: CloudRainIcon,
  cloud: CloudIcon,
  sun: SunIcon,
  drop: DropIcon,
  wind: WindIcon,
  thermometer: ThermometerIcon,
  traffic: TrafficSignalIcon,
  users: UsersThreeIcon,
  lightning: LightningIcon,
  route: PathIcon,
  mapPin: MapPinIcon,
  target: TargetIcon,
  flag: FlagCheckeredIcon,
  calendar: CalendarBlankIcon,
  bell: BellIcon,
  bellRinging: BellRingingIcon,
  sparkle: SparkleIcon,
  chartBar: ChartBarIcon,
  chartLine: ChartLineIcon,
  table: TableIcon,
  stack: StackIcon,
  gitBranch: GitBranchIcon,
  swap: ArrowsLeftRightIcon,
  key: KeyIcon,
  play: PlayIcon,
  bus: BusIcon,
  train: TrainIcon,
  personSimpleWalk: PersonSimpleWalkIcon,
  scooter: ScooterIcon,
  taxi: TaxiIcon,
  bicycle: BicycleIcon,
  database: DatabaseIcon,

  // Route graph
  /** A fork in the route graph, shown on junction nodes. */
  junction: GitBranchIcon,
  /** Generic graph structure, for the whole-graph affordance. */
  graph: GraphIcon,
  /** A signpost, for waypoint and alternative-route nodes. */
  signpost: SignpostIcon,
  /** Where a commute starts. */
  homeIcon: HouseLineIcon,
  /** A building, for a destination such as a campus or workplace. */
  building: BuildingsIcon,
  /** Where a commute ends. */
  destination: FlagIcon,
} as const satisfies Record<string, ComponentType<ReachIconProps>>;

/** The name union accepted by {@link Icon}. */
export type IconName = keyof typeof ICONS;

/** Renders a named Phosphor icon. */
export function Icon({
  name,
  size = 20,
  color,
  weight = 'regular',
  testID,
  accessibilityLabel,
}: { readonly name: IconName } & ReachIconProps) {
  const Component = ICONS[name];
  return (
    <Component
      size={size}
      color={color}
      weight={weight}
      testID={testID}
      title={accessibilityLabel}
    />
  );
}

/**
 * Icon per transport mode.
 *
 * Each mode gets a real pictogram rather than a generic one: a glance at the
 * timeline should say "bus" without reading the label, and metro and train
 * are deliberately distinguished because Reach compares them constantly.
 */
const MODE_ICONS: Readonly<Record<TransportMode, IconName>> = {
  walk: 'personSimpleWalk',
  bus: 'bus',
  metro: 'train',
  train: 'train',
  auto: 'scooter',
  bike: 'bicycle',
  cab: 'taxi',
};

/** Icon name for a transport mode. */
export function modeIconName(mode: TransportMode): IconName {
  return MODE_ICONS[mode] ?? 'route';
}

export type { PhosphorIconType };
