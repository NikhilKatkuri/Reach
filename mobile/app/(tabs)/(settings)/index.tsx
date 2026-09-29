/** Settings: appearance, conditions defaults, reminders, AI and data. */
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme, type ThemePreference } from '@/src/store/theme';
import { Button, Card, Chip, Icon, ScreenContainer } from '@/src/components/ui';
import { useSettings, useSetSetting } from '@/src/hooks/useSettings';
import { useTotalTripCount } from '@/src/hooks/useStatistics';
import { useTemplates, useTemplateGraph } from '@/src/hooks/useTrips';
import {
  type LocalBackup,
  BackupImportError,
  exportAndShare,
  importFromUri,
  listLocalBackups,
} from '@/src/services/backup';
import { clearAllData } from '@/src/db/queries';
import {
  REMINDER_LEADS,
  ensureChannel,
  notificationsSupported,
  requestPermission,
  scheduleLeaveReminders,
} from '@/src/services/notifications';
import { usePrediction } from '@/src/hooks/usePrediction';
import { weatherLabel } from '@/src/engine/weatherPenalty';
import { trafficShortLabel } from '@/src/engine/trafficPenalty';
import { startOfDay, atLocalTime, formatDate } from '@/src/utils/time';
import { useNow } from '@/src/hooks/useNow';
import { queryKeys } from '@/src/store/queryClient';
import { type TrafficLevel, type WeatherCondition } from '@/src/types/schemas';

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const WEATHER_OPTIONS: readonly WeatherCondition[] = [
  'clear',
  'cloudy',
  'light_rain',
  'rain',
  'heavy_rain',
];

const TRAFFIC_OPTIONS: readonly TrafficLevel[] = ['low', 'medium', 'high', 'very_high'];

