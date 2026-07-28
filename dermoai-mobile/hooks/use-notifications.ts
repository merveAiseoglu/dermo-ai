/**
 * hooks/use-notifications.ts
 *
 * Expo local bildirim yardımcı fonksiyonları:
 *  - izinIste()           → bildirim izni iste
 *  - bildirimKur()        → haftalık tekrarlı bildirim kur, ID'leri AsyncStorage'a kaydet
 *  - bildirimIptalEt()    → AsyncStorage'dan ID'leri çekip iptal et
 *  - testBildirimiGonder() → 60 sn sonra tek seferlik bildirim (demo)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// ─── Bildirim Handler (uygulama açıkken de göster) ───────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Sabit Eşlemeler ─────────────────────────────────────────────────────────

/** Türkçe gün adı → Expo weekday (1=Pazar, 2=Pazartesi, ..., 7=Cumartesi) */
const GUN_WEEKDAY: Record<string, number> = {
  Pazar: 1,
  Pazartesi: 2,
  Salı: 3,
  Çarşamba: 4,
  Perşembe: 5,
  Cuma: 6,
  Cumartesi: 7,
};

/** Zaman dilimi → saat (24s) */
const ZAMAN_SAAT: Record<string, number> = {
  Sabah: 8,
  Öğlen: 13,
  Akşam: 19,
  Gece: 22,
};

// ─── İzin İste ───────────────────────────────────────────────────────────────

export async function izinIste(): Promise<boolean> {
  // Emülatörde bildirim çalışmayabilir ama izin yine de alınabilir
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("dermoai-rutin", {
      name: "Dermo-AI Rutin Hatırlatıcılar",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: mevcut } = await Notifications.getPermissionsAsync();
  if (mevcut === "granted") return true;

  const { status: yeni } = await Notifications.requestPermissionsAsync();
  return yeni === "granted";
}

// ─── Bildirim Kur ─────────────────────────────────────────────────────────────

/**
 * Her gün için ayrı haftalık tekrarlı bildirim kurar.
 * Dönen notification ID'lerini AsyncStorage'a `notif_rutin_{rutinId}` key'iyle kaydeder.
 */
export async function bildirimKur(
  rutinId: number,
  icerikAdi: string,
  gunler: string[],
  zamanDilimi: string
): Promise<string[]> {
  const saat = ZAMAN_SAAT[zamanDilimi] ?? 20;
  const notifIds: string[] = [];

  for (const gun of gunler) {
    const weekday = GUN_WEEKDAY[gun];
    if (!weekday) continue;

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "🧚 Cilt Perin",
          body: `${zamanDilimi} rutinin için ${icerikAdi} zamanı geldi, parlamaya hazır mısın? ✨`,
          data: { rutin_id: rutinId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: saat,
          minute: 0,
        },
      });
      notifIds.push(id);
    } catch (e) {
      console.warn(`Bildirim kurulamadı [${gun}]:`, e);
    }
  }

  await AsyncStorage.setItem(`notif_rutin_${rutinId}`, JSON.stringify(notifIds));
  return notifIds;
}

// ─── Bildirim İptal Et ───────────────────────────────────────────────────────

/**
 * Bir rutine ait tüm bildirimleri iptal eder ve AsyncStorage'dan siler.
 */
export async function bildirimIptalEt(rutinId: number): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(`notif_rutin_${rutinId}`);
    if (!raw) return;

    const ids: string[] = JSON.parse(raw);
    for (const id of ids) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
    await AsyncStorage.removeItem(`notif_rutin_${rutinId}`);
  } catch (e) {
    console.warn(`Bildirim iptal hatası [rutin=${rutinId}]:`, e);
  }
}

// ─── Demo / Test Bildirimi ───────────────────────────────────────────────────

/**
 * 60 saniye sonra tek seferlik bildirim gönderir — sunum demosu için.
 */
export async function testBildirimiGonder(icerikAdi: string = "Rutin"): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🧚 Cilt Perin Test",
      body: `Test: "${icerikAdi}" hatırlatıcısı işte böyle görünecek!`,
      data: { test: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 60,
      repeats: false,
    },
  });
}

// ─── Hijyen Hatırlatıcıları ──────────────────────────────────────────────────

export async function hijyenBildirimiKur(hijyen: any): Promise<void> {
  await hijyenBildirimiIptalEt(hijyen.id);
  
  const notifIds: string[] = [];
  
  if (hijyen.sıklık === "günde 3 kez" && hijyen.saatler) {
    for (const saat of hijyen.saatler) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: hijyen.baslik,
          body: hijyen.mesaj,
          data: { hijyen_id: hijyen.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: saat,
          minute: 0,
        },
      });
      notifIds.push(id);
    }
  } else if (hijyen.sıklık === "haftalık" && hijyen.gun && hijyen.saat !== undefined) {
    const weekday = GUN_WEEKDAY[hijyen.gun];
    if (weekday) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: hijyen.baslik,
          body: hijyen.mesaj,
          data: { hijyen_id: hijyen.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: hijyen.saat,
          minute: 0,
        },
      });
      notifIds.push(id);
    }
  } else if (hijyen.sıklık === "aylık" && hijyen.ayin_gunu && hijyen.saat !== undefined) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: hijyen.baslik,
        body: hijyen.mesaj,
        data: { hijyen_id: hijyen.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
        day: hijyen.ayin_gunu,
        hour: hijyen.saat,
        minute: 0,
      },
    });
    notifIds.push(id);
  }

  await AsyncStorage.setItem(`notif_hijyen_${hijyen.id}`, JSON.stringify(notifIds));
}

export async function hijyenBildirimiIptalEt(hijyenId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(`notif_hijyen_${hijyenId}`);
    if (!raw) return;

    const ids: string[] = JSON.parse(raw);
    for (const id of ids) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
    await AsyncStorage.removeItem(`notif_hijyen_${hijyenId}`);
  } catch (e) {
    console.warn(`Hijyen bildirim iptal hatası [${hijyenId}]:`, e);
  }
}
