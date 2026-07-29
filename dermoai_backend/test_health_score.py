import pytest
from fastapi.testclient import TestClient
from main import app, hesapla_rutin_saglik_skoru
from unittest.mock import MagicMock
from models import Cakisma, Sinerji, Icerik

client = TestClient(app)

class MockIcerik:
    def __init__(self, adi):
        self.icerik_adi = adi

class MockCakisma:
    def __init__(self, severity, dogrulama_durumu='dogrulanmadi'):
        self.severity = severity
        self.dogrulama_durumu = dogrulama_durumu

class MockSinerji:
    def __init__(self, dogrulama_durumu='dogrulanmadi'):
        self.dogrulama_durumu = dogrulama_durumu

def test_health_score_calculation():
    mock_db = MagicMock()
    
    def mock_query(model):
        mock_filter = MagicMock()
        def filter_side_effect(*args, **kwargs):
            mock_first = MagicMock()
            if model == Cakisma:
                # Return a Cakisma for specific condition to test both
                mock_first.first.return_value = MockCakisma(severity='high')
            elif model == Sinerji:
                mock_first.first.return_value = MockSinerji()
            elif model == Icerik:
                mock_first.first.return_value = MockIcerik("Test Icerik")
            return mock_first
        
        mock_filter.filter.side_effect = filter_side_effect
        return mock_filter
        
    mock_db.query.side_effect = mock_query

    result = hesapla_rutin_saglik_skoru([1, 2], mock_db)
    
    # 100 - 15 (high cakisma) + 5 (sinerji) = 90
    assert result["skor"] == 90
    assert result["cakisma_sayisi"] == 1
    assert result["sinerji_sayisi"] == 1
    assert len(result["detaylar"]) == 2
    
    for detay in result["detaylar"]:
        assert "dogrulama_durumu" in detay
        assert detay["dogrulama_durumu"] == "dogrulanmadi"

def test_health_score_api():
    # Calling the actual endpoint for an existing user
    response = client.get("/api/routine/health-score/4")
    assert response.status_code == 200
    data = response.json()
    assert "skor" in data
    assert "cakisma_sayisi" in data
    assert "sinerji_sayisi" in data
    assert "detaylar" in data
    
    assert "genel_uyari" in data
    assert data["genel_uyari"] != ""
    assert isinstance(data["genel_uyari"], str)
    
    assert type(data["skor"]) == int
    assert 0 <= data["skor"] <= 100
    
    for d in data["detaylar"]:
        assert "dogrulama_durumu" in d
        # API veritabanı boşsa detaylar boş olabilir, boş değilse test et

from unittest.mock import patch, ANY

@patch("main.hesapla_rutin_saglik_skoru")
def test_health_score_api_excludes_kapsam_disi(mock_hesapla):
    mock_hesapla.return_value = {"skor": 100, "cakisma_sayisi": 0, "sinerji_sayisi": 0, "detaylar": []}
    
    # We patch the database query to return a mix of kapsam_disi and normal routines
    from models import Rutin
    mock_db = MagicMock()
    
    # Simüle edilmiş veritabanı kayıtları
    rutin_normal = Rutin(rutin_id=1, kullanici_id=999, icerik_id=10, kapsam_disi=False, aktif=True)
    rutin_serbest = Rutin(rutin_id=2, kullanici_id=999, icerik_id=None, kapsam_disi=True, aktif=True)
    
    def mock_query(model):
        mock_filter = MagicMock()
        def filter_return(*args, **kwargs):
            mock_all = MagicMock()
            # The API filters by kapsam_disi == False, so only rutin_normal should be returned
            mock_all.all.return_value = [rutin_normal]
            return mock_all
        mock_filter.filter.return_value = filter_return()
        return mock_filter
        
    mock_db.query.side_effect = mock_query

    # We bypass the dependency injection for this test or just test the logic directly
    from main import get_routine_health_score
    
    # get_routine_health_score expects (kullanici_id, db)
    # The actual implementation calls hesapla_skor_streak, rozet_kontrol_ve_ver and cache check. 
    # To keep the test simple and focused on the filtering, we mock them.
    with patch("main.hesapla_skor_streak", return_value=0), \
         patch("main.rozet_kontrol_ve_ver", return_value=None):
        result = get_routine_health_score(999, db=mock_db)
        
    # The important part is that hesapla_rutin_saglik_skoru is called with ONLY [10], excluding None from rutin_serbest
    mock_hesapla.assert_called_once_with([10], mock_db)


from unittest.mock import patch, ANY

@patch("main.hesapla_skor_streak")
@patch("main.rozet_kontrol_ve_ver")
def test_health_score_badges_7_days(mock_rozet_kontrol, mock_hesapla_skor_streak):
    mock_hesapla_skor_streak.return_value = 7
    mock_rozet_kontrol.return_value = {"rozet_kodu": "haftalik_denge"}
    
    response = client.get("/api/routine/health-score/4")
    assert response.status_code == 200
    data = response.json()
    
    mock_rozet_kontrol.assert_called_once_with(4, 'haftalik_denge', ANY)
    assert "yeni_rozetler" in data
    assert len(data["yeni_rozetler"]) == 1
    assert data["yeni_rozetler"][0]["rozet_kodu"] == "haftalik_denge"

@patch("main.hesapla_skor_streak")
@patch("main.rozet_kontrol_ve_ver")
def test_health_score_badges_30_days_gets_both(mock_rozet_kontrol, mock_hesapla_skor_streak):
    mock_hesapla_skor_streak.return_value = 30
    def side_effect(kullanici_id, rozet_kodu, db):
        if rozet_kodu == "haftalik_denge":
            return {"rozet_kodu": "haftalik_denge"}
        if rozet_kodu == "aylik_disiplin":
            return {"rozet_kodu": "aylik_disiplin"}
        return None
    mock_rozet_kontrol.side_effect = side_effect
    
    response = client.get("/api/routine/health-score/4")
    assert response.status_code == 200
    data = response.json()
    
    assert mock_rozet_kontrol.call_count == 2
    assert "yeni_rozetler" in data
    assert len(data["yeni_rozetler"]) == 2
    assert data["yeni_rozetler"][0]["rozet_kodu"] == "haftalik_denge"
    assert data["yeni_rozetler"][1]["rozet_kodu"] == "aylik_disiplin"

@patch("main.hesapla_skor_streak")
@patch("main.rozet_kontrol_ve_ver")
def test_health_score_badges_broken_streak(mock_rozet_kontrol, mock_hesapla_skor_streak):
    mock_hesapla_skor_streak.return_value = 5
    
    response = client.get("/api/routine/health-score/4")
    assert response.status_code == 200
    data = response.json()
    
    mock_rozet_kontrol.assert_not_called()
    assert "yeni_rozetler" not in data

@patch("main.hesapla_skor_streak")
@patch("main.rozet_kontrol_ve_ver")
def test_health_score_badges_already_earned(mock_rozet_kontrol, mock_hesapla_skor_streak):
    mock_hesapla_skor_streak.return_value = 30
    mock_rozet_kontrol.return_value = None
    
    response = client.get("/api/routine/health-score/4")
    assert response.status_code == 200
    data = response.json()
    
    assert mock_rozet_kontrol.call_count == 2
    assert "yeni_rozetler" not in data
