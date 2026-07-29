import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AppThemeProvider, useThemeContext } from '@/hooks/ThemeProvider';
import { useKullanici } from '@/hooks/use-kullanici';
import { TurProvider } from '@/hooks/TurContext';
import { TurOverlay } from '@/components/TurOverlay';
import { RozetKutlamaModal } from '@/components/RozetKutlamaModal';
import { OzelAlertRoot } from '@/components/OzelAlert';

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * İç bileşen — hook'ların Stack içinde çalışabilmesi için
 * ThemeProvider'ın altında ayrı bir bileşen olarak tanımlandı.
 */
function RootNavigator() {
  const { yukleniyor } = useKullanici();
  const { activeTheme } = useThemeContext();
  
  return (
    <ThemeProvider value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <TurProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <TurOverlay />
        <RozetKutlamaModal />
        <OzelAlertRoot />
      </TurProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <RootNavigator />
    </AppThemeProvider>
  );
}
