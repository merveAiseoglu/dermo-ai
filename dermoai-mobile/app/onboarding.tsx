/**
 * app/onboarding.tsx
 *
 * 3 adımlı onboarding akışı (Seçenek A):
 *  Adım 1: İsim gir
 *  Adım 2: Yaş (TextInput, numeric) + Cinsiyet (tekli buton grubu)
 *  Adım 3: Cilt tipi (tekli) + Cilt sorunları (çoklu)
 *
 * Son adımda POST /kullanici çağrılır, dönen kullanici_id
 * AsyncStorage'a kaydedilip Ana Sayfa'ya yönlendirilir.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { API_URL, uuidOlustur } from "@/hooks/use-kullanici";
import { useTur } from "@/hooks/TurContext";

const CINSIYET_SECENEKLERI = ["Kadın", "Erkek", "Belirtmek istemiyorum"];

const CILT_TIPLERI = ["Normal", "Yağlı", "Kuru", "Karma", "Hassas"];

const CILT_SORUNLARI = [
  "Akne / Sivilce",
  "Kırışıklık",
  "Leke / Hiperpigmentasyon",
  "Gözenek",
  "Kızarıklık",
  "Kuruluk / Soyulma",
  "Yağlanma",
  "Karanlık Halkalar",
];

export default function OnboardingScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
  const renkler = Colors[theme];
  
  const { turuBaslat } = useTur();

  const [adim, setAdim] = useState(1);

  // Cihaz ID'nin hazır olduğundan emin ol
  useEffect(() => {
    const cihazIdHazirla = async () => {
      let mevcutCihazId = await AsyncStorage.getItem("cihaz_id");
      if (!mevcutCihazId) {
        mevcutCihazId = uuidOlustur();
        await AsyncStorage.setItem("cihaz_id", mevcutCihazId);
        console.log("[GUARD] cihazId üretildi ve kaydedildi:", mevcutCihazId);
      }
    };
    cihazIdHazirla();
  }, []);

  // Adım 1
  const [isim, setIsim] = useState("");

  // Adım 2
  const [yas, setYas] = useState("");
  const [cinsiyet, setCinsiyet] = useState<string | null>(null);

  // Adım 3
  const [ciltTipi, setCiltTipi] = useState<string | null>(null);
  const [ciltSorunlari, setCiltSorunlari] = useState<string[]>([]);

  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  // Çoklu seçim toggle
  const sorunToggle = (sorun: string) => {
    setCiltSorunlari((prev) =>
      prev.includes(sorun) ? prev.filter((s) => s !== sorun) : [...prev, sorun]
    );
  };

  const devamEt = async () => {
    setHata(null);
    console.log("[KAYIT] Fonksiyon tetiklendi, adim:", adim);

    // ── Adım 1: İsim doğrulama ──
    if (adim === 1) {
      if (!isim.trim()) {
        setHata("Lütfen isminizi girin.");
        return;
      }
      setAdim(2);
      return;
    }

    // ── Adım 2: Yaş + Cinsiyet ──
    if (adim === 2) {
      // İkisi de opsiyonel — doğrudan geçebilir
      if (yas && (isNaN(Number(yas)) || Number(yas) < 1 || Number(yas) > 120)) {
        setHata("Lütfen geçerli bir yaş girin (1-120).");
        return;
      }
      setAdim(3);
      return;
    }

    // ── Adım 3: Cilt Tipi zorunlu, Sorunlar opsiyonel → Backend'e kaydet ──
    if (adim === 3) {
      if (!ciltTipi) {
        setHata("Lütfen cilt tipinizi seçin.");
        return;
      }

      setYukleniyor(true);
      try {
        const cihazId = await AsyncStorage.getItem("cihaz_id");
        if (!cihazId) throw new Error("Cihaz ID bulunamadı");

        const bodyData = {
          cihaz_id: cihazId,
          isim: isim.trim(),
          yas: yas ? Number(yas) : null,
          cinsiyet: cinsiyet ?? null,
          cilt_tipi: ciltTipi,
          cilt_sorunlari: ciltSorunlari,
        };
        console.log("[KAYIT] İstek gönderiliyor:", `${API_URL}/kullanici`, "body:", JSON.stringify(bodyData));

        const yanit = await fetch(`${API_URL}/kullanici`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyData),
        });

        if (!yanit.ok) throw new Error("Kayıt başarısız");

        const veri = await yanit.json();
        await AsyncStorage.setItem("kullanici_id", String(veri.kullanici_id));
        await AsyncStorage.setItem("kullanici_isim", veri.isim);

        // Tur kontrolü
        const turGosterildi = await AsyncStorage.getItem("tur_gosterildi");
        if (turGosterildi === "true") {
          router.replace("/(tabs)");
        } else {
          turuBaslat(); // turuBaslat (tabs)'e yönlendirip overlay'i açacak
        }
      } catch (e: any) {
        console.error("[KAYIT] Hata:", e);
        setHata("Bir hata oluştu, tekrar deneyin.");
      } finally {
        setYukleniyor(false);
      }
    }
  };

  const ilerlemeYuzdesi = (adim / 3) * 100;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: renkler.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedView style={styles.container}>
            {/* ── Başlık ── */}
            <View style={styles.baslikAlani}>
              <ThemedText type="title" style={styles.logo}>
                🌿 Dermo-AI
              </ThemedText>
              <ThemedText style={[styles.altBaslik, { color: renkler.icon }]}>
                Kişisel cilt bakım asistanın
              </ThemedText>
            </View>

            {/* ── İlerleme Çubuğu ── */}
            <View style={styles.ilerlemeContainer}>
              <View
                style={[styles.ilerlemeCubugu, { backgroundColor: renkler.border }]}
              >
                <View
                  style={[
                    styles.ilerlemeIc,
                    {
                      width: `${ilerlemeYuzdesi}%` as any,
                      backgroundColor: renkler.tint,
                    },
                  ]}
                />
              </View>
              <ThemedText style={[styles.adimYazisi, { color: renkler.icon }]}>
                {adim} / 3
              </ThemedText>
            </View>

            {/* ── ADIM 1: İsim ── */}
            {adim === 1 && (
              <View style={styles.adimIcerigi}>
                <ThemedText type="defaultSemiBold" style={styles.soruBasligi}>
                  Seni nasıl çağıralım? 👋
                </ThemedText>
                <ThemedText style={[styles.soruAciklama, { color: renkler.icon }]}>
                  İsmin, analizlerini kişiselleştirmemize yardımcı olur.
                </ThemedText>
                <TextInput
                  style={[
                    styles.girdi,
                    {
                      backgroundColor: renkler.surface,
                      borderColor: renkler.border,
                      color: renkler.text,
                    },
                  ]}
                  placeholder="Adın..."
                  placeholderTextColor={renkler.icon}
                  value={isim}
                  onChangeText={setIsim}
                  autoFocus
                  returnKeyType="next"
                  onSubmitEditing={devamEt}
                />
              </View>
            )}

            {/* ── ADIM 2: Yaş + Cinsiyet ── */}
            {adim === 2 && (
              <View style={styles.adimIcerigi}>
                <ThemedText type="defaultSemiBold" style={styles.soruBasligi}>
                  Seni biraz daha tanıyalım 🧬
                </ThemedText>
                <ThemedText style={[styles.soruAciklama, { color: renkler.icon }]}>
                  Bu bilgiler analiz önerilerini kişiselleştirmek için kullanılır.
                  İsteğe bağlıdır, atlayabilirsin.
                </ThemedText>

                {/* Yaş */}
                <ThemedText style={[styles.altEtiket, { color: renkler.icon }]}>
                  Yaş
                </ThemedText>
                <TextInput
                  style={[
                    styles.girdi,
                    {
                      backgroundColor: renkler.surface,
                      borderColor: renkler.border,
                      color: renkler.text,
                      marginBottom: 20,
                    },
                  ]}
                  placeholder="Yaşınız (opsiyonel)"
                  placeholderTextColor={renkler.icon}
                  value={yas}
                  onChangeText={setYas}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />

                {/* Cinsiyet */}
                <ThemedText style={[styles.altEtiket, { color: renkler.icon }]}>
                  Cinsiyet
                </ThemedText>
                <View style={styles.secenekListesi}>
                  {CINSIYET_SECENEKLERI.map((c) => {
                    const secili = cinsiyet === c;
                    return (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setCinsiyet(secili ? null : c)}
                        activeOpacity={0.7}
                        style={[
                          styles.secenekKutusu,
                          {
                            backgroundColor: secili
                              ? renkler.primaryLight
                              : renkler.surface,
                            borderColor: secili ? renkler.tint : renkler.border,
                          },
                        ]}
                      >
                        <ThemedText
                          style={[
                            styles.secenekYazi,
                            { color: secili ? renkler.tint : renkler.text },
                          ]}
                        >
                          {c}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── ADIM 3: Cilt Tipi + Cilt Sorunları ── */}
            {adim === 3 && (
              <View style={styles.adimIcerigi}>
                {/* Cilt Tipi */}
                <ThemedText type="defaultSemiBold" style={styles.soruBasligi}>
                  Cilt tipiniz ve sorunlarınız 🧴
                </ThemedText>
                <ThemedText style={[styles.soruAciklama, { color: renkler.icon }]}>
                  Cilt tipi seçimi zorunludur.
                </ThemedText>

                <ThemedText style={[styles.altEtiket, { color: renkler.icon }]}>
                  Cilt Tipi (tek seçim)
                </ThemedText>
                <View style={[styles.secenekListesi, { marginBottom: 24 }]}>
                  {CILT_TIPLERI.map((tip) => {
                    const secili = ciltTipi === tip;
                    return (
                      <TouchableOpacity
                        key={tip}
                        onPress={() => setCiltTipi(tip)}
                        activeOpacity={0.7}
                        style={[
                          styles.secenekKutusu,
                          {
                            backgroundColor: secili
                              ? renkler.primaryLight
                              : renkler.surface,
                            borderColor: secili ? renkler.tint : renkler.border,
                          },
                        ]}
                      >
                        <ThemedText
                          style={[
                            styles.secenekYazi,
                            { color: secili ? renkler.tint : renkler.text },
                          ]}
                        >
                          {tip}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Cilt Sorunları */}
                <ThemedText style={[styles.altEtiket, { color: renkler.icon }]}>
                  Cilt Sorunları (çoklu seçim, opsiyonel)
                </ThemedText>
                <View style={styles.secenekListesi}>
                  {CILT_SORUNLARI.map((sorun) => {
                    const secili = ciltSorunlari.includes(sorun);
                    return (
                      <TouchableOpacity
                        key={sorun}
                        onPress={() => sorunToggle(sorun)}
                        activeOpacity={0.7}
                        style={[
                          styles.secenekKutusu,
                          {
                            backgroundColor: secili
                              ? renkler.primaryLight
                              : renkler.surface,
                            borderColor: secili ? renkler.tint : renkler.border,
                          },
                        ]}
                      >
                        <ThemedText
                          style={[
                            styles.secenekYazi,
                            { color: secili ? renkler.tint : renkler.text },
                          ]}
                        >
                          {sorun}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── Hata Mesajı ── */}
            {hata && (
              <ThemedText style={[styles.hataMesaji, { color: renkler.danger }]}>
                {hata}
              </ThemedText>
            )}

            {/* ── Devam Et / Başlayalım Butonu ── */}
            <TouchableOpacity
              onPress={devamEt}
              disabled={yukleniyor}
              activeOpacity={0.8}
              style={[
                styles.devamButon,
                { backgroundColor: yukleniyor ? renkler.border : renkler.tint },
              ]}
            >
              {yukleniyor ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.devamButonYazi}>
                  {adim === 3 ? "Başlayalım 🚀" : "Devam Et →"}
                </ThemedText>
              )}
            </TouchableOpacity>

            {/* ── Adım 2'de ve 3'te "Atla" ── */}
            {(adim === 2 || adim === 3) && !yukleniyor && (
              <TouchableOpacity
                onPress={() => {
                  if (adim === 2) {
                    // Yaş/cinsiyeti boş bırakarak geç
                    setYas("");
                    setCinsiyet(null);
                    setHata(null);
                    setAdim(3);
                  } else {
                    // Adım 3: sorunları temizle ve gönder (cilt tipi zorunlu kontrolü devamEt içinde)
                    setCiltSorunlari([]);
                    devamEt();
                  }
                }}
                style={styles.atlaBaglan}
              >
                <ThemedText style={[styles.atlaYazi, { color: renkler.icon }]}>
                  {adim === 2 ? "Bu adımı atla" : "Sorunları seçme"}
                </ThemedText>
              </TouchableOpacity>
            )}
          </ThemedView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  baslikAlani: { alignItems: "center", marginBottom: 32 },
  logo: { fontSize: 32, marginBottom: 4 },
  altBaslik: { fontSize: 15 },
  ilerlemeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 36,
  },
  ilerlemeCubugu: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  ilerlemeIc: { height: "100%", borderRadius: 3 },
  adimYazisi: {
    fontSize: 13,
    fontWeight: "600",
    minWidth: 28,
    textAlign: "right",
  },
  adimIcerigi: { flex: 1, marginBottom: 24 },
  soruBasligi: { fontSize: 22, marginBottom: 8 },
  soruAciklama: { fontSize: 14, marginBottom: 20 },
  altEtiket: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  girdi: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  secenekListesi: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  secenekKutusu: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  secenekYazi: { fontSize: 14, fontWeight: "500" },
  hataMesaji: {
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
  },
  devamButon: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  devamButonYazi: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  atlaBaglan: { alignItems: "center", marginTop: 16 },
  atlaYazi: { fontSize: 14 },
});
