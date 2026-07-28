/**
 * hooks/use-kullanici.ts
 *
 * Cihaz kimliği (UUID) ve kullanıcı bilgisini tek yerden yönetir.
 * - AsyncStorage'dan cihaz_id okur, yoksa yeni UUID üretip kaydeder
 * - GET /kullanici/cihaz/{cihaz_id} ile kullanici_id ve isim çeker
 * - Onboarding durumuna göre yönlendirme sinyali verir
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

// Backend base URL — gerekirse .env'den al
export const API_URL = "http://10.222.69.168:8000";

// AsyncStorage anahtarları
const CIHAZ_ID_KEY = "cihaz_id";
const KULLANICI_ID_KEY = "kullanici_id";

export interface KullaniciBilgisi {
  kullanici_id: number;
  cihaz_id: string;
  isim: string;
  cilt_tipi?: string;
  cilt_sorunlari?: string[];
  onboarding_tamamlandi: boolean;
}

function uuidOlustur(): string {
  // Expo'da expo-crypto yoksa güvenli fallback UUID v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useKullanici() {
  const router = useRouter();
  const [cihazId, setCihazId] = useState<string | null>(null);
  const [kullanici, setKullanici] = useState<KullaniciBilgisi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    baslatAsync();
  }, []);

  async function baslatAsync() {
    try {
      // 1) AsyncStorage'dan cihaz_id oku
      let mevcutCihazId = await AsyncStorage.getItem(CIHAZ_ID_KEY);

      if (!mevcutCihazId) {
        // 2) Yoksa yeni UUID üret ve kaydet
        mevcutCihazId = uuidOlustur();
        await AsyncStorage.setItem(CIHAZ_ID_KEY, mevcutCihazId);
        setCihazId(mevcutCihazId);
        // Backend'e henüz kayıt yok → onboarding'e yönlendir
        router.replace("/onboarding");
        return;
      }

      setCihazId(mevcutCihazId);

      // 3) Backend'den kullanıcı bilgisini çek
      const yanit = await fetch(
        `${API_URL}/kullanici/cihaz/${mevcutCihazId}`
      );

      if (yanit.status === 404) {
        // Cihaz_id var ama backend'de kayıt yok → onboarding
        router.replace("/onboarding");
        return;
      }

      if (!yanit.ok) {
        throw new Error("Sunucu hatası");
      }

      const veri: KullaniciBilgisi = await yanit.json();
      setKullanici(veri);

      // 4) Onboarding durumuna göre yönlendir
      if (!veri.onboarding_tamamlandi) {
        router.replace("/onboarding");
      }
      // onboarding tamamsa zaten (tabs)'e düşer, yönlendirmeye gerek yok
    } catch (hata) {
      console.error("useKullanici başlatma hatası:", hata);
    } finally {
      setYukleniyor(false);
    }
  }

  /** Onboarding tamamlandıktan sonra kullanıcıyı state'e set et */
  async function kullaniciKaydet(bilgi: KullaniciBilgisi) {
    await AsyncStorage.setItem(KULLANICI_ID_KEY, String(bilgi.kullanici_id));
    setKullanici(bilgi);
  }

  /** Profil güncellemesinden sonra lokal state'i senkronize et */
  function kullaniciGuncelle(guncel: Partial<KullaniciBilgisi>) {
    if (!kullanici) return;
    setKullanici({ ...kullanici, ...guncel });
  }

  return {
    cihazId,
    kullanici,
    yukleniyor,
    kullaniciKaydet,
    kullaniciGuncelle,
  };
}
