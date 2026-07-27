import React from 'react';
import { TouchableOpacity, Alert, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/hooks/ThemeProvider';
import { Colors } from '@/constants/theme';

interface RenkRozetiProps {
  renk?: string; // "kirmizi", "turuncu", "yesil", "gri"
  style?: ViewStyle;
}

export function RenkRozeti({ renk = "gri", style }: RenkRozetiProps) {
  const { activeTheme: theme } = useThemeContext();
  const renkler = Colors[theme];

  let renkKodu = renkler.icon; // Varsayılan (Gri)
  if (renk === "kirmizi") renkKodu = "#E53935";
  if (renk === "turuncu") renkKodu = "#FF9800";
  if (renk === "yesil") renkKodu = "#43A047";

  const handlePress = () => {
    if (renk === "gri") {
      Alert.alert(
        "Veri Bulunmuyor",
        "Bu içerik için henüz doğrulanmış risk verisi yok (Bilinmiyor)."
      );
    } else {
      // Diğer renkler için bilgilendirme
      const mesajlar: Record<string, string> = {
        "kirmizi": "Yüksek Riskli: Bu içerik çakışmalara sahip, gebelikte sakıncalı olabilir veya yüksek komedojenite (gözenek tıkama) değerine sahip.",
        "turuncu": "Dikkatli Kullanın: Bu içerik orta seviye komedojeniteye veya potansiyel tek bir çakışmaya sahip olabilir.",
        "yesil": "Güvenli: Bilinen bir çakışması veya yüksek riski bulunmuyor.",
      };
      Alert.alert("Uygunluk Durumu", mesajlar[renk]);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[styles.container, { backgroundColor: renkKodu }, style]}
      onPress={(e) => {
        // Tıklamanın ebeveyn TouchableOpacity'e gitmesini engelle (stopPropagation)
        e.stopPropagation();
        handlePress();
      }}
    >
      <Ionicons
        name={renk === "gri" ? "help" : "checkmark"}
        size={10}
        color="#FFFFFF"
        style={renk !== "gri" && { opacity: 0 }} // Sadece gride soru işareti gösterelim
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
