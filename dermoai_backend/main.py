from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from typing import Optional
from database import SessionLocal
from models import Icerik, UrunIcerik, Cakisma, Urun, Kullanici, AnalizGecmisi, Rutin, Sinerji, RutinKaydi, GeriBildirim, KullaniciOncelikPuani, Rozet, KullaniciRozet, LlmAciklamaCache
from itertools import combinations
import hashlib
import os
from openai import OpenAI
from dotenv import load_dotenv
from openai import OpenAI
import os
import json
import requests
from datetime import datetime, timedelta

load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pydantic Şemaları ────────────────────────────────────────────────────────

class AnalizIstek(BaseModel):
    urun_idler: list[int]
    kullanici_id: Optional[int] = None

class KullaniciOlustur(BaseModel):
    cihaz_id: str
    isim: str
    yas: Optional[int] = None
    cinsiyet: Optional[str] = None
    cilt_tipi: Optional[str] = None
    cilt_sorunlari: Optional[list[str]] = None

class KullaniciGuncelle(BaseModel):
    isim: Optional[str] = None
    yas: Optional[int] = None
    cinsiyet: Optional[str] = None
    cilt_tipi: Optional[str] = None
    cilt_sorunlari: Optional[list[str]] = None
    hamilelik_modu_aktif: Optional[bool] = None

class RutinOlustur(BaseModel):
    kullanici_id: int
    icerik_id: Optional[int] = None
    serbest_urun_adi: Optional[str] = None
    gunler: list[str]
    zaman_dilimi: str

class RutinKayitIstek(BaseModel):
    rutin_id: int
    tarih: str # "YYYY-MM-DD" formatında frontend'den bekleniyor

class ManuelRutinEkleIstek(BaseModel):
    kullanici_id: int
    icerik_id: int
    gunler: list[str]
    zaman_dilimi: str
    onay: bool = False

class ManuelSerbestEkleIstek(BaseModel):
    kullanici_id: int
    serbest_urun_adi: str
    gunler: list[str]
    zaman_dilimi: str

class GeriBildirimOlustur(BaseModel):
    icerik_id: int
    gun_esigi: int
    begeni: bool
    not_metni: Optional[str] = None

class GeriBildirimYanit(BaseModel):
    id: int
    yeni_puan: int
    mesaj: str

class BarkodSorgu(BaseModel):
    barkod: str
    kullanici_id: Optional[int] = None

# ─── Veritabanı Bağımlılığı ───────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ─── Rozet Yardımcı Fonksiyonu ────────────────────────────────────────────────
def rozet_kontrol_ve_ver(kullanici_id: int, rozet_kodu: str, db: Session):
    try:
        rozet_bilgi = db.query(Rozet).filter(Rozet.rozet_kodu == rozet_kodu).first()
        if not rozet_bilgi:
            return None
            
        mevcut = db.query(KullaniciRozet).filter(
            KullaniciRozet.kullanici_id == kullanici_id, 
            KullaniciRozet.rozet_id == rozet_bilgi.rozet_id
        ).first()
        
        if mevcut:
            return None
            
        yeni_rozet = KullaniciRozet(kullanici_id=kullanici_id, rozet_id=rozet_bilgi.rozet_id)
        db.add(yeni_rozet)
        db.commit()
        
        return {
            "rozet_kodu": rozet_bilgi.rozet_kodu,
            "rozet_adi": rozet_bilgi.rozet_adi,
            "aciklama": rozet_bilgi.aciklama,
            "emoji": rozet_bilgi.emoji
        }
    except Exception as e:
        db.rollback()
        print(f"Rozet verme hatası: {e}")
        return None

# ─── Sabit Listeler (halüsinasyon önleme) ────────────────────────────────────

GECERLI_GUNLER  = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
GECERLI_ZAMANLAR = ["Sabah", "Öğlen", "Akşam", "Gece"]

# ─── AI Fonksiyonları ─────────────────────────────────────────────────────────

def ai_cakisma_analiz_et(
    aciklama: str,
    icerik_1_id: int,
    icerik_2_id: int,
    icerik_adlari: list = None,   # [İçerik1_adi, İçerik2_adi] — Retinol/yaş denetimi için
    cilt_tipi: str = None,
    cilt_sorunlari: list = None,
    yas: int = None,
) -> dict:
    """
    Tek OpenAI çağrısında hem prose öneri (oneri) hem yapılandırılmış
    rutin programı (program) üretir. JSON mode kullanır.
    Hata durumunda program=None ile güvenli fallback döner.
    """
    client = OpenAI(api_key=api_key)

    # ─ Kişisel bağlam bloğu ─
    kisisel_satirlar = []

    # Yaş bloğu — 30 altı + Retinol içeren çakışmada özel dikkat notu
    if yas is not None:
        retinol_var = any(
            "retinol" in (ad or "").lower()
            for ad in (icerik_adlari or [])
        )
        if yas < 30 and retinol_var:
            kisisel_satirlar.append(
                f"Kullanıcının yaşı: {yas} (30 yaş altı). "
                "Bu çakışmada Retinol bulunuyor. "
                "oneri alanında nazikçe belirt: genç ciltlerde Retinol önerilenden düşük "
                "yoğunluktan başlanması önerilir; kızarıklık veya soyulma görülmesi halinde "
                "kullanımı azaltın."
            )
        else:
            kisisel_satirlar.append(f"Kullanıcının yaşı: {yas}.")

    if cilt_tipi:
        kisisel_satirlar.append(f"Cilt tipi: {cilt_tipi}.")

    if cilt_sorunlari:
        sorunlar_str = ", ".join(cilt_sorunlari)
        kisisel_satirlar.append(
            f"Cilt sorunları: {sorunlar_str}. "
            "Bunlar arasında önceliklendirme yaparak hangi bileşenin ön planda tutulacağını öner."
        )

    kisisel_context = (
        "\n\nKullanıcıya özel bilgiler:\n" + "\n".join(f"- {s}" for s in kisisel_satirlar)
        if kisisel_satirlar else ""
    )

    prompt = f"""Sen uzman bir kozmetik kimyageri ve cilt bakım formülatörüsünsün.

Çakışma mekanizması kaydı (AYNEN baz al, kendi çıkarımını yapma):
"{aciklama}"{kisisel_context}

GEÇERLİ GÜNLER (SADECE bunlardan seç): {GECERLI_GUNLER}
GEÇERLİ ZAMAN DİLİMLERİ (SADECE bunlardan seç): {GECERLI_ZAMANLAR}

Aşağıdaki JSON formatında yanıt ver. Başka hiçbir şey yazma, sadece JSON:

{{
  "oneri": "<3-4 cümle Türkçe pratik kullanım önerisi>",
  "program": {{
    "strateji": "<'zaman_ayrimi' veya 'gun_ayrimi'>",
    "icerik_1_id": {icerik_1_id},
    "icerik_1_gunler": ["<gün listesi>"],
    "icerik_1_zaman": "<zaman dilimi>",
    "icerik_2_id": {icerik_2_id},
    "icerik_2_gunler": ["<gün listesi>"],
    "icerik_2_zaman": "<zaman dilimi>"
  }}
}}

KURALLAR — PROGRAM (program alanı):
- strateji: aciklama metninde "aynı anda kullanılmamalı / aynı anda" gibi ifade varsa "zaman_ayrimi"; aksi halde "gun_ayrimi".
- gun_ayrimi → icerik_1 ve icerik_2 günleri çakışmasın.
- zaman_ayrimi → aynı günler, farklı zaman dilimleri.
- Günler ve zaman dilimleri SADECE yukarıdaki listelerden.

KURALLAR — ONERİ (oneri alanı):
- Pratik yönlendirme: zaman ayrımı / nöbetleşe / önceliklendirme stratejilerinden uygun olanı seç.
- "Cildinizi gözlemleyerek kullanın", "güneş kremi unutmayın" gibi esnek ifadeler kullan.
- ❗ SAYISAL SIKLIK/HAFTA/DOZ İFADE YASAĞI: "haftada X kez", "X günde bir", "X mg", "X hafta"
  gibi hiçbir sayısal ifade oneri metninde GEÇMESİN.
- Günlere atıfta bulunmak istersen SADECE "belirlenen program günlerinde" veya
  "programınıza eklediğiniz günlerde" şeklinde genel ifade kullan.
- Destekleyici 1 bileşen öner (Seramid, Hyalüronik Asit veya Centella gibi).
- Ciddi tahriş / alerjik reaksiyon riski varsa kısaca belirt; gereksiz "doktora danışın" deme."""

    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        sonuc = json.loads(response.choices[0].message.content)

        # Program alanını doğrula — izinsiz değer varsa null yap
        program = sonuc.get("program")
        if program:
            gunler_1 = [g for g in program.get("icerik_1_gunler", []) if g in GECERLI_GUNLER]
            gunler_2 = [g for g in program.get("icerik_2_gunler", []) if g in GECERLI_GUNLER]
            zaman_1  = program.get("icerik_1_zaman") if program.get("icerik_1_zaman") in GECERLI_ZAMANLAR else GECERLI_ZAMANLAR[2]
            zaman_2  = program.get("icerik_2_zaman") if program.get("icerik_2_zaman") in GECERLI_ZAMANLAR else GECERLI_ZAMANLAR[3]
            strateji = program.get("strateji") if program.get("strateji") in ("zaman_ayrimi", "gun_ayrimi") else "gun_ayrimi"
            program = {
                "strateji": strateji,
                "icerik_1_id": icerik_1_id,
                "icerik_1_gunler": gunler_1 or ["Pazartesi", "Çarşamba", "Cuma"],
                "icerik_1_zaman": zaman_1,
                "icerik_2_id": icerik_2_id,
                "icerik_2_gunler": gunler_2 or ["Salı", "Perşembe"],
                "icerik_2_zaman": zaman_2,
            }

        return {"oneri": sonuc.get("oneri", ""), "program": program}

    except Exception as e:
        print(f"ai_cakisma_analiz_et hata: {e}")
        return {"oneri": "Bu iki içeriği farklı rutinlerde kullanmanızı öneririz.", "program": None}


