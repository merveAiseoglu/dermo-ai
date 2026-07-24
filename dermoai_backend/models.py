#models.py
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, ARRAY, DateTime, Text, Date, UniqueConstraint
from sqlalchemy.sql import func
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
    gorsel_url = Column(String, nullable=True)

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

class Sinerji(Base):
    __tablename__ = "sinerjiler"
    icerik_id_1 = Column(Integer, ForeignKey("icerikler.icerik_id"), primary_key=True)
    icerik_id_2 = Column(Integer, ForeignKey("icerikler.icerik_id"), primary_key=True)
    aciklama = Column(Text)
    kaynak = Column(String(255))
    kaynak_url = Column(String(255))

class Kullanici(Base):
    __tablename__ = "kullanicilar"
    kullanici_id = Column(Integer, primary_key=True)
    isim = Column(String(50), nullable=False)
    yas = Column(Integer)
    cinsiyet = Column(String(20))
    cilt_tipi = Column(String(50))
    cihaz_id = Column(String(100), unique=True)
    cilt_sorunlari = Column(ARRAY(String))
    onboarding_tamamlandi = Column(Boolean, default=False)


class AnalizGecmisi(Base):
    __tablename__ = "analiz_gecmisi"
    analiz_id = Column(Integer, primary_key=True)
    kullanici_id = Column(Integer, ForeignKey("kullanicilar.kullanici_id"))
    urun_idler = Column(ARRAY(Integer))
    cakisma_sayisi = Column(Integer)
    olusturma_tarihi = Column(DateTime, server_default=func.now())


class Rutin(Base):
    __tablename__ = "rutinler"
    rutin_id         = Column(Integer, primary_key=True)
    kullanici_id     = Column(Integer, ForeignKey("kullanicilar.kullanici_id"))
    icerik_id        = Column(Integer, ForeignKey("icerikler.icerik_id"))
    gunler           = Column(ARRAY(String))
    zaman_dilimi     = Column(String(20))
    aktif            = Column(Boolean, default=True)
    olusturma_tarihi = Column(DateTime, server_default=func.now())

class RutinKaydi(Base):
    __tablename__ = "rutin_kayitlari"
    kayit_id = Column(Integer, primary_key=True)
    rutin_id = Column(Integer, ForeignKey("rutinler.rutin_id"))
    tarih = Column(Date, server_default=func.current_date())
    
    __table_args__ = (UniqueConstraint('rutin_id', 'tarih', name='_rutin_tarih_uc'),)
