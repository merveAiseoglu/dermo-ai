/**
 * app/(tabs)/analiz.tsx
 *
 * Ürün seçimi + çakışma analizi.
 * Her çakışma kartında ve tekli öneri kartında "📅 Rutine Ekle" butonu var.
 * Sunum için __DEV__ modunda "🔔 Test Bildirimi (1 dk)" butonu görünür.
 */

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { UrunGorseli } from "@/components/urun-gorseli";
import { KaynakRozeti } from "@/components/kaynak-rozeti";
import { Colors } from "@/constants/theme";
import { useThemeContext } from "@/hooks/ThemeProvider";
import { CustomAlert as Alert } from '@/components/OzelAlert';
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useRouter } from "expo-router";
import { API_URL } from "@/hooks/use-kullanici";
import { bildirimIptalEt, bildirimKur, izinIste, testBildirimiGonder } from "@/hooks/use-notifications";
import { BarkodTarayiciModal } from "@/components/BarkodTarayiciModal";
import { RenkRozeti } from "@/components/RenkRozeti";

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface Urun {
  urun_id: number;
  marka: string;
  urun_adi: string;
  gorsel_url?: string | null;
}

interface CakismaProgram {
  strateji: "zaman_ayrimi" | "gun_ayrimi";
  icerik_1_id: number;
  icerik_1_gunler: string[];
  icerik_1_zaman: string;
  icerik_2_id: number;
  icerik_2_gunler: string[];
  icerik_2_zaman: string;
}

interface Cakisma {
  icerik_1_id: number;
  icerik_2_id: number;
  icerik_1_adi?: string;
  icerik_1_renk?: string;
  icerik_2_adi?: string;
  icerik_2_renk?: string;
  aciklama: string;
  oneri: string;
  program: CakismaProgram | null;
  kaynak?: string;
  kaynak_url?: string;
}

interface SinerjiProgram {
  strateji: string;
  icerik_1_id: number;
  icerik_1_gunler: string[];
  icerik_1_zaman: string;
  icerik_2_id: number;
  icerik_2_gunler: string[];
  icerik_2_zaman: string;
}

interface Sinerji {
  icerik_1_id: number;
  icerik_2_id: number;
  icerik_1_adi?: string;
  icerik_1_renk?: string;
  icerik_2_adi?: string;
  icerik_2_renk?: string;
  aciklama: string;
  oneri: string;
  program: SinerjiProgram | null;
  kaynak?: string;
  kaynak_url?: string;
}

interface TekliOneriProgram {
  gunler: string[];
  zaman_dilimi: string;
}

interface TekliOneri {
  icerik_id: number;
  icerik_adi: string;
  renk?: string;
  oneri: string;
  program: TekliOneriProgram | null;
  kaynak?: string;
  kaynak_url?: string;
}

