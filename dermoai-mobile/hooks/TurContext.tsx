import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { createContext, useContext, useState } from "react";

interface TurContextType {
  turAktif: boolean;
  turAdimi: number;
  turuBaslat: () => void;
  turuIlerlet: () => void;
  turuAtla: () => void;
}

const TurContext = createContext<TurContextType | undefined>(undefined);

export function TurProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [turAktif, setTurAktif] = useState(false);
  const [turAdimi, setTurAdimi] = useState(0);

  console.log("[TurContext] Render calisiyor. turAktif:", turAktif, "turAdimi:", turAdimi);

  const turuBaslat = () => {
    console.log("[TurContext] turuBaslat cagirildi, turAktif true yapiliyor...");
    setTurAktif(true);
    setTurAdimi(0);
    // Adım 0: Ana Sayfa
    console.log("[TurContext] router.replace('/(tabs)') cagiriliyor...");
    router.replace("/(tabs)");
  };

  const turuIlerlet = async () => {
    if (turAdimi === 0) {
      setTurAdimi(1);
      router.push("/(tabs)/analiz");
    } else if (turAdimi === 1) {
      setTurAdimi(2);
      router.push("/(tabs)/gecmis");
    } else if (turAdimi === 2) {
      setTurAdimi(3);
      router.push("/(tabs)/profil");
    } else {
      await turuBitir();
    }
  };

  const turuAtla = async () => {
    await turuBitir();
  };

  const turuBitir = async () => {
    setTurAktif(false);
    await AsyncStorage.setItem("tur_gosterildi", "true");
    router.replace("/(tabs)");
  };

  return (
    <TurContext.Provider value={{ turAktif, turAdimi, turuBaslat, turuIlerlet, turuAtla }}>
      {children}
    </TurContext.Provider>
  );
}

export function useTur() {
  const context = useContext(TurContext);
  if (!context) {
    throw new Error("useTur must be used within a TurProvider");
  }
  return context;
}
