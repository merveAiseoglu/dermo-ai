import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useKullanici } from '@/hooks/use-kullanici';

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * İç bileşen — hook'ların Stack içinde çalışabilmesi için
 * ThemeProvider'ın altında ayrı bir bileşen olarak tanımlandı.
 */
function RootNavigator() {
  const { yukleniyor } = useKullanici();
  // useKullanici kendi içinde yönlendirmeyi (router.replace) hallediyor.
  // Burada sadece hook'u çağırmak yeterli; yukleniyor state'ini
  // ileride bir splash/loading overlay için kullanabilirsin.
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <RootNavigator />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
