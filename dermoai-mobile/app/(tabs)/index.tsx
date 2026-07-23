/**
 * app/(tabs)/index.tsx
 *
 * Ana Sayfa:
 *  - "Merhaba, {isim} 👋" karşılama
 *  - Cilt tipine göre kişisel ipucu kartı (statik harita)
 *  - "Analiz Et" → Analiz sekmesine yönlendirir
 */

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useThemeContext } from "@/hooks/ThemeProvider";
import { API_URL } from "@/hooks/use-kullanici";

// Cilt tipine göre statik ipucu haritası
const CILT_IPUCU: Record<string, { baslik: string; metin: string; ikon: string }> = {
  Yağlı: {
    baslik: "Yağlı Cilt İpucu",
    metin:
      "Hafif, yağsız nemlendirici tercih et. Niacinamid ve salisilik asit içeren ürünler gözenek görünümünü azaltmaya yardımcı olur.",
    ikon: "water-outline",
  },
  Kuru: {
    baslik: "Kuru Cilt İpucu",
    metin:
      "Hyalüronik asit ve seramid içeren ürünler nem bariyerini güçlendirir. Duş sonrası hemen nemlendirici uygulamayı unutma.",
    ikon: "leaf-outline",
  },
  Karma: {
    baslik: "Karma Cilt İpucu",
    metin:
      "T-bölgesi için daha hafif, yanaklar için daha besleyici ürünler kullan. Zone-layering rutinini dene!",
    ikon: "color-palette-outline",
  },
  Hassas: {
    baslik: "Hassas Cilt İpucu",
    metin:
      "Parfümsüz ve hipoalerjenik formüller tercih et. Yeni ürünleri boyuna veya bilek içine küçük bir alanda test et.",
    ikon: "heart-outline",
  },
  Normal: {
    baslik: "Normal Cilt İpucu",
    metin:
      "Şanslısın! Antioksidan içeren serum (C vitamini) rutin sağlığını korur ve cilt tonunu eşitler.",
    ikon: "sunny-outline",
  },
};

const VARSAYILAN_IPUCU = {
  baslik: "Günlük Bakım İpucu",
  metin:
    "SPF 30+ güneş koruyucu her sabah temel adımdır — bulutlu günlerde bile. Cildin için en büyük yatırım!",
  ikon: "shield-checkmark-outline",
};

interface KullaniciBilgisi {
  isim: string;
  cilt_tipi?: string;
}

