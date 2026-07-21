import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface Urun {
  urun_id: number;
  marka: string;
  urun_adi: string;
}

export default function HomeScreen() {
  const theme = useColorScheme() ?? "light";
  const renkler = Colors[theme];

  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [seciliUrunler, setSeciliUrunler] = useState<number[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [analizSonucu, setAnalizSonucu] = useState<any>(null);

  useEffect(() => {
    fetch("http://10.226.41.168:8000/urunler")
      .then((response) => response.json())
      .then((data) => {
        setUrunler(data);
      })
      .catch((error) => {
        console.log("Hata:", error);
      });
  }, []);

  const urunSecimiDegistir = (urunId: number) => {
    if (seciliUrunler.includes(urunId)) {
      setSeciliUrunler(seciliUrunler.filter((id) => id !== urunId));
    } else {
      setSeciliUrunler([...seciliUrunler, urunId]);
    }
  };

  const analizEt = () => {
    setYukleniyor(true);
    setAnalizSonucu(null);

    fetch("http://10.226.41.168:8000/analiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urun_idler: seciliUrunler }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Sunucu hatası");
        }
        return response.json();
      })
      .then((data) => {
        setAnalizSonucu(data);
        setYukleniyor(false);
      })
      .catch((error) => {
        console.log("Hata:", error);
        setAnalizSonucu({
          hata: true,
          mesaj: "Sunucu hatası, tekrar deneyin.",
        });
        setYukleniyor(false);
      });
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: renkler.background }]}
    >
      <ThemedView style={styles.container}>
        <View style={styles.baslikAlani}>
          <ThemedText type="title" style={styles.baslik}>
            Dermo-AI
          </ThemedText>
          <ThemedText style={[styles.altBaslik, { color: renkler.icon }]}>
            Ürünlerini seç, çakışmaları öğren
          </ThemedText>
        </View>

        <FlatList
          data={urunler}
          keyExtractor={(item) => item.urun_id.toString()}
          contentContainerStyle={styles.liste}
          renderItem={({ item }) => {
            const secili = seciliUrunler.includes(item.urun_id);
            return (
              <TouchableOpacity
                onPress={() => urunSecimiDegistir(item.urun_id)}
                activeOpacity={0.7}
                style={[
                  styles.urunKutusu,
                  {
                    backgroundColor: secili
                      ? renkler.primaryLight
                      : renkler.surface,
                    borderColor: secili ? renkler.tint : renkler.border,
                  },
                ]}
              >
                <View style={styles.urunSatiri}>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="defaultSemiBold">{item.marka}</ThemedText>
                    <ThemedText style={{ color: renkler.icon, fontSize: 14 }}>
                      {item.urun_adi}
                    </ThemedText>
                  </View>
                  {secili && (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={renkler.tint}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />

        <TouchableOpacity
          onPress={analizEt}
          disabled={seciliUrunler.length === 0 || yukleniyor}
          activeOpacity={0.8}
          style={[
            styles.anaButon,
            {
              backgroundColor:
                seciliUrunler.length === 0 || yukleniyor
                  ? renkler.border
                  : renkler.tint,
            },
          ]}
        >
          <ThemedText style={styles.anaButonYazi}>
            {yukleniyor ? "Analiz ediliyor..." : "Analiz Et"}
          </ThemedText>
        </TouchableOpacity>

        {analizSonucu && analizSonucu.hata && (
          <View
            style={[styles.sonucKart, { backgroundColor: renkler.dangerLight }]}
          >
            <Ionicons name="alert-circle" size={20} color={renkler.danger} />
            <ThemedText style={[styles.sonucMetni, { color: renkler.danger }]}>
              {analizSonucu.mesaj}
            </ThemedText>
          </View>
        )}

        {analizSonucu &&
          !analizSonucu.hata &&
          analizSonucu.cakismalar.length > 0 && (
            <FlatList
              data={analizSonucu.cakismalar}
              keyExtractor={(_, index) => index.toString()}
              contentContainerStyle={styles.sonucListesi}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.sonucKart,
                    { backgroundColor: renkler.dangerLight },
                  ]}
                >
                  <View style={styles.sonucBasligi}>
                    <Ionicons name="warning" size={18} color={renkler.danger} />
                    <ThemedText
                      style={[
                        styles.sonucMetni,
                        { color: renkler.danger, fontWeight: "600" },
                      ]}
                    >
                      {item.aciklama}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.oneriMetni}>
                    ✨ Öneri: {item.oneri}
                  </ThemedText>
                </View>
              )}
            />
          )}

        {analizSonucu &&
          !analizSonucu.hata &&
          analizSonucu.cakismalar.length === 0 && (
            <View
              style={[
                styles.sonucKart,
                { backgroundColor: renkler.successLight },
              ]}
            >
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={renkler.success}
              />
              <ThemedText
                style={[styles.sonucMetni, { color: renkler.success }]}
              >
                Çakışma bulunamadı, güvenli görünüyor!
              </ThemedText>
            </View>
          )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  baslikAlani: {
    paddingTop: 12,
    paddingBottom: 16,
  },
  baslik: {
    fontSize: 28,
  },
  altBaslik: {
    fontSize: 14,
    marginTop: 4,
  },
  liste: {
    paddingBottom: 12,
  },
  urunKutusu: {
    padding: 16,
    borderWidth: 1.5,
    borderRadius: 14,
    marginBottom: 10,
  },
  urunSatiri: {
    flexDirection: "row",
    alignItems: "center",
  },
  anaButon: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  anaButonYazi: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sonucListesi: {
    paddingBottom: 20,
  },
  sonucKart: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sonucBasligi: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  sonucMetni: {
    flex: 1,
    fontSize: 14,
  },
  oneriMetni: {
    fontSize: 14,
    marginTop: 6,
  },
});
