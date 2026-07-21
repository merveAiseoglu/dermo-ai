from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import SessionLocal
from models import Icerik, UrunIcerik, Cakisma, Urun
from itertools import combinations
from dotenv import load_dotenv
from openai import OpenAI
import os

load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
print("KEY UZUNLUĞU:", len(api_key) if api_key else "KEY BULUNAMADI")
print("KEY BAŞI:", api_key[:15] if api_key else "YOK")
print("KEY SONU:", api_key[-10:] if api_key else "YOK")

app = FastAPI()

class AnalizIstek(BaseModel):
    urun_idler: list[int]

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def ai_onerisi_al(aciklama):
    client = OpenAI(api_key=api_key)
    
    # GÜNCELLENMİŞ PROMPT: AI'ı çözüm üretmeye zorluyoruz
    prompt = f"""Sen uzman bir kozmetik kimyageri ve cilt bakım formülatörüsün.
Kullanıcı şu içerik çakışması uyarısını aldı: '{aciklama}'.

Kullanıcıya bu ürünleri güvenli şekilde birlikte kullanabilmesi için pratik bir 
rutin önerisi ver (örn. hangi sabah/akşam, hangi sırayla, ne kadar aralıkla).
Ayrıca cildi yatıştırmak için 1 destekleyici içerik öner (Seramid, Hyalüronik Asit, Centella vb.).

Eğer bu çakışma ciddi tahriş, kızarıklık, yanma veya alerjik reaksiyon riski taşıyorsa, 
bunu kısaca belirt ve böyle bir belirti görülürse bir cilt uzmanına danışılmasını öner.
Rutin öneriler için gereksiz yere 'doktora danışın' deme — sadece gerçek risk varsa söyle.

Yanıtın en fazla 3 cümle olsun, doğrudan uygulanabilir olsun."""
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}]
    )
    
    return response.choices[0].message.content

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

@app.post("/analiz")
def analiz_yap(istek: AnalizIstek, db: Session = Depends(get_db)):
    # YAMA 1: Hata Kontrolü - En az 2 ürün seçilmeli
    if len(istek.urun_idler) < 2:
        raise HTTPException(status_code=400, detail="Analiz için en az 2 farklı ürün seçmelisiniz.")

    urun_icerik_satirlari = db.query(UrunIcerik).filter(UrunIcerik.urun_id.in_(istek.urun_idler)).all()
    
    # Seçilen ürünlerin içi boşsa veya veritabanında yoksa
    if not urun_icerik_satirlari:
        return {"mesaj": "Seçilen ürünlere ait içerik bulunamadı."}
    
    icerik_idler = [satir.icerik_id for satir in urun_icerik_satirlari]
    tekil_icerik_idler = set(icerik_idler)
    
    kombinasyonlar = list(combinations(tekil_icerik_idler, 2))
    
    bulunan_cakismalar = []
    
    for kombinasyon in kombinasyonlar:
        # YAMA 2: Ters sıra problemini (1,2 vs 2,1) çözmek için her zaman küçük ID'yi başa alıyoruz
        icerik_1 = min(kombinasyon[0], kombinasyon[1])
        icerik_2 = max(kombinasyon[0], kombinasyon[1])
        
        cakisma = db.query(Cakisma).filter(
            Cakisma.icerik_id_1 == icerik_1,
            Cakisma.icerik_id_2 == icerik_2
        ).first()
        
        if cakisma is not None:
            # Senin eklediğin harika AI asistanı entegrasyonu
            ai_onerisi = ai_onerisi_al(cakisma.aciklama)
            bulunan_cakismalar.append({
                "icerik_1_id": icerik_1,
                "icerik_2_id": icerik_2,
                "aciklama": cakisma.aciklama,
                "oneri": ai_onerisi
            })
    
    # YAMA 3: Sonuçları sayılarla paketleme ve Hukuki Zırh (Disclaimer)
    return {
        "analiz_edilen_icerik_sayisi": len(tekil_icerik_idler),
        "bulunan_cakisma_sayisi": len(bulunan_cakismalar),
        "cakismalar": bulunan_cakismalar,
        "uyari": "Dermo-AI sonuçları algoritmik analizdir, kapsamlı tıbbi bir veritabanı değildir ve tıbbi tavsiye yerine geçmez."
    }