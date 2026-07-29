import React, { useState } from 'react';
import { Modal, StyleSheet, View, TouchableOpacity, ActivityIndicator, SafeAreaView, Platform } from 'react-native';
import { CustomAlert as Alert } from '@/components/OzelAlert';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './themed-text';
import { Colors } from '@/constants/theme';
import { useThemeContext } from '@/hooks/ThemeProvider';
import { API_URL } from '@/hooks/use-kullanici';

interface BarkodTarayiciModalProps {
  visible: boolean;
  onClose: () => void;
  onProductFound: (urunId: number, urunAdi: string, marka: string) => void;
}

import { useKullanici } from '@/hooks/use-kullanici';
import { DeviceEventEmitter } from 'react-native';

export function BarkodTarayiciModal({ visible, onClose, onProductFound }: BarkodTarayiciModalProps) {
  const { activeTheme: theme } = useThemeContext();
  const renkler = Colors[theme];
  const { kullaniciId } = useKullanici();
  
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);

  const resetState = () => {
    setScanned(false);
    setYukleniyor(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleBarcodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (scanned || yukleniyor) return;
    
    setScanned(true);
    setYukleniyor(true);

    console.log("OKUNAN BARKOD:", data);

    try {
      const response = await fetch(`${API_URL}/urun/barkod-sorgula`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barkod: data, kullanici_id: kullaniciId }),
      });

      const result = await response.json();

      if (result.yeni_rozetler && result.yeni_rozetler.length > 0) {
        DeviceEventEmitter.emit('yeni_rozet_kuyrugu', result.yeni_rozetler);
      } else if (result.yeni_rozet_kazanildi) {
        DeviceEventEmitter.emit('yeni_rozet_kuyrugu', [result.yeni_rozet_kazanildi]);
      }

      if (result.bulundu) {
        if (result.dogrulanmamis_icerik_sayisi && result.dogrulanmamis_icerik_sayisi > 0) {
          Alert.alert(
            "Ürün Bulundu",
            `${result.urun_adi || 'Bilinmeyen Ürün'} (${result.marka || 'Marka'})\n\nNot: ${result.dogrulanmamis_icerik_sayisi} madde henüz doğrulanmamış açık kaynak verisinden (Open Beauty Facts) eklendi.`,
            [{ text: "Devam Et", onPress: () => {
              handleClose();
              onProductFound(result.urun_id, result.urun_adi, result.marka);
            }}]
          );
        } else {
          Alert.alert(
            "Ürün Bulundu",
            `${result.urun_adi || 'Bilinmeyen Ürün'}\nBu ürün analiz listenize ekleniyor.`,
            [{ text: "Tamam", onPress: () => {
              handleClose();
              onProductFound(result.urun_id, result.urun_adi, result.marka);
            }}]
          );
        }
      } else {
        Alert.alert(
          "Ürün Bulunamadı",
          "Bu barkoda ait bir ürün bulunamadı. Manuel eklemek ister misiniz?",
          [
            { text: "İptal", style: "cancel", onPress: () => setScanned(false) },
            { text: "Manuel Ekle", onPress: () => {
              Alert.alert("Bilgi", "Bu özellik yakında eklenecek.");
              handleClose();
            }}
          ]
        );
      }
    } catch (error) {
      Alert.alert("Bağlantı Hatası", "Sunucu ile iletişim kurulamadı, lütfen tekrar deneyin.", [
        { text: "Tamam", onPress: () => setScanned(false) }
      ]);
    } finally {
      setYukleniyor(false);
    }
  };

  if (!permission) {
    return <View />;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: renkler.background }]}>
        <View style={[styles.header, { borderBottomColor: renkler.border }]}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={renkler.text} />
          </TouchableOpacity>
          <ThemedText style={[styles.title, { color: renkler.text }]}>
            Barkod Tara
          </ThemedText>
          <View style={{ width: 28 }} />
        </View>

        {!permission.granted ? (
          <View style={styles.permissionContainer}>
            <ThemedText style={{ color: renkler.text, textAlign: 'center', marginBottom: 20 }}>
              Kamerayı kullanmak için izninize ihtiyacımız var.
            </ThemedText>
            <TouchableOpacity 
              style={[styles.permissionButton, { backgroundColor: renkler.tint }]}
              onPress={requestPermission}
            >
              <ThemedText style={{ color: '#fff', fontWeight: 'bold' }}>İzin Ver</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            {yukleniyor ? (
              <View style={[styles.loadingContainer, { backgroundColor: renkler.background }]}>
                <ActivityIndicator size="large" color={renkler.tint} />
                <ThemedText style={{ color: renkler.text, marginTop: 16 }}>
                  Ürün sorgulanıyor...
                </ThemedText>
              </View>
            ) : (
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39"],
                }}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
              >
                <View style={styles.overlay}>
                  <View style={[styles.scanFrame, { borderColor: renkler.tint }]} />
                  <ThemedText style={styles.scanText}>
                    Barkodu çerçevenin içine yerleştirin
                  </ThemedText>
                </View>
              </CameraView>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  permissionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 150,
    borderWidth: 2,
    backgroundColor: 'transparent',
    borderRadius: 12,
  },
  scanText: {
    color: '#fff',
    marginTop: 20,
    fontSize: 16,
    fontWeight: '500',
  }
});
