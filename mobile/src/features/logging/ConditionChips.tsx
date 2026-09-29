/** Condition chips: one tap to set today's weather, traffic and crowd. */
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { Chip, type IconName } from '@/src/components/ui';
import { WEATHER_SEVERITY, weatherLabel } from '@/src/engine/weatherPenalty';
import { TRAFFIC_SEVERITY, trafficShortLabel } from '@/src/engine/trafficPenalty';
import { crowdShortLabel } from '@/src/engine/crowdPenalty';
import { type CrowdLevel, type TrafficLevel, type WeatherCondition } from '@/src/types/schemas';
import { type TodayConditions } from '@/src/features/logging/useTodayTrip';

/** Icon for each weather condition. */
const WEATHER_ICONS: Readonly<Record<WeatherCondition, IconName>> = {
  clear: 'sun',
  cloudy: 'cloud',
  light_rain: 'drop',
  rain: 'cloudRain',
  heavy_rain: 'cloudRain',
};

/** Icon for each traffic level. */
const TRAFFIC_ICONS: Readonly<Record<TrafficLevel, IconName>> = {
  low: 'traffic',
  medium: 'traffic',
  high: 'traffic',
  very_high: 'warning',
};

/** Props for {@link ConditionChips}. */
export interface ConditionChipsProps {
  readonly conditions: TodayConditions;
  readonly onWeather: (condition: WeatherCondition) => void;
  readonly onTraffic: (level: TrafficLevel) => void;
  readonly onCrowd: (level: CrowdLevel) => void;
}

const WEATHER_ORDER: readonly WeatherCondition[] = [
  'clear',
  'cloudy',
  'light_rain',
  'rain',
  'heavy_rain',
];

/**
 * Lets the user adjust the conditions the engine assumes.
 *
 * These default to the settings, so on a normal day the user never touches
 * them. They exist because weather is the single biggest input the engine
 * cannot observe on its own.
 */
export function ConditionChips({ conditions, onWeather, onTraffic, onCrowd }: ConditionChipsProps) {
  const { colors, type } = useTheme();

  const weatherIndex = WEATHER_SEVERITY.indexOf(conditions.weather);
  const weatherAccent =
    weatherIndex >= 3 ? colors.error : weatherIndex === 2 ? colors.warning : colors.primary;

  return (
    <View style={styles.container}>
      <ChipGroup
        label="Weather"
        icon={<Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>Weather</Text>}
      >
        {WEATHER_ORDER.map((condition) => (
          <Chip
            key={condition}
            label={weatherLabel(condition)}
            icon={WEATHER_ICONS[condition]}
            variant="filter"
            selected={conditions.weather === condition}
            accentColor={weatherAccent}
            onPress={() => onWeather(condition)}
            accessibilityLabel={`Set weather to ${weatherLabel(condition)}`}
          />
        ))}
      </ChipGroup>

      <ChipGroup
        label="Traffic"
        icon={<Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>Traffic</Text>}
      >
        {TRAFFIC_SEVERITY.map((level) => (
          <Chip
            key={level}
            label={trafficShortLabel(level)}
            icon={TRAFFIC_ICONS[level]}
            variant="filter"
            selected={conditions.traffic === level}
            accentColor={level === 'very_high' ? colors.error : colors.primary}
            onPress={() => onTraffic(level)}
            accessibilityLabel={`Set traffic to ${trafficShortLabel(level)}`}
          />
        ))}
      </ChipGroup>

      <ChipGroup
        label="Crowd"
        icon={<Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>Crowd</Text>}
      >
        {([0, 1, 2, 3, 4, 5] as CrowdLevel[]).map((level) => (
          <Chip
            key={level}
            label={crowdShortLabel(level)}
            variant="filter"
            selected={conditions.crowdLevel === level}
            accentColor={level >= 4 ? colors.warning : colors.primary}
            onPress={() => onCrowd(level)}
            accessibilityLabel={`Set crowd to ${crowdShortLabel(level)}`}
          />
        ))}
      </ChipGroup>
    </View>
  );
}

function ChipGroup({
  label,
  icon,
  children,
}: {
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.group}>
      <View style={styles.groupLabel}>
        {icon}
        <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>{label}</Text>
      </View>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  group: {
    gap: 6,
  },
  groupLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
});