interface AnalizSonucu {
  analiz_edilen_icerik_sayisi: number;
  bulunan_cakisma_sayisi: number;
  cakismalar: Cakisma[];
  sinerjiler?: Sinerji[];
  tekli_oneriler: TekliOneri[];
  uyari: string;
  hata?: boolean;
  mesaj?: string;
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────

export default function AnalizScreen() {
  const theme = useColorScheme() ?? "light";
  const renkler = Colors[theme];
  const router = useRouter();

  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [seciliUrunler, setSeciliUrunler] = useState<number[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [analizSonucu, setAnalizSonucu] = useState<AnalizSonucu | null>(null);
  const [kullaniciId, setKullaniciId] = useState<number | null>(null);

  // Hangi çakışmalar / tekli öneriler rutine eklendi
  const [rutineEklendi, setRutineEklendi] = useState<Set<string>>(new Set());
  const [rutineEkleniyor, setRutineEkleniyor] = useState<string | null>(null);

  // Ürün Ekle / Barkod
  const [barkodModalVisible, setBarkodModalVisible] = useState(false);

  // İzin bir kez istensin
  const izinIstendi = useRef(false);

  const urunleriGetir = () => {
    console.log("[API] İstek gönderiliyor:", `${API_URL}/urunler`);
    fetch(`${API_URL}/urunler`)
      .then((r) => r.json())
      .then(setUrunler)
      .catch((e) => console.log("Ürünler yüklenemedi:", e));
  };

  useEffect(() => {
    AsyncStorage.getItem("kullanici_id").then((id) => {
      if (id) setKullaniciId(Number(id));
    });
    urunleriGetir();
  }, []);

  const handleUrunEkleSecenekleri = () => {
    Alert.alert(
      "Ürün Ekle",
      "Nasıl eklemek istersiniz?",
      [
        { text: "📷 Barkod Tara", onPress: () => setBarkodModalVisible(true) },
        { text: "✍️ Manuel Ekle", onPress: () => Alert.alert("Bilgi", "Bu özellik yakında eklenecek.") },
        { text: "İptal", style: "cancel" }
      ]
    );
  };

  const handleUrunBulundu = (urunId: number, urunAdi: string, marka: string) => {
    urunleriGetir();
    setSeciliUrunler((prev) => {
      if (!prev.includes(urunId)) {
        return [...prev, urunId];
      }
      return prev;
    });
  };

  // ─── Analiz ────────────────────────────────────────────────────────────────

  const analizEt = () => {
    setYukleniyor(true);
    setAnalizSonucu(null);
    setRutineEklendi(new Set());

    // İlk analiz sırasında bildirim izni iste
    if (!izinIstendi.current) {
      izinIstendi.current = true;
      izinIste().then((izinVerildi) => {
        if (!izinVerildi) {
          Alert.alert(
            "Bildirim İzni Gerekli",
            "Hatırlatıcıları alabilmek için cihaz ayarlarından bildirimlere izin vermenizi öneririz. Aksi takdirde rutinler sadece uygulama içinde görünecektir."
          );
        }
      }).catch((e) => console.log("İzin isteme hatası:", e));
    }

    const payload = {
      urun_idler: seciliUrunler,
      ...(kullaniciId ? { kullanici_id: kullaniciId } : {}),
    };
    console.log("ANALIZ ISTEGI:", JSON.stringify(payload));

    console.log("[API] İstek gönderiliyor:", `${API_URL}/analiz`);
    fetch(`${API_URL}/analiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => {
        if (!r.ok) {
          console.error(`Sunucu yanıtı ok değil. Status: ${r.status}`);
          throw new Error(`HTTP Hata: ${r.status}`);
        }
        return r.json();
      })
      .then((data) => {
        setAnalizSonucu(data);
        setYukleniyor(false);
      })
      .catch((error) => {
        console.error("ANALIZ HATASI:", error);
        setAnalizSonucu({ hata: true, mesaj: "Sunucu hatası, tekrar deneyin." } as any);
        setYukleniyor(false);
      });
  };

  // ─── Çakışma için Rutine Ekle ─────────────────────────────────────────────

  const cakismaRutineEkle = async (cakisma: Cakisma) => {
    console.log("[GUARD] kullaniciId:", kullaniciId);
    if (!kullaniciId) {
      Alert.alert("Giriş gerekli", "Rutine eklemek için lütfen önce onboarding'i tamamla.");
      return;
    }
    if (!cakisma.program) {
      Alert.alert("Program yok", "Bu çakışma için program oluşturulamadı.");
      return;
    }

    const anahtar = `cakisma_${cakisma.icerik_1_id}_${cakisma.icerik_2_id}`;
    setRutineEkleniyor(anahtar);

    try {
      const { program } = cakisma;

      // İçerik 1 → POST /rutin
      console.log("[API] İstek gönderiliyor:", `${API_URL}/rutin`);
      const yanit1 = await fetch(`${API_URL}/rutin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kullanici_id: kullaniciId,
          icerik_id: program.icerik_1_id,
          gunler: program.icerik_1_gunler,
          zaman_dilimi: program.icerik_1_zaman,
        }),
      });
      if (!yanit1.ok) throw new Error("Rutin 1 kaydedilemedi");
      const rutin1 = await yanit1.json();

