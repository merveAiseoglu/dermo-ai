import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface UrunGorseliProps {
  gorselUrl?: string | null;
  marka: string;
  boyut?: number;
}

export function UrunGorseli({ gorselUrl, marka, boyut = 40 }: UrunGorseliProps) {
  const theme = useColorScheme() ?? "light";
  const renkler = Colors[theme];

  const yariCap = boyut / 2;
  const harfBoyutu = boyut * 0.45; // Boyutun %45'i kadar font büyüklüğü

  if (gorselUrl) {
    return (
      <Image
        source={{ uri: gorselUrl }}
        style={[
          styles.gorsel,
          { width: boyut, height: boyut, borderRadius: yariCap },
        ]}
        resizeMode="cover"
      />
    );
  }

  // Görsel yoksa placeholder göster (profildeki avatar stiline benzer)
  const ilkHarf = marka ? marka.charAt(0).toUpperCase() : "?";

  return (
    <View
      style={[
        styles.placeholder,
        {
          width: boyut,
          height: boyut,
          borderRadius: yariCap,
          backgroundColor: renkler.primaryLight,
        },
      ]}
    >
      <ThemedText
        style={[
          styles.placeholderHarf,
          { color: renkler.tint, fontSize: harfBoyutu },
        ]}
      >
        {ilkHarf}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  gorsel: {
    backgroundColor: "#f0f0f0", // Yüklenirken gri arka plan
  },
  placeholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderHarf: {
    fontWeight: "700",
  },
});
