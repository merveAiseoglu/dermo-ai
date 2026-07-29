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
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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
import { GeriBildirimModal, GeriBildirimIcerik } from "@/components/GeriBildirimModal";
import { CircularGauge } from "@/components/CircularGauge";
import { BitkiKarakteri } from "@/components/BitkiKarakteri";
import { Sprout } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

function motivasyonSozuGetir(streak: number): string {
  if (streak === 0) return "Bugün başla, ilk adımı at!";
  if (streak < 3) return "Güzel gidiyorsun, devam et!";
  if (streak < 7) return "3 günlük rozeti kaptın, sıradaki hedef 7 gün! 🔥";
  if (streak < 30) return "Harikasın, cildin bu tutarlılığı hissediyor 💚";
  return "Sen bir Dermo-AI ustasısın! 🏆";
}

const ROZETLER = [
  { esik: 3, emoji: "🔥", ad: "3 gün" },
  { esik: 7, emoji: "⭐", ad: "7 gün" },
  { esik: 30, emoji: "🏆", ad: "30 gün" },
];

interface KullaniciBilgisi {
  kullanici_id: number;
  isim: string;
  cilt_tipi?: string;
}

interface StreakSonucu {
  streak_gun_sayisi: number;
  son_kayit_tarihi: string | null;
  rozet: { emoji: string; ad: string } | null;
  sonraki_esik: number;
}

