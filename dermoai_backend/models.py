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
    kaynak_tipi = Column(String(50), nullable=True)
    son_gozden_gecirme_tarihi = Column(Date, nullable=True)
    dogrulanmis_mi = Column(Boolean, nullable=False, default=True)
    komedojenite_puani = Column(Integer, nullable=True)
    uyumlu_cilt_tipleri = Column(ARRAY(String), nullable=True)
    kullanim_talimati = Column(Text, nullable=True)

class Urun(Base):
    __tablename__ = "urunler"
    urun_id = Column(Integer, primary_key=True)
    marka = Column(String(50), nullable=False)
    urun_adi = Column(String(100), nullable=False)
    gorsel_url = Column(String, nullable=True)
    barkod = Column(String(50), unique=True, nullable=True)

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
    iliski_tipi = Column(String(50), default="engelleyici")
    kosul_notu = Column(Text)
    severity = Column(String(50), default="medium")
    dogrulama_durumu = Column(String(50), default="dogrulanmadi")

class Sinerji(Base):
    __tablename__ = "sinerjiler"
    icerik_id_1 = Column(Integer, ForeignKey("icerikler.icerik_id"), primary_key=True)
    icerik_id_2 = Column(Integer, ForeignKey("icerikler.icerik_id"), primary_key=True)
    aciklama = Column(Text)
    kaynak = Column(String(255))
    kaynak_url = Column(String(255))
    dogrulama_durumu = Column(String(50), default="dogrulanmadi")

class LlmAciklamaCache(Base):
    __tablename__ = "llm_aciklama_cache"
    id = Column(Integer, primary_key=True, index=True)
    kullanici_id = Column(Integer, nullable=False)
    rutin_hash = Column(String(64), nullable=False)
    aciklama_metni = Column(Text, nullable=False)
    olusturulma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

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
    hamilelik_modu_aktif = Column(Boolean, default=False)


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
    icerik_id        = Column(Integer, ForeignKey("icerikler.icerik_id"), nullable=True)
    serbest_urun_adi = Column(String(255), nullable=True)
    kapsam_disi      = Column(Boolean, default=False)
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

class GeriBildirim(Base):
    __tablename__ = "geri_bildirimler"
    id = Column(Integer, primary_key=True)
    kullanici_id = Column(Integer, ForeignKey("kullanicilar.kullanici_id"), nullable=False)
    icerik_id = Column(Integer, ForeignKey("icerikler.icerik_id"), nullable=False)
    gun_esigi = Column(Integer, nullable=False)
    begeni = Column(Boolean, nullable=False)
    not_metni = Column(String(500), nullable=True)
    llm_ile_islendi_mi = Column(Boolean, nullable=False, default=False)
    olusturma_tarihi = Column(DateTime, server_default=func.now(), nullable=False)

class KullaniciOncelikPuani(Base):
    __tablename__ = "kullanici_oncelik_puanlari"
    id = Column(Integer, primary_key=True)
    kullanici_id = Column(Integer, ForeignKey("kullanicilar.kullanici_id"), nullable=False)
    icerik_id = Column(Integer, ForeignKey("icerikler.icerik_id"), nullable=False)
    puan = Column(Integer, nullable=False, default=5)
    guncelleme_tarihi = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint('kullanici_id', 'icerik_id', name='_kullanici_icerik_uc'),)


class Rozet(Base):
    __tablename__ = "rozetler"
    rozet_id = Column(Integer, primary_key=True)
    rozet_kodu = Column(String(50), unique=True)
    rozet_adi = Column(String(100), nullable=False)
    aciklama = Column(Text)
    emoji = Column(String(10))


class KullaniciRozet(Base):
    __tablename__ = "kullanici_rozetleri"
    id = Column(Integer, primary_key=True)
    kullanici_id = Column(Integer, ForeignKey("kullanicilar.kullanici_id"))
    rozet_id = Column(Integer, ForeignKey("rozetler.rozet_id"))
    kazanilma_tarihi = Column(DateTime, server_default=func.now())
    
    __table_args__ = (UniqueConstraint('kullanici_id', 'rozet_id', name='_kullanici_rozet_uc'),)