export default function HomeScreen() {
  const { activeTheme: theme, toggleTheme } = useThemeContext();
  const renkler = Colors[theme];
  const router = useRouter();

  const [kullanici, setKullanici] = useState<KullaniciBilgisi | null>(null);

  useEffect(() => {
    const veriCek = async () => {
      try {
        const cihazId = await AsyncStorage.getItem("cihaz_id");
        if (!cihazId) return;

        const yanit = await fetch(`${API_URL}/kullanici/cihaz/${cihazId}`);
        if (!yanit.ok) return;

        const veri = await yanit.json();
        setKullanici({ isim: veri.isim, cilt_tipi: veri.cilt_tipi });
      } catch (e) {
        // sessizce geç
      }
    };
    veriCek();
  }, []);

  const ipucu = kullanici?.cilt_tipi
    ? CILT_IPUCU[kullanici.cilt_tipi] ?? VARSAYILAN_IPUCU
    : VARSAYILAN_IPUCU;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: renkler.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.container}>
          {/* ── Karşılama ── */}
          <View style={styles.baslikAlani}>
            <View>
              <ThemedText type="title" style={styles.baslik}>
                Dermo-AI
              </ThemedText>
              {kullanici ? (
                <ThemedText style={[styles.altBaslik, { color: renkler.tint }]}>
                  Merhaba, {kullanici.isim} 👋
                </ThemedText>
              ) : (
                <ThemedText style={[styles.altBaslik, { color: renkler.icon }]}>
                  Kişisel cilt bakım asistanın
                </ThemedText>
              )}
            </View>
            <TouchableOpacity onPress={toggleTheme} style={styles.temaGecisButonu}>
              <Ionicons
                name={theme === 'light' ? 'moon' : 'sunny'}
                size={24}
                color={renkler.icon}
              />
            </TouchableOpacity>
          </View>

          {/* ── İpucu Kartı ── */}
          <View
            style={[
              styles.ipucuKart,
              { backgroundColor: renkler.primaryLight, borderColor: renkler.tint },
            ]}
          >
            <View style={styles.ipucuIkon}>
              <Ionicons name={ipucu.ikon as any} size={28} color={renkler.tint} />
            </View>
            <View style={styles.ipucuIcerik}>
              <ThemedText
                type="defaultSemiBold"
                style={[styles.ipucuBaslik, { color: renkler.tint }]}
              >
                {ipucu.baslik}
              </ThemedText>
              <ThemedText style={[styles.ipucuMetin, { color: renkler.text }]}>
                {ipucu.metin}
              </ThemedText>
            </View>
          </View>

          {/* ── Analiz Et Butonu ── */}
          <View style={styles.eylemAlani}>
            <ThemedText
              type="defaultSemiBold"
              style={[styles.eylemBaslik, { color: renkler.icon }]}
            >
              Ne yapmak istersin?
            </ThemedText>

            <TouchableOpacity
              onPress={() => router.push("/(tabs)/analiz")}
              activeOpacity={0.8}
              style={[styles.buyukButon, { backgroundColor: renkler.tint }]}
            >
              <Ionicons name="flask" size={24} color="#fff" />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.buyukButonBaslik}>Ürün Analizi Yap</ThemedText>
                <ThemedText style={styles.buyukButonAlt}>
                  Çakışmaları kontrol et
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/(tabs)/gecmis")}
              activeOpacity={0.8}
              style={[
                styles.kucukButon,
                { backgroundColor: renkler.surface, borderColor: renkler.border },
              ]}
            >
              <Ionicons name="time-outline" size={20} color={renkler.tint} />
              <ThemedText style={[styles.kucukButonYazi, { color: renkler.text }]}>
                Geçmiş Analizler
              </ThemedText>
              <Ionicons name="chevron-forward" size={16} color={renkler.icon} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/kutuphane")}
              activeOpacity={0.8}
              style={[
                styles.kucukButon,
                { backgroundColor: renkler.surface, borderColor: renkler.border },
              ]}
            >
              <Ionicons name="library-outline" size={20} color={renkler.tint} />
              <ThemedText style={[styles.kucukButonYazi, { color: renkler.text }]}>
                İçerik Kütüphanesi
              </ThemedText>
              <Ionicons name="chevron-forward" size={16} color={renkler.icon} />
            </TouchableOpacity>
          </View>

          {/* ── Uyarı Notu ── */}
          <View
            style={[
              styles.notKart,
              { backgroundColor: renkler.surface, borderColor: renkler.border },
            ]}
          >
            <Ionicons name="information-circle-outline" size={16} color={renkler.icon} />
            <ThemedText style={[styles.notMetin, { color: renkler.icon }]}>
              Dermo-AI sonuçları algoritmik analizdir ve tıbbi tavsiye yerine geçmez.
            </ThemedText>
          </View>
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  container: { flex: 1, paddingHorizontal: 20, paddingBottom: 40 },
  baslikAlani: { 
    paddingTop: 12, 
    paddingBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  temaGecisButonu: {
    padding: 8,
    borderRadius: 20,
  },
  baslik: { fontSize: 28 },
  altBaslik: { fontSize: 15, marginTop: 4 },

  ipucuKart: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    gap: 14,
    marginBottom: 32,
  },
  ipucuIkon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  ipucuIcerik: { flex: 1, gap: 6 },
  ipucuBaslik: { fontSize: 14 },
  ipucuMetin: { fontSize: 14, lineHeight: 20 },

  eylemAlani: { gap: 12, marginBottom: 24 },
  eylemBaslik: { fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 },

  buyukButon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 16,
  },
  buyukButonBaslik: { fontSize: 16, fontWeight: "700", color: "#fff" },
  buyukButonAlt: { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },

  kucukButon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  kucukButonYazi: { flex: 1, fontSize: 15, fontWeight: "500" },

  notKart: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  notMetin: { flex: 1, fontSize: 12, lineHeight: 18 },
});