export default function HomeScreen() {
  const { activeTheme: theme, toggleTheme } = useThemeContext();
  const renkler = Colors[theme];
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [kullanici, setKullanici] = useState<KullaniciBilgisi | null>(null);
  const [streak, setStreak] = useState<StreakSonucu | null>(null);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [llmAciklama, setLlmAciklama] = useState<string | null>(null);
  const [healthScoreDetails, setHealthScoreDetails] = useState<any[]>([]);
  const [healthScoreUyari, setHealthScoreUyari] = useState<string | null>(null);
  const [isHealthScoreLoading, setIsHealthScoreLoading] = useState(false);
  const [haftalikSadakat, setHaftalikSadakat] = useState<{yuzde: number, toplam_beklenen: number, toplam_tamamlanan: number, mesaj: string} | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [geriBildirimIcerikler, setGeriBildirimIcerikler] = useState<GeriBildirimIcerik[]>([]);
  const [gunEsigi, setGunEsigi] = useState<number>(3);

  useFocusEffect(
    useCallback(() => {
      const veriCek = async () => {
        try {
          const cihazId = await AsyncStorage.getItem("cihaz_id");
          console.log("[GUARD] cihazId:", cihazId);
          if (!cihazId) return;

          console.log("[API] İstek gönderiliyor:", `${API_URL}/kullanici/cihaz/${cihazId}`);
          const yanit = await fetch(`${API_URL}/kullanici/cihaz/${cihazId}`);
          if (!yanit.ok) return;

          const veri = await yanit.json();
          setKullanici(veri);

          // Get Health Score
          try {
            setIsHealthScoreLoading(true);
            console.log("[API] İstek gönderiliyor:", `${API_URL}/api/routine/health-score/${veri.kullanici_id}`);
            const hsYanit = await fetch(`${API_URL}/api/routine/health-score/${veri.kullanici_id}`);
            if (hsYanit.ok) {
              const hsVeri = await hsYanit.json();
              setHealthScore(hsVeri.skor);
              setLlmAciklama(hsVeri.llm_aciklama);
              setHealthScoreDetails(hsVeri.detaylar || []);
              setHealthScoreUyari(hsVeri.genel_uyari || null);
              
              if (hsVeri.yeni_rozetler && hsVeri.yeni_rozetler.length > 0) {
                import('react-native').then(({ DeviceEventEmitter }) => {
                  DeviceEventEmitter.emit('yeni_rozet_kuyrugu', hsVeri.yeni_rozetler);
                });
              }
            }
          } catch (e) {
            console.error(e);
          } finally {
            setIsHealthScoreLoading(false);
          }
          
          // Get Haftalik Sadakat
          try {
            console.log("[API] İstek gönderiliyor:", `${API_URL}/kullanicilar/${veri.kullanici_id}/haftalik-sadakat`);
            const sadakatYanit = await fetch(`${API_URL}/kullanicilar/${veri.kullanici_id}/haftalik-sadakat`);
            if (sadakatYanit.ok) {
              const sadakatVeri = await sadakatYanit.json();
              setHaftalikSadakat(sadakatVeri);
            }
          } catch (e) {
            console.error(e);
          }

          // Frontend saatine göre tarih oluştur
          const d = new Date();
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const localTarih = `${yyyy}-${mm}-${dd}`;

          console.log("[API] İstek gönderiliyor:", `${API_URL}/streak/${veri.kullanici_id}?tarih=${localTarih}`);
          const streakYanit = await fetch(`${API_URL}/streak/${veri.kullanici_id}?tarih=${localTarih}`);
          if (streakYanit.ok) {
            const streakData = await streakYanit.json();
            setStreak(streakData);
            
            // Geri Bildirim kontrolü
            if (streakData.streak_gun_sayisi >= 3) {
               console.log("[API] İstek gönderiliyor:", `${API_URL}/geri-bildirim/gerekli-mi?kullanici_id=${veri.kullanici_id}&streak_gun_sayisi=${streakData.streak_gun_sayisi}`);
               const gbYanit = await fetch(`${API_URL}/geri-bildirim/gerekli-mi?kullanici_id=${veri.kullanici_id}&streak_gun_sayisi=${streakData.streak_gun_sayisi}`);
               if (gbYanit.ok) {
                 const gbData = await gbYanit.json();
                 if (gbData.sorulmali && gbData.icerikler?.length > 0) {
                    setGeriBildirimIcerikler(gbData.icerikler);
                    setGunEsigi(gbData.gun_esigi);
                    setModalVisible(true);
                 }
               }
            }
          }
        } catch (e) {
          // sessizce geç
        }
      };
      veriCek();
    }, [])
  );

  const ipucu = kullanici?.cilt_tipi
    ? CILT_IPUCU[kullanici.cilt_tipi] ?? VARSAYILAN_IPUCU
    : VARSAYILAN_IPUCU;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: renkler.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
          {/* ── Karşılama ── */}
          <View style={styles.baslikAlani}>
            <View>
              <ThemedText type="title" style={styles.baslik}>
                Dermo-AI
              </ThemedText>
              {kullanici ? (
                <ThemedText style={[styles.altBaslik, { color: renkler.tint }]}>
                  Merhaba, {kullanici.isim}
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

          {/* ── Birleşik Rutin Serisi & Sadakat Kartı ── */}
          {streak && streak.streak_gun_sayisi > 0 && haftalikSadakat && (
            <View
              style={[
                styles.streakKart,
                { backgroundColor: renkler.surface, borderColor: renkler.border },
              ]}
            >
              <View style={[styles.streakUst, { alignItems: 'center' }]}>
                <View style={{ marginRight: 16 }}>
                  <Sprout size={32} color={renkler.tint} />
                </View>
                
                <View style={[styles.streakSol, { flex: 1 }]}>
                  <ThemedText style={[styles.streakBaslik, { color: renkler.tint }]}>
                    Rutin Disiplini
                  </ThemedText>
                  <ThemedText type="title" style={{ fontSize: 24, marginTop: 4 }}>
                    {streak.streak_gun_sayisi} gün
                  </ThemedText>
                </View>
                {streak.rozet && (
                  <View style={[styles.rozetKutu, { backgroundColor: renkler.primaryLight }]}>
                    <ThemedText style={{ fontSize: 22 }}>{streak.rozet.emoji}</ThemedText>
                    <ThemedText style={[styles.rozetAd, { color: renkler.tint }]}>
                      {streak.rozet.ad}
                    </ThemedText>
                  </View>
                )}
              </View>

              {/* Haftalık Sadakat Progress */}
              <View style={{ width: '100%', marginTop: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 8 }}>
                  <ThemedText style={{ color: renkler.text, fontSize: 13, fontWeight: '600' }}>
                    Haftalık Sadakat ({haftalikSadakat.toplam_tamamlanan}/{haftalikSadakat.toplam_beklenen})
                  </ThemedText>
                  <ThemedText style={{ color: renkler.tint, fontSize: 13, fontWeight: 'bold' }}>
                    %{haftalikSadakat.yuzde}
                  </ThemedText>
                </View>
                
                <View style={{ height: 8, width: '100%', backgroundColor: renkler.border, borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${haftalikSadakat.yuzde}%`, backgroundColor: renkler.tint, borderRadius: 4 }} />
                </View>
              </View>

              {/* ── Motivasyon Sözü ── */}
              <View style={[styles.motivasyonKutu, { backgroundColor: renkler.primaryLight, marginTop: 16 }]}>
                <ThemedText style={[styles.motivasyonYazi, { color: renkler.tint }]}>
                  {haftalikSadakat.mesaj !== "Henüz veri yok" ? haftalikSadakat.mesaj : motivasyonSozuGetir(streak.streak_gun_sayisi)}
                </ThemedText>
              </View>
            </View>
          )}





          {/* 💡 İpucu Kartı 💡 */}
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

      {kullanici && (
        <GeriBildirimModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          icerikler={geriBildirimIcerikler}
          gun_esigi={gunEsigi}
          kullanici_id={kullanici.kullanici_id}
        />
      )}
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
    borderWidth: 0,
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

  streakKart: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  streakUst: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  streakSol: { flex: 1 },
  streakBaslik: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  rozetKutu: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    minWidth: 80,
  },
  rozetAd: { fontSize: 10, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: { fontSize: 12, marginTop: 4 },
  rozetSeridi: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  seritRozet: {
    alignItems: 'center',
  },
  motivasyonKutu: {
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  motivasyonYazi: {
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
  },

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