      // İçerik 2 → POST /rutin
      console.log("[API] İstek gönderiliyor:", `${API_URL}/rutin`);
      const yanit2 = await fetch(`${API_URL}/rutin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kullanici_id: kullaniciId,
          icerik_id: program.icerik_2_id,
          gunler: program.icerik_2_gunler,
          zaman_dilimi: program.icerik_2_zaman,
        }),
      });
      if (!yanit2.ok) throw new Error("Rutin 2 kaydedilemedi");
      const rutin2 = await yanit2.json();

      // Bildirimleri kur
      await bildirimKur(
        rutin1.rutin_id,
        `İçerik #${program.icerik_1_id}`,
        program.icerik_1_gunler,
        program.icerik_1_zaman
      );
      await bildirimKur(
        rutin2.rutin_id,
        `İçerik #${program.icerik_2_id}`,
        program.icerik_2_gunler,
        program.icerik_2_zaman
      );

      setRutineEklendi((prev) => new Set([...prev, anahtar]));
    } catch (e) {
      Alert.alert("Hata", "Rutine eklenirken bir sorun oluştu.");
      console.error(e);
    } finally {
      setRutineEkleniyor(null);
    }
  };

  // ─── Sinerji için Rutine Ekle ─────────────────────────────────────────────

  const sinerjiRutineEkle = async (sinerji: Sinerji) => {
    console.log("[GUARD] kullaniciId:", kullaniciId);
    if (!kullaniciId) {
      Alert.alert("Giriş gerekli", "Rutine eklemek için lütfen önce onboarding'i tamamla.");
      return;
    }
    if (!sinerji.program) {
      Alert.alert("Program yok", "Bu sinerji için program oluşturulamadı.");
      return;
    }

    const anahtar = `sinerji_${sinerji.icerik_1_id}_${sinerji.icerik_2_id}`;
    setRutineEkleniyor(anahtar);

    try {
      const { program } = sinerji;

      // İçerik 1 → POST /rutin
      console.log("[API] İstek gönderiliyor:", `${API_URL}/rutin`);
      const yanit1 = await fetch(`${API_URL}/rutin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kullanici_id: kullaniciId,
          icerik_id: program.icerik_1_id,
          gunler: program.icerik_1_gunler,
          zaman_dilimi: program.icerik_1_zaman,
        }),
      });
      if (!yanit1.ok) throw new Error("Rutin 1 kaydedilemedi");
      const rutin1 = await yanit1.json();

      // İçerik 2 → POST /rutin
      console.log("[API] İstek gönderiliyor:", `${API_URL}/rutin`);
      const yanit2 = await fetch(`${API_URL}/rutin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kullanici_id: kullaniciId,
          icerik_id: program.icerik_2_id,
          gunler: program.icerik_2_gunler,
          zaman_dilimi: program.icerik_2_zaman,
        }),
      });
      if (!yanit2.ok) throw new Error("Rutin 2 kaydedilemedi");
      const rutin2 = await yanit2.json();

      // Bildirimleri kur
      await bildirimKur(
        rutin1.rutin_id,
        sinerji.icerik_1_adi || `İçerik #${program.icerik_1_id}`,
        program.icerik_1_gunler,
        program.icerik_1_zaman
      );
      await bildirimKur(
        rutin2.rutin_id,
        sinerji.icerik_2_adi || `İçerik #${program.icerik_2_id}`,
        program.icerik_2_gunler,
        program.icerik_2_zaman
      );

      setRutineEklendi((prev) => new Set([...prev, anahtar]));
    } catch (e) {
      Alert.alert("Hata", "Rutine eklenirken bir sorun oluştu.");
      console.error(e);
    } finally {
      setRutineEkleniyor(null);
    }
  };

  // ─── Tekli Öneri için Rutine Ekle ────────────────────────────────────────

  const tekliRutineEkle = async (oneri: TekliOneri) => {
    console.log("[GUARD] kullaniciId:", kullaniciId);
    if (!kullaniciId) {
      Alert.alert("Giriş gerekli", "Rutine eklemek için lütfen önce onboarding'i tamamla.");
      return;
    }
    if (!oneri.program) {
      Alert.alert("Program yok", "Bu içerik için program oluşturulamadı.");
      return;
    }

    const anahtar = `tekli_${oneri.icerik_id}`;
    setRutineEkleniyor(anahtar);

    try {
      console.log("[API] İstek gönderiliyor:", `${API_URL}/rutin`);
      const yanit = await fetch(`${API_URL}/rutin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kullanici_id: kullaniciId,
          icerik_id: oneri.icerik_id === -1 ? null : oneri.icerik_id,
          serbest_urun_adi: oneri.icerik_id === -1 ? oneri.icerik_adi : null,
          gunler: oneri.program.gunler,
          zaman_dilimi: oneri.program.zaman_dilimi,
        }),
      });
      if (!yanit.ok) throw new Error("Rutin kaydedilemedi");
      const rutin = await yanit.json();

      await bildirimKur(
        rutin.rutin_id,
        oneri.icerik_adi,
        oneri.program.gunler,
        oneri.program.zaman_dilimi
      );

      setRutineEklendi((prev) => new Set([...prev, anahtar]));
    } catch (e) {
      Alert.alert("Hata", "Rutine eklenirken bir sorun oluştu.");
      console.error(e);
    } finally {
      setRutineEkleniyor(null);
    }
  };

  // ─── Render: Çakışma Kartı ────────────────────────────────────────────────

  const renderCakismaKarti = (item: Cakisma, index: number) => {
    const anahtar = `cakisma_${item.icerik_1_id}_${item.icerik_2_id}`;
    const eklendi = rutineEklendi.has(anahtar);
    const yukleniyor_bu = rutineEkleniyor === anahtar;

    return (
      <View
        key={index}
        style={[styles.sonucKart, { backgroundColor: renkler.dangerLight }]}
      >
        {/* Çakışma başlığı */}
        <View style={styles.sonucBasligi}>
          <Ionicons name="warning" size={18} color={renkler.danger} />
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', flex: 1, gap: 4 }}>
            {item.icerik_1_adi && item.icerik_2_adi ? (
              <>
                <ThemedText style={[styles.sonucMetni, { color: renkler.danger, fontWeight: "600" }]}>
                  {item.icerik_1_adi}
                </ThemedText>
                <RenkRozeti renk={item.icerik_1_renk} />
                <ThemedText style={[styles.sonucMetni, { color: renkler.danger, fontWeight: "600" }]}>
                  {" + "}
                </ThemedText>
                <ThemedText style={[styles.sonucMetni, { color: renkler.danger, fontWeight: "600" }]}>
                  {item.icerik_2_adi}
                </ThemedText>
                <RenkRozeti renk={item.icerik_2_renk} />
              </>
            ) : (
              <ThemedText style={[styles.sonucMetni, { color: renkler.danger, fontWeight: "600" }]}>
                {item.aciklama}
              </ThemedText>
            )}
          </View>
        </View>
        
        {item.icerik_1_adi && item.icerik_2_adi && (
          <ThemedText style={{ color: renkler.danger, fontSize: 13, marginBottom: 6, fontStyle: 'italic' }}>
            {item.aciklama}
          </ThemedText>
        )}

        {/* AI önerisi */}
        <ThemedText style={[styles.oneriMetni, { color: renkler.text }]}>
          ✨ {item.oneri}
        </ThemedText>

        {/* Program özeti */}
        {item.program && (
          <View
            style={[styles.programOzet, { backgroundColor: renkler.surface }]}
          >
            <Ionicons name="calendar-outline" size={13} color={renkler.tint} />
            <ThemedText style={[styles.programMetin, { color: renkler.icon }]}>
              {item.program.strateji === "gun_ayrimi"
                ? `${item.program.icerik_1_gunler.join(", ")} (${item.program.icerik_1_zaman}) — nöbetleşe`
                : `Aynı gün, ${item.program.icerik_1_zaman} / ${item.program.icerik_2_zaman} ayrı öğünde`}
            </ThemedText>
          </View>
        )}

        {/* Rutine Ekle butonu */}
        {item.program && (
          <TouchableOpacity
            onPress={() => cakismaRutineEkle(item)}
            disabled={eklendi || yukleniyor_bu}
            activeOpacity={0.8}
            style={[
              styles.rutinButon,
              {
                backgroundColor: eklendi
                  ? renkler.successLight
                  : renkler.primaryLight,
                borderColor: eklendi ? renkler.success : renkler.tint,
              },
            ]}
          >
            {yukleniyor_bu ? (
              <ActivityIndicator size="small" color={renkler.tint} />
            ) : (
              <>
                <ThemedText
                  style={[
                    styles.rutinButonYazi,
                    { color: eklendi ? renkler.success : renkler.tint },
                  ]}
                >
                  {eklendi ? "✅ Rutinde" : "📅 Rutine Ekle"}
                </ThemedText>
                </>
            )}
          </TouchableOpacity>
        )}

        {/* Kaynak Rozeti */}
        <KaynakRozeti kaynak={item.kaynak} kaynak_url={item.kaynak_url} />
      </View>
    );
  };

  // ─── Render: Sinerji Kartı ────────────────────────────────────────────────

  const renderSinerjiKarti = (item: Sinerji, index: number) => {
    const anahtar = `sinerji_${item.icerik_1_id}_${item.icerik_2_id}`;
    const eklendi = rutineEklendi.has(anahtar);
    const yukleniyor_bu = rutineEkleniyor === anahtar;

    return (
      <View
        key={`sinerji_${index}`}
        style={[styles.sonucKart, { backgroundColor: renkler.successLight }]}
      >
        {/* Sinerji başlığı */}
        <View style={styles.sonucBasligi}>
          <Ionicons name="sparkles" size={18} color={renkler.success} />
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', flex: 1, gap: 4 }}>
            {item.icerik_1_adi && item.icerik_2_adi ? (
              <>
                <ThemedText style={[styles.sonucMetni, { color: renkler.success, fontWeight: "600" }]}>
                  {item.icerik_1_adi}
                </ThemedText>
                <RenkRozeti renk={item.icerik_1_renk} />
                <ThemedText style={[styles.sonucMetni, { color: renkler.success, fontWeight: "600" }]}>
                  {" + "}
                </ThemedText>
                <ThemedText style={[styles.sonucMetni, { color: renkler.success, fontWeight: "600" }]}>
                  {item.icerik_2_adi}
                </ThemedText>
                <RenkRozeti renk={item.icerik_2_renk} />
              </>
            ) : (
              <ThemedText style={[styles.sonucMetni, { color: renkler.success, fontWeight: "600" }]}>
                Bu ikisi birlikte iyi çalışır
              </ThemedText>
            )}
          </View>
        </View>

        {/* AI önerisi */}
        <ThemedText style={[styles.oneriMetni, { color: renkler.text }]}>
          {item.oneri}
        </ThemedText>

        {/* Program özeti */}
        {item.program && (
          <View
            style={[styles.programOzet, { backgroundColor: renkler.surface }]}
          >
            <Ionicons name="calendar-outline" size={13} color={renkler.tint} />
            <ThemedText style={[styles.programMetin, { color: renkler.icon }]}>
              Birlikte Kullanım: {item.program.icerik_1_gunler.join(", ")} ({item.program.icerik_1_zaman})
            </ThemedText>
          </View>
        )}

        {/* Rutine Ekle butonu */}
        {item.program && (
          <TouchableOpacity
            onPress={() => sinerjiRutineEkle(item)}
            disabled={eklendi || yukleniyor_bu}
            activeOpacity={0.8}
            style={[
              styles.rutinButon,
              {
                backgroundColor: eklendi
                  ? renkler.successLight
                  : renkler.primaryLight,
                borderColor: eklendi ? renkler.success : renkler.tint,
              },
            ]}
          >
            {yukleniyor_bu ? (
              <ActivityIndicator size="small" color={renkler.tint} />
            ) : (
              <>
                <ThemedText
                  style={[
                    styles.rutinButonYazi,
                    { color: eklendi ? renkler.success : renkler.tint },
                  ]}
                >
                  {eklendi ? "✅ Rutinde" : "📅 Rutine Ekle"}
                </ThemedText>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Kaynak Rozeti */}
        <KaynakRozeti kaynak={item.kaynak} kaynak_url={item.kaynak_url} />
      </View>
    );
  };

  // ─── Render: Tekli Öneri Kartı ────────────────────────────────────────────

  const renderTekliOneriKarti = (item: TekliOneri, index: number) => {
    const anahtar = `tekli_${item.icerik_id}`;
    const eklendi = rutineEklendi.has(anahtar);
    const yukleniyor_bu = rutineEkleniyor === anahtar;

    return (
      <View
        key={`tekli_${index}`}
        style={[
          styles.sonucKart,
          { backgroundColor: renkler.surface, borderColor: renkler.border, borderWidth: 1 },
        ]}
      >
        {/* Başlık */}
        <View style={styles.sonucBasligi}>
          <Ionicons name="sparkles" size={16} color={renkler.tint} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ThemedText
              style={[styles.sonucMetni, { color: renkler.tint, fontWeight: "600" }]}
            >
              {item.icerik_adi}
            </ThemedText>
            <RenkRozeti renk={item.renk} />
          </View>
        </View>

        {/* Öneri */}
        <ThemedText style={[styles.oneriMetni, { color: renkler.text }]}>
          {item.oneri}
        </ThemedText>

        {/* Program özeti */}
        {item.program && (
          <View
            style={[styles.programOzet, { backgroundColor: renkler.primaryLight }]}
          >
            <Ionicons name="calendar-outline" size={13} color={renkler.tint} />
            <ThemedText style={[styles.programMetin, { color: renkler.icon }]}>
              {item.program.gunler.join(", ")} — {item.program.zaman_dilimi}
            </ThemedText>
          </View>
        )}

        {/* Rutine Ekle */}
        {item.program && (
          <TouchableOpacity
            onPress={() => tekliRutineEkle(item)}
            disabled={eklendi || yukleniyor_bu}
            activeOpacity={0.8}
            style={[
              styles.rutinButon,
              {
                backgroundColor: eklendi
                  ? renkler.successLight
                  : renkler.primaryLight,
                borderColor: eklendi ? renkler.success : renkler.tint,
              },
            ]}
          >
            {yukleniyor_bu ? (
              <ActivityIndicator size="small" color={renkler.tint} />
            ) : (
              <ThemedText
                style={[
                  styles.rutinButonYazi,
                  { color: eklendi ? renkler.success : renkler.tint },
                ]}
              >
                {eklendi ? "✅ Rutinde" : "📅 Rutine Ekle"}
              </ThemedText>
            )}
          </TouchableOpacity>
        )}

        {/* Kaynak Rozeti */}
        <KaynakRozeti kaynak={item.kaynak} kaynak_url={item.kaynak_url} />
      </View>
    );
  };

  // ─── JSX ──────────────────────────────────────────────────────────────────

  const sonucVar =
    analizSonucu && !analizSonucu.hata;
  const cakismalar = analizSonucu?.cakismalar ?? [];
  const sinerjiler = analizSonucu?.sinerjiler ?? [];
  const tekliOneriler = analizSonucu?.tekli_oneriler ?? [];
  const temiz = sonucVar && cakismalar.length === 0;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: renkler.background }]}>
      <ThemedView style={styles.container}>
        {/* Başlık */}
        <View style={styles.baslikAlani}>
          <View style={{ flex: 1 }}>
            <ThemedText type="title" style={styles.baslik}>
              Analiz
            </ThemedText>
            <ThemedText style={[styles.altBaslik, { color: renkler.icon }]}>
              {seciliUrunler.length > 0
                ? `${seciliUrunler.length} ürün seçildi`
                : "Ürünlerini seç, çakışmaları öğren"}
            </ThemedText>
          </View>
          <TouchableOpacity
            onPress={handleUrunEkleSecenekleri}
            style={[styles.urunEkleButon, { backgroundColor: renkler.primaryLight, borderColor: renkler.tint }]}
          >
            <Ionicons name="add" size={20} color={renkler.tint} />
            <ThemedText style={{ color: renkler.tint, fontWeight: '600' }}>Ekle</ThemedText>
          </TouchableOpacity>
        </View>

        <FlatList
          data={urunler}
          keyExtractor={(item) => item.urun_id.toString()}
          contentContainerStyle={styles.liste}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const secili = seciliUrunler.includes(item.urun_id);
            return (
              <TouchableOpacity
                onPress={() =>
                  setSeciliUrunler((prev) =>
                    prev.includes(item.urun_id)
                      ? prev.filter((id) => id !== item.urun_id)
                      : [...prev, item.urun_id]
                  )
                }
                activeOpacity={0.7}
                style={[
                  styles.urunKutusu,
                  {
                    backgroundColor: secili ? `rgba(74, 124, 111, 0.05)` : renkler.surface,
                    borderColor: secili ? renkler.tint : (theme === 'dark' ? '#333' : '#E5E5E5'),
                    borderWidth: secili ? 2 : 1,
                    minHeight: 76,
                    padding: 12,
                    alignItems: 'center',
                  },
                ]}
              >
                <View style={[styles.urunSatiri, { gap: 12, width: '100%' }]}>
                  <View style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: secili ? 0 : 1,
                    borderColor: '#ccc',
                    backgroundColor: secili ? renkler.tint : 'transparent',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                    {secili && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                  <UrunGorseli 
                    gorselUrl={item.gorsel_url} 
                    marka={item.marka === "Bilinmeyen Marka" ? item.urun_adi : item.marka} 
                    boyut={40} 
                  />
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    {item.marka === "Bilinmeyen Marka" ? (
                      <>
                        <ThemedText type="defaultSemiBold" numberOfLines={1}>{item.urun_adi}</ThemedText>
                        <TouchableOpacity onPress={() => router.push(`/urun-duzenle/${item.urun_id}` as any)}>
                          <ThemedText style={{ color: renkler.icon, fontSize: 12, marginTop: 2 }}>
                            Marka bulunamadı, düzenlemek için dokun
                          </ThemedText>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <ThemedText type="defaultSemiBold" numberOfLines={1}>{item.marka}</ThemedText>
                        <ThemedText style={{ color: renkler.icon, fontSize: 14 }} numberOfLines={1} ellipsizeMode="tail">
                          {item.urun_adi}
                        </ThemedText>
                      </>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={
            <>
              {/* Analiz Et butonu */}
              <TouchableOpacity
                onPress={analizEt}
                disabled={seciliUrunler.length < 2 || yukleniyor}
                activeOpacity={0.8}
                style={[
                  styles.anaButon,
                  {
                    backgroundColor:
                      seciliUrunler.length < 2 || yukleniyor
                        ? renkler.border
                        : renkler.tint,
                  },
                ]}
              >
                {yukleniyor ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.anaButonYazi}>
                    {seciliUrunler.length < 2 ? "En az 2 ürün seç" : `${seciliUrunler.length} Ürünü Analiz Et`}
                  </ThemedText>
                )}
              </TouchableOpacity>

              {/* Hata */}
              {analizSonucu?.hata && (
                <View style={[styles.sonucKart, { backgroundColor: renkler.dangerLight }]}>
                  <Ionicons name="alert-circle" size={20} color={renkler.danger} />
                  <ThemedText style={[styles.oneriMetni, { color: renkler.danger }]}>
                    {analizSonucu.mesaj}
                  </ThemedText>
                </View>
              )}

              {/* Temiz sonuç */}
              {temiz && tekliOneriler.length === 0 && (
                <View style={[styles.sonucKart, { backgroundColor: renkler.successLight }]}>
                  <Ionicons name="checkmark-circle" size={20} color={renkler.success} />
                  <ThemedText style={[styles.oneriMetni, { color: renkler.success }]}>
                    Çakışma bulunamadı, güvenli görünüyor! 🎉
                  </ThemedText>
                </View>
              )}

              {/* Çakışma başlığı */}
              {cakismalar.length > 0 && (
                <View style={styles.bolumBaslik}>
                  <Ionicons name="warning-outline" size={16} color={renkler.danger} />
                  <ThemedText style={[styles.bolumBaslikYazi, { color: renkler.danger }]}>
                    {cakismalar.length} Çakışma Bulundu
                  </ThemedText>
                </View>
              )}

              {/* Çakışma kartları */}
              {cakismalar.map((item, i) => renderCakismaKarti(item, i))}

              {/* Sinerji başlığı */}
              {sinerjiler.length > 0 && (
                <View style={[styles.bolumBaslik, { marginTop: 8 }]}>
                  <Ionicons name="sparkles" size={16} color={renkler.success} />
                  <ThemedText style={[styles.bolumBaslikYazi, { color: renkler.success }]}>
                    ✨ Bu ikisi birlikte iyi çalışır ({sinerjiler.length})
                  </ThemedText>
                </View>
              )}

              {/* Sinerji kartları */}
              {sinerjiler.map((item, i) => renderSinerjiKarti(item, i))}

              {/* Tekli öneriler başlığı */}
              {tekliOneriler.length > 0 && (
                <View style={[styles.bolumBaslik, { marginTop: 8 }]}>
                  <Ionicons name="sparkles-outline" size={16} color={renkler.tint} />
                  <ThemedText style={[styles.bolumBaslikYazi, { color: renkler.tint }]}>
                    Cilt Tipine Özel Öneriler
                  </ThemedText>
                </View>
              )}

              {/* Tekli öneri kartları */}
              {tekliOneriler.map((item, i) => renderTekliOneriKarti(item, i))}

              <View style={{ height: 24 }} />
            </>
          }
        />
        <BarkodTarayiciModal
          visible={barkodModalVisible}
          onClose={() => setBarkodModalVisible(false)}
          onProductFound={handleUrunBulundu}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

// ─── Stiller ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 20 },
  baslikAlani: { paddingTop: 12, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  baslik: { fontSize: 28 },
  altBaslik: { fontSize: 14, marginTop: 4 },
  urunEkleButon: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  liste: { paddingBottom: 8 },
  urunKutusu: {
    padding: 16,
    borderWidth: 1.5,
    borderRadius: 14,
    marginBottom: 10,
  },
  urunSatiri: { flexDirection: "row", alignItems: "center" },
  anaButon: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  anaButonYazi: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  bolumBaslik: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  bolumBaslikYazi: { fontSize: 14, fontWeight: "700" },
  sonucKart: {
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    gap: 8,
  },
  sonucBasligi: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  sonucMetni: { flex: 1, fontSize: 14 },
  oneriMetni: { fontSize: 13, lineHeight: 20 },
  programOzet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  programMetin: { fontSize: 12, flex: 1 },
  rutinButon: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    minHeight: 40,
  },
  rutinButonYazi: { fontSize: 13, fontWeight: "600" },
  demoButon: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  demoButonYazi: { fontSize: 13 },
});
