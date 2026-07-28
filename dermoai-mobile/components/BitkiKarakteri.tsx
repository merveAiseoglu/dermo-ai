import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';
import { ThemedText } from './themed-text';
import { useThemeContext } from '@/hooks/ThemeProvider';
import { Colors } from '@/constants/theme';

interface BitkiKarakteriProps {
  streak: number;
  kutlamaYap: boolean;
}

const ASAMALAR = [
  { min: 0, max: 0, isim: 'Tohum', resim: require('@/assets/images/karakterler/bitki-asama-1.png') },
  { min: 1, max: 2, isim: 'Filiz', resim: require('@/assets/images/karakterler/bitki-asama-1.png') },
  { min: 3, max: 6, isim: 'Fide', resim: require('@/assets/images/karakterler/bitki-asama-2.png') },
  { min: 7, max: 13, isim: 'Gelişen Fide', resim: require('@/assets/images/karakterler/bitki-asama-3.png') },
  { min: 14, max: 29, isim: 'Tomurcuk', resim: require('@/assets/images/karakterler/bitki-asama-4.png') },
  { min: 30, max: Infinity, isim: 'Çiçek Açtı', resim: require('@/assets/images/karakterler/bitki-asama-5.png') },
];

export function BitkiKarakteri({ streak, kutlamaYap }: BitkiKarakteriProps) {
  const { activeTheme } = useThemeContext();
  const renkler = Colors[activeTheme];
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Aşama belirleme
  const aktifAsama = ASAMALAR.find((a) => streak >= a.min && streak <= a.max) || ASAMALAR[ASAMALAR.length - 1];
  const sonrakiKalan = aktifAsama.max !== Infinity ? aktifAsama.max + 1 - streak : 0;

  useEffect(() => {
    if (kutlamaYap) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.2,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 3,
          tension: 40,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [kutlamaYap]);

  return (
    <View style={[styles.container, { backgroundColor: renkler.surface, borderColor: renkler.border }]}>
      <Animated.Image 
        source={aktifAsama.resim} 
        style={[styles.image, { transform: [{ scale: scaleAnim }] }]} 
        resizeMode="contain"
      />
      
      <ThemedText style={[styles.streakText, { color: renkler.tint }]}>
        {streak} gün streak - {aktifAsama.isim}
      </ThemedText>

      {sonrakiKalan > 0 ? (
        <ThemedText style={[styles.kalanText, { color: renkler.icon }]}>
          Bir sonraki aşamaya {sonrakiKalan} gün kaldı
        </ThemedText>
      ) : (
        <ThemedText style={[styles.kalanText, { color: renkler.success }]}>
          Maksimum seviyeye ulaştın! 🏆
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginVertical: 16,
  },
  image: {
    width: 150,
    height: 150,
    marginBottom: 16,
  },
  streakText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  kalanText: {
    fontSize: 14,
  },
});
