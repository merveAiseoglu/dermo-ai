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
    def __init__(self):
        pass

def test_health_score_calculation():
    mock_db = MagicMock()
    
    # Mocking db queries for a specific test case:
    # 2 items: 1 and 2
    # 1 conflict (high risk) between 1 and 2
    # No synergy
    
    def mock_query(model):
        mock_filter = MagicMock()
        def filter_side_effect(*args, **kwargs):
            mock_first = MagicMock()
            if model == Cakisma:
                mock_first.first.return_value = MockCakisma(severity='high')
            elif model == Sinerji:
                mock_first.first.return_value = None
            elif model == Icerik:
                mock_first.first.return_value = MockIcerik("Test Icerik")
            return mock_first
        
        mock_filter.filter.side_effect = filter_side_effect
        return mock_filter
        
    mock_db.query.side_effect = mock_query

    result = hesapla_rutin_saglik_skoru([1, 2], mock_db)
    
    # 100 - 15 = 85
    assert result["skor"] == 85
    assert result["cakisma_sayisi"] == 1
    assert result["sinerji_sayisi"] == 0
    assert len(result["detaylar"]) == 1
    assert result["detaylar"][0]["severity"] == "high"
    assert "dogrulama_durumu" in result["detaylar"][0]
    assert result["detaylar"][0]["dogrulama_durumu"] == "dogrulanmadi"

def test_health_score_api():
    # Calling the actual endpoint for an existing user
    # Note: Using user_id=4 which we know gives 100 right now based on our previous test
    response = client.get("/api/routine/health-score/4")
    assert response.status_code == 200
    data = response.json()
    assert "skor" in data
    assert "cakisma_sayisi" in data
    assert "sinerji_sayisi" in data
    assert "detaylar" in data
    assert "genel_uyari" in data
    assert data["genel_uyari"] != ""
    assert type(data["skor"]) == int
    assert 0 <= data["skor"] <= 100
    for d in data["detaylar"]:
        assert "dogrulama_durumu" in d
