import sqlite3
import json

conn = sqlite3.connect('dermoai.db')
c = conn.cursor()
c.execute('UPDATE kullanicilar SET streak_gun_sayisi = 7 WHERE kullanici_id = 1')
conn.commit()
conn.close()
