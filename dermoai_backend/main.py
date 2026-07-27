from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from typing import Optional
from database import SessionLocal
from models import Icerik, UrunIcerik, Cakisma, Urun, Kullanici, AnalizGecmisi, Rutin, Sinerji, RutinKaydi, GeriBildirim, KullaniciOncelikPuani
from itertools import combinations
from dotenv import load_dotenv
from openai import OpenAI
import os
import json
import requests
from datetime import datetime, timedelta

load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
print("KEY UZUNLUĞU:", len(api_key) if api_key else "KEY BULUNAMADI")
print("KEY BAŞI:", api_key[:15] if api_key else "YOK")
print("KEY SONU:", api_key[-10:] if api_key else "YOK")

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
    icerik_id: int
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

# ─── Veritabanı Bağımlılığı ───────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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


def tekli_oneri_al(
    icerik_id: int,
    icerik_adi: str,
    cilt_sorunlari: list,
) -> Optional[dict]:
    """
    Tek bir içerik için cilt sorunlarıyla uyumluluk değerlendirmesi ve rutin önerisi.
    Uygun değilse None döner. Uygunsa {"oneri": str, "program": {gunler, zaman_dilimi}} döner.
    """
    client = OpenAI(api_key=api_key)
    sorunlar_str = ", ".join(cilt_sorunlari)

    prompt = f"""Sen uzman bir kozmetik kimyageri ve cilt bakım formülatörüsünsün.

İncelenen içerik: {icerik_adi}
Kullanıcının cilt sorunları: {sorunlar_str}

GEÇERLİ GÜNLER (SADECE bunlardan seç): {GECERLI_GUNLER}
GEÇERLİ ZAMAN DİLİMLERİ (SADECE bunlardan seç): {GECERLI_ZAMANLAR}

Bu içerik kullanıcının cilt sorunlarından EN AZ BİRİNE uygunsa, kısa öneri ve program üret.
Uygun değilse "uygun": false döndür.

JSON formatında yanıt ver. Başka hiçbir şey yazma, sadece JSON:

{{
  "uygun": true,
  "oneri": "<2-3 cümle kısa öneri veya null>",
  "program": {{
    "gunler": ["<gün listesi>"],
    "zaman_dilimi": "<zaman dilimi>"
  }}
}}

KURALLAR:
- Aktif/eksfoliyan içerikler (retinol, AHA, BHA, C vitamini, glikolik asit vb.) → Akşam veya Gece, az sayıda gün.
- Nemlendirici/yatıştırıcı içerikler (hyalüronik asit, seramid, niasinamid, panthenol vb.) → Sabah veya Gece, daha sık.
- Günler SADECE geçerli listeden. Dozaj/yüzde/hafta sayısı ÜRETME.
- ❗ SAYISAL SIKLIK YASAĞI: oneri metninde "haftada X kez", "X günde bir" gibi ifade GEÇMESİN.
  Günlere atıfta bulunmak istersen SADECE "belirlenen program günlerinde" ifadesini kullan.
- Kullanıcının sorunu için gerçekten faydalı değilse uygun: false döndür."""

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
        print(f"tekli_oneri_al hata [{icerik_adi}]: {e}")
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
            "renk": renk
        })
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
        for i_id in tekil_icerik_idler:
            sonuc = tekli_oneri_al(
                icerik_id=i_id,
                icerik_adi=icerik_adi_map[i_id],
                cilt_sorunlari=cilt_sorunlari,
            )
            if sonuc:
                tekli_oneriler.append({
                    "icerik_id": i_id,
                    "icerik_adi": icerik_adi_map[i_id],
                    "renk": renk_map[i_id],
                    "uygun": sonuc["uygun"],
                    "oneri": sonuc.get("oneri"),
                    "program": sonuc.get("program")
                })

        if istek.kullanici_id:
            tekli_oneriler = puan_bazli_sirala(tekli_oneriler, db, istek.kullanici_id)

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

    # Eğer onay verilmemişse çakışmaları kontrol et
    if not istek.onay:
        aktif_rutinler = db.query(Rutin).filter(
            Rutin.kullanici_id == istek.kullanici_id, 
            Rutin.aktif == True
        ).all()
        mevcut_icerik_idler = [r.icerik_id for r in aktif_rutinler]
        
        bulunan_cakismalar = []
        for m_id in mevcut_icerik_idler:
            cakisma = db.query(Cakisma).filter(
                ((Cakisma.icerik_id_1 == istek.icerik_id) & (Cakisma.icerik_id_2 == m_id)) |
                ((Cakisma.icerik_id_1 == m_id) & (Cakisma.icerik_id_2 == istek.icerik_id))
            ).first()
            if cakisma:
                diger_icerik = db.query(Icerik).filter(Icerik.icerik_id == m_id).first()
                bulunan_cakismalar.append({
                    "icerik_id": m_id,
                    "icerik_adi": diger_icerik.icerik_adi if diger_icerik else f"İçerik #{m_id}",
                    "aciklama": cakisma.aciklama
                })

        if bulunan_cakismalar:
            return {
                "uyari": True,
                "cakismalar": bulunan_cakismalar,
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

    return {
        "uyari": False,
        "rutin_id": yeni.rutin_id,
        "icerik_id": yeni.icerik_id,
        "gunler": yeni.gunler,
        "zaman_dilimi": yeni.zaman_dilimi,
        "aktif": yeni.aktif
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
        icerik = db.query(Icerik).filter(Icerik.icerik_id == rutin.icerik_id).first()
        sonuc.append({
            "rutin_id": rutin.rutin_id,
            "icerik_id": rutin.icerik_id,
            "icerik_adi": icerik.icerik_adi if icerik else f"İçerik #{rutin.icerik_id}",
            "gunler": rutin.gunler,
            "zaman_dilimi": rutin.zaman_dilimi,
            "olusturma_tarihi": rutin.olusturma_tarihi.isoformat() if rutin.olusturma_tarihi else None,
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
    return {
        "streak_gun_sayisi": streak, 
        "son_kayit_tarihi": son_kayit_tarihi,
        "rozet": rozet_hesapla(streak),
        "sonraki_esik": sonraki_esik_hesapla(streak)
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
        return {
            "bulundu": True,
            "kaynak": "yerel",
            "urun_id": yerel_urun.urun_id,
            "icerikler": icerik_listesi
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
        
        for inci in inci_list:
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
        
        return {
            "bulundu": True,
            "kaynak": "openbeautyfacts",
            "urun_id": yeni_urun.urun_id,
            "icerikler": icerik_listesi,
            "dogrulanmamis_icerik_sayisi": dogrulanmamis_sayisi,
            "urun_adi": product_name,
            "marka": brands
        }
        
    except requests.exceptions.RequestException as e:
        # Timeout veya network hatası
        print(f"OBF İstek Hatası (Timeout/Network): {e}")
        return {"bulundu": False, "hata": "NETWORK_ERROR"}