def ai_sinerji_analiz_et(
    aciklama: str,
    icerik_1_id: int,
    icerik_2_id: int,
    cilt_tipi: str = None,
    cilt_sorunlari: list = None,
) -> dict:
    """
    Sinerji (birlikte iyi çalışma) durumunda OpenAI çağrısı.
    """
    client = OpenAI(api_key=api_key)

    kisisel_satirlar = []
    if cilt_tipi:
        kisisel_satirlar.append(f"Cilt tipi: {cilt_tipi}.")
    if cilt_sorunlari:
        sorunlar_str = ", ".join(cilt_sorunlari)
        kisisel_satirlar.append(
            f"Cilt sorunları: {sorunlar_str}. "
            "Bunlar arasında nasıl bir fayda sağlayacağını belirt."
        )

    kisisel_context = (
        "\n\nKullanıcıya özel bilgiler:\n" + "\n".join(f"- {s}" for s in kisisel_satirlar)
        if kisisel_satirlar else ""
    )

    prompt = f"""Sen uzman bir kozmetik kimyageri ve cilt bakım formülatörüsünsün.

Sinerji mekanizması kaydı (AYNEN baz al, kendi çıkarımını yapma):
"{aciklama}"{kisisel_context}

GEÇERLİ GÜNLER (SADECE bunlardan seç): {GECERLI_GUNLER}
GEÇERLİ ZAMAN DİLİMLERİ (SADECE bunlardan seç): {GECERLI_ZAMANLAR}

Aşağıdaki JSON formatında yanıt ver. Başka hiçbir şey yazma, sadece JSON:

{{
  "oneri": "<3-4 cümle Türkçe samimi ve pratik kullanım önerisi>",
  "program": {{
    "strateji": "birlikte_kullanim",
    "icerik_1_id": {icerik_1_id},
    "icerik_1_gunler": ["<gün listesi>"],
    "icerik_1_zaman": "<zaman dilimi>",
    "icerik_2_id": {icerik_2_id},
    "icerik_2_gunler": ["<gün listesi>"],
    "icerik_2_zaman": "<zaman dilimi>"
  }}
}}

KURALLAR — PROGRAM (program alanı):
- Sinerji olduğu için strateji "birlikte_kullanim" olabilir.
- icerik_1 ve icerik_2 için AYNI günleri ve AYNI zaman dilimini öner (çünkü sinerjiktir ve birlikte kullanılırlar).
- Günler ve zaman dilimleri SADECE yukarıdaki listelerden.

KURALLAR — ONERİ (oneri alanı):
- Pratik yönlendirme yap, bu iki içeriği arka arkaya veya karıştırarak kullanmanın faydasını anlat.
- "Cildinizi gözlemleyerek kullanın" gibi esnek ifadeler kullan.
- ❗ SAYISAL SIKLIK/HAFTA/DOZ İFADE YASAĞI: "haftada X kez", "X günde bir" gibi hiçbir sayısal ifade oneri metninde GEÇMESİN.
- Günlere atıfta bulunmak istersen SADECE "belirlenen program günlerinde" şeklinde genel ifade kullan."""

    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        sonuc = json.loads(response.choices[0].message.content)

        program = sonuc.get("program")
        if program:
            gunler_1 = [g for g in program.get("icerik_1_gunler", []) if g in GECERLI_GUNLER]
            gunler_2 = [g for g in program.get("icerik_2_gunler", []) if g in GECERLI_GUNLER]
            zaman_1  = program.get("icerik_1_zaman") if program.get("icerik_1_zaman") in GECERLI_ZAMANLAR else GECERLI_ZAMANLAR[2]
            zaman_2  = program.get("icerik_2_zaman") if program.get("icerik_2_zaman") in GECERLI_ZAMANLAR else GECERLI_ZAMANLAR[2]
            
            # Sinerji olduğu için ikisini de senkronize edelim fallback durumunda
            if not gunler_1 and not gunler_2:
                ortak_gunler = ["Pazartesi", "Çarşamba", "Cuma"]
                gunler_1 = gunler_2 = ortak_gunler
            elif gunler_1 and not gunler_2:
                gunler_2 = gunler_1
            elif gunler_2 and not gunler_1:
                gunler_1 = gunler_2

            program = {
                "strateji": "birlikte_kullanim",
                "icerik_1_id": icerik_1_id,
                "icerik_1_gunler": gunler_1,
                "icerik_1_zaman": zaman_1,
                "icerik_2_id": icerik_2_id,
                "icerik_2_gunler": gunler_2,
                "icerik_2_zaman": zaman_2,
            }

        return {"oneri": sonuc.get("oneri", ""), "program": program}

    except Exception as e:
        print(f"ai_sinerji_analiz_et hata: {e}")
        return {"oneri": "Bu iki içeriği aynı rutinde güvenle kullanabilirsiniz.", "program": None}

import re

def gecerli_aktif_madde_mi(icerik_adi: str, dogrulanmis_mi: bool) -> bool:
    """
    Barkod taramasından gelen kirli INCI verilerini filtreler.
    Renk kodları, ağırlık/hacim birimleri ve aşırı kısa isimleri eler.
    """
    isim = icerik_adi.strip().upper()
    
    # 1. Aşırı kısa (muhtemelen anlamsız) isimler
    if len(isim) < 3:
        return False
        
    # 2. Sadece sayılar veya sayılar+noktalama
    if re.fullmatch(r'[0-9\.\-\s]+', isim):
        return False
        
    # 3. Renk kodları (CI 77499, CI 77492 vb.)
    if isim.startswith("CI ") or re.match(r'^CI\d+', isim):
        return False
        
    # 4. Ağırlık/Hacim birimleri
    hacim_birimleri = ["ML", "GR", "GRAM", "LITRE", "LITER", "OZ", "KILO", "KG"]
    for kelime in isim.split():
        temiz_kelime = re.sub(r'[^A-Z]', '', kelime)
        if temiz_kelime in hacim_birimleri:
            return False
            
    # 5. Doğrulanmamış şüpheli kelimeler
    if not dogrulanmis_mi:
        if "WATER" in isim and len(isim.split()) > 4:
            return False
            
    return True

def konsolide_oneri_al(
    gecerli_icerikler: list,
    cilt_sorunlari: list,
) -> Optional[dict]:
    """
    Tüm geçerli aktif maddeleri tek bir çağrıda değerlendirir ve tek bir öneri döndürür.
    """
    if not gecerli_icerikler or not cilt_sorunlari:
        return None
        
    client = OpenAI(api_key=api_key)
    sorunlar_str = ", ".join(cilt_sorunlari)
    icerikler_str = ", ".join(gecerli_icerikler)

    prompt = f"""Sen uzman bir kozmetik kimyageri ve cilt bakım formülatörüsünsün.

Kullanıcının rutinine/analize eklediği geçerli içerikler: {icerikler_str}
Kullanıcının cilt sorunları: {sorunlar_str}

GEÇERLİ GÜNLER (SADECE bunlardan seç): {GECERLI_GUNLER}
GEÇERLİ ZAMAN DİLİMLERİ (SADECE bunlardan seç): {GECERLI_ZAMANLAR}

Bu içerikler (birlikte düşünüldüğünde) kullanıcının cilt sorunlarından EN AZ BİRİNE uygunsa, TEK BİR kısa genel öneri ve program üret.
Uygun değilse "uygun": false döndür.

SADECE TÜRKÇE YANIT VER. Yabancı dilde veya ham bir metin döndürme.
JSON formatında yanıt ver. Başka hiçbir şey yazma, sadece JSON:

{{
  "uygun": true,
  "oneri": "<2-3 cümle kısa, tutarlı Türkçe öneri>",
  "program": {{
    "gunler": ["<gün listesi>"],
    "zaman_dilimi": "<zaman dilimi>"
  }}
}}

KURALLAR:
- Aktif/eksfoliyan içerikler varsa → Akşam veya Gece, az sayıda gün.
- Günler SADECE geçerli listeden. Dozaj/yüzde/hafta sayısı ÜRETME.
- ❗ SAYISAL SIKLIK YASAĞI: oneri metninde "haftada X kez", "X günde bir" gibi ifade GEÇMESİN.
- SADECE TÜRKÇE konuş.
- Tüm içeriklerin genel bir özeti olarak tavsiye ver, tek tek uzun açıklamalar yapma."""

    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        sonuc = json.loads(response.choices[0].message.content)

        if not sonuc.get("uygun"):
            return None

        program = sonuc.get("program")
        if program:
            gunler = [g for g in program.get("gunler", []) if g in GECERLI_GUNLER]
            zaman  = program.get("zaman_dilimi") if program.get("zaman_dilimi") in GECERLI_ZAMANLAR else "Gece"
            program = {
                "gunler": gunler or ["Salı", "Cuma"],
                "zaman_dilimi": zaman,
            }

        return {"oneri": sonuc.get("oneri", ""), "program": program}

    except Exception as e:
        print(f"konsolide_oneri_al hata: {e}")
        return None

