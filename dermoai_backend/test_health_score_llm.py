import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from main import app, get_routine_health_score
import hashlib

client = TestClient(app)

# Dummy models
class DummyLlmCache:
    def __init__(self, aciklama_metni):
        self.aciklama_metni = aciklama_metni

class DummyRutin:
    def __init__(self, icerik_id):
        self.icerik_id = icerik_id

def test_cache_miss_llm_called_and_saved():
    with patch("main.SessionLocal") as mock_session, \
         patch("main.OpenAI") as mock_openai_cls, \
         patch("main.hesapla_rutin_saglik_skoru") as mock_hesapla, \
         patch("os.getenv") as mock_getenv:
        
        mock_getenv.return_value = "dummy_key"
        
        mock_db = MagicMock()
        mock_session.return_value = mock_db
        
        # Override Dependency
        app.dependency_overrides[get_routine_health_score] = lambda: mock_db
        
        # Mocking db queries
        # 1. db.query(Rutin) -> returns 2 items
        rutin_mock = MagicMock()
        rutin_mock.filter().all.return_value = [DummyRutin(1), DummyRutin(2)]
        
        # 2. db.query(LlmAciklamaCache) -> returns None (Cache empty)
        cache_mock = MagicMock()
        cache_mock.filter().first.return_value = None
        
        def query_side_effect(model):
            from models import Rutin, LlmAciklamaCache
            if model == Rutin:
                return rutin_mock
            elif model == LlmAciklamaCache:
                return cache_mock
            return MagicMock()
            
        mock_db.query.side_effect = query_side_effect
        
        # Mock hesapla
        mock_hesapla.return_value = {
            "skor": 85, "cakisma_sayisi": 1, "sinerji_sayisi": 0, 
            "detaylar": [{"tip": "cakisma", "icerik_1": "A", "icerik_2": "B", "severity": "high"}]
        }
        
        # Mock OpenAI
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "Bu çok iyi bir rutin değil, çakışma var."
        mock_client.chat.completions.create.return_value = mock_response
        
        response = client.get("/api/routine/health-score/99")
        assert response.status_code == 200
        data = response.json()
        
        assert data["llm_aciklama"] == "Bu çok iyi bir rutin değil, çakışma var."
        assert mock_client.chat.completions.create.called
        assert mock_db.add.called
        assert mock_db.commit.called

def test_cache_hit_llm_not_called():
    with patch("main.SessionLocal") as mock_session, \
         patch("main.OpenAI") as mock_openai_cls, \
         patch("main.hesapla_rutin_saglik_skoru") as mock_hesapla:
        
        mock_db = MagicMock()
        mock_session.return_value = mock_db
        
        rutin_mock = MagicMock()
        rutin_mock.filter().all.return_value = [DummyRutin(1), DummyRutin(2)]
        
        cache_mock = MagicMock()
        cache_mock.filter().first.return_value = DummyLlmCache("Cache'ten gelen açıklama")
        
        def query_side_effect(model):
            from models import Rutin, LlmAciklamaCache
            if model == Rutin:
                return rutin_mock
            elif model == LlmAciklamaCache:
                return cache_mock
            return MagicMock()
            
        mock_db.query.side_effect = query_side_effect
        
        mock_hesapla.return_value = {
            "skor": 85, "cakisma_sayisi": 1, "sinerji_sayisi": 0, 
            "detaylar": [{"tip": "cakisma", "icerik_1": "A", "icerik_2": "B", "severity": "high"}]
        }
        
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        
        response = client.get("/api/routine/health-score/99")
        assert response.status_code == 200
        data = response.json()
        
        assert data["llm_aciklama"] == "Cache'ten gelen açıklama"
        assert not mock_client.chat.completions.create.called

def test_openai_fallback_on_error():
    with patch("main.SessionLocal") as mock_session, \
         patch("main.OpenAI") as mock_openai_cls, \
         patch("main.hesapla_rutin_saglik_skoru") as mock_hesapla, \
         patch("os.getenv") as mock_getenv:
        
        mock_getenv.return_value = "dummy_key"
        
        mock_db = MagicMock()
        mock_session.return_value = mock_db
        
        rutin_mock = MagicMock()
        rutin_mock.filter().all.return_value = [DummyRutin(1), DummyRutin(2)]
        
        cache_mock = MagicMock()
        cache_mock.filter().first.return_value = None
        
        def query_side_effect(model):
            from models import Rutin, LlmAciklamaCache
            if model == Rutin:
                return rutin_mock
            elif model == LlmAciklamaCache:
                return cache_mock
            return MagicMock()
            
        mock_db.query.side_effect = query_side_effect
        
        mock_hesapla.return_value = {
            "skor": 85, "cakisma_sayisi": 1, "sinerji_sayisi": 0, 
            "detaylar": [{"tip": "cakisma", "icerik_1": "A", "icerik_2": "B", "severity": "high"}]
        }
        
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        # Fırlatılacak hata
        mock_client.chat.completions.create.side_effect = Exception("API Error")
        
        response = client.get("/api/routine/health-score/99")
        assert response.status_code == 200
        data = response.json()
        
        assert "A ile B arasında high riskli bir etkileşim var" in data["llm_aciklama"]
