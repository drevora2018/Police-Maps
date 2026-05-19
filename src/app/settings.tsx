import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAppPreferences } from '@/contexts/app-preferences-context';
import { useTheme } from '@/hooks/use-theme';
import { PinType, ThemePreference } from '@/types/domain';

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

const PIN_OPTIONS: { label: string; value: PinType }[] = [
  { label: 'Police car', value: 'police_car' },
  { label: 'Camera', value: 'camera' },
];

export default function SettingsScreen() {
  const { preferences, setAlias, setThemePreference, setDefaultPinType } = useAppPreferences();
  const theme = useTheme();
  const [draftAlias, setDraftAlias] = React.useState(preferences.alias);

  React.useEffect(() => {
    setDraftAlias(preferences.alias);
  }, [preferences.alias]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle">Settings</ThemedText>

        <View style={styles.group}>
          <ThemedText type="smallBold">Theme</ThemedText>
          <View style={styles.row}>
            {THEME_OPTIONS.map((option) => {
              const selected = preferences.themePreference === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => void setThemePreference(option.value)}
                  style={styles.button}>
                  <ThemedView type={selected ? 'backgroundSelected' : 'backgroundElement'} style={styles.pill}>
                    <ThemedText type="small">{option.label}</ThemedText>
                  </ThemedView>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.group}>
          <ThemedText type="smallBold">Alias</ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            value={draftAlias}
            onChangeText={setDraftAlias}
            maxLength={40}
            placeholder="Choose your alias"
            onBlur={() => void setAlias(draftAlias)}
            onSubmitEditing={() => void setAlias(draftAlias)}
          />
        </View>

        <View style={styles.group}>
          <ThemedText type="smallBold">Default pin type</ThemedText>
          <View style={styles.row}>
            {PIN_OPTIONS.map((option) => {
              const selected = preferences.defaultPinType === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => void setDefaultPinType(option.value)}
                  style={styles.button}>
                  <ThemedView type={selected ? 'backgroundSelected' : 'backgroundElement'} style={styles.pill}>
                    <ThemedText type="small">{option.label}</ThemedText>
                  </ThemedView>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.four,
  },
  group: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  button: {
    borderRadius: 999,
  },
  pill: {
    borderRadius: 999,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#B8B8BC',
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    minHeight: 42,
  },
});
