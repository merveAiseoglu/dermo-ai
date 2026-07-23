from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import SessionLocal
from models import Icerik, UrunIcerik, Cakisma, Urun, Kullanici, AnalizGecmisi, Rutin
from itertools import combinations
from dotenv import load_dotenv
from openai import OpenAI
import os
import json

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

class RutinOlustur(BaseModel):
    kullanici_id: int
    icerik_id: int
    gunler: list[str]
    zaman_dilimi: str

# ─── DB Bağımlılığı ───────────────────────────────────────────────────────────

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

# ─── Genel Endpoint'ler ───────────────────────────────────────────────────────

@app.get("/")
def ana_sayfa():
    return {"mesaj": "Merhaba Dermo-AI"}

@app.get("/icerikler")
def icerikleri_getir(db: Session = Depends(get_db)):
    icerikler = db.query(Icerik).all()
    return icerikler

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

    # ─ Çakışma analizi ─
    bulunan_cakismalar = []

    for kombinasyon in kombinasyonlar:
        icerik_1 = min(kombinasyon[0], kombinasyon[1])
        icerik_2 = max(kombinasyon[0], kombinasyon[1])

        cakisma = db.query(Cakisma).filter(
            Cakisma.icerik_id_1 == icerik_1,
            Cakisma.icerik_id_2 == icerik_2
        ).first()

        if cakisma is not None:
            ic1 = icerik_adi_map.get(icerik_1, f"İçerik #{icerik_1}")
            ic2 = icerik_adi_map.get(icerik_2, f"İçerik #{icerik_2}")

            ai_sonuc = ai_cakisma_analiz_et(
                aciklama=cakisma.aciklama,
                icerik_1_id=icerik_1,
                icerik_2_id=icerik_2,
                icerik_adlari=[ic1, ic2],
                cilt_tipi=cilt_tipi,
                cilt_sorunlari=cilt_sorunlari,
                yas=yas,
            )
            bulunan_cakismalar.append({
                "icerik_1_id": icerik_1,
                "icerik_2_id": icerik_2,
                "aciklama": cakisma.aciklama,
                "oneri": ai_sonuc["oneri"],
                "program": ai_sonuc["program"],
                "kaynak": cakisma.kaynak,
                "kaynak_url": cakisma.kaynak_url,
            })

    # ─ Tekli öneriler (sadece cilt_sorunlari varsa) ─
    tekli_oneriler = []

    if cilt_sorunlari:
        for icerik_id in tekil_icerik_idler:
            icerik_adi = icerik_adi_map.get(icerik_id, f"İçerik #{icerik_id}")
            sonuc = tekli_oneri_al(
                icerik_id=icerik_id,
                icerik_adi=icerik_adi,
                cilt_sorunlari=cilt_sorunlari,
            )
            if sonuc:
                icerik_obj = icerik_map.get(icerik_id)
                tekli_oneriler.append({
                    "icerik_id": icerik_id,
                    "icerik_adi": icerik_adi,
                    "oneri": sonuc["oneri"],
                    "program": sonuc["program"],
                    "kaynak": icerik_obj.kaynak if icerik_obj else None,
                    "kaynak_url": icerik_obj.kaynak_url if icerik_obj else None,
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