from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    print("ROZETLER TABLOSU")
    res1 = conn.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'rozetler';"))
    for row in res1:
        print(row)

    print("\nKULLANICI_ROZETLERI TABLOSU")
    res2 = conn.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'kullanici_rozetleri';"))
    for row in res2:
        print(row)
