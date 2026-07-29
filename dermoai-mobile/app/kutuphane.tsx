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
import { useKullanici, API_URL } from '@/hooks/use-kullanici';
import { RenkRozeti } from '@/components/RenkRozeti';
import { ScrollView } from 'react-native';

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

  const { kullaniciId } = useKullanici();
  const [icerikler, setIcerikler] = useState<Icerik[]>([]);
  const [aramaMetni, setAramaMetni] = useState('');
  const [yukleniyor, setYukleniyor] = useState(true);

  const [filtreHamilelik, setFiltreHamilelik] = useState(false);
  const [filtreCiltTipi, setFiltreCiltTipi] = useState(false);
  const [filtreKomedojenite, setFiltreKomedojenite] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setYukleniyor(true);
      
      let params = `q=${aramaMetni}&limit=50`;
      if (filtreHamilelik) params += `&hamilelik_uyumlu=true`;
      if (filtreCiltTipi) params += `&cilt_tipine_uygun=true`;
      if (filtreKomedojenite) params += `&max_komedojenite=2`;
      if (kullaniciId) params += `&kullanici_id=${kullaniciId}`;

      fetch(`${API_URL}/icerikler/ara?${params}`)
        .then((res) => res.json())
        .then((data) => {
          setIcerikler(data.sonuclar || data);
          
          if (data.yeni_rozetler && data.yeni_rozetler.length > 0) {
            import('react-native').then(({ DeviceEventEmitter }) => {
               DeviceEventEmitter.emit('yeni_rozet_kuyrugu', data.yeni_rozetler);
            });
          } else if (data.yeni_rozet_kazanildi) {
            import('react-native').then(({ DeviceEventEmitter }) => {
               DeviceEventEmitter.emit('yeni_rozet_kuyrugu', [data.yeni_rozet_kazanildi]);
            });
          }
          
          setYukleniyor(false);
        })
        .catch((err) => {
          console.error(err);
          setYukleniyor(false);
        });
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [aramaMetni, filtreHamilelik, filtreCiltTipi, filtreKomedojenite, kullaniciId]);

  const filtrelenmisIcerikler = icerikler;

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

        <View style={{ height: 40, marginBottom: 16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
            <TouchableOpacity
              style={[styles.filtreChip, { backgroundColor: filtreHamilelik ? renkler.tint : 'transparent', borderColor: renkler.tint }]}
              onPress={() => setFiltreHamilelik(!filtreHamilelik)}
            >
              <ThemedText style={{ color: filtreHamilelik ? '#FFF' : renkler.tint, fontSize: 13, fontWeight: '600' }}>🤰 Hamileliğe Uygun</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filtreChip, { backgroundColor: filtreCiltTipi ? renkler.tint : 'transparent', borderColor: renkler.tint }]}
              onPress={() => setFiltreCiltTipi(!filtreCiltTipi)}
            >
              <ThemedText style={{ color: filtreCiltTipi ? '#FFF' : renkler.tint, fontSize: 13, fontWeight: '600' }}>💧 Cilt Tipime Uygun</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filtreChip, { backgroundColor: filtreKomedojenite ? renkler.tint : 'transparent', borderColor: renkler.tint }]}
              onPress={() => setFiltreKomedojenite(!filtreKomedojenite)}
            >
              <ThemedText style={{ color: filtreKomedojenite ? '#FFF' : renkler.tint, fontSize: 13, fontWeight: '600' }}>✨ Komedojenik Değil</ThemedText>
            </TouchableOpacity>
          </ScrollView>
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
  filtreChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