def puan_bazli_sirala(oneriler: list, db: Session, kullanici_id: int) -> list:
    """Kullanıcının öncelik puanı 3 veya altındaysa öneriyi listenin sonuna atar."""
    if not kullanici_id or not oneriler:
        return oneriler
        
    puan_kayitlari = db.query(KullaniciOncelikPuani).filter(KullaniciOncelikPuani.kullanici_id == kullanici_id).all()
    puan_map = {k.icerik_id: k.puan for k in puan_kayitlari}
    
    normal_oneriler = []
    dusuk_puanli_oneriler = []
    
    for oneri in oneriler:
        icerik_id = oneri.get("icerik_id")
        puan = puan_map.get(icerik_id, 5)
        if puan <= 3:
            oneri["oncelik_puani"] = puan
            dusuk_puanli_oneriler.append(oneri)
        else:
            normal_oneriler.append(oneri)
            
    return normal_oneriler + dusuk_puanli_oneriler

def hesapla_icerik_rengi(icerik: Icerik, db: Session) -> str:
    # Doğrulanmamış (OBF'den otomatik gelen) içerikler her zaman gri
    if not icerik.dogrulanmis_mi:
        return "gri"

    # 1. Gebelik güvenliği kırmızı çizgi
    if icerik.hamilelikte_guvenli_mi is False:
        return "kirmizi"

    # 2. Bilinen çakışma sayısı
    cakisma_sayisi = db.query(Cakisma).filter(
        or_(Cakisma.icerik_id_1 == icerik.icerik_id,
            Cakisma.icerik_id_2 == icerik.icerik_id)
    ).count()

    if cakisma_sayisi >= 2:
        return "kirmizi"
    if cakisma_sayisi == 1:
        return "turuncu"

    # 3. Komedojenite puanı varsa ek sinyal olarak kullan
    if icerik.komedojenite_puani is not None:
        if icerik.komedojenite_puani >= 4:
            return "kirmizi"
        elif icerik.komedojenite_puani >= 2:
            return "turuncu"
        else:
            return "yesil"

    # Çakışma yok, gebelikte güvenli, komedojenite verisi yok — yeşil ver
    return "yesil"

# ─── Genel Endpoint'ler ───────────────────────────────────────────────────────

@app.get("/")
def ana_sayfa():
    return {"mesaj": "Merhaba Dermo-AI"}

@app.get("/icerikler")
def icerikleri_getir(db: Session = Depends(get_db)):
    icerikler = db.query(Icerik).all()
    sonuc = []
    for i in icerikler:
        renk = hesapla_icerik_rengi(i, db)
        sonuc.append({
            "icerik_id": i.icerik_id,
            "icerik_adi": i.icerik_adi,
            "baz_tipi": i.baz_tipi,
            "hamilelikte_guvenli_mi": i.hamilelikte_guvenli_mi,
            "kaynak": i.kaynak,
            "kaynak_url": i.kaynak_url,
            "dogrulanmis_mi": i.dogrulanmis_mi,
            "komedojenite_puani": i.komedojenite_puani,
            "renk": renk
        })
    return sonuc

@app.get("/icerikler/ara")
def icerikleri_ara(
    q: str = "", 
    limit: int = 20, 
    hamilelik_uyumlu: bool = False,
    cilt_tipine_uygun: bool = False,
    max_komedojenite: int = None,
    kullanici_id: int = None,
    db: Session = Depends(get_db)
):
    sorgu = db.query(Icerik)
    if q:
        sorgu = sorgu.filter(Icerik.icerik_adi.ilike(f"%{q}%"))
        
    kullanici_hamile_modu = False
    kullanici_cilt_tipi = None
    
    if kullanici_id:
        kullanici = db.query(Kullanici).filter(Kullanici.kullanici_id == kullanici_id).first()
        if kullanici:
            kullanici_hamile_modu = kullanici.hamilelik_modu_aktif
            kullanici_cilt_tipi = kullanici.cilt_tipi

    if hamilelik_uyumlu or kullanici_hamile_modu:
        sorgu = sorgu.filter(Icerik.hamilelikte_guvenli_mi == True)
        
    if max_komedojenite is not None:
        sorgu = sorgu.filter(Icerik.komedojenite_puani < max_komedojenite)
        
    if cilt_tipine_uygun and kullanici_cilt_tipi:
        sorgu = sorgu.filter(or_(
            Icerik.uyumlu_cilt_tipleri == None,
            Icerik.uyumlu_cilt_tipleri.any(kullanici_cilt_tipi)
        ))

    icerikler = sorgu.limit(limit).all()
    
    sonuc = []
    for i in icerikler:
        renk = hesapla_icerik_rengi(i, db)
        sonuc.append({
            "icerik_id": i.icerik_id,
            "icerik_adi": i.icerik_adi,
            "baz_tipi": i.baz_tipi,
            "hamilelikte_guvenli_mi": i.hamilelikte_guvenli_mi,
            "dogrulanmis_mi": i.dogrulanmis_mi,
            "komedojenite_puani": i.komedojenite_puani,
            "renk": renk,
            "kullanim_talimati": i.kullanim_talimati
        })
        
    yeni_rozet = None
    if kullanici_id and (hamilelik_uyumlu or cilt_tipine_uygun or max_komedojenite is not None):
        yeni_rozet = rozet_kontrol_ve_ver(kullanici_id, "uzman_kullanici", db)

    if yeni_rozet:
        return {"sonuclar": sonuc, "yeni_rozet_kazanildi": yeni_rozet}
        
    return sonuc

@app.get("/urunler")
def urunleri_getir(db: Session = Depends(get_db)):
    urunler = db.query(Urun).all()
    return urunler

@app.get("/icerikler/{icerik_id}")
def icerik_detay_getir(icerik_id: int, db: Session = Depends(get_db)):
    icerik = db.query(Icerik).filter(Icerik.icerik_id == icerik_id).first()
    if not icerik:
        raise HTTPException(status_code=404, detail="İçerik bulunamadı")
    
    cakismalar = db.query(Cakisma).filter(
        (Cakisma.icerik_id_1 == icerik_id) | (Cakisma.icerik_id_2 == icerik_id)
    ).all()
    
    cakistigi_icerikler = []
    for c in cakismalar:
        karsi_id = c.icerik_id_2 if c.icerik_id_1 == icerik_id else c.icerik_id_1
        karsi_icerik = db.query(Icerik).filter(Icerik.icerik_id == karsi_id).first()
        
        cakistigi_icerikler.append({
            "icerik_adi": karsi_icerik.icerik_adi if karsi_icerik else f"İçerik #{karsi_id}",
            "aciklama": c.aciklama,
            "kaynak": c.kaynak,
            "kaynak_url": c.kaynak_url
        })
        
    return {
        "icerik_id": icerik.icerik_id,
        "icerik_adi": icerik.icerik_adi,
        "baz_tipi": icerik.baz_tipi,
        "hamilelikte_guvenli_mi": icerik.hamilelikte_guvenli_mi,
        "kaynak": icerik.kaynak,
        "kaynak_url": icerik.kaynak_url,
        "cakistigi_icerikler": cakistigi_icerikler
    }

# ─── Kullanıcı Endpoint'leri ──────────────────────────────────────────────────

@app.get("/kullanicilar/{kullanici_id}/rozetler")
def kullanici_rozetleri_getir(kullanici_id: int, db: Session = Depends(get_db)):
    tum_rozetler = db.query(Rozet).all()
    kazanilan_rozetler = db.query(KullaniciRozet).filter(KullaniciRozet.kullanici_id == kullanici_id).all()
    
    kazanilan_dict = {kr.rozet_id: kr.kazanilma_tarihi for kr in kazanilan_rozetler}
    
    sonuc = []
    for r in tum_rozetler:
        kazanildi_mi = r.rozet_id in kazanilan_dict
        sonuc.append({
            "rozet_kodu": r.rozet_kodu,
            "rozet_adi": r.rozet_adi,
            "aciklama": r.aciklama,
            "emoji": r.emoji,
            "kazanildi_mi": kazanildi_mi,
            "kazanilma_tarihi": kazanilan_dict[r.rozet_id].isoformat() if kazanildi_mi and kazanilan_dict[r.rozet_id] else None
        })
        
    return sonuc

