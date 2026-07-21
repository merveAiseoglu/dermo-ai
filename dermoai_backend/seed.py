from sqlalchemy.orm import Session
from database import engine
from models import Cakisma

def veri_bas():
    # 1. Veritabanı oturumunu aç
    with Session(engine) as session:
        # 2. Eklenecek 5/5 Güvenilirlikli Çakışma Verileri
        # Not: icerik_id'ler senin pgAdmin tablonla birebir eşleşmektedir.
        yeni_cakismalar = [
            Cakisma(
                icerik_id_1=1, # Retinol
                icerik_id_2=3, # Vitamin C (L-Ascorbic Acid)
                aciklama="Saf C vitamini düşük asidik ortam (pH 2.5-3.5) gerektirirken, retinol daha yüksek bir pH'ta (5.5-6.0) stabilize olur. Aynı anda kullanımları hem etkinliği düşürür hem de şiddetli iritasyon yapar."
            ),
            Cakisma(
                icerik_id_1=1, # Retinol
                icerik_id_2=5, # Glikolik Asit
                aciklama="Retinol hücre döngüsünü hızlandırır, AHA/BHA grubu asitler kimyasal eksfoliasyon yapar. Birlikte kullanımları cilt bariyerini doğrudan inceltir, kimyasal yanık riski yaratır."
            ),
            Cakisma(
                icerik_id_1=1, # Retinol
                icerik_id_2=7, # Benzoyl Peroxide
                aciklama="Benzoyl Peroxide çok güçlü bir oksidandır. Üst üste uygulandıklarında retinol moleküllerini okside ederek tamamen etkisiz hale getirir ve cildi aşırı kurutur."
            ),
            Cakisma(
                icerik_id_1=3, # Vitamin C (L-Ascorbic Acid)
                icerik_id_2=9, # Peptitler (Copper Peptides)
                aciklama="Bakır iyonları (Copper), saf C vitaminini çok hızlı bir şekilde okside eder. Bu reaksiyon C vitaminini anında bozarak cilde fayda sağlamadan yok olmasına neden olur."
            )
        ]

        # 3. Verileri ekle ve kaydet
        session.add_all(yeni_cakismalar)
        session.commit()
        print("Şahane! 5/5 Güvenilirlikli çakışma verileri veritabanına başarıyla eklendi! 🎉")

if __name__ == "__main__":
    veri_bas()