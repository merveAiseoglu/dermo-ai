import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useThemeContext } from '@/hooks/ThemeProvider';
import { API_URL } from '@/hooks/use-kullanici';
import { RenkRozeti } from '@/components/RenkRozeti';

interface Icerik {
  icerik_id: number;
  icerik_adi: string;
  baz_tipi: string;
  renk?: string;
}

export default function KutuphaneScreen() {
  const { activeTheme: theme } = useThemeContext();
  const renkler = Colors[theme];
  const router = useRouter();

  const [icerikler, setIcerikler] = useState<Icerik[]>([]);
  const [aramaMetni, setAramaMetni] = useState('');
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/icerikler`)
      .then((res) => res.json())
      .then((data) => {
        setIcerikler(data);
        setYukleniyor(false);
      })
      .catch((err) => {
        console.error(err);
        setYukleniyor(false);
      });
  }, []);

  const filtrelenmisIcerikler = icerikler.filter((icerik) =>
    icerik.icerik_adi.toLowerCase().includes(aramaMetni.toLowerCase())
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: renkler.background }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'İçerik Kütüphanesi',
          headerStyle: { backgroundColor: renkler.background },
          headerTintColor: renkler.text,
          headerShadowVisible: false,
        }}
      />
      
      <ThemedView style={styles.container}>
        <View style={[styles.aramaKutusu, { backgroundColor: renkler.surface, borderColor: renkler.border }]}>
          <Ionicons name="search" size={20} color={renkler.icon} />
          <TextInput
            style={[styles.aramaInput, { color: renkler.text }]}
            placeholder="İçerik ara (örn: Retinol)"
            placeholderTextColor={renkler.icon}
            value={aramaMetni}
            onChangeText={setAramaMetni}
          />
          {aramaMetni.length > 0 && (
            <TouchableOpacity onPress={() => setAramaMetni('')}>
              <Ionicons name="close-circle" size={20} color={renkler.icon} />
            </TouchableOpacity>
          )}
        </View>

        {yukleniyor ? (
          <View style={styles.merkez}>
            <ActivityIndicator size="large" color={renkler.tint} />
          </View>
        ) : (
          <FlatList
            data={filtrelenmisIcerikler}
            keyExtractor={(item) => item.icerik_id.toString()}
            contentContainerStyle={styles.liste}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.listeOgesi, { backgroundColor: renkler.surface, borderColor: renkler.border }]}
                onPress={() => router.push(`/icerik/${item.icerik_id}` as any)}
              >
                <View style={styles.ogeMetinler}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ThemedText type="defaultSemiBold" style={{ fontSize: 16 }}>
                      {item.icerik_adi}
                    </ThemedText>
                    <RenkRozeti renk={item.renk} />
                  </View>
                  <ThemedText style={{ fontSize: 13, color: renkler.icon }}>
                    {item.baz_tipi} bazlı içerik
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={20} color={renkler.icon} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.merkez}>
                <ThemedText style={{ color: renkler.icon }}>Sonuç bulunamadı.</ThemedText>
              </View>
            }
          />
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 20 },
  aramaKutusu: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 16,
    gap: 8,
  },
  aramaInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  liste: { paddingBottom: 24, gap: 12 },
  listeOgesi: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  ogeMetinler: { flex: 1, gap: 4 },
  merkez: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