@app.post("/kullanici")
def kullanici_olustur(istek: KullaniciOlustur, db: Session = Depends(get_db)):
    """Onboarding sonunda çağrılır. Kullanıcıyı oluşturur, onboarding_tamamlandi = True."""
    mevcut = db.query(Kullanici).filter(Kullanici.cihaz_id == istek.cihaz_id).first()
    if mevcut:
        mevcut.isim = istek.isim
        mevcut.yas = istek.yas
        mevcut.cinsiyet = istek.cinsiyet
        mevcut.cilt_tipi = istek.cilt_tipi
        mevcut.cilt_sorunlari = istek.cilt_sorunlari
        mevcut.onboarding_tamamlandi = True
        db.commit()
        db.refresh(mevcut)
        return {
            "kullanici_id": mevcut.kullanici_id,
            "cihaz_id": mevcut.cihaz_id,
            "isim": mevcut.isim,
            "yas": mevcut.yas,
            "cinsiyet": mevcut.cinsiyet,
            "cilt_tipi": mevcut.cilt_tipi,
            "cilt_sorunlari": mevcut.cilt_sorunlari,
            "onboarding_tamamlandi": mevcut.onboarding_tamamlandi,
        }

    yeni = Kullanici(
        cihaz_id=istek.cihaz_id,
        isim=istek.isim,
        yas=istek.yas,
        cinsiyet=istek.cinsiyet,
        cilt_tipi=istek.cilt_tipi,
        cilt_sorunlari=istek.cilt_sorunlari,
        onboarding_tamamlandi=True,
    )
    db.add(yeni)
    db.commit()
    db.refresh(yeni)
    return {
        "kullanici_id": yeni.kullanici_id,
        "cihaz_id": yeni.cihaz_id,
        "isim": yeni.isim,
        "yas": yeni.yas,
        "cinsiyet": yeni.cinsiyet,
        "cilt_tipi": yeni.cilt_tipi,
        "cilt_sorunlari": yeni.cilt_sorunlari,
        "onboarding_tamamlandi": yeni.onboarding_tamamlandi,
    }


@app.get("/kullanici/cihaz/{cihaz_id}")
def kullanici_getir_cihaz(cihaz_id: str, db: Session = Depends(get_db)):
    """Cihaz ID'ye göre kullanıcı bilgisini döner. Bulunamazsa 404."""
    kullanici = db.query(Kullanici).filter(Kullanici.cihaz_id == cihaz_id).first()
    if not kullanici:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    return {
        "kullanici_id": kullanici.kullanici_id,
        "cihaz_id": kullanici.cihaz_id,
        "isim": kullanici.isim,
        "cilt_tipi": kullanici.cilt_tipi,
        "cilt_sorunlari": kullanici.cilt_sorunlari,
        "onboarding_tamamlandi": kullanici.onboarding_tamamlandi,
    }


@app.get("/kullanici/{kullanici_id}")
def kullanici_getir(kullanici_id: int, db: Session = Depends(get_db)):
    """Kullanıcı ID'ye göre kullanıcı bilgisini döner. Bulunamazsa 404."""
    kullanici = db.query(Kullanici).filter(Kullanici.kullanici_id == kullanici_id).first()
    if not kullanici:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    return {
        "kullanici_id": kullanici.kullanici_id,
        "cihaz_id": kullanici.cihaz_id,
        "isim": kullanici.isim,
        "yas": kullanici.yas,
        "cinsiyet": kullanici.cinsiyet,
        "cilt_tipi": kullanici.cilt_tipi,
        "cilt_sorunlari": kullanici.cilt_sorunlari,
        "onboarding_tamamlandi": kullanici.onboarding_tamamlandi,
    }


@app.put("/kullanici/{kullanici_id}")
def kullanici_guncelle(kullanici_id: int, istek: KullaniciGuncelle, db: Session = Depends(get_db)):
    """Profil ekranından kullanıcı bilgilerini günceller."""
    kullanici = db.query(Kullanici).filter(Kullanici.kullanici_id == kullanici_id).first()
    if not kullanici:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    if istek.isim is not None:
        kullanici.isim = istek.isim
    if istek.yas is not None:
        kullanici.yas = istek.yas
    if istek.cinsiyet is not None:
        kullanici.cinsiyet = istek.cinsiyet
    if istek.cilt_tipi is not None:
        kullanici.cilt_tipi = istek.cilt_tipi
    if istek.cilt_sorunlari is not None:
        kullanici.cilt_sorunlari = istek.cilt_sorunlari

    db.commit()
    db.refresh(kullanici)
    return {
        "kullanici_id": kullanici.kullanici_id,
        "isim": kullanici.isim,
        "yas": kullanici.yas,
        "cinsiyet": kullanici.cinsiyet,
        "cilt_tipi": kullanici.cilt_tipi,
        "cilt_sorunlari": kullanici.cilt_sorunlari,
        "onboarding_tamamlandi": kullanici.onboarding_tamamlandi,
    }

# ─── Analiz Endpoint'i ────────────────────────────────────────────────────────

@app.post("/analiz")
def analiz_yap(istek: AnalizIstek, db: Session = Depends(get_db)):
    if len(istek.urun_idler) < 2:
        raise HTTPException(status_code=400, detail="Analiz için en az 2 farklı ürün seçmelisiniz.")

    # Kullanıcı kişiselleştirme verisini çek (varsa)
    cilt_tipi = None
    cilt_sorunlari = None
    yas = None
    if istek.kullanici_id:
        kullanici = db.query(Kullanici).filter(Kullanici.kullanici_id == istek.kullanici_id).first()
        if kullanici:
            cilt_tipi = kullanici.cilt_tipi
            cilt_sorunlari = kullanici.cilt_sorunlari
            yas = kullanici.yas

    urun_icerik_satirlari = db.query(UrunIcerik).filter(UrunIcerik.urun_id.in_(istek.urun_idler)).all()

    if not urun_icerik_satirlari:
        return {"mesaj": "Seçilen ürünlere ait içerik bulunamadı."}

    icerik_idler = [satir.icerik_id for satir in urun_icerik_satirlari]
    tekil_icerik_idler = set(icerik_idler)
    kombinasyonlar = list(combinations(tekil_icerik_idler, 2))

    # icerik_id → icerik kaydı eşlemesi (hem çakışma hem tekli öneri için)
    icerik_kayitlari = db.query(Icerik).filter(Icerik.icerik_id.in_(tekil_icerik_idler)).all()
    icerik_map = {i.icerik_id: i for i in icerik_kayitlari}
    icerik_adi_map = {i.icerik_id: i.icerik_adi for i in icerik_kayitlari}
    
    # Tüm içerikler için renk değerini önbellekle
    renk_map = {i_id: hesapla_icerik_rengi(i_obj, db) for i_id, i_obj in icerik_map.items()}

    # ─ Çakışma ve Sinerji analizi ─
    bulunan_cakismalar = []
    bulunan_sinerjiler = []

    for kombinasyon in kombinasyonlar:
        id1, id2 = kombinasyon
        
        cakisma = db.query(Cakisma).filter(
            ((Cakisma.icerik_id_1 == id1) & (Cakisma.icerik_id_2 == id2)) |
            ((Cakisma.icerik_id_1 == id2) & (Cakisma.icerik_id_2 == id1))
        ).first()

        if cakisma is not None:
            ai_yanit = ai_cakisma_analiz_et(
                aciklama=cakisma.aciklama,
                icerik_1_id=id1,
                icerik_2_id=id2,
                icerik_adlari=[icerik_adi_map[id1], icerik_adi_map[id2]],
                cilt_tipi=cilt_tipi,
                cilt_sorunlari=cilt_sorunlari,
                yas=yas,
            )
            bulunan_cakismalar.append({
                "icerik_1_id": id1,
                "icerik_1_adi": icerik_adi_map[id1],
                "icerik_1_renk": renk_map[id1],
                "icerik_2_id": id2,
                "icerik_2_adi": icerik_adi_map[id2],
                "icerik_2_renk": renk_map[id2],
                "aciklama": cakisma.aciklama,
                "oneri": ai_yanit["oneri"],
                "program": ai_yanit["program"],
                "kaynak": cakisma.kaynak,
                "kaynak_url": cakisma.kaynak_url,
                "risk_seviyesi": "Yuksek"
            })
        else:
            # Çakışma yoksa, sinerji var mı kontrol et
            sinerji = db.query(Sinerji).filter(
                ((Sinerji.icerik_id_1 == id1) & (Sinerji.icerik_id_2 == id2)) |
                ((Sinerji.icerik_id_1 == id2) & (Sinerji.icerik_id_2 == id1))
            ).first()

            if sinerji is not None:
                ai_yanit = ai_sinerji_analiz_et(
                    aciklama=sinerji.aciklama,
                    icerik_1_id=id1,
                    icerik_2_id=id2,
                    cilt_tipi=cilt_tipi,
                    cilt_sorunlari=cilt_sorunlari,
                )
                
                bulunan_sinerjiler.append({
                    "icerik_1_id": id1,
                    "icerik_1_adi": icerik_adi_map[id1],
                    "icerik_1_renk": renk_map[id1],
                    "icerik_2_id": id2,
                    "icerik_2_adi": icerik_adi_map[id2],
                    "icerik_2_renk": renk_map[id2],
                    "aciklama": sinerji.aciklama,
                    "oneri": ai_yanit["oneri"],
                    "program": ai_yanit["program"],
                    "kaynak": sinerji.kaynak,
                    "kaynak_url": sinerji.kaynak_url,
                    "sinerji_puani": 5
                })

    # ─ Tekli öneriler (sadece cilt_sorunlari varsa) ─
    tekli_oneriler = []

    if cilt_sorunlari:
        gecerli_icerikler = []
        for i_id in tekil_icerik_idler:
            icerik_obj = icerik_map[i_id]
            if gecerli_aktif_madde_mi(icerik_obj.icerik_adi, icerik_obj.dogrulanmis_mi):
                gecerli_icerikler.append(icerik_obj.icerik_adi)
                
        if gecerli_icerikler:
            sonuc = konsolide_oneri_al(gecerli_icerikler, cilt_sorunlari)
            if sonuc:
                tekli_oneriler.append({
                    "icerik_id": -1,
                    "icerik_adi": "Genel Cilt Bakım Önerisi",
                    "renk": "gray",
                    "uygun": True,
                    "oneri": sonuc.get("oneri"),
                    "program": sonuc.get("program")
                })

    # ─ Geçmişe kaydet (kullanici_id varsa) ─
    if istek.kullanici_id:
        gecmis_kaydi = AnalizGecmisi(
            kullanici_id=istek.kullanici_id,
            urun_idler=istek.urun_idler,
            cakisma_sayisi=len(bulunan_cakismalar),
        )
        db.add(gecmis_kaydi)
        db.commit()

    return {
        "analiz_edilen_icerik_sayisi": len(tekil_icerik_idler),
        "bulunan_cakisma_sayisi": len(bulunan_cakismalar),
        "cakismalar": bulunan_cakismalar,
        "sinerjiler": bulunan_sinerjiler,
        "tekli_oneriler": tekli_oneriler,
        "uyari": "Dermo-AI sonuçları algoritmik analizdir, kapsamlı tıbbi bir veritabanı değildir ve tıbbi tavsiye yerine geçmez.",
    }

