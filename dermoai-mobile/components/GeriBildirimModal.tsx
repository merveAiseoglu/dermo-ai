import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, StyleSheet, TextInput, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { useThemeContext } from "@/hooks/ThemeProvider";
import { Colors } from "@/constants/theme";
import { API_URL } from "@/hooks/use-kullanici";

export interface GeriBildirimIcerik {
  icerik_id: number;
  icerik_adi: string;
}

interface GeriBildirimModalProps {
  visible: boolean;
  onClose: () => void;
  icerikler: GeriBildirimIcerik[];
  gun_esigi: number;
  kullanici_id: number;
}

export function GeriBildirimModal({ visible, onClose, icerikler, gun_esigi, kullanici_id }: GeriBildirimModalProps) {
  const { activeTheme: theme } = useThemeContext();
  const renkler = Colors[theme];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [begeni, setBegeni] = useState<boolean | null>(null);
  const [notMetni, setNotMetni] = useState("");
  const [loading, setLoading] = useState(false);
  const [tamamlandi, setTamamlandi] = useState(false);

  if (!visible || !icerikler || icerikler.length === 0) return null;

  const currentIcerik = icerikler[currentIndex];

  const handleGonder = async () => {
    if (begeni === null) return;

    setLoading(true);
    try {
      const yanit = await fetch(`${API_URL}/geri-bildirim?kullanici_id=${kullanici_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          icerik_id: currentIcerik.icerik_id,
          gun_esigi: gun_esigi,
          begeni: begeni,
          not_metni: notMetni.trim() ? notMetni : null,
        }),
      });

      if (yanit.ok) {
        if (currentIndex < icerikler.length - 1) {
          setCurrentIndex(currentIndex + 1);
          setBegeni(null);
          setNotMetni("");
        } else {
          setTamamlandi(true);
          setTimeout(() => {
            onClose();
            setCurrentIndex(0);
            setBegeni(null);
            setNotMetni("");
            setTamamlandi(false);
          }, 1500);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <ThemedView style={[styles.modalKart, { backgroundColor: renkler.surface }]}>
          {tamamlandi ? (
            <View style={styles.tamamlandiIcerik}>
              <Ionicons name="checkmark-circle" size={64} color={renkler.tint} />
              <ThemedText style={{ fontSize: 20, marginTop: 16, color: renkler.text }}>Teşekkürler!</ThemedText>
            </View>
          ) : (
            <>
              <ThemedText style={{ fontSize: 18, fontWeight: "600", marginBottom: 16, textAlign: "center" }}>
                Geri Bildirim ({currentIndex + 1}/{icerikler.length})
              </ThemedText>
              
              <ThemedText style={{ fontSize: 16, marginBottom: 24, textAlign: "center" }}>
                <ThemedText style={{ fontWeight: "bold", color: renkler.tint }}>{currentIcerik.icerik_adi}</ThemedText> sana iyi geldi mi?
              </ThemedText>

              <View style={styles.butonlar}>
                <TouchableOpacity
                  style={[
                    styles.oyButon,
                    { borderColor: renkler.border, backgroundColor: begeni === true ? "rgba(76, 175, 80, 0.2)" : "transparent" },
                  ]}
                  onPress={() => setBegeni(true)}
                >
                  <ThemedText style={{ fontSize: 32 }}>👍</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.oyButon,
                    { borderColor: renkler.border, backgroundColor: begeni === false ? "rgba(244, 67, 54, 0.2)" : "transparent" },
                  ]}
                  onPress={() => setBegeni(false)}
                >
                  <ThemedText style={{ fontSize: 32 }}>👎</ThemedText>
                </TouchableOpacity>
              </View>

              <TextInput
                style={[
                  styles.textInput,
                  { color: renkler.text, borderColor: renkler.border, backgroundColor: renkler.background },
                ]}
                placeholder="Kısa not eklemek ister misin? (opsiyonel)"
                placeholderTextColor={renkler.icon}
                maxLength={500}
                value={notMetni}
                onChangeText={setNotMetni}
                multiline
              />

              <TouchableOpacity
                style={[styles.gonderButon, { backgroundColor: begeni === null ? renkler.border : renkler.tint }]}
                disabled={begeni === null || loading}
                onPress={handleGonder}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Gönder</ThemedText>
                )}
              </TouchableOpacity>
            </>
          )}
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalKart: {
    width: "100%",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  butonlar: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 24,
  },
  oyButon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    height: 80,
    textAlignVertical: "top",
    marginBottom: 24,
  },
  gonderButon: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  tamamlandiIcerik: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  }
});
