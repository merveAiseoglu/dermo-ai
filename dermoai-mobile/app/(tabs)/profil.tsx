/**
 * app/(tabs)/profil.tsx
 *
 * Profil ekranı:
 * - Mevcut kullanıcı bilgilerini gösterir (isim, cilt tipi, cilt sorunları)
 * - Düzenleme modunda PUT /kullanici/{kullanici_id} çağırır
 */

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ManuelRutinEkleModal } from "@/components/ManuelRutinEkleModal";
import { Colors } from "@/constants/theme";
import { useThemeContext } from "@/hooks/ThemeProvider";
import { API_URL } from "@/hooks/use-kullanici";
import { bildirimIptalEt, hijyenBildirimiKur, hijyenBildirimiIptalEt, izinIste } from "@/hooks/use-notifications";

const HIJYEN_HATIRLATICILARI = [
  {
    id: "gunes_kremi",
    baslik: "☀️ Güneş Kremi Yenileme",
    mesaj: "Güneş kreminizi tekrar sürmeyi unutmayın",
    sıklık: "günde 3 kez",
    saatler: [10, 13, 16],
  },
  {
    id: "yastik_kilifi",
    baslik: "🛏️ Yastık Kılıfı Değişimi",
    mesaj: "Cilt sağlığınız için yastık kılıfınızı değiştirmeyi unutmayın",
    sıklık: "haftalık",
    gun: "Pazar",
    saat: 20,
  },
  {
    id: "makyaj_fircasi",
    baslik: "🖌️ Makyaj Fırçası/Sünger Temizliği",
    mesaj: "Fırça ve süngerlerinizi temizlemeyi unutmayın",
    sıklık: "haftalık",
    gun: "Cumartesi",
    saat: 19,
  },
  {
    id: "urun_skt",
    baslik: "📅 Ürün Son Kullanma Tarihi Kontrolü",
    mesaj: "Açık kutu ürünlerinizin son kullanma tarihlerini kontrol edin",
    sıklık: "aylık",
    ayin_gunu: 1,
    saat: 18,
  },
];

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

interface KullaniciBilgisi {
  kullanici_id: number;
  isim: string;
  cihaz_id?: string;
  cilt_tipi?: string;
  cilt_sorunlari?: string[];
  hamilelik_modu_aktif?: boolean;
}

interface RutinKaydi {
  rutin_id: number;
  icerik_id: number;
  icerik_adi: string;
  gunler: string[];
  zaman_dilimi: string;
}

