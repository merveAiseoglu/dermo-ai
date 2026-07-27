import React from "react";
import { StyleSheet, TouchableOpacity, View, SafeAreaView, Modal, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "./themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTur } from "@/hooks/TurContext";

const ADIMLAR = [
  { baslik: "Ana Sayfa", metin: "Burada streak'ini ve kişisel ipuçlarını görürsün 🔥" },
  { baslik: "Analiz", metin: "Ürünlerini seç, çakışma ve sinerjilerini keşfet 🧪" },
  { baslik: "Geçmiş", metin: "Önceki analizlerine göz at ve favori ürünlerini hatırla 🕒" },
  { baslik: "Profil", metin: "Cilt bilgilerini ve rutinini güncelle, rozetlerini takip et 🏆" },
];

export function TurOverlay() {
  const { turAktif, turAdimi, turuIlerlet, turuAtla } = useTur();
  const theme = useColorScheme() ?? "light";
  const renkler = Colors[theme];

  const EKRAN_GENISLIGI = Dimensions.get("window").width;
  const SEKME_GENISLIGI = EKRAN_GENISLIGI / 4;
  const okPozisyonu = (SEKME_GENISLIGI * turAdimi) + (SEKME_GENISLIGI / 2) - 12;
  const insets = useSafeAreaInsets();
  const TAB_BAR_YUKSEKLIGI = 60;

  if (!turAktif) return null;

  const adimVeri = ADIMLAR[turAdimi];

  return (
    <Modal transparent visible={turAktif} animationType="fade" statusBarTranslucent>
      <View style={styles.overlay} pointerEvents="box-none">
        <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
          <View style={[styles.bannerContainer, { paddingBottom: 24 + insets.bottom + TAB_BAR_YUKSEKLIGI }]} pointerEvents="box-none">
            <View style={[styles.kart, { backgroundColor: renkler.surface, borderColor: renkler.border }]}>
              <View style={styles.baslikSatiri}>
                <ThemedText type="title" style={styles.baslik}>
                  {adimVeri.baslik}
                </ThemedText>
              </View>
              <ThemedText style={[styles.metin, { color: renkler.icon }]}>{adimVeri.metin}</ThemedText>

              <View style={styles.butonlar}>
                <TouchableOpacity onPress={turuAtla} style={styles.atlaButon}>
                  <ThemedText style={[styles.atlaYazi, { color: renkler.icon }]}>Atla</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={turuIlerlet}
                  activeOpacity={0.8}
                  style={[styles.ileriButon, { backgroundColor: renkler.tint }]}
                >
                  <ThemedText style={styles.ileriYazi}>
                    {turAdimi === ADIMLAR.length - 1 ? "Bitir" : "İleri →"}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <ThemedText style={[styles.okEmoji, { left: okPozisyonu, bottom: insets.bottom + TAB_BAR_YUKSEKLIGI }]}>⬇️</ThemedText>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  safeArea: {
    width: "100%",
  },
  bannerContainer: {
    padding: 16,
    paddingBottom: 24,
  },
  kart: {
    width: "100%",
    padding: 10,
    maxHeight: 90,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  baslikSatiri: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  baslik: {
    fontSize: 15,
  },
  metin: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  okEmoji: {
    fontSize: 24,
    position: "absolute",
    bottom: 0,
  },
  butonlar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  atlaButon: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  atlaYazi: {
    fontSize: 15,
    fontWeight: "500",
  },
  ileriButon: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  ileriYazi: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFF",
  },
});