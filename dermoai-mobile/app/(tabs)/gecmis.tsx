/**
 * app/(tabs)/gecmis.tsx
 *
 * Kullanıcının geçmiş analizlerini listeler.
 * GET /gecmis/{kullanici_id} çağrısı yapılır.
 */

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { API_URL } from "@/hooks/use-kullanici";
import { UrunGorseli } from "@/components/urun-gorseli";

interface UrunDetay {
  marka: string;
  urun_adi: string;
  gorsel_url?: string | null;
}

interface GecmisKaydi {
  analiz_id: number;
  urunler: UrunDetay[];
  cakisma_sayisi: number;
  olusturma_tarihi: string | null;
}

function tarihBicimle(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function GecmisScreen() {
  const theme = useColorScheme() ?? "light";
  const renkler = Colors[theme];

  const [kayitlar, setKayitlar] = useState<GecmisKaydi[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const veriCek = useCallback(async (yenilemeIle = false) => {
    if (yenilemeIle) setYenileniyor(true);
    else setYukleniyor(true);
    setHata(null);

    try {
      const kullaniciIdStr = await AsyncStorage.getItem("kullanici_id");
      if (!kullaniciIdStr) {
        setHata("Kullanıcı bilgisi bulunamadı.");
        return;
      }

      const yanit = await fetch(`${API_URL}/gecmis/${kullaniciIdStr}`);
      if (!yanit.ok) throw new Error("Sunucu hatası");

      const veri: GecmisKaydi[] = await yanit.json();
      setKayitlar(veri);
    } catch (e) {
      setHata("Geçmiş yüklenirken bir hata oluştu.");
      console.error(e);
    } finally {
      setYukleniyor(false);
      setYenileniyor(false);
    }
  }, []);

  // Sekmeye her odaklanıldığında taze veri çek
  useFocusEffect(
    useCallback(() => {
      veriCek();
    }, [veriCek])
  );

  const renderKart = ({ item }: { item: GecmisKaydi }) => {
    const guvenlimi = item.cakisma_sayisi === 0;
    return (
      <View
        style={[
          styles.kart,
          {
            backgroundColor: renkler.surface,
            borderColor: guvenlimi ? renkler.success : renkler.danger,
            borderLeftWidth: 4,
          },
        ]}
      >
        {/* Üst satır: tarih + rozet */}
        <View style={styles.kartUst}>
          <ThemedText style={[styles.tarih, { color: renkler.icon }]}>
            {tarihBicimle(item.olusturma_tarihi)}
          </ThemedText>
          <View
            style={[
              styles.rozet,
              {
                backgroundColor: guvenlimi
                  ? renkler.successLight
                  : renkler.dangerLight,
              },
            ]}
          >
            <Ionicons
              name={guvenlimi ? "checkmark-circle" : "warning"}
              size={13}
              color={guvenlimi ? renkler.success : renkler.danger}
            />
            <ThemedText
              style={[
                styles.rozetYazi,
                { color: guvenlimi ? renkler.success : renkler.danger },
              ]}
            >
              {guvenlimi
                ? "Çakışma yok"
                : `${item.cakisma_sayisi} çakışma`}
            </ThemedText>
          </View>
        </View>

        {/* Ürün listesi */}
        <View style={styles.urunListesi}>
          {item.urunler.map((urun, i) => (
            <View key={i} style={styles.urunSatiri}>
              <UrunGorseli gorselUrl={urun.gorsel_url} marka={urun.marka} boyut={24} />
              <ThemedText style={styles.urunAdi}>{urun.marka} - {urun.urun_adi}</ThemedText>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: renkler.background }]}>
      <ThemedView style={styles.container}>
        {/* Başlık */}
        <View style={styles.baslikAlani}>
          <ThemedText type="title" style={styles.baslik}>
            Geçmiş
          </ThemedText>
          <ThemedText style={[styles.altBaslik, { color: renkler.icon }]}>
            Önceki analizlerin
          </ThemedText>
        </View>

        {yukleniyor && (
          <View style={styles.merkezKutu}>
            <ActivityIndicator size="large" color={renkler.tint} />
          </View>
        )}

        {!yukleniyor && hata && (
          <View style={styles.merkezKutu}>
            <Ionicons name="alert-circle" size={40} color={renkler.danger} />
            <ThemedText style={[styles.bilgiYazi, { color: renkler.danger }]}>
              {hata}
            </ThemedText>
          </View>
        )}

        {!yukleniyor && !hata && kayitlar.length === 0 && (
          <View style={styles.merkezKutu}>
            <Ionicons name="time-outline" size={48} color={renkler.icon} />
            <ThemedText style={[styles.bilgiYazi, { color: renkler.icon }]}>
              Henüz analiz yapılmadı.
            </ThemedText>
            <ThemedText style={[styles.bilgiAlt, { color: renkler.icon }]}>
              Ana sayfadan ürünlerini seç ve analiz et!
            </ThemedText>
          </View>
        )}

        {!yukleniyor && !hata && kayitlar.length > 0 && (
          <FlatList
            data={kayitlar}
            keyExtractor={(item) => item.analiz_id.toString()}
            renderItem={renderKart}
            contentContainerStyle={styles.liste}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={yenileniyor}
                onRefresh={() => veriCek(true)}
                tintColor={renkler.tint}
              />
            }
          />
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 20 },
  baslikAlani: { paddingTop: 12, paddingBottom: 16 },
  baslik: { fontSize: 28 },
  altBaslik: { fontSize: 14, marginTop: 4 },
  merkezKutu: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingBottom: 60,
  },
  bilgiYazi: { fontSize: 16, fontWeight: "600", textAlign: "center" },
  bilgiAlt: { fontSize: 14, textAlign: "center" },
  liste: { paddingBottom: 24 },
  kart: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  kartUst: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tarih: { fontSize: 12 },
  rozet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  rozetYazi: { fontSize: 12, fontWeight: "600" },
  urunListesi: { gap: 6 },
  urunSatiri: { flexDirection: "row", alignItems: "center", gap: 8 },
  nokta: { width: 6, height: 6, borderRadius: 3 },
  urunAdi: { fontSize: 14, flex: 1 },
});
