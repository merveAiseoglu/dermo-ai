#database.py
# Bu dosya: Veritabanı bağlantısını (Engine) ve oturum (Session) mekanizmasını kurar
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# PostgreSQL'e bağlanmak için adres (kullanıcı, şifre, host, port, veritabanı adı)
# NOT: İleride bu satır .env dosyasına taşınacak 
DATABASE_URL = "postgresql://postgres:mrv6363@localhost:5432/dermoai_db"

# Bu adresi kullanarak, Python ile PostgreSQL arasında gerçek bağlantı hattını (motoru) oluşturur
engine = create_engine(DATABASE_URL)

# Her istek geldiğinde yeni bir "oturum" (session) üretebilen fabrika
# autocommit=False -> değişiklikler biz "commit" demeden kalıcı olmaz (güvenlik)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# models.py'da tablolarımızı Python class'ı olarak tanımlarken kullanacağımız temel şablon
Base = declarative_base()