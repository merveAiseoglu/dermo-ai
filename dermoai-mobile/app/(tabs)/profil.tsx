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
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  Text,
  Switch,
  Image,
  DeviceEventEmitter,
} from "react-native";
import { Repeat, MoreVertical, Sun, Moon, Sparkles, CalendarClock, Check } from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ManuelRutinEkleModal } from "@/components/ManuelRutinEkleModal";
import { BitkiKarakteri } from "@/components/BitkiKarakteri";
import { Colors } from "@/constants/theme";
import { useThemeContext } from "@/hooks/ThemeProvider";
import { CustomAlert as Alert } from "@/components/OzelAlert";
import { API_URL } from "@/hooks/use-kullanici";
import { bildirimIptalEt, hijyenBildirimiKur, hijyenBildirimiIptalEt, izinIste } from "@/hooks/use-notifications";

const HIJYEN_HATIRLATICILARI = [
  {
    id: "gunes_kremi",
    baslik: "Güneş Kremi Yenileme",
    mesaj: "Cilt perin hatırlatıyor: Güneş kremini tazeleme vakti geldi!",
    ikon: "Sun",
    sıklık: "günde 3 kez",
    saatler: [10, 13, 16],
  },
  {
    id: "yastik_kilifi",
    baslik: "Yastık Kılıfı Değişimi",
    mesaj: "Cilt perin: Yastık kılıfını değiştirmenin tam zamanı, cildin teşekkür edecek",
    ikon: "Moon",
    sıklık: "haftalık",
    gun: "Pazar",
    saat: 20,
  },
  {
    id: "makyaj_fircasi",
    baslik: "Makyaj Fırçası/Sünger Temizliği",
    mesaj: "Cilt perin fısıldıyor: Fırçaların temizlenmek istiyor, sivilcelerden korunalım!",
    ikon: "Sparkles",
    sıklık: "haftalık",
    gun: "Cumartesi",
    saat: 19,
  },
  {
    id: "urun_skt",
    baslik: "Ürün Son Kullanma Tarihi Kontrolü",
    mesaj: "Cilt perin uyarıyor: Ürünlerinin ömrünü kontrol et, tazeliğini koru!",
    ikon: "CalendarClock",
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
  kullanim_talimati?: string | null;
  kapsam_disi?: boolean;
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
  
  // Streak
  const [streakGunSayisi, setStreakGunSayisi] = useState<number>(0);
  const [streakKutlama, setStreakKutlama] = useState<boolean>(false);
  
  // Rozetler
  const [rozetler, setRozetler] = useState<any[]>([]);

  const [healthScore, setHealthScore] = useState<number | null>(null);

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
      console.log("[GUARD] cihazId:", cihazId);
      if (!cihazId) return;

      console.log("[API] İstek gönderiliyor:", `${API_URL}/kullanici/cihaz/${cihazId}`);
      const yanit = await fetch(`${API_URL}/kullanici/cihaz/${cihazId}`);
      if (!yanit.ok) return;

      const veri: KullaniciBilgisi = await yanit.json();
      setKullanici(veri);

      rutinleriCek(veri.kullanici_id);

      try {
        console.log("[API] İstek gönderiliyor:", `${API_URL}/api/routine/health-score/${veri.kullanici_id}`);
        const hsYanit = await fetch(`${API_URL}/api/routine/health-score/${veri.kullanici_id}`);
        if (hsYanit.ok) {
          const hsVeri = await hsYanit.json();
          setHealthScore(hsVeri.skor);
        }
      } catch (e) { console.error(e); }

      // Streak verisini çek
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const localTarih = `${yyyy}-${mm}-${dd}`;
      
      console.log("[API] İstek gönderiliyor:", `${API_URL}/streak/${veri.kullanici_id}?tarih=${localTarih}`);
      const sYanit = await fetch(`${API_URL}/streak/${veri.kullanici_id}?tarih=${localTarih}`);
      if (sYanit.ok) {
        const sData = await sYanit.json();
        setStreakGunSayisi(sData.streak_gun_sayisi || 0);
        if (sData.yeni_rozetler && sData.yeni_rozetler.length > 0) {
          DeviceEventEmitter.emit('yeni_rozet_kuyrugu', sData.yeni_rozetler);
        } else if (sData.yeni_rozet_kazanildi) {
          DeviceEventEmitter.emit('yeni_rozet_kuyrugu', [sData.yeni_rozet_kazanildi]);
        }
      }

      // Rozetleri çek
      console.log("[API] İstek gönderiliyor:", `${API_URL}/kullanicilar/${veri.kullanici_id}/rozetler`);
      const rYanit = await fetch(`${API_URL}/kullanicilar/${veri.kullanici_id}/rozetler`);
      if (rYanit.ok) {
        const rData = await rYanit.json();
        setRozetler(rData);
      }

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
      console.log("[API] İstek gönderiliyor:", `${API_URL}/rutin/${kullaniciId}`);
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
    console.log("[GUARD] kullanici:", kullanici);
    if (!kullanici) return;

    console.log("[API] İstek gönderiliyor:", `${API_URL}/kullanici/${kullanici.kullanici_id}`);
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
              console.log("[API] İstek gönderiliyor:", `${API_URL}/rutin/${rutin.rutin_id}`);
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
          console.log("[API] İstek gönderiliyor:", `${API_URL}/streak/${kullanici.kullanici_id}?tarih=${localTarih}`);
          const sYanit = await fetch(`${API_URL}/streak/${kullanici.kullanici_id}?tarih=${localTarih}`);
          if (sYanit.ok) {
            const data = await sYanit.json();
            eskiStreak = data.streak_gun_sayisi || 0;
          }
        } catch (e) { console.error(e); }
      }

      console.log("[API] İstek gönderiliyor:", `${API_URL}/rutin-kayit`);
      const yanit = await fetch(`${API_URL}/rutin-kayit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rutin_id: rutinId, tarih: localTarih }),
      });
      
      if (yanit.ok) {
        setIsaretlenenRutinler(prev => new Set([...prev, rutinId]));
        
        if (kullanici) {
          try {
            console.log("[API] İstek gönderiliyor:", `${API_URL}/streak/${kullanici.kullanici_id}?tarih=${localTarih}`);
            const sYanit2 = await fetch(`${API_URL}/streak/${kullanici.kullanici_id}?tarih=${localTarih}`);
            if (sYanit2.ok) {
              const data2 = await sYanit2.json();
              const yeniStreak = data2.streak_gun_sayisi || 0;
              
              if (yeniStreak > eskiStreak) {
                setStreakGunSayisi(yeniStreak);
                setStreakKutlama(true);
                setTimeout(() => setStreakKutlama(false), 3000);
              }
              
              if (data2.yeni_rozetler && data2.yeni_rozetler.length > 0) {
                DeviceEventEmitter.emit('yeni_rozet_kuyrugu', data2.yeni_rozetler);
              } else if (data2.yeni_rozet_kazanildi) {
                DeviceEventEmitter.emit('yeni_rozet_kuyrugu', [data2.yeni_rozet_kazanildi]);
              } 
              
              // Rozetleri yenile
              console.log("[API] İstek gönderiliyor:", `${API_URL}/kullanicilar/${kullanici.kullanici_id}/rozetler`);
              fetch(`${API_URL}/kullanicilar/${kullanici.kullanici_id}/rozetler`)
                .then(r => r.json())
                .then(data => setRozetler(data))
                .catch(() => {});
            }
          } catch (e) { console.error(e); }
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

            {/* Bitki Karakteri (Streak) */}
            {!duzenlemeAktif && kullanici && (
              <BitkiKarakteri streak={streakGunSayisi} kutlamaYap={streakKutlama} />
            )}

            {/* ── GÖRÜNTÜLEME MODU ── */}
            {!duzenlemeAktif && kullanici && (
              <View style={styles.bilgiBolumu}>
                <View style={[styles.bilgiKart, { backgroundColor: renkler.surface, borderColor: renkler.border, padding: 20, flexDirection: 'column', gap: 16 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <ThemedText style={{ fontSize: 12, textTransform: 'uppercase', color: renkler.icon, letterSpacing: 0.5, marginBottom: 4 }}>
                        Cilt Tipi
                      </ThemedText>
                      <ThemedText style={{ fontSize: 20, fontWeight: '600', color: renkler.text }}>
                        {kullanici.cilt_tipi ?? "Belirtilmemiş"}
                      </ThemedText>
                    </View>
                    
                    <View style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}>
                      <Svg width="40" height="40" viewBox="0 0 40 40">
                        <Circle cx="20" cy="20" r="18" stroke={renkler.border} strokeWidth="4" fill="none" />
                        <Circle 
                          cx="20" cy="20" r="18" 
                          stroke={renkler.tint} 
                          strokeWidth="4" 
                          fill="none" 
                          strokeDasharray="113.097"
                          strokeDashoffset={113.097 - (113.097 * (healthScore ?? 0)) / 100}
                          strokeLinecap="round"
                          transform="rotate(-90 20 20)"
                        />
                      </Svg>
                      <ThemedText style={{ position: 'absolute', fontSize: 14, fontWeight: '700', color: renkler.text }}>
                        {healthScore ?? 0}
                      </ThemedText>
                    </View>
                  </View>
                  
                  <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.06)' }} />
                  
                  <View>
                    <ThemedText style={{ fontSize: 12, textTransform: 'uppercase', color: renkler.icon, letterSpacing: 0.5, marginBottom: 8 }}>
                      Cilt Sorunları
                    </ThemedText>
                    {kullanici.cilt_sorunlari && kullanici.cilt_sorunlari.length > 0 ? (
                      <View style={styles.etiketler}>
                        {kullanici.cilt_sorunlari.map((sorun) => (
                          <View key={sorun} style={[styles.etiket, { backgroundColor: renkler.primaryLight }]}>
                            <ThemedText style={[styles.etiketYazi, { color: renkler.tint }]}>
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

                {kullanici.hamilelik_modu_aktif && (
                  <BilgiKarti
                    baslik="Hamilelik Modu"
                    ikon="heart"
                    deger="Aktif"
                    renkler={renkler}
                  />
                )}
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
                rutinler.map((rutin) => {
                  const gunMetni = rutin.gunler.length === 7 ? "Her gün" : rutin.gunler.join(", ");
                  return (
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                          <Repeat size={14} color={renkler.icon} style={{ marginRight: 4 }} />
                          <ThemedText style={[styles.rutinDetay, { color: renkler.icon, marginTop: 0 }]}>
                            {gunMetni} • {rutin.zaman_dilimi}
                          </ThemedText>
                        </View>
                        {rutin.kullanim_talimati && (
                          <ThemedText style={{ fontSize: 12, color: renkler.icon, fontStyle: 'italic', marginTop: 4 }} numberOfLines={2}>
                            {rutin.kullanim_talimati}
                          </ThemedText>
                        )}
                        {rutin.kapsam_disi && (
                          <View style={{ backgroundColor: renkler.surface, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4, borderWidth: 1, borderColor: renkler.border }}>
                            <ThemedText style={{ fontSize: 10, color: renkler.icon }}>ℹ️ Analiz kapsamı dışında</ThemedText>
                          </View>
                        )}
                      </View>
                      <View style={{ gap: 8, alignItems: 'flex-end', justifyContent: 'center' }}>
                        <TouchableOpacity
                          onPress={() => Alert.alert("Sil", "Bu rutini silmek istediğine emin misin?", [{text: "İptal", style: "cancel"}, {text: "Sil", style: "destructive", onPress: () => rutinSil(rutin)}])}
                          activeOpacity={0.7}
                          style={{ position: 'absolute', top: -8, right: -8, padding: 8 }}
                        >
                          <MoreVertical size={20} color={renkler.icon} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => rutinIsaretle(rutin.rutin_id)}
                          disabled={isaretlenenRutinler.has(rutin.rutin_id)}
                          activeOpacity={0.7}
                          style={[
                            styles.rutinKaldirButon, 
                            { 
                              borderColor: isaretlenenRutinler.has(rutin.rutin_id) ? renkler.success : renkler.tint,
                              backgroundColor: isaretlenenRutinler.has(rutin.rutin_id) ? renkler.successLight : 'transparent',
                              marginTop: 24
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
                      </View>
                    </View>
                  );
                })}
            </View>
          )}

          {/* ── Cilt Hijyeni Hatırlatıcıları Bölümü ── */}
          {!duzenlemeAktif && (
            <View style={styles.rutinimBolum}>
              <View style={[styles.rutinimBaslikSatir, { justifyContent: 'space-between' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Image 
                    source={require('@/assets/images/karakterler/peri-maskot.png')} 
                    style={{ width: 28, height: 28 }} 
                    resizeMode="contain" 
                  />
                  <ThemedText style={[styles.rutinimBaslik, { color: renkler.text }]}>
                    Cilt Hijyeni Hatırlatıcıları
                  </ThemedText>
                </View>
              </View>

              {HIJYEN_HATIRLATICILARI.map((hijyen) => {
                const IconComponent = 
                  hijyen.ikon === "Sun" ? Sun : 
                  hijyen.ikon === "Moon" ? Moon : 
                  hijyen.ikon === "Sparkles" ? Sparkles : CalendarClock;

                return (
                  <View
                    key={hijyen.id}
                    style={[
                      styles.rutinKart,
                      { backgroundColor: renkler.surface, borderColor: renkler.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
                    ]}
                  >
                    <View style={{ flex: 1, paddingRight: 40, position: 'relative' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <IconComponent size={20} color={renkler.tint} />
                        <ThemedText type="defaultSemiBold" style={styles.rutinIcerikAdi}>
                          {hijyen.baslik}
                        </ThemedText>
                      </View>
                      <ThemedText style={[styles.rutinDetay, { color: renkler.icon, fontSize: 11, marginTop: 0 }]}>
                        {hijyen.mesaj}
                      </ThemedText>
                      <View style={{ position: 'absolute', top: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 12 }}>
                        <ThemedText style={{ fontSize: 10, textTransform: 'uppercase', color: renkler.icon, fontWeight: '600' }}>
                          {hijyen.sıklık}
                        </ThemedText>
                      </View>
                    </View>
                    <Switch
                      value={!!hijyenDurumlari[hijyen.id]}
                      onValueChange={() => toggleHijyen(hijyen)}
                      trackColor={{ false: "#767577", true: renkler.tint }}
                      thumbColor={"#f4f3f4"}
                    />
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Rozetlerim Bölümü ── */}
          {!duzenlemeAktif && rozetler.length > 0 && (
            <View style={styles.rutinimBolum}>
              <View style={styles.rutinimBaslikSatir}>
                <Ionicons name="medal-outline" size={16} color={renkler.tint} />
                <ThemedText style={[styles.rutinimBaslik, { color: renkler.text }]}>
                  Rozetlerim ({rozetler.filter(r => r.kazanildi_mi).length}/{rozetler.length})
                </ThemedText>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }}>
                {rozetler.map((rozet, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    onPress={() => Alert.alert(
                      rozet.rozet_adi, 
                      rozet.kazanildi_mi 
                        ? `${rozet.aciklama}\n\nBu rozeti kazandın! 🎉`
                        : `${rozet.aciklama}\n\nHenüz kazanılmadı. 🔒`
                    )}
                    style={[
                      styles.rozetKarti, 
                      { 
                        backgroundColor: rozet.kazanildi_mi ? renkler.primaryLight : (renkler.surface + '80'),
                        borderColor: rozet.kazanildi_mi ? renkler.tint + '66' : renkler.border
                      }
                    ]}
                  >
                    <Text style={{ fontSize: 32, opacity: rozet.kazanildi_mi ? 1 : 0.3 }}>{rozet.emoji}</Text>
                    <ThemedText style={{ fontSize: 12, fontWeight: 'bold', textAlign: 'center', marginTop: 4, color: rozet.kazanildi_mi ? renkler.text : renkler.icon }}>
                      {rozet.rozet_adi}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
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
                          borderWidth: secili ? 1.5 : 1,
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {secili && <Check size={14} color={renkler.tint} />}
                        <ThemedText
                          style={{
                            fontSize: 13,
                            fontWeight: "500",
                            color: secili ? renkler.tint : renkler.text,
                          }}
                        >
                          {isimMap[mode]}
                        </ThemedText>
                      </View>
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
  rozetKarti: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
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