# ─── Geçmiş Endpoint'i ───────────────────────────────────────────────────────

@app.get("/gecmis/{kullanici_id}")
def gecmis_getir(kullanici_id: int, db: Session = Depends(get_db)):
    """Kullanıcının analiz geçmişini en yeniden en eskiye döner."""
    kayitlar = (
        db.query(AnalizGecmisi)
        .filter(AnalizGecmisi.kullanici_id == kullanici_id)
        .order_by(AnalizGecmisi.olusturma_tarihi.desc())
        .all()
    )

    sonuc = []
    for kayit in kayitlar:
        urunler = db.query(Urun).filter(Urun.urun_id.in_(kayit.urun_idler)).all()
        urunler_data = [
            {"marka": u.marka, "urun_adi": u.urun_adi, "gorsel_url": u.gorsel_url}
            for u in urunler
        ]

        sonuc.append({
            "analiz_id": kayit.analiz_id,
            "urunler": urunler_data,
            "cakisma_sayisi": kayit.cakisma_sayisi,
            "olusturma_tarihi": kayit.olusturma_tarihi.isoformat() if kayit.olusturma_tarihi else None,
        })

    return sonuc

# ─── Rutin Endpoint'leri ─────────────────────────────────────────────────────

@app.post("/rutin")
def rutin_olustur(istek: RutinOlustur, db: Session = Depends(get_db)):
    """Kullanıcının rutinine yeni bir içerik ekler."""
    gecerli_gunler = [g for g in istek.gunler if g in GECERLI_GUNLER]
    if not gecerli_gunler:
        raise HTTPException(status_code=400, detail="Geçerli gün belirtilmedi.")
    if istek.zaman_dilimi not in GECERLI_ZAMANLAR:
        raise HTTPException(status_code=400, detail=f"Geçerli zaman dilimi: {GECERLI_ZAMANLAR}")

    yeni = Rutin(
        kullanici_id=istek.kullanici_id,
        icerik_id=istek.icerik_id,
        serbest_urun_adi=istek.serbest_urun_adi,
        gunler=gecerli_gunler,
        zaman_dilimi=istek.zaman_dilimi,
        aktif=True,
    )
    db.add(yeni)
    db.commit()
    db.refresh(yeni)

    return {
        "rutin_id": yeni.rutin_id,
        "kullanici_id": yeni.kullanici_id,
        "icerik_id": yeni.icerik_id,
        "gunler": yeni.gunler,
        "zaman_dilimi": yeni.zaman_dilimi,
        "aktif": yeni.aktif,
        "olusturma_tarihi": yeni.olusturma_tarihi.isoformat() if yeni.olusturma_tarihi else None,
    }


@app.post("/rutinler/manuel-ekle")
def manuel_rutin_ekle(istek: ManuelRutinEkleIstek, db: Session = Depends(get_db)):
    """Kural tabanlı manuel içerik ekleme ve çakışma kontrolü."""
    gecerli_gunler = [g for g in istek.gunler if g in GECERLI_GUNLER]
    if not gecerli_gunler:
        raise HTTPException(status_code=400, detail="Geçerli gün belirtilmedi.")
    if istek.zaman_dilimi not in GECERLI_ZAMANLAR:
        raise HTTPException(status_code=400, detail=f"Geçerli zaman dilimi: {GECERLI_ZAMANLAR}")

    eklenecek_icerik = db.query(Icerik).filter(Icerik.icerik_id == istek.icerik_id).first()
    if not eklenecek_icerik:
        raise HTTPException(status_code=404, detail="İçerik bulunamadı")

    komedojenite_uyarisi = False
    if eklenecek_icerik.komedojenite_puani is not None and eklenecek_icerik.komedojenite_puani >= 3:
        komedojenite_uyarisi = True

    dikkatli_kullan_notlari = []
    
    # Tüm aktif rutinlerle karşılaştırma yap (her durumda, çünkü dikkat notlarını uyarı yoksa da döneceğiz)
    aktif_rutinler = db.query(Rutin).filter(
        Rutin.kullanici_id == istek.kullanici_id, 
        Rutin.aktif == True
    ).all()
    mevcut_icerik_idler = [r.icerik_id for r in aktif_rutinler]
    
    bulunan_engelleyici_cakismalar = []
    for m_id in mevcut_icerik_idler:
        cakisma = db.query(Cakisma).filter(
            ((Cakisma.icerik_id_1 == istek.icerik_id) & (Cakisma.icerik_id_2 == m_id)) |
            ((Cakisma.icerik_id_1 == m_id) & (Cakisma.icerik_id_2 == istek.icerik_id))
        ).first()
        if cakisma:
            diger_icerik = db.query(Icerik).filter(Icerik.icerik_id == m_id).first()
            icerik_adi = diger_icerik.icerik_adi if diger_icerik else f"İçerik #{m_id}"
            if getattr(cakisma, "iliski_tipi", "engelleyici") == "dikkatli_kullan":
                dikkatli_kullan_notlari.append({
                    "icerik_adi": icerik_adi,
                    "kosul_notu": getattr(cakisma, "kosul_notu", None) or cakisma.aciklama
                })
            else:
                bulunan_engelleyici_cakismalar.append({
                    "icerik_id": m_id,
                    "icerik_adi": icerik_adi,
                    "aciklama": cakisma.aciklama
                })

    # Eğer onay verilmemişse sadece engelleyici çakışmaları ve komedojeniteyi kontrol et
    if not istek.onay:
        if bulunan_engelleyici_cakismalar:
            return {
                "uyari": True,
                "cakismalar": bulunan_engelleyici_cakismalar,
                "komedojenite_uyarisi": komedojenite_uyarisi,
                "mesaj": "Çakışma bulundu."
            }
        
        if komedojenite_uyarisi:
            return {
                "uyari": True,
                "cakismalar": [],
                "komedojenite_uyarisi": True,
                "mesaj": "Komedojenik risk."
            }

    # Çakışma yoksa veya kullanıcı onay verdiyse ekle
    yeni = Rutin(
        kullanici_id=istek.kullanici_id,
        icerik_id=istek.icerik_id,
        gunler=gecerli_gunler,
        zaman_dilimi=istek.zaman_dilimi,
        aktif=True,
    )
    db.add(yeni)
    db.commit()
    db.refresh(yeni)

    yeni_rozet = rozet_kontrol_ve_ver(istek.kullanici_id, "ilk_adim", db)

    return {
        "uyari": False,
        "rutin_id": yeni.rutin_id,
        "icerik_id": yeni.icerik_id,
        "gunler": yeni.gunler,
        "zaman_dilimi": yeni.zaman_dilimi,
        "aktif": yeni.aktif,
        "dikkatli_kullan_notlari": dikkatli_kullan_notlari,
        "yeni_rozet_kazanildi": yeni_rozet
    }

