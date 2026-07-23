import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useThemeContext } from '@/hooks/ThemeProvider';
import { API_URL } from '@/hooks/use-kullanici';
import { KaynakRozeti } from '@/components/kaynak-rozeti';

interface CakisanIcerik {
  icerik_adi: string;
  aciklama: string;
  kaynak?: string;
  kaynak_url?: string;
}

interface IcerikDetay {
  icerik_id: number;
  icerik_adi: string;
  baz_tipi: string;
  hamilelikte_guvenli_mi: boolean;
  kaynak?: string;
  kaynak_url?: string;
  cakistigi_icerikler: CakisanIcerik[];
}

export default function IcerikDetayScreen() {
  const { id } = useLocalSearchParams();
  const { activeTheme: theme } = useThemeContext();
  const renkler = Colors[theme];

  const [detay, setDetay] = useState<IcerikDetay | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/icerikler/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Detay çekilemedi');
        return res.json();
      })
      .then((data) => {
        setDetay(data);
        setYukleniyor(false);
      })
      .catch((err) => {
        console.error(err);
        setHata(true);
        setYukleniyor(false);
      });
  }, [id]);

  if (yukleniyor) {
    return (
      <SafeAreaView style={[styles.merkez, { backgroundColor: renkler.background }]}>
        <ActivityIndicator size="large" color={renkler.tint} />
      </SafeAreaView>
    );
  }

  if (hata || !detay) {
    return (
      <SafeAreaView style={[styles.merkez, { backgroundColor: renkler.background }]}>
        <ThemedText>İçerik bilgisi yüklenemedi.</ThemedText>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: renkler.background }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: detay.icerik_adi,
          headerStyle: { backgroundColor: renkler.background },
          headerTintColor: renkler.text,
          headerShadowVisible: false,
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.container}>
          {/* ── Temel Bilgiler ── */}
          <View style={styles.baslikAlani}>
            <ThemedText type="title" style={styles.baslik}>
              {detay.icerik_adi}
            </ThemedText>
            <ThemedText style={[styles.altBaslik, { color: renkler.icon }]}>
              {detay.baz_tipi} bazlı içerik
            </ThemedText>
            
            <View style={styles.rozetKapsayici}>
              <View
                style={[
                  styles.hamilelikRozet,
                  { 
                    backgroundColor: detay.hamilelikte_guvenli_mi ? renkler.successLight : renkler.dangerLight,
                  },
                ]}
              >
                <Ionicons 
                  name={detay.hamilelikte_guvenli_mi ? "checkmark-circle" : "warning"} 
                  size={14} 
                  color={detay.hamilelikte_guvenli_mi ? renkler.success : renkler.danger} 
                />
                <ThemedText 
                  style={[
                    styles.hamilelikYazi, 
                    { color: detay.hamilelikte_guvenli_mi ? renkler.success : renkler.danger }
                  ]}
                >
                  Hamilelik: {detay.hamilelikte_guvenli_mi ? 'Güvenli' : 'Doktora Danışın'}
                </ThemedText>
              </View>

              <KaynakRozeti kaynak={detay.kaynak} kaynak_url={detay.kaynak_url} />
            </View>
          </View>

          {/* ── Çakışmalar ── */}
          <View style={styles.bolumBaslikContainer}>
            <Ionicons name="warning-outline" size={18} color={renkler.danger} />
            <ThemedText style={[styles.bolumBaslik, { color: renkler.danger }]}>
              Bilinen Çakışmalar ({detay.cakistigi_icerikler.length})
            </ThemedText>
          </View>

          {detay.cakistigi_icerikler.length === 0 ? (
            <View style={[styles.bilgiKart, { backgroundColor: renkler.successLight }]}>
              <Ionicons name="checkmark-circle-outline" size={20} color={renkler.success} />
              <ThemedText style={{ color: renkler.success }}>
                Bu içeriğin bilinen hiçbir çakışması yoktur, rutininize eklemesi oldukça güvenlidir.
              </ThemedText>
            </View>
          ) : (
            detay.cakistigi_icerikler.map((cakisma, index) => (
              <View
                key={index}
                style={[styles.cakismaKart, { backgroundColor: renkler.dangerLight }]}
              >
                <ThemedText type="defaultSemiBold" style={[styles.cakismaBaslik, { color: renkler.danger }]}>
                  ⚠️ {cakisma.icerik_adi}
                </ThemedText>
                <ThemedText style={[styles.cakismaAciklama, { color: renkler.text }]}>
                  {cakisma.aciklama}
                </ThemedText>
                <KaynakRozeti kaynak={cakisma.kaynak} kaynak_url={cakisma.kaynak_url} />
              </View>
            ))
          )}

        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  container: { flex: 1, paddingHorizontal: 20 },
  merkez: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  baslikAlani: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  baslik: { fontSize: 28, marginBottom: 4 },
  altBaslik: { fontSize: 16 },
  
  rozetKapsayici: {
    marginTop: 16,
    gap: 8,
    alignItems: 'flex-start',
  },
  hamilelikRozet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  hamilelikYazi: {
    fontSize: 13,
    fontWeight: '600',
  },

  bolumBaslikContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  bolumBaslik: {
    fontSize: 16,
    fontWeight: '700',
  },
  
  cakismaKart: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    gap: 8,
  },
  cakismaBaslik: { fontSize: 15 },
  cakismaAciklama: { fontSize: 14, lineHeight: 21 },
  
  bilgiKart: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    alignItems: 'center',
  },
});
