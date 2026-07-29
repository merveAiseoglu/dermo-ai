import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Modal, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import { DeviceEventEmitter } from 'react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemedText } from '@/components/themed-text';

export function RozetKutlamaModal() {
  const colorScheme = useColorScheme();
  const renkler = Colors[colorScheme ?? 'light'];
  
  const [rozetKuyrugu, setRozetKuyrugu] = useState<any[]>([]);
  const [aktifRozet, setAktifRozet] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('yeni_rozet_kuyrugu', (yeniRozetler) => {
      setRozetKuyrugu(prev => [...prev, ...yeniRozetler]);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!aktifRozet && rozetKuyrugu.length > 0) {
      setAktifRozet(rozetKuyrugu[0]);
      setRozetKuyrugu(prev => prev.slice(1));
      setVisible(true);
      scale.setValue(0);
      
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.2,
          duration: 300,
          easing: Easing.out(Easing.back(2)),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [rozetKuyrugu, aktifRozet, scale]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (visible && aktifRozet) {
      timer = setTimeout(() => modalKapat(), 4000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [visible, aktifRozet]);

  const modalKapat = () => {
    setVisible(false);
    setTimeout(() => {
      setAktifRozet(null);
    }, 300); // Fade animasyonu için süre tanı
  };

  if (!visible || !aktifRozet) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: renkler.background, borderColor: renkler.tint }]}>
          <ThemedText type="subtitle" style={styles.title}>Tebrikler! 🎉</ThemedText>
          <Animated.Text style={[styles.emoji, { transform: [{ scale }] }]}>
            {aktifRozet.emoji}
          </Animated.Text>
          <ThemedText type="defaultSemiBold" style={[styles.rozetAdi, { color: renkler.tint }]}>
            {aktifRozet.rozet_adi} Rozeti Kazandın!
          </ThemedText>
          <ThemedText style={styles.aciklama}>{aktifRozet.aciklama}</ThemedText>
          
          <TouchableOpacity 
            style={[styles.button, { backgroundColor: renkler.tint }]}
            onPress={modalKapat}
          >
            <Text style={styles.buttonText}>Harika!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  title: {
    fontSize: 24,
    marginBottom: 16,
  },
  emoji: {
    fontSize: 80,
    marginBottom: 16,
  },
  rozetAdi: {
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 8,
  },
  aciklama: {
    textAlign: 'center',
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 24,
  },
  button: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