@app.post("/rutinler/serbest-ekle")
def serbest_rutin_ekle(istek: ManuelSerbestEkleIstek, db: Session = Depends(get_db)):
    """Kullanıcının kendi girdiği analiz kapsamı dışındaki serbest ürünleri rutine ekler."""
    gecerli_gunler = [g for g in istek.gunler if g in GECERLI_GUNLER]
    if not gecerli_gunler:
        raise HTTPException(status_code=400, detail="Geçerli gün belirtilmedi.")
    if istek.zaman_dilimi not in GECERLI_ZAMANLAR:
        raise HTTPException(status_code=400, detail="Geçerli bir zaman dilimi seçin.")

    yeni = Rutin(
        kullanici_id=istek.kullanici_id,
        icerik_id=None,
        serbest_urun_adi=istek.serbest_urun_adi,
        kapsam_disi=True,
        gunler=gecerli_gunler,
        zaman_dilimi=istek.zaman_dilimi,
        aktif=True
    )
    db.add(yeni)
    db.commit()
    db.refresh(yeni)

    yeni_rozet = rozet_kontrol_ve_ver(istek.kullanici_id, "ilk_adim", db)

    return {
        "uyari": False,
        "rutin_id": yeni.rutin_id,
        "icerik_id": None,
        "serbest_urun_adi": yeni.serbest_urun_adi,
        "kapsam_disi": True,
        "gunler": yeni.gunler,
        "zaman_dilimi": yeni.zaman_dilimi,
        "aktif": yeni.aktif,
        "yeni_rozet_kazanildi": yeni_rozet
    }

@app.get("/rutin/{kullanici_id}")
def rutin_getir(kullanici_id: int, db: Session = Depends(get_db)):
    """Kullanıcının aktif rutinlerini içerik adlarıyla birlikte döner."""
    rutinler = (
        db.query(Rutin)
        .filter(Rutin.kullanici_id == kullanici_id, Rutin.aktif == True)
        .order_by(Rutin.olusturma_tarihi.asc())
        .all()
    )

    sonuc = []
    for rutin in rutinler:
        if rutin.kapsam_disi:
            icerik_adi = rutin.serbest_urun_adi
            kullanim_talimati = None
        else:
            icerik = db.query(Icerik).filter(Icerik.icerik_id == rutin.icerik_id).first()
            icerik_adi = icerik.icerik_adi if icerik else f"İçerik #{rutin.icerik_id}"
            kullanim_talimati = icerik.kullanim_talimati if icerik else None

        sonuc.append({
            "rutin_id": rutin.rutin_id,
            "icerik_id": rutin.icerik_id,
            "icerik_adi": icerik_adi,
            "kapsam_disi": rutin.kapsam_disi,
            "gunler": rutin.gunler,
            "zaman_dilimi": rutin.zaman_dilimi,
            "olusturma_tarihi": rutin.olusturma_tarihi.isoformat() if rutin.olusturma_tarihi else None,
            "kullanim_talimati": kullanim_talimati
        })

    return sonuc


@app.delete("/rutin/{rutin_id}")
def rutin_sil(rutin_id: int, db: Session = Depends(get_db)):
    """Rutini soft-delete yapar (aktif = false). Geçmiş kaybolmaz."""
    rutin = db.query(Rutin).filter(Rutin.rutin_id == rutin_id).first()
    if not rutin:
        raise HTTPException(status_code=404, detail="Rutin bulunamadı.")

    rutin.aktif = False
    db.commit()
    return {"mesaj": "Rutin kaldırıldı.", "rutin_id": rutin_id}


# ─── Gamification Endpoint'leri ──────────────────────────────────────────────

from sqlalchemy.exc import IntegrityError

