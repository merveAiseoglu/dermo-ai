import { useThemeContext } from '@/hooks/ThemeProvider';

export function useColorScheme() {
  const { activeTheme } = useThemeContext();
  return activeTheme;
}
