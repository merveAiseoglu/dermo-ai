import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Modal, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import { DeviceEventEmitter } from 'react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemedText } from '@/components/themed-text';

export function RozetKutlamaModal() {
  const colorScheme = useColorScheme();
  const renkler = Colors[colorScheme ?? 'light'];
  
  const [rozet, setRozet] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('yeni_rozet', (yeniRozet) => {
      setRozet(yeniRozet);
      setVisible(true);
      
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
      
      setTimeout(() => setVisible(false), 4000); // Otomatik kapat
    });

    return () => {
      subscription.remove();
    };
  }, []);

  if (!visible || !rozet) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: renkler.background, borderColor: renkler.tint }]}>
          <ThemedText type="subtitle" style={styles.title}>Tebrikler! 🎉</ThemedText>
          <Animated.Text style={[styles.emoji, { transform: [{ scale }] }]}>
            {rozet.emoji}
          </Animated.Text>
          <ThemedText type="defaultSemiBold" style={[styles.rozetAdi, { color: renkler.tint }]}>
            {rozet.rozet_adi} Rozeti Kazandın!
          </ThemedText>
          <ThemedText style={styles.aciklama}>{rozet.aciklama}</ThemedText>
          
          <TouchableOpacity 
            style={[styles.button, { backgroundColor: renkler.tint }]}
            onPress={() => setVisible(false)}
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
