#models.py
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from database import Base
# icerikler tablosunun Python/SQLAlchemy karşılığı (ORM Modeli)

class Icerik(Base):
    __tablename__ = "icerikler"
    icerik_id = Column(Integer, primary_key=True)
    icerik_adi = Column(String(100), nullable=False)
    baz_tipi = Column(String(50), nullable=False)
    hamilelikte_guvenli_mi = Column(Boolean)
    kaynak = Column(String(200))      # pgAdmin'deki kolonla eşleşti
    kaynak_url = Column(String)       # Text tipinin SQLAlchemy karşılığı

class Urun(Base):
    __tablename__ = "urunler"
    urun_id = Column(Integer, primary_key=True)
    marka = Column(String(50), nullable=False)
    urun_adi = Column(String(100), nullable=False)

class UrunIcerik(Base):
    __tablename__ = "urun_icerikleri"
    urun_id = Column(Integer, ForeignKey("urunler.urun_id"), primary_key=True)
    icerik_id = Column(Integer, ForeignKey("icerikler.icerik_id"), primary_key=True)

class Cakisma(Base):
    __tablename__ = "cakismalar"
    icerik_id_1 = Column(Integer, ForeignKey("icerikler.icerik_id"), primary_key=True)
    icerik_id_2 = Column(Integer, ForeignKey("icerikler.icerik_id"), primary_key=True)
    aciklama = Column(String(255))
    kaynak = Column(String(200))
    kaynak_url = Column(String)

class Kullanici(Base):
    __tablename__ = "kullanicilar"
    kullanici_id = Column(Integer, primary_key=True)
    isim = Column(String(50), nullable=False)
    yas = Column(Integer)
    cinsiyet = Column(String(20))
    cilt_tipi = Column(String(50))  # Örn: Kuru, Yağlı, Karma, Hassas
    temel_sorun = Column(String(100))  # Örn: Akne, Leke, Kırışıklık