export default function ProfilScreen() {
  const { activeTheme: theme, themeMode, setThemeMode } = useThemeContext();
  const renkler = Colors[theme];
  const router = useRouter();

  const [kullanici, setKullanici] = useState<KullaniciBilgisi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [duzenlemeAktif, setDuzenlemeAktif] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  // Rutinim bölümü
  const [rutinler, setRutinler] = useState<RutinKaydi[]>([]);
  const [rutinYukleniyor, setRutinYukleniyor] = useState(false);
  const [isaretlenenRutinler, setIsaretlenenRutinler] = useState<Set<number>>(new Set());
  const [manuelModalAcik, setManuelModalAcik] = useState(false);

  // Düzenleme alanları
  const [duzenIsim, setDuzenIsim] = useState("");
  const [duzenCiltTipi, setDuzenCiltTipi] = useState<string | null>(null);
  const [duzenCiltSorunlari, setDuzenCiltSorunlari] = useState<string[]>([]);
  const [duzenHamilelikModu, setDuzenHamilelikModu] = useState(false);
  
  const [hijyenDurumlari, setHijyenDurumlari] = useState<Record<string, boolean>>({});

  const veriCek = useCallback(async () => {
    setYukleniyor(true);
    try {
      const cihazId = await AsyncStorage.getItem("cihaz_id");
      if (!cihazId) return;

      const yanit = await fetch(`${API_URL}/kullanici/cihaz/${cihazId}`);
      if (!yanit.ok) return;

      const veri: KullaniciBilgisi = await yanit.json();
      setKullanici(veri);

      rutinleriCek(veri.kullanici_id);

      const yeniDurumlar: Record<string, boolean> = {};
      for (const hijyen of HIJYEN_HATIRLATICILARI) {
        const val = await AsyncStorage.getItem(`hijyen_durum_${hijyen.id}`);
        yeniDurumlar[hijyen.id] = val === "true";
      }
      setHijyenDurumlari(yeniDurumlar);

    } catch (e) {
      console.error(e);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  const rutinleriCek = async (kullaniciId: number) => {
    setRutinYukleniyor(true);
    try {
      const yanit = await fetch(`${API_URL}/rutin/${kullaniciId}`);
      if (!yanit.ok) return;
      const veri: RutinKaydi[] = await yanit.json();
      setRutinler(veri);
    } catch (e) {
      console.error("Rutin yükleme hatası:", e);
    } finally {
      setRutinYukleniyor(false);
    }
  };

  const toggleHijyen = async (hijyen: any) => {
    const newVal = !hijyenDurumlari[hijyen.id];
    setHijyenDurumlari(prev => ({ ...prev, [hijyen.id]: newVal }));
    await AsyncStorage.setItem(`hijyen_durum_${hijyen.id}`, String(newVal));

    if (newVal) {
      const izinOk = await izinIste();
      if (izinOk) {
        await hijyenBildirimiKur(hijyen);
        Alert.alert("Aktif", `${hijyen.baslik} hatırlatıcısı açıldı.`);
      } else {
        setHijyenDurumlari(prev => ({ ...prev, [hijyen.id]: false }));
        await AsyncStorage.setItem(`hijyen_durum_${hijyen.id}`, "false");
        Alert.alert("Hata", "Bildirim izni gerekli.");
      }
    } else {
      await hijyenBildirimiIptalEt(hijyen.id);
    }
  };

  useFocusEffect(
    useCallback(() => {
      veriCek();
    }, [veriCek])
  );

  const duzenlemeBaslat = () => {
    if (!kullanici) return;
    setDuzenIsim(kullanici.isim);
    setDuzenCiltTipi(kullanici.cilt_tipi ?? null);
    setDuzenCiltSorunlari(kullanici.cilt_sorunlari ?? []);
    setDuzenHamilelikModu(kullanici.hamilelik_modu_aktif ?? false);
    setDuzenlemeAktif(true);
  };

  const iptalEt = () => setDuzenlemeAktif(false);

  const sorunToggle = (sorun: string) => {
    setDuzenCiltSorunlari((prev) =>
      prev.includes(sorun) ? prev.filter((s) => s !== sorun) : [...prev, sorun]
    );
  };

  const kaydet = async () => {
    if (!kullanici) return;
    if (!duzenIsim.trim()) {
      Alert.alert("Hata", "İsim boş olamaz.");
      return;
    }

    setKaydediliyor(true);
    try {
      const yanit = await fetch(
        `${API_URL}/kullanici/${kullanici.kullanici_id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isim: duzenIsim.trim(),
            cilt_tipi: duzenCiltTipi,
            cilt_sorunlari: duzenCiltSorunlari,
            hamilelik_modu_aktif: duzenHamilelikModu,
          }),
        }
      );

      if (!yanit.ok) throw new Error("Güncelleme başarısız");

      const guncellendi: KullaniciBilgisi = await yanit.json();
      setKullanici(guncellendi);
      await AsyncStorage.setItem("kullanici_isim", guncellendi.isim);
      setDuzenlemeAktif(false);
    } catch (e) {
      Alert.alert("Hata", "Profil güncellenirken bir sorun oluştu.");
      console.error(e);
    } finally {
      setKaydediliyor(false);
    }
  };

  const cikisYap = () => {
    Alert.alert(
      "Çıkış Yap",
      "Hesabından çıkış yapılacak ve onboarding ekranına yönlendirileceksin. Emin misin?",
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Çıkış Yap",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.multiRemove(["kullanici_id", "kullanici_isim", "tur_gosterildi"]);
            router.replace("/onboarding");
          },
        },
      ]
    );
  };

  const rutinSil = async (rutin: RutinKaydi) => {
    Alert.alert(
      "Rutini Kaldır",
      `"${rutin.icerik_adi}" rutinini kaldırmak istiyor musun? Bildirimleri de iptal edilecek.`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Kaldır",
          style: "destructive",
          onPress: async () => {
            try {
              await fetch(`${API_URL}/rutin/${rutin.rutin_id}`, { method: "DELETE" });
              await bildirimIptalEt(rutin.rutin_id);
              setRutinler((prev) => prev.filter((r) => r.rutin_id !== rutin.rutin_id));
            } catch (e) {
              Alert.alert("Hata", "Rutin kaldırılırken bir sorun oluştu.");
            }
          },
        },
      ]
    );
  };

  const rutinIsaretle = async (rutinId: number) => {
    try {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const localTarih = `${yyyy}-${mm}-${dd}`;

      let eskiStreak = 0;
      if (kullanici) {
        try {
          const sYanit = await fetch(`${API_URL}/streak/${kullanici.kullanici_id}?tarih=${localTarih}`);
          if (sYanit.ok) {
            const data = await sYanit.json();
            eskiStreak = data.streak_gun_sayisi || 0;
          }
        } catch (e) {}
      }

      const yanit = await fetch(`${API_URL}/rutin-kayit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rutin_id: rutinId, tarih: localTarih }),
      });
      
      if (yanit.ok) {
        setIsaretlenenRutinler(prev => new Set([...prev, rutinId]));
        
        if (kullanici) {
          try {
            const sYanit2 = await fetch(`${API_URL}/streak/${kullanici.kullanici_id}?tarih=${localTarih}`);
            if (sYanit2.ok) {
              const data2 = await sYanit2.json();
              const yeniStreak = data2.streak_gun_sayisi || 0;
              
              if (yeniStreak > eskiStreak && [3, 7, 30].includes(yeniStreak)) {
                Alert.alert("🎉 Tebrikler!", `${yeniStreak} Gün Rozetini Kazandın!`);
              }
            }
          } catch (e) {}
        }
      }
    } catch(e) {
      console.error(e);
    }
  };

  if (yukleniyor) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: renkler.background }]}>
        <View style={styles.merkezKutu}>
          <ActivityIndicator size="large" color={renkler.tint} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: renkler.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedView style={styles.container}>
            {/* Başlık */}
            <View style={styles.baslikAlani}>
              <ThemedText type="title" style={styles.baslik}>
                Profil
              </ThemedText>
              {!duzenlemeAktif && (
                <TouchableOpacity
                  onPress={duzenlemeBaslat}
                  style={[styles.duzenleButon, { borderColor: renkler.tint }]}
                >
                  <Ionicons name="pencil" size={15} color={renkler.tint} />
                  <ThemedText style={[styles.duzenleYazi, { color: renkler.tint }]}>
                    Düzenle
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>

            {/* Avatar */}
            <View style={styles.avatarAlani}>
              <View
                style={[styles.avatar, { backgroundColor: renkler.primaryLight }]}
              >
                <ThemedText style={[styles.avatarHarf, { color: renkler.tint }]}>
                  {kullanici?.isim?.charAt(0).toUpperCase() ?? "?"}
                </ThemedText>
              </View>
              {!duzenlemeAktif && (
                <ThemedText type="defaultSemiBold" style={styles.isimYazi}>
                  {kullanici?.isim ?? "—"}
                </ThemedText>
              )}
            </View>

            {/* ── GÖRÜNTÜLEME MODU ── */}
            {!duzenlemeAktif && kullanici && (
              <View style={styles.bilgiBolumu}>
                <BilgiKarti
                  baslik="Cilt Tipi"
                  ikon="water"
                  deger={kullanici.cilt_tipi ?? "Belirtilmemiş"}
                  renkler={renkler}
                />
                
                {kullanici.hamilelik_modu_aktif && (
                  <BilgiKarti
                    baslik="Hamilelik Modu"
                    ikon="heart"
                    deger="Aktif"
                    renkler={renkler}
                  />
                )}
                
                <View
                  style={[
                    styles.bilgiKart,
                    {
                      backgroundColor: renkler.surface,
                      borderColor: renkler.border,
                    },
                  ]}
                >
                  <View style={styles.bilgiKartUst}>
                    <Ionicons name="sparkles" size={16} color={renkler.tint} />
                    <ThemedText
                      style={[styles.bilgiBaslik, { color: renkler.icon }]}
                    >
                      Cilt Sorunları
                    </ThemedText>
                  </View>
                  {kullanici.cilt_sorunlari && kullanici.cilt_sorunlari.length > 0 ? (
                    <View style={styles.etiketler}>
                      {kullanici.cilt_sorunlari.map((sorun) => (
                        <View
                          key={sorun}
                          style={[
                            styles.etiket,
                            { backgroundColor: renkler.primaryLight },
                          ]}
                        >
                          <ThemedText
                            style={[styles.etiketYazi, { color: renkler.tint }]}
                          >
                            {sorun}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <ThemedText style={{ color: renkler.icon, fontSize: 14 }}>
                      Belirtilmemiş
                    </ThemedText>
                  )}
                </View>
              </View>
            )}

            {/* ── DÜZENLEME MODU ── */}
            {duzenlemeAktif && (
              <View style={styles.bilgiBolumu}>
                {/* İsim */}
                <View style={styles.duzenAlani}>
                  <ThemedText
                    style={[styles.duzenEtiket, { color: renkler.icon }]}
                  >
                    İsim
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
                    value={duzenIsim}
                    onChangeText={setDuzenIsim}
                    placeholder="İsminiz"
                    placeholderTextColor={renkler.icon}
                  />
                </View>

                {/* Cilt Tipi */}
                <View style={styles.duzenAlani}>
                  <ThemedText
                    style={[styles.duzenEtiket, { color: renkler.icon }]}
                  >
                    Cilt Tipi
                  </ThemedText>
                  <View style={styles.secenekListesi}>
                    {CILT_TIPLERI.map((tip) => {
                      const secili = duzenCiltTipi === tip;
                      return (
                        <TouchableOpacity
                          key={tip}
                          onPress={() => setDuzenCiltTipi(tip)}
                          style={[
                            styles.secenekKutusu,
                            {
                              backgroundColor: secili
                                ? renkler.primaryLight
                                : renkler.surface,
                              borderColor: secili
                                ? renkler.tint
                                : renkler.border,
                            },
                          ]}
                        >
                          <ThemedText
                            style={{
                              fontSize: 13,
                              fontWeight: "500",
                              color: secili ? renkler.tint : renkler.text,
                            }}
                          >
                            {tip}
                          </ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Cilt Sorunları */}
                <View style={styles.duzenAlani}>
                  <ThemedText
                    style={[styles.duzenEtiket, { color: renkler.icon }]}
                  >
                    Cilt Sorunları
                  </ThemedText>
                  <View style={styles.secenekListesi}>
                    {CILT_SORUNLARI.map((sorun) => {
                      const secili = duzenCiltSorunlari.includes(sorun);
                      return (
                        <TouchableOpacity
                          key={sorun}
                          onPress={() => sorunToggle(sorun)}
                          style={[
                            styles.secenekKutusu,
                            {
                              backgroundColor: secili
                                ? renkler.primaryLight
                                : renkler.surface,
                              borderColor: secili
                                ? renkler.tint
                                : renkler.border,
                            },
                          ]}
                        >
                          <ThemedText
                            style={{
                              fontSize: 13,
                              fontWeight: "500",
                              color: secili ? renkler.tint : renkler.text,
                            }}
                          >
                            {sorun}
                          </ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Hamilelik Modu */}
                <View style={[styles.duzenAlani, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: renkler.surface, padding: 16, borderRadius: 12, borderColor: renkler.border, borderWidth: 1 }]}>
                  <View style={{ gap: 4, flex: 1 }}>
                    <ThemedText style={{ fontSize: 16, fontWeight: '600' }}>Hamilelik Modu</ThemedText>
                    <ThemedText style={{ fontSize: 13, color: renkler.icon, paddingRight: 20 }}>
                      Bu mod açıkken içerik önerilerinde hamilelikte kullanımı sakıncalı olan ürünler filtrelenir.
                    </ThemedText>
                  </View>
                  <Switch
                    value={duzenHamilelikModu}
                    onValueChange={setDuzenHamilelikModu}
                    trackColor={{ false: renkler.border, true: renkler.tint }}
                  />
                </View>

                {/* Kaydet / İptal */}
                <View style={styles.eylemler}>
                  <TouchableOpacity
                    onPress={iptalEt}
                    style={[
                      styles.eylemButon,
                      { borderColor: renkler.border, borderWidth: 1.5 },
                    ]}
                  >
                    <ThemedText style={{ fontWeight: "600" }}>İptal</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={kaydet}
                    disabled={kaydediliyor}
                    style={[
                      styles.eylemButon,
                      {
                        backgroundColor: kaydediliyor
                          ? renkler.border
                          : renkler.tint,
                        flex: 1.5,
                      },
                    ]}
                  >
                    {kaydediliyor ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <ThemedText
                        style={{ fontWeight: "700", color: "#fff" }}
                      >
                        Kaydet
                      </ThemedText>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ThemedView>

          {/* ── Rutinim Bölümü ── */}
          {!duzenlemeAktif && (
            <View style={styles.rutinimBolum}>
              <View style={styles.rutinimBaslikSatir}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="calendar" size={16} color={renkler.tint} />
                  <ThemedText style={[styles.rutinimBaslik, { color: renkler.text }]}>
                    Rutinim
                  </ThemedText>
                </View>
                <TouchableOpacity 
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: renkler.tint, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 }}
                  onPress={() => setManuelModalAcik(true)}
                >
                  <Ionicons name="add" size={16} color="#FFF" />
                  <ThemedText style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>İçerik Ekle</ThemedText>
                </TouchableOpacity>
              </View>

              {rutinYukleniyor && (
                <ActivityIndicator size="small" color={renkler.tint} style={{ marginTop: 8 }} />
              )}

              {!rutinYukleniyor && rutinler.length === 0 && (
                <ThemedText style={[styles.rutinBosYazi, { color: renkler.icon }]}>
                  Henüz rutin eklenmedi. Analiz ekranından ekleyebilirsin.
                </ThemedText>
              )}

              {!rutinYukleniyor &&
                rutinler.map((rutin) => (
                  <View
                    key={rutin.rutin_id}
                    style={[
                      styles.rutinKart,
                      { backgroundColor: renkler.surface, borderColor: renkler.border },
                    ]}
                  >
                    <View style={styles.rutinKartSol}>
                      <ThemedText type="defaultSemiBold" style={styles.rutinIcerikAdi}>
                        {rutin.icerik_adi}
                      </ThemedText>
                      <ThemedText style={[styles.rutinDetay, { color: renkler.icon }]}>
                        {rutin.gunler.join(", ")} • {rutin.zaman_dilimi}
                      </ThemedText>
                    </View>
                    <View style={{ gap: 8, alignItems: 'flex-end' }}>
                      <TouchableOpacity
                        onPress={() => rutinIsaretle(rutin.rutin_id)}
                        disabled={isaretlenenRutinler.has(rutin.rutin_id)}
                        activeOpacity={0.7}
                        style={[
                          styles.rutinKaldirButon, 
                          { 
                            borderColor: isaretlenenRutinler.has(rutin.rutin_id) ? renkler.success : renkler.tint,
                            backgroundColor: isaretlenenRutinler.has(rutin.rutin_id) ? renkler.successLight : 'transparent'
                          }
                        ]}
                      >
                        <ThemedText 
                          style={[
                            styles.rutinKaldirYazi, 
                            { color: isaretlenenRutinler.has(rutin.rutin_id) ? renkler.success : renkler.tint }
                          ]}
                        >
                          {isaretlenenRutinler.has(rutin.rutin_id) ? "✅ İşaretlendi" : "✓ Bugün Yaptım"}
                        </ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => rutinSil(rutin)}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={[styles.rutinKaldirYazi, { color: renkler.danger, fontWeight: '400', fontSize: 11 }]}>
                          Sil
                        </ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
            </View>
          )}

          {/* ── Cilt Hijyeni Hatırlatıcıları Bölümü ── */}
          {!duzenlemeAktif && (
            <View style={styles.rutinimBolum}>
              <View style={styles.rutinimBaslikSatir}>
                <Ionicons name="water-outline" size={16} color={renkler.tint} />
                <ThemedText style={[styles.rutinimBaslik, { color: renkler.text }]}>
                  Cilt Hijyeni Hatırlatıcıları
                </ThemedText>
              </View>

              {HIJYEN_HATIRLATICILARI.map((hijyen) => (
                <View
                  key={hijyen.id}
                  style={[
                    styles.rutinKart,
                    { backgroundColor: renkler.surface, borderColor: renkler.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
                  ]}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <ThemedText type="defaultSemiBold" style={styles.rutinIcerikAdi}>
                      {hijyen.baslik}
                    </ThemedText>
                    <ThemedText style={[styles.rutinDetay, { color: renkler.icon, marginTop: 4, fontSize: 11 }]}>
                      {hijyen.mesaj} ({hijyen.sıklık})
                    </ThemedText>
                  </View>
                  <Switch
                    value={!!hijyenDurumlari[hijyen.id]}
                    onValueChange={() => toggleHijyen(hijyen)}
                    trackColor={{ false: "#767577", true: renkler.tint }}
                    thumbColor={"#f4f3f4"}
                  />
                </View>
              ))}
            </View>
          )}

          {/* ── Tema Ayarları Bölümü ── */}
          {!duzenlemeAktif && (
            <View style={styles.rutinimBolum}>
              <View style={styles.rutinimBaslikSatir}>
                <Ionicons name="color-palette" size={16} color={renkler.tint} />
                <ThemedText style={[styles.rutinimBaslik, { color: renkler.text }]}>
                  Uygulama Teması
                </ThemedText>
              </View>
              
              <View style={styles.secenekListesi}>
                {(['light', 'dark', 'system'] as const).map((mode) => {
                  const secili = themeMode === mode;
                  const isimMap = {
                    light: 'Açık',
                    dark: 'Koyu',
                    system: 'Sistem',
                  };
                  return (
                    <TouchableOpacity
                      key={mode}
                      onPress={() => setThemeMode(mode)}
                      style={[
                        styles.secenekKutusu,
                        {
                          backgroundColor: secili
                            ? renkler.primaryLight
                            : renkler.surface,
                          borderColor: secili
                            ? renkler.tint
                            : renkler.border,
                        },
                      ]}
                    >
                      <ThemedText
                        style={{
                          fontSize: 13,
                          fontWeight: "500",
                          color: secili ? renkler.tint : renkler.text,
                        }}
                      >
                        {isimMap[mode]}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Çıkış Butonu ── */}
          {!duzenlemeAktif && (
            <View style={styles.cikisAlani}>
              <TouchableOpacity
                onPress={cikisYap}
                activeOpacity={0.7}
                style={[styles.cikisButon, { borderColor: renkler.danger }]}
              >
                <Ionicons name="log-out-outline" size={18} color={renkler.danger} />
                <ThemedText style={[styles.cikisYazi, { color: renkler.danger }]}>
                  Çıkış Yap
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ManuelRutinEkleModal
        visible={manuelModalAcik}
        kullaniciId={kullanici?.kullanici_id ?? null}
        onClose={() => setManuelModalAcik(false)}
        onEklendi={() => {
          if (kullanici?.kullanici_id) {
            rutinleriCek(kullanici.kullanici_id);
          }
        }}
      />
    </SafeAreaView>
  );
}

// ─── Yardımcı Bileşen ─────────────────────────────────────────────────────────

function BilgiKarti({
  baslik,
  ikon,
  deger,
  renkler,
}: {
  baslik: string;
  ikon: any;
  deger: string;
  renkler: any;
}) {
  return (
    <View
      style={[
        styles.bilgiKart,
        { backgroundColor: renkler.surface, borderColor: renkler.border },
      ]}
    >
      <View style={styles.bilgiKartUst}>
        <Ionicons name={ikon} size={16} color={renkler.tint} />
        <ThemedText style={[styles.bilgiBaslik, { color: renkler.icon }]}>
          {baslik}
        </ThemedText>
      </View>
      <ThemedText style={{ fontSize: 15, fontWeight: "500" }}>{deger}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 20, paddingBottom: 40 },
  baslikAlani: {
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  baslik: { fontSize: 28 },
  duzenleButon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  duzenleYazi: { fontSize: 13, fontWeight: "600" },
  avatarAlani: { alignItems: "center", paddingVertical: 24, gap: 12 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarHarf: { fontSize: 36, fontWeight: "700" },
  isimYazi: { fontSize: 20 },
  merkezKutu: { flex: 1, justifyContent: "center", alignItems: "center" },
  bilgiBolumu: { gap: 12 },
  bilgiKart: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  bilgiKartUst: { flexDirection: "row", alignItems: "center", gap: 6 },
  bilgiBaslik: { fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
  etiketler: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  etiket: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  etiketYazi: { fontSize: 13, fontWeight: "500" },
  duzenAlani: { gap: 10 },
  duzenEtiket: { fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
  girdi: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  secenekListesi: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  secenekKutusu: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderRadius: 10,
  },
  eylemler: { flexDirection: "row", gap: 10, marginTop: 8 },
  eylemButon: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cikisAlani: {
    paddingTop: 16,
    paddingBottom: 16,
    alignItems: "center",
  },
  cikisButon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  cikisYazi: { fontSize: 14, fontWeight: "600" },

  // Rutinim bölümü
  rutinimBolum: {
    marginTop: 24,
    gap: 10,
  },
  rutinimBaslikSatir: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  rutinimBaslik: { fontSize: 16, fontWeight: "700" },
  rutinBosYazi: { fontSize: 14, fontStyle: "italic" },
  rutinKart: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  rutinKartSol: { flex: 1, gap: 3 },
  rutinIcerikAdi: { fontSize: 14 },
  rutinDetay: { fontSize: 12 },
  rutinKaldirButon: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rutinKaldirYazi: { fontSize: 12, fontWeight: "600" },
});
