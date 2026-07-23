import React from 'react';
import { Linking, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useThemeContext } from '@/hooks/ThemeProvider';

interface KaynakRozetiProps {
  kaynak?: string;
  kaynak_url?: string;
}

export function KaynakRozeti({ kaynak, kaynak_url }: KaynakRozetiProps) {
  const { activeTheme: theme } = useThemeContext();
  const renkler = Colors[theme];

  if (!kaynak) return null;

  return (
    <TouchableOpacity
      onPress={() => kaynak_url && Linking.openURL(kaynak_url)}
      disabled={!kaynak_url}
      activeOpacity={0.7}
      style={[styles.kaynakRozet, { backgroundColor: renkler.surface }]}
    >
      <Ionicons name="document-text-outline" size={12} color={renkler.icon} />
      <ThemedText style={[styles.kaynakYazi, { color: renkler.icon }]}>
        Kaynak: {kaynak}
      </ThemedText>
      {kaynak_url && (
        <Ionicons name="open-outline" size={10} color={renkler.icon} style={{ marginLeft: 2 }} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  kaynakRozet: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
    marginTop: 2,
  },
  kaynakYazi: { fontSize: 12 },
});