@app.post("/rutin-kayit")
def rutin_kayit_olustur(istek: RutinKayitIstek, db: Session = Depends(get_db)):
    """Kullanıcının rutini yaptığını kaydeder. Zaten işaretliyse 200 döner."""
    try:
        tarih_obj = datetime.strptime(istek.tarih, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Tarih formatı geçersiz, YYYY-MM-DD bekleniyor.")

    yeni_kayit = RutinKaydi(
        rutin_id=istek.rutin_id,
        tarih=tarih_obj
    )
    
    try:
        db.add(yeni_kayit)
        db.commit()
    except IntegrityError:
        db.rollback()
        return {"mesaj": "Bugün zaten işaretlenmiş."}

    return {"mesaj": "Rutin başarıyla işaretlendi."}

def rozet_hesapla(streak: int) -> dict | None:
    if streak >= 30: return {"emoji": "🏆", "ad": "30 Gün Ustası"}
    if streak >= 7: return {"emoji": "⭐", "ad": "7 Gün Kararlı"}
    if streak >= 3: return {"emoji": "🔥", "ad": "3 Gün Başlangıç"}
    return None

def sonraki_esik_hesapla(streak: int) -> int:
    if streak < 3: return 3
    if streak < 7: return 7
    if streak < 30: return 30
    return 30

@app.get("/streak/{kullanici_id}")
def streak_getir(kullanici_id: int, tarih: str = None, db: Session = Depends(get_db)):
    """Kullanıcının streak değerini hesaplar."""
    if tarih:
        try:
            bugun = datetime.strptime(tarih, "%Y-%m-%d").date()
        except ValueError:
            bugun = datetime.now().date()
    else:
        bugun = datetime.now().date()
        
    rutinler = db.query(Rutin).filter(Rutin.kullanici_id == kullanici_id, Rutin.aktif == True).all()
    if not rutinler:
        return {"streak_gun_sayisi": 0, "son_kayit_tarihi": None, "rozet": None, "sonraki_esik": 3}
        
    rutin_idler = [r.rutin_id for r in rutinler]
    kayit_tarihleri = db.query(RutinKaydi.tarih).filter(RutinKaydi.rutin_id.in_(rutin_idler)).distinct().all()
    tarih_seti = set(k[0] for k in kayit_tarihleri)
    
    if not tarih_seti:
        return {"streak_gun_sayisi": 0, "son_kayit_tarihi": None, "rozet": None, "sonraki_esik": 3}
    
    streak = 0
    kontrol = bugun
    if kontrol not in tarih_seti:
        if (kontrol - timedelta(days=1)) in tarih_seti:
            kontrol -= timedelta(days=1)
        else:
            return {"streak_gun_sayisi": 0, "son_kayit_tarihi": max(tarih_seti).isoformat(), "rozet": None, "sonraki_esik": 3}
            
    while kontrol in tarih_seti:
        streak += 1
        kontrol -= timedelta(days=1)

    son_kayit_tarihi = max(tarih_seti).isoformat()
    
    yeni_rozet = None
    if streak >= 30:
        yeni_rozet = rozet_kontrol_ve_ver(kullanici_id, "otuz_gun", db)
    elif streak >= 7:
        yeni_rozet = rozet_kontrol_ve_ver(kullanici_id, "yedi_gun", db)
        
    return {
        "streak_gun_sayisi": streak, 
        "son_kayit_tarihi": son_kayit_tarihi,
        "rozet": rozet_hesapla(streak),
        "sonraki_esik": sonraki_esik_hesapla(streak),
        "yeni_rozet_kazanildi": yeni_rozet
    }

# ─── Geri Bildirim Endpoint'leri ──────────────────────────────────────────────

@app.get("/geri-bildirim/gerekli-mi")
def geri_bildirim_gerekli_mi(kullanici_id: int, streak_gun_sayisi: int, db: Session = Depends(get_db)):
    if streak_gun_sayisi < 3:
        return {"sorulmali": False, "icerikler": []}
    elif streak_gun_sayisi < 7:
        gun_esigi = 3
    elif streak_gun_sayisi < 30:
        gun_esigi = 7
    else:
        gun_esigi = 30
        
    onceki = db.query(GeriBildirim).filter(
        GeriBildirim.kullanici_id == kullanici_id,
        GeriBildirim.gun_esigi == gun_esigi
    ).first()
    
    if onceki:
        return {"sorulmali": False, "icerikler": []}
        
    rutinler = db.query(Rutin).filter(Rutin.kullanici_id == kullanici_id, Rutin.aktif == True).all()
    if not rutinler:
        return {"sorulmali": False, "icerikler": []}
        
    icerikler = []
    for r in rutinler:
        icerik = db.query(Icerik).filter(Icerik.icerik_id == r.icerik_id).first()
        if icerik:
            icerikler.append({
                "icerik_id": icerik.icerik_id,
                "icerik_adi": icerik.icerik_adi
            })
            
    if not icerikler:
        return {"sorulmali": False, "icerikler": []}
        
    return {"sorulmali": True, "icerikler": icerikler, "gun_esigi": gun_esigi}

@app.post("/geri-bildirim", response_model=GeriBildirimYanit)
def geri_bildirim_olustur(istek: GeriBildirimOlustur, kullanici_id: int, db: Session = Depends(get_db)):
    yeni_bildirim = GeriBildirim(
        kullanici_id=kullanici_id,
        icerik_id=istek.icerik_id,
        gun_esigi=istek.gun_esigi,
        begeni=istek.begeni,
        not_metni=istek.not_metni
    )
    db.add(yeni_bildirim)
    
    oncelik = db.query(KullaniciOncelikPuani).filter(
        KullaniciOncelikPuani.kullanici_id == kullanici_id,
        KullaniciOncelikPuani.icerik_id == istek.icerik_id
    ).first()
    
    if not oncelik:
        oncelik = KullaniciOncelikPuani(
            kullanici_id=kullanici_id,
            icerik_id=istek.icerik_id,
            puan=5
        )
        db.add(oncelik)
        db.flush()
        
    if istek.begeni:
        oncelik.puan = min(oncelik.puan + 1, 10)
    else:
        oncelik.puan = max(oncelik.puan - 1, 1)
        
    db.commit()
    
    return {
        "id": yeni_bildirim.id,
        "yeni_puan": oncelik.puan,
        "mesaj": "Geri bildirim başarıyla kaydedildi."
    }

@app.post("/urun/barkod-sorgula")
def barkod_sorgula(sorgu: BarkodSorgu, db: Session = Depends(get_db)):
    print(f"\n--- YENİ BARKOD SORGUSU: {sorgu.barkod} ---")
    
    # 1. Yerel veritabanında ara
    yerel_urun = db.query(Urun).filter(Urun.barkod == sorgu.barkod).first()
    if yerel_urun:
        print("Sonuç: Yerel veritabanında bulundu.")
        icerik_baglari = db.query(UrunIcerik).filter(UrunIcerik.urun_id == yerel_urun.urun_id).all()
        icerik_idler = [b.icerik_id for b in icerik_baglari]
        icerikler = db.query(Icerik).filter(Icerik.icerik_id.in_(icerik_idler)).all()
        icerik_listesi = [{"icerik_id": i.icerik_id, "icerik_adi": i.icerik_adi} for i in icerikler]
        yeni_rozet = None
        if sorgu.kullanici_id:
            yeni_rozet = rozet_kontrol_ve_ver(sorgu.kullanici_id, "kasif", db)
            
        return {
            "bulundu": True,
            "kaynak": "yerel",
            "urun_id": yerel_urun.urun_id,
            "icerikler": icerik_listesi,
            "yeni_rozet_kazanildi": yeni_rozet
        }
    
    # 2. Open Beauty Facts API'sine sor
    print(f"Sonuç: Yerelde bulunamadı, Open Beauty Facts'e (OBF) gidiliyor... URL: https://world.openbeautyfacts.org/api/v2/product/{sorgu.barkod}.json")
    try:
        yanit = requests.get(f"https://world.openbeautyfacts.org/api/v2/product/{sorgu.barkod}.json", timeout=8)
        if yanit.status_code != 200:
            print(f"OBF Hatası: HTTP {yanit.status_code} döndü.")
            return {"bulundu": False, "hata": "API_ERROR"}
        
        veri = yanit.json()
        status = veri.get("status")
        print(f"OBF Yanıt Status: {status}")

        if status == 0:
            print("Sonuç: OBF veritabanında ürün BULUNAMADI (status=0).")
            return {"bulundu": False}
        
        product = veri.get("product", {})
        product_name = product.get("product_name", "Bilinmeyen Ürün")
        brands = product.get("brands", "Bilinmeyen Marka")
        ingredients_text = product.get("ingredients_text", "")
        
        if not ingredients_text:
            print("Sonuç: Ürün bulundu ama içerik listesi (ingredients_text) boş.")
            return {"bulundu": False, "mesaj": "İçerik listesi bulunamadı"}
            
        # 3. Ürünü DB'ye ekle
        yeni_urun = Urun(barkod=sorgu.barkod, marka=brands, urun_adi=product_name)
        db.add(yeni_urun)
        db.commit()
        db.refresh(yeni_urun)
        
        # 4. İçerikleri ayrıştır ve eşleştir
        inci_list = [i.strip() for i in ingredients_text.split(",") if i.strip()]
        eklenen_icerikler = []
        dogrulanmamis_sayisi = 0
        
        for inci_raw in inci_list:
            # SQLAlchemy StringDataRightTruncation hatasını önlemek için 100 karaktere kırpıyoruz
            inci = inci_raw[:97] + "..." if len(inci_raw) > 100 else inci_raw
            
            mevcut_icerik = db.query(Icerik).filter(Icerik.icerik_adi.ilike(inci)).first()
            if mevcut_icerik:
                eklenen_icerikler.append(mevcut_icerik)
            else:
                yeni_icerik = Icerik(
                    icerik_adi=inci,
                    baz_tipi="Bilinmiyor",
                    dogrulanmis_mi=False,
                    kaynak="Open Beauty Facts (topluluk verisi, doğrulanmamış)"
                )
                db.add(yeni_icerik)
                db.commit()
                db.refresh(yeni_icerik)
                eklenen_icerikler.append(yeni_icerik)
                dogrulanmamis_sayisi += 1
                
        # Ürün-İçerik ilişkilerini oluştur
        for icerik in eklenen_icerikler:
            bag = UrunIcerik(urun_id=yeni_urun.urun_id, icerik_id=icerik.icerik_id)
            db.add(bag)
        
        db.commit()
        
        icerik_listesi = [{"icerik_id": i.icerik_id, "icerik_adi": i.icerik_adi} for i in eklenen_icerikler]
        print(f"Sonuç: OBF'den ürün eklendi. Eklenen Doğrulanmamış İçerik Sayısı: {dogrulanmamis_sayisi}")
        
        yeni_rozet = None
        if sorgu.kullanici_id:
            yeni_rozet = rozet_kontrol_ve_ver(sorgu.kullanici_id, "kasif", db)
            
        return {
            "bulundu": True,
            "kaynak": "openbeautyfacts",
            "urun_id": yeni_urun.urun_id,
            "icerikler": icerik_listesi,
            "dogrulanmamis_icerik_sayisi": dogrulanmamis_sayisi,
            "urun_adi": product_name,
            "marka": brands,
            "yeni_rozet_kazanildi": yeni_rozet
        }
        
    except requests.exceptions.RequestException as e:
        # Timeout veya network hatası
        print(f"OBF İstek Hatası (Timeout/Network): {e}")
        return {"bulundu": False, "hata": "NETWORK_ERROR"}
def hesapla_rutin_saglik_skoru(icerik_idler, db):
    skor = 100
    cakisma_sayisi = 0
    sinerji_sayisi = 0
    detaylar = []

    # Benzersiz icerikleri alalım
    tum_icerikler = list(set(icerik_idler))

    for i in range(len(tum_icerikler)):
        for j in range(i + 1, len(tum_icerikler)):
            id1 = tum_icerikler[i]
            id2 = tum_icerikler[j]

            # Çakışma Kontrolü
            cakisma = db.query(Cakisma).filter(
                ((Cakisma.icerik_id_1 == id1) & (Cakisma.icerik_id_2 == id2)) |
                ((Cakisma.icerik_id_1 == id2) & (Cakisma.icerik_id_2 == id1))
            ).first()

            if cakisma:
                cakisma_sayisi += 1
                if cakisma.severity == 'high':
                    puan = -15
                elif cakisma.severity == 'low':
                    puan = -3
                else:  # medium
                    puan = -8

                skor += puan
                i1_isim = db.query(Icerik).filter(Icerik.icerik_id == id1).first().icerik_adi
                i2_isim = db.query(Icerik).filter(Icerik.icerik_id == id2).first().icerik_adi

                detaylar.append({
                    'tip': 'cakisma',
                    'icerik_1': i1_isim,
                    'icerik_2': i2_isim,
                    'severity': cakisma.severity,
                    'puan': puan,
                    'dogrulama_durumu': cakisma.dogrulama_durumu
                })

            # Sinerji Kontrolü
            sinerji = db.query(Sinerji).filter(
                ((Sinerji.icerik_id_1 == id1) & (Sinerji.icerik_id_2 == id2)) |
                ((Sinerji.icerik_id_1 == id2) & (Sinerji.icerik_id_2 == id1))
            ).first()

            if sinerji:
                sinerji_sayisi += 1
                skor += 5
                i1_isim = db.query(Icerik).filter(Icerik.icerik_id == id1).first().icerik_adi
                i2_isim = db.query(Icerik).filter(Icerik.icerik_id == id2).first().icerik_adi

                detaylar.append({
                    'tip': 'sinerji',
                    'icerik_1': i1_isim,
                    'icerik_2': i2_isim,
                    'puan': 5,
                    'dogrulama_durumu': sinerji.dogrulama_durumu
                })

    skor = max(0, min(100, skor))

    return {
        'skor': skor,
        'cakisma_sayisi': cakisma_sayisi,
        'sinerji_sayisi': sinerji_sayisi,
        'detaylar': detaylar
    }

def hesapla_skor_streak(kullanici_id: int, db: Session) -> int:
    from datetime import datetime, timedelta
    rutinler = db.query(Rutin).filter(Rutin.kullanici_id == kullanici_id).all()
    if not rutinler:
        return 0
    
    rutin_map = {r.rutin_id: r.icerik_id for r in rutinler}
    kayitlar = db.query(RutinKaydi).filter(RutinKaydi.rutin_id.in_(rutin_map.keys())).all()
    
    gunluk_icerikler = {}
    for k in kayitlar:
        if k.tarih not in gunluk_icerikler:
            gunluk_icerikler[k.tarih] = []
        gunluk_icerikler[k.tarih].append(rutin_map[k.rutin_id])
        
    tarih_seti = set(gunluk_icerikler.keys())
    if not tarih_seti:
        return 0
        
    bugun = datetime.now().date()
    kontrol = bugun
    
    if kontrol not in tarih_seti:
        if (kontrol - timedelta(days=1)) in tarih_seti:
            kontrol -= timedelta(days=1)
        else:
            return 0
            
    streak = 0
    while kontrol in tarih_seti:
        icerik_idler = gunluk_icerikler[kontrol]
        sonuc = hesapla_rutin_saglik_skoru(icerik_idler, db)
        if sonuc["skor"] >= 80:
            streak += 1
        else:
            break
        kontrol -= timedelta(days=1)
        
    return streak

@app.get('/api/routine/health-score/{kullanici_id}')
def get_routine_health_score(kullanici_id: int, db: Session = Depends(get_db)):
    rutinler = db.query(Rutin).filter(
        Rutin.kullanici_id == kullanici_id, 
        Rutin.aktif == True,
        Rutin.kapsam_disi == False
    ).all()
    icerik_idler = [r.icerik_id for r in rutinler if r.icerik_id is not None]
    sonuc = hesapla_rutin_saglik_skoru(icerik_idler, db)

    # Yeni Rozet Kontrolleri (Haftalık Denge & Aylık Disiplin)
    skor_streak = hesapla_skor_streak(kullanici_id, db)
    yeni_rozetler = []
    
    if skor_streak >= 7:
        yeni_rozet = rozet_kontrol_ve_ver(kullanici_id, 'haftalik_denge', db)
        if yeni_rozet:
            yeni_rozetler.append(yeni_rozet)
    
    if skor_streak >= 30:
        yeni_rozet = rozet_kontrol_ve_ver(kullanici_id, 'aylik_disiplin', db)
        if yeni_rozet:
            yeni_rozetler.append(yeni_rozet)
    
    if yeni_rozetler:
        sonuc["yeni_rozetler"] = yeni_rozetler

    # Hash the sorted ingredient IDs
    sorted_icerikler = sorted(list(set(icerik_idler)))
    rutin_hash_str = ",".join(map(str, sorted_icerikler))
    rutin_hash = hashlib.sha256(rutin_hash_str.encode()).hexdigest()

    # Check cache
    cache_entry = db.query(LlmAciklamaCache).filter(
        LlmAciklamaCache.kullanici_id == kullanici_id,
        LlmAciklamaCache.rutin_hash == rutin_hash
    ).first()

    if cache_entry:
        sonuc["llm_aciklama"] = cache_entry.aciklama_metni
        sonuc["genel_uyari"] = "AI tavsiyeleri tıbbi nitelik taşımaz."
        return sonuc

    # Prepare static fallback text
    fallback_text = []
    for d in sonuc["detaylar"]:
        # Fetching aciklama logic (since hesapla_rutin_saglik_skoru doesn't return aciklama, we can query it or construct it)
        pass # We will do a generic fallback if OpenAI fails
    
    if not sonuc["detaylar"]:
        fallback_metin = "Rutininizdeki ürünler arasında bilinen bir çakışma veya sinerji bulunamadı. Dengeli bir rutin kullanıyorsunuz."
    else:
        parts = []
        for d in sonuc["detaylar"]:
            if d['tip'] == 'cakisma':
                parts.append(f"{d['icerik_1']} ile {d['icerik_2']} arasında {d['severity']} riskli bir etkileşim var.")
            else:
                parts.append(f"{d['icerik_1']} ile {d['icerik_2']} birlikte harika çalışıyor.")
        fallback_metin = " ".join(parts)

    try:
        openai_key = os.getenv("OPENAI_API_KEY")
        if not openai_key:
            raise Exception("OPENAI_API_KEY missing")

        client = OpenAI(api_key=openai_key)
        
        system_prompt = "Sen bir dermatoloğun asistanısın. Kullanıcının günlük rutinini inceliyorsun. Sadece 2-3 cümlelik, çok KISA, özet bir tavsiye ver. Kesinlikle tıbbi tavsiye yerine geçmez, doktora danışın gibi uyarılar EKLEME, bunu biz UI'da sabit yazacağız. Nazik ve motive edici ol."
        user_prompt = "Rutin detaylarım:\n"
        for d in sonuc["detaylar"]:
            user_prompt += f"- {d['tip'].capitalize()}: {d['icerik_1']} ve {d['icerik_2']}. (Risk: {d.get('severity', 'yok')})\n"
            
        if not sonuc["detaylar"]:
             user_prompt += "Çakışma veya sinerji yok."

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7,
            max_tokens=200
        )
        llm_text = response.choices[0].message.content.strip()

        # Save to DB
        new_cache = LlmAciklamaCache(
            kullanici_id=kullanici_id,
            rutin_hash=rutin_hash,
            aciklama_metni=llm_text
        )
        db.add(new_cache)
        db.commit()

        sonuc["llm_aciklama"] = llm_text
    except Exception as e:
        print("LLM Error:", e)
        sonuc["llm_aciklama"] = fallback_metin

    sonuc["genel_uyari"] = "AI tavsiyeleri tıbbi nitelik taşımaz."
    return sonuc