export default function SettingsScreen() {
  const { colors, type, shape } = useTheme();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const setSetting = useSetSetting();
  const templates = useTemplates();
  const totalTrips = useTotalTripCount();
  const now = useNow(5 * 60_000);

  const firstTemplateId = templates.data?.[0]?.id ?? null;
  const graph = useTemplateGraph(firstTemplateId);
  const target = atLocalTime(startOfDay(now) + 86_400_000, 9, 5);
  const prediction = usePrediction({
    graph: graph.data ?? null,
    targetArrivalAt: target,
    conditions: {
      weather: settings.defaultWeather,
      traffic: settings.defaultTraffic,
      crowdLevel: 2,
    },
    now,
  });

  const [apiKey, setApiKey] = useState(settings.geminiApiKey);
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<LocalBackup[]>([]);

  // Backups this device has written, so the import button has something real
  // to offer. Refreshed after every export.
  const refreshBackups = useCallback(() => {
    void listLocalBackups()
      .then(setBackups)
      .catch(() => setBackups([]));
  }, []);

  useEffect(refreshBackups, [refreshBackups]);

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.insights.all });
  }, [queryClient]);

  const onExport = useCallback(async () => {
    setBusy(true);
    try {
      const result = await exportAndShare();
      refreshBackups();
      Alert.alert(
        'Backup created',
        `${result.fileName}\n${result.counts.trips ?? 0} trips, ` +
          `${result.counts.templates ?? 0} templates exported.`,
      );
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [refreshBackups]);

  const onImport = useCallback(() => {
    if (backups.length === 0) {
      Alert.alert('No backups found', 'Export a backup first, then you can restore it here.');
      return;
    }

    Alert.alert(
      'Restore a backup',
      'This replaces every template, trip and setting on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        ...backups.slice(0, 4).map((backup) => ({
          text: `${backup.fileName}${backup.writtenAt === 0 ? '' : ` · ${formatDate(backup.writtenAt)}`}`,
          style: 'destructive' as const,
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const result = await importFromUri(backup.uri);
                invalidateAll();
                Alert.alert(
                  'Backup restored',
                  `${result.counts.templates ?? 0} templates and ` +
                    `${result.counts.trips ?? 0} trips are back.`,
                );
              } catch (error) {
                Alert.alert(
                  'Import failed',
                  error instanceof BackupImportError
                    ? error.message
                    : error instanceof Error
                      ? error.message
                      : 'Unknown error',
                );
              } finally {
                setBusy(false);
              }
            })();
          },
        })),
      ],
    );
  }, [backups, invalidateAll]);

  const onClearData = useCallback(() => {
    Alert.alert('Delete all data?', 'Templates, trips and settings will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete everything',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await clearAllData();
              invalidateAll();
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }, [invalidateAll]);

  const onToggleNotifications = useCallback(
    (enabled: boolean) => {
      void (async () => {
        if (!enabled) {
          setSetting('notificationsEnabled', false);
          return;
        }

        // Distinguish "this build cannot do notifications" from "you said
        // no", because the remedy is completely different. In Expo Go on
        // Android the module is unavailable, and telling a user to open
        // system settings would send them somewhere that cannot help.
        if (!notificationsSupported()) {
          Alert.alert(
            'Reminders need a development build',
            'Leave-now reminders are unavailable in this preview build. Everything else in Reach ' +
              'works offline as normal.',
          );
          return;
        }

        await ensureChannel();
        const granted = await requestPermission();
        if (!granted) {
          Alert.alert(
            'Notifications blocked',
            'Enable notifications for Reach in your system settings to get leave-now reminders.',
          );
          return;
        }

        setSetting('notificationsEnabled', true);

        const result = prediction.data?.prediction;
        if (result !== undefined) {
          await scheduleLeaveReminders(result, {
            leadMinutes: REMINDER_LEADS,
            weather: settings.defaultWeather,
            traffic: settings.defaultTraffic,
          });
        }
      })();
    },
    [setSetting, prediction.data, settings.defaultWeather, settings.defaultTraffic],
  );

  return (
    <ScreenContainer title="Settings" applyTopInset={false} padded={false} scrollable={false}>
      <Stack.Screen options={{ title: 'Settings' }} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title="Appearance">
          <View style={styles.chipRow}>
            {THEME_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                variant="filter"
                selected={settings.theme === option.value}
                onPress={() => setSetting('theme', option.value)}
              />
            ))}
          </View>

          <ToggleRow
            label="Reduce motion"
            hint="Turns off timeline and ring animations"
            value={settings.reducedMotion}
            onChange={(value) => setSetting('reducedMotion', value)}
          />
        </Section>

        <Section title="Default conditions">
          <Text style={[type.labelMedium, styles.subLabel, { color: colors.onSurfaceVariant }]}>
            Used before you change anything on the Today screen.
          </Text>

          <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>Weather</Text>
          <View style={styles.chipRow}>
            {WEATHER_OPTIONS.map((condition) => (
              <Chip
                key={condition}
                label={weatherLabel(condition)}
                variant="filter"
                selected={settings.defaultWeather === condition}
                onPress={() => setSetting('defaultWeather', condition)}
              />
            ))}
          </View>

          <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>Traffic</Text>
          <View style={styles.chipRow}>
            {TRAFFIC_OPTIONS.map((level) => (
              <Chip
                key={level}
                label={trafficShortLabel(level)}
                variant="filter"
                selected={settings.defaultTraffic === level}
                onPress={() => setSetting('defaultTraffic', level)}
              />
            ))}
          </View>

          <View style={styles.sliderRow}>
            <Text style={[type.bodyMedium, { color: colors.onSurface }]}>Extra buffer</Text>
            <View style={styles.chipRow}>
              {[0, 2, 5, 10].map((value) => (
                <Chip
                  key={value}
                  label={`${value} min`}
                  variant="filter"
                  selected={settings.extraBufferMinutes === value}
                  onPress={() => setSetting('extraBufferMinutes', value)}
                />
              ))}
            </View>
          </View>
        </Section>

        <Section title="Reminders">
          <ToggleRow
            label="Departure reminders"
            hint={
              settings.notificationsEnabled
                ? `A nudge ${REMINDER_LEADS.join(' / ')} minutes before your leave-by time`
                : 'Schedule a leave-now notification with your buffer'
            }
            value={settings.notificationsEnabled}
            onChange={onToggleNotifications}
          />
          {settings.notificationsEnabled ? (
            <View style={styles.chipRow}>
              {[10, 20, 30, 45].map((value) => (
                <Chip
                  key={value}
                  label={`${value} min early`}
                  variant="filter"
                  selected={settings.reminderLeadMinutes === value}
                  onPress={() => setSetting('reminderLeadMinutes', value)}
                />
              ))}
            </View>
          ) : null}
        </Section>

        <Section title="Explanations (optional)">
          <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
            Reach picks your route arithmetically, always. Gemini only rewrites the result as one
            sentence. Leave this off and you get an on-device explanation instead.
          </Text>

          <ToggleRow
            label="Use Gemini"
            hint={
              settings.aiExplanationsEnabled && settings.geminiApiKey.length > 0
                ? 'Sent only the recommendation and its factors'
                : 'Add a key to enable'
            }
            value={settings.aiExplanationsEnabled}
            onChange={(value) => setSetting('aiExplanationsEnabled', value)}
            disabled={settings.geminiApiKey.length === 0}
          />

          <View
            style={[
              styles.apiKeyBox,
              {
                backgroundColor: colors.surfaceContainer,
                borderColor: colors.outlineVariant,
                borderRadius: shape.small,
              },
            ]}
          >
            <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
              Gemini API key
            </Text>
            <ApiKeyField
              value={apiKey}
              onChange={setApiKey}
              onCommit={() => setSetting('geminiApiKey', apiKey)}
            />
            <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
              Stored in the local database only. Never synced anywhere.
            </Text>
          </View>
        </Section>

        <Section title="Data">
          <View style={styles.dataRow}>
            <DataStat label="Templates" value={String(templates.data?.length ?? 0)} />
            <DataStat label="Trips" value={String(totalTrips.data ?? 0)} />
            <DataStat label="Engine" value="Offline" />
          </View>

          <Button
            label="Export backup"
            icon="download"
            variant="tonal"
            onPress={() => void onExport()}
            disabled={busy}
          />
          <Button
            label="Import backup"
            icon="upload"
            variant="outlined"
            onPress={() => void onImport()}
            disabled={busy}
          />
          <Button
            label="Delete all data"
            icon="trash"
            variant="danger"
            onPress={onClearData}
            disabled={busy}
          />
        </Section>

        <Card variant="outlined">
          <View style={styles.aboutRow}>
            <Icon name="info" size={16} color={colors.onSurfaceVariant} />
            <Text style={[type.bodySmall, styles.aboutText, { color: colors.onSurfaceVariant }]}>
              Reach works entirely offline. No account, no sync, no network calls except the
              optional Gemini explanation, which is off by default.
            </Text>
          </View>
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  const { colors, type } = useTheme();
  return (
    <Card>
      <Text accessibilityRole="header" style={[type.titleMedium, { color: colors.onSurface }]}>
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </Card>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled = false,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly disabled?: boolean;
}) {
  const { colors, type } = useTheme();

  return (
    <View style={[styles.toggleRow, { opacity: disabled ? 0.5 : 1 }]}>
      <View style={styles.toggleText}>
        <Text style={[type.bodyLarge, { color: colors.onSurface }]}>{label}</Text>
        {hint !== undefined ? (
          <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>{hint}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.surfaceContainerHighest, true: colors.primaryContainer }}
        thumbColor={value ? colors.primary : colors.outline}
        accessibilityLabel={label}
        accessibilityHint={hint}
      />
    </View>
  );
}

function DataStat({ label, value }: { readonly label: string; readonly value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.dataStat}>
      <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <Text style={[type.titleMedium, { color: colors.onSurface }]}>{value}</Text>
    </View>
  );
}

function ApiKeyField({
  value,
  onChange,
  onCommit,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onCommit: () => void;
}) {
  const { colors, type } = useTheme();

  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      onBlur={onCommit}
      placeholder="AIza…"
      autoCapitalize="none"
      autoCorrect={false}
      secureTextEntry
      style={{
        ...type.bodyLarge,
        backgroundColor: colors.surfaceContainerHighest,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 48,
        textAlignVertical: 'center',
        color: colors.onSurface,
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 16,
  },
  sectionBody: {
    marginTop: 12,
    gap: 12,
  },
  subLabel: {
    marginTop: -4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleText: {
    flex: 1,
    gap: 2,
  },
  sliderRow: {
    gap: 8,
  },
  apiKeyBox: {
    gap: 6,
    padding: 12,
    borderWidth: 1,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  dataStat: {
    gap: 2,
  },
  aboutRow: {
    flexDirection: 'row',
    gap: 8,
  },
  aboutText: {
    flex: 1,
  },
});
