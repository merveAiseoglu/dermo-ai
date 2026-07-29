import React, { useState, useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  DeviceEventEmitter,
} from 'react-native';
import { CustomAlert as Alert } from '@/components/OzelAlert';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Colors } from '@/constants/theme';
import { useThemeContext } from '@/hooks/ThemeProvider';
import { API_URL } from '@/hooks/use-kullanici';
import { RenkRozeti } from './RenkRozeti';
import { bildirimKur } from '@/hooks/use-notifications';

interface ManuelRutinEkleModalProps {
  visible: boolean;
  kullaniciId: number | null;
  onClose: () => void;
  onEklendi: () => void;
}

interface IcerikSonuc {
  icerik_id: number;
  icerik_adi: string;
  baz_tipi: string;
  renk?: string;
  kullanim_talimati?: string | null;
}

export function ManuelRutinEkleModal({
  visible,
  kullaniciId,
  onClose,
  onEklendi,
}: ManuelRutinEkleModalProps) {
  const { activeTheme: theme } = useThemeContext();
  const renkler = Colors[theme];

  const [aramaMetni, setAramaMetni] = useState('');
  const [sonuclar, setSonuclar] = useState<IcerikSonuc[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  
  // Filtreler
  const [filtreHamilelik, setFiltreHamilelik] = useState(false);
  const [filtreCiltTipi, setFiltreCiltTipi] = useState(false);
  const [filtreKomedojenite, setFiltreKomedojenite] = useState(false);
  
  // Seçim aşaması
  const [seciliIcerik, setSeciliIcerik] = useState<IcerikSonuc | null>(null);
  const [zamanDilimi, setZamanDilimi] = useState<'Sabah' | 'Akşam'>('Akşam');
  const [gunModu, setGunModu] = useState<'Her gün' | 'Belirli günler'>('Her gün');
  const [seciliGunler, setSeciliGunler] = useState<Set<string>>(new Set(['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']));
  const [dikkatliKullanNotlari, setDikkatliKullanNotlari] = useState<{icerik_adi: string, kosul_notu: string}[]>([]);
  
  const [islemYukleniyor, setIslemYukleniyor] = useState(false);
  
  const [aktifSekme, setAktifSekme] = useState<'kutuphane' | 'serbest'>('kutuphane');
  const [serbestUrunAdi, setSerbestUrunAdi] = useState('');

  // Debounce ile arama
  useEffect(() => {
    if (!visible) return;
    
    const delayDebounceFn = setTimeout(() => {
      setYukleniyor(true);

      let params = `q=${aramaMetni}&limit=20`;
      if (filtreHamilelik) params += `&hamilelik_uyumlu=true`;
      if (filtreCiltTipi) params += `&cilt_tipine_uygun=true`;
      if (filtreKomedojenite) params += `&max_komedojenite=2`;
      if (kullaniciId) params += `&kullanici_id=${kullaniciId}`;

      fetch(`${API_URL}/icerikler/ara?${params}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.sonuclar) {
            setSonuclar(data.sonuclar);
            if (data.yeni_rozetler && data.yeni_rozetler.length > 0) {
              DeviceEventEmitter.emit('yeni_rozet_kuyrugu', data.yeni_rozetler);
            } else if (data.yeni_rozet_kazanildi) {
              DeviceEventEmitter.emit('yeni_rozet_kuyrugu', [data.yeni_rozet_kazanildi]);
            }
          } else {
            setSonuclar(data);
          }
          setYukleniyor(false);
        })
        .catch((e) => {
          console.warn(e);
          setYukleniyor(false);
        });
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [aramaMetni, visible, filtreHamilelik, filtreCiltTipi, filtreKomedojenite, kullaniciId]);

  const resetState = () => {
    setAramaMetni('');
    setSeciliIcerik(null);
    setZamanDilimi('Akşam');
    setGunModu('Her gün');
    setSeciliGunler(new Set(['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']));
    setFiltreHamilelik(false);
    setFiltreCiltTipi(false);
    setFiltreKomedojenite(false);
    setDikkatliKullanNotlari([]);
    setAktifSekme('kutuphane');
    setSerbestUrunAdi('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const toggleGun = (gun: string) => {
    setSeciliGunler((prev) => {
      const yeni = new Set(prev);
      if (yeni.has(gun)) {
        yeni.delete(gun);
      } else {
        yeni.add(gun);
      }
      return yeni;
    });
  };

  const rutineEkle = async (onay = false) => {
    if (!kullaniciId || !seciliIcerik) return;
    
    let gunlerDizisi = Array.from(seciliGunler);
    if (gunModu === 'Her gün') {
      gunlerDizisi = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
    }

    if (gunlerDizisi.length === 0) {
      Alert.alert('Hata', 'Lütfen en az bir gün seçin.');
      return;
    }

    setIslemYukleniyor(true);
    try {
      if (seciliIcerik.icerik_id === -1) {
        // Serbest ürün ekleme akışı
        const response = await fetch(`${API_URL}/rutinler/serbest-ekle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kullanici_id: kullaniciId,
            serbest_urun_adi: seciliIcerik.icerik_adi,
            gunler: gunlerDizisi,
            zaman_dilimi: zamanDilimi
          })
        });

        if (!response.ok) throw new Error('Sunucu hatası');
        await bildirimKur(-1, seciliIcerik.icerik_adi, gunlerDizisi, zamanDilimi);
        Alert.alert('Başarılı', `"${seciliIcerik.icerik_adi}" rutininize eklendi!`);
        onEklendi();
        handleClose();
      } else {
        // Mevcut kütüphane ürünü ekleme akışı
        const response = await fetch(`${API_URL}/rutinler/manuel-ekle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kullanici_id: kullaniciId,
            icerik_id: seciliIcerik.icerik_id,
            gunler: gunlerDizisi,
            zaman_dilimi: zamanDilimi,
            onay: onay
          })
        });

        if (!response.ok) throw new Error('Sunucu hatası');
        const data = await response.json();

        if (data.uyari && !onay) {
          setIslemYukleniyor(false);
          let mesaj = '';
          if (data.cakismalar && data.cakismalar.length > 0) {
            mesaj += `Bu içerik rutininizdeki ${data.cakismalar[0].icerik_adi} ile çakışabilir:\n${data.cakismalar[0].aciklama}\n\n`;
          }
          if (data.komedojenite_uyarisi) {
            mesaj += `Bu içerik yüksek komedojenite (gözenek tıkama) riskine sahip.\n\n`;
          }
          
          Alert.alert(
            'Uyarı',
            mesaj + 'Yine de eklemek istiyor musunuz?',
            [
              { text: 'İptal', style: 'cancel' },
              { text: 'Yine de Ekle', style: 'destructive', onPress: () => rutineEkle(true) }
            ]
          );
          return;
        }

        // Başarılı, bildirimleri kur
        await bildirimKur(data.rutin_id, seciliIcerik.icerik_adi, gunlerDizisi, zamanDilimi);
        
        onEklendi(); 

        if (data.yeni_rozetler && data.yeni_rozetler.length > 0) {
          DeviceEventEmitter.emit('yeni_rozet_kuyrugu', data.yeni_rozetler);
        } else if (data.yeni_rozet_kazanildi) {
          DeviceEventEmitter.emit('yeni_rozet_kuyrugu', [data.yeni_rozet_kazanildi]);
        }

        if (data.dikkatli_kullan_notlari && data.dikkatli_kullan_notlari.length > 0) {
          setDikkatliKullanNotlari(data.dikkatli_kullan_notlari);
        } else {
          Alert.alert('Başarılı', `${seciliIcerik.icerik_adi} rutininize eklendi!`);
          handleClose();
        }
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Hata', 'Rutin eklenirken bir hata oluştu.');
    } finally {
      setIslemYukleniyor(false);
    }
  };

  const renderIcerik = ({ item }: { item: IcerikSonuc }) => (
    <TouchableOpacity
      style={[styles.listeOgesi, { backgroundColor: renkler.surface, borderColor: renkler.border }]}
      onPress={() => setSeciliIcerik(item)}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ThemedText type="defaultSemiBold" style={{ fontSize: 16 }}>{item.icerik_adi}</ThemedText>
          <RenkRozeti renk={item.renk} />
        </View>
        <ThemedText style={{ fontSize: 13, color: renkler.icon }}>{item.baz_tipi}</ThemedText>
        {item.kullanim_talimati && (
          <ThemedText style={{ fontSize: 12, color: renkler.icon, fontStyle: 'italic', marginTop: 2 }} numberOfLines={2}>
            {item.kullanim_talimati}
          </ThemedText>
        )}
      </View>
      <Ionicons name="add-circle-outline" size={24} color={renkler.tint} />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: renkler.background }]}>
        <View style={[styles.header, { borderBottomColor: renkler.border }]}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={renkler.text} />
          </TouchableOpacity>
          <ThemedText style={[styles.title, { color: renkler.text }]}>
            {seciliIcerik ? 'Rutine Ekle' : 'Manuel İçerik Ekle'}
          </ThemedText>
          <View style={{ width: 28 }} />
        </View>

        {!seciliIcerik ? (
          <View style={{ flex: 1, padding: 20 }}>
            {/* Sekmeler */}
            <View style={{ flexDirection: 'row', marginBottom: 16, backgroundColor: renkler.surface, borderRadius: 8, padding: 4 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: aktifSekme === 'kutuphane' ? renkler.tint : 'transparent', borderRadius: 6 }}
                onPress={() => setAktifSekme('kutuphane')}
              >
                <ThemedText style={{ color: aktifSekme === 'kutuphane' ? '#FFF' : renkler.text, fontWeight: '600', fontSize: 14 }}>Kütüphaneden Seç</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: aktifSekme === 'serbest' ? renkler.tint : 'transparent', borderRadius: 6 }}
                onPress={() => setAktifSekme('serbest')}
              >
                <ThemedText style={{ color: aktifSekme === 'serbest' ? '#FFF' : renkler.text, fontWeight: '600', fontSize: 14 }}>Kendi Ürününü Ekle</ThemedText>
              </TouchableOpacity>
            </View>

            {aktifSekme === 'kutuphane' ? (
              <>
                <View style={[styles.aramaKutusu, { backgroundColor: renkler.surface, borderColor: renkler.border }]}>
              <Ionicons name="search" size={20} color={renkler.icon} />
              <TextInput
                style={[styles.aramaInput, { color: renkler.text }]}
                placeholder="İçerik ara (örn: C Vitamini)"
                placeholderTextColor={renkler.icon}
                value={aramaMetni}
                onChangeText={setAramaMetni}
                autoFocus
              />
              {aramaMetni.length > 0 && (
                <TouchableOpacity onPress={() => setAramaMetni('')}>
                  <Ionicons name="close-circle" size={20} color={renkler.icon} />
                </TouchableOpacity>
              )}
            </View>

            <View style={{ height: 40, marginBottom: 16 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
                <TouchableOpacity
                  style={[styles.filtreChip, { backgroundColor: filtreHamilelik ? renkler.tint : 'transparent', borderColor: renkler.tint }]}
                  onPress={() => setFiltreHamilelik(!filtreHamilelik)}
                >
                  <ThemedText style={{ color: filtreHamilelik ? '#FFF' : renkler.tint, fontSize: 13, fontWeight: '600' }}>🤰 Hamileliğe Uygun</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filtreChip, { backgroundColor: filtreCiltTipi ? renkler.tint : 'transparent', borderColor: renkler.tint }]}
                  onPress={() => setFiltreCiltTipi(!filtreCiltTipi)}
                >
                  <ThemedText style={{ color: filtreCiltTipi ? '#FFF' : renkler.tint, fontSize: 13, fontWeight: '600' }}>💧 Cilt Tipime Uygun</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filtreChip, { backgroundColor: filtreKomedojenite ? renkler.tint : 'transparent', borderColor: renkler.tint }]}
                  onPress={() => setFiltreKomedojenite(!filtreKomedojenite)}
                >
                  <ThemedText style={{ color: filtreKomedojenite ? '#FFF' : renkler.tint, fontSize: 13, fontWeight: '600' }}>✨ Komedojenik Değil</ThemedText>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {yukleniyor ? (
              <ActivityIndicator size="large" color={renkler.tint} style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={sonuclar}
                keyExtractor={(item) => item.icerik_id.toString()}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={renderIcerik}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', marginTop: 40 }}>
                    <ThemedText style={{ color: renkler.icon }}>Sonuç bulunamadı.</ThemedText>
                  </View>
                }
              />
            )}
              </>
            ) : (
              <View style={{ flex: 1 }}>
                <View style={{ backgroundColor: '#E8F4FD', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                  <ThemedText style={{ color: '#005A9E', fontSize: 13 }}>ℹ️ Bu ürün analiz kapsamı dışında, sadece hatırlatıcı olarak eklenir.</ThemedText>
                </View>
                <ThemedText style={{ color: renkler.text, marginBottom: 8, fontWeight: '600' }}>Ürün Adı</ThemedText>
                <TextInput
                  style={[styles.aramaInput, { color: renkler.text, backgroundColor: renkler.surface, borderColor: renkler.border, borderWidth: 1, padding: 12, borderRadius: 8, marginBottom: 20 }]}
                  placeholder="Ürün adını girin (örn: Haftalık Kil Maskesi)"
                  placeholderTextColor={renkler.icon}
                  value={serbestUrunAdi}
                  onChangeText={setSerbestUrunAdi}
                  autoFocus
                />
                
                {/* Gün ve Zaman seçiciler burada render edilebilir, ancak aşağıda seciliIcerik durumunda render edildiği için ortak bir Component olarak refactor etmek veya buraya eklemek gerek. Mevcut koda dokunmamak adına seçimi buradan da yapabilir ve serbestEkle'yi çağırabiliriz. */}
                <TouchableOpacity
                  style={[styles.onayButon, { backgroundColor: serbestUrunAdi.trim() ? renkler.tint : renkler.border, marginTop: 'auto' }]}
                  onPress={() => {
                    setSeciliIcerik({
                      icerik_id: -1,
                      icerik_adi: serbestUrunAdi.trim(),
                      baz_tipi: 'Kapsam Dışı',
                    });
                  }}
                  disabled={!serbestUrunAdi.trim()}
                >
                  <ThemedText style={styles.onayButonYazi}>Devam Et</ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <ScrollView style={{ flex: 1, padding: 20 }}>
            {dikkatliKullanNotlari.length > 0 ? (
              <View style={{ padding: 20, backgroundColor: '#FFF3CD', borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#FFEEBA' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                  <Ionicons name="warning" size={24} color="#856404" />
                  <ThemedText type="defaultSemiBold" style={{ fontSize: 18, color: '#856404' }}>Dikkatli Kullanım</ThemedText>
                </View>
                <ThemedText style={{ color: '#856404', marginBottom: 16 }}>
                  {seciliIcerik?.icerik_adi} başarıyla eklendi, ancak rutininizdeki diğer içeriklerle kullanımı hakkında aşağıdaki notlara dikkat ediniz:
                </ThemedText>
                {dikkatliKullanNotlari.map((not, idx) => (
                  <View key={idx} style={{ marginBottom: 12 }}>
                    <ThemedText style={{ color: '#856404', fontWeight: 'bold' }}>• {not.icerik_adi} ile:</ThemedText>
                    <ThemedText style={{ color: '#856404', marginTop: 4 }}>{not.kosul_notu}</ThemedText>
                  </View>
                ))}
                
                <TouchableOpacity
                  style={[styles.onayButon, { backgroundColor: '#856404', marginTop: 20 }]}
                  onPress={handleClose}
                >
                  <ThemedText style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>Tamam, Anladım</ThemedText>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={[styles.seciliKutu, { backgroundColor: renkler.primaryLight }]}>
                  <ThemedText type="defaultSemiBold" style={{ fontSize: 18, color: renkler.tint, textAlign: 'center' }}>
                    {seciliIcerik.icerik_adi}
                  </ThemedText>
                </View>

                <ThemedText type="defaultSemiBold" style={styles.secimBaslik}>Zaman Dilimi</ThemedText>
            <View style={styles.butonSatiri}>
              {(['Sabah', 'Akşam'] as const).map(z => (
                <TouchableOpacity
                  key={z}
                  style={[
                    styles.secimButonu,
                    { backgroundColor: zamanDilimi === z ? renkler.tint : renkler.surface, borderColor: zamanDilimi === z ? renkler.tint : renkler.border }
                  ]}
                  onPress={() => setZamanDilimi(z)}
                >
                  <ThemedText style={{ color: zamanDilimi === z ? '#FFF' : renkler.text, fontWeight: zamanDilimi === z ? '600' : '400' }}>{z}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            <ThemedText type="defaultSemiBold" style={styles.secimBaslik}>Günler</ThemedText>
            <View style={styles.butonSatiri}>
              {(['Her gün', 'Belirli günler'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.secimButonu,
                    { backgroundColor: gunModu === m ? renkler.tint : renkler.surface, borderColor: gunModu === m ? renkler.tint : renkler.border }
                  ]}
                  onPress={() => setGunModu(m)}
                >
                  <ThemedText style={{ color: gunModu === m ? '#FFF' : renkler.text, fontWeight: gunModu === m ? '600' : '400' }}>{m}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            {gunModu === 'Belirli günler' && (
              <View style={styles.gunlerKutusu}>
                {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'].map(g => {
                  const secili = seciliGunler.has(g);
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[
                        styles.gunButonu,
                        { backgroundColor: secili ? renkler.successLight : renkler.surface, borderColor: secili ? renkler.success : renkler.border }
                      ]}
                      onPress={() => toggleGun(g)}
                    >
                      <ThemedText style={{ color: secili ? renkler.success : renkler.text }}>{g}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <TouchableOpacity
              style={[styles.onayButon, { backgroundColor: islemYukleniyor ? renkler.icon : renkler.tint, marginTop: 40 }]}
              onPress={() => rutineEkle(false)}
              disabled={islemYukleniyor}
            >
              {islemYukleniyor ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <ThemedText style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>Kaydet</ThemedText>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={() => setSeciliIcerik(null)} disabled={islemYukleniyor}>
              <ThemedText style={{ color: renkler.icon }}>Geri Dön</ThemedText>
            </TouchableOpacity>
            </>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeButton: { padding: 4 },
  title: { fontSize: 18, fontWeight: '600' },
  aramaKutusu: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  aramaInput: { flex: 1, fontSize: 16, height: '100%' },
  listeOgesi: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  seciliKutu: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'center',
  },
  secimBaslik: {
    fontSize: 16,
    marginBottom: 10,
    marginTop: 10,
  },
  butonSatiri: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  secimButonu: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  gunlerKutusu: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  gunButonu: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  onayButon: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  onayButonYazi: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  filtreChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  }
});