@app.get("/kullanicilar/{kullanici_id}/haftalik-sadakat")
def haftalik_sadakat(kullanici_id: int, db: Session = Depends(get_db)):
    from datetime import date, timedelta
    
    bugun = date.today()
    pazartesi = bugun - timedelta(days=bugun.weekday())
    
    # Kullanıcının aktif olan tüm rutinleri (kapsam_disi dahil)
    rutinler = db.query(Rutin).filter(
        Rutin.kullanici_id == kullanici_id,
        Rutin.aktif == True
    ).all()
    
    if not rutinler:
        return {"yuzde": 0, "toplam_beklenen": 0, "toplam_tamamlanan": 0, "mesaj": "Henüz veri yok"}
        
    rutin_idler = [r.rutin_id for r in rutinler]
    
    # Bu haftanın rutin kayıtları
    kayitlar = db.query(RutinKaydi).filter(
        RutinKaydi.rutin_id.in_(rutin_idler),
        RutinKaydi.tarih >= pazartesi,
        RutinKaydi.tarih <= bugun
    ).all()
    
    # Hızlı arama için dict
    tamamlanan_dict = {}
    for k in kayitlar:
        tamamlanan_dict[(k.rutin_id, k.tarih)] = True

    toplam_beklenen = 0
    toplam_tamamlanan = 0
    
    for i in range((bugun - pazartesi).days + 1):
        gun_tarih = pazartesi + timedelta(days=i)
        gun_adi = GECERLI_GUNLER[gun_tarih.weekday()]
        
        for r in rutinler:
            # Sadece ilgili günde yapılması gereken ve o gün / daha öncesinde oluşturulmuş rutinleri say
            olusturma_date = r.olusturma_tarihi.date() if r.olusturma_tarihi else date.min
            if gun_adi in r.gunler and olusturma_date <= gun_tarih:
                toplam_beklenen += 1
                if (r.rutin_id, gun_tarih) in tamamlanan_dict:
                    toplam_tamamlanan += 1
                    
    if toplam_beklenen == 0:
        return {"yuzde": 0, "toplam_beklenen": 0, "toplam_tamamlanan": 0, "mesaj": "Henüz veri yok"}
        
    yuzde = int((toplam_tamamlanan / toplam_beklenen) * 100)
    yuzde = min(100, max(0, yuzde))
    
    if yuzde >= 80:
        mesaj = "Harikasın, bu hafta çok disiplinlisin! 🌟"
    elif yuzde >= 50:
        mesaj = "İyi gidiyorsun, devam et!"
    else:
        mesaj = "İvme kazanabilirsin, bugün bir adım at! 💪"
        
    return {
        "yuzde": yuzde,
        "toplam_beklenen": toplam_beklenen,
        "toplam_tamamlanan": toplam_tamamlanan,
        "mesaj": mesaj
    }
