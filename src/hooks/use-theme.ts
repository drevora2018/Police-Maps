/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useAppPreferences } from '@/contexts/app-preferences-context';

export function useTheme() {
  const { effectiveTheme } = useAppPreferences();
  return Colors[effectiveTheme];
}
