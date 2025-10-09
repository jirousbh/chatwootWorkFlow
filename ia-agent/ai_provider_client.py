"""
Cliente genérico para provedores de IA baseado na tabela ia_providers
"""

import os
import requests
from typing import List, Dict, Optional
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine, text

class AIProviderClient:
    def __init__(self, database_url: str):
        """Inicializa o cliente com conexão ao banco de dados"""
        self.engine = create_engine(database_url)
        self.Session = sessionmaker(bind=self.engine)
    
    def get_provider(self, provider_name: str) -> Optional[Dict]:
        """Obtém um provedor pelo nome"""
        session = self.Session()
        try:
            result = session.execute(
                text("SELECT * FROM ia_providers WHERE name = :name AND is_active = true"),
                {"name": provider_name}
            ).fetchone()
            
            if result:
                return dict(result._mapping)
            return None
        finally:
            session.close()
    
    def get_active_providers(self) -> List[Dict]:
        """Obtém todos os provedores ativos"""
        session = self.Session()
        try:
            results = session.execute(
                text("SELECT * FROM ia_providers WHERE is_active = true")
            ).fetchall()
            
            return [dict(row._mapping) for row in results]
        finally:
            session.close()
    
    def get_api_key(self, provider: Dict) -> Optional[str]:
        """Obtém a API key do provedor diretamente do banco de dados"""
        return provider.get('api_key')
    
    def list_models(self, provider_name: str) -> List[Dict]:
        """Lista modelos disponíveis para um provedor"""
        provider = self.get_provider(provider_name)
        if not provider:
            return []
        
        api_key = self.get_api_key(provider)
        if not api_key:
            print(f"❌ API key não encontrada para {provider['display_name']}")
            return []
        
        try:
            headers = {
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            }
            
            # Endpoint para listar modelos (padrão OpenAI)
            models_url = f"{provider['api_base_url']}/models"
            
            response = requests.get(models_url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                # Filtrar modelos úteis para chat e análise de documentos
                useful_models = [
                    model for model in data.get('data', [])
                    if self._is_useful_model(model.get('id', ''), provider)
                ]
                
                # Adicionar informações úteis
                formatted_models = []
                for model in useful_models:
                    formatted_models.append({
                        'id': model['id'],
                        'name': model['id'],
                        'provider': provider['name'],
                        'display_provider': provider['display_name'],
                        'description': self._get_model_description(model['id'], provider),
                        'max_tokens': model.get('context_window', provider['max_tokens'])
                    })
                
                # Ordenar por prioridade (modelos mais rápidos primeiro)
                formatted_models.sort(key=lambda x: self._get_model_priority(x['id'], provider))
                
                return formatted_models
                
            else:
                print(f"❌ Erro ao listar modelos para {provider['display_name']}: {response.status_code}")
                return []
                
        except Exception as e:
            print(f"❌ Erro ao conectar com {provider['display_name']}: {e}")
            return []
    
    def _is_useful_model(self, model_id: str, provider: Dict) -> bool:
        """Verifica se o modelo é útil para chat e análise de documentos"""
        # Excluir modelos que não são úteis para chat
        exclude_patterns = [
            'whisper',        # Speech-to-text
            'playai-tts',     # Text-to-speech
            'llama-guard',    # Safety models
            'prompt-guard',   # Safety models
        ]
        
        # Verificar se deve ser excluído
        for exclude in exclude_patterns:
            if exclude in model_id.lower():
                return False
        
        # Incluir todos os outros modelos (são úteis para chat)
        return True
    
    def _get_model_priority(self, model_id: str, provider: Dict) -> int:
        """Define prioridade do modelo (menor número = maior prioridade)"""
        priority_map = {
            # Groq - modelos mais rápidos primeiro
            'llama-3.1-8b-instant': 1,
            'llama-3.1-70b-versatile': 2,
            'mixtral-8x7b-32768': 3,
            'gemma2-9b-it': 4,
            
            # OpenAI - modelos mais rápidos primeiro
            'gpt-3.5-turbo': 1,
            'gpt-4': 2,
            'gpt-4-turbo': 3,
            
            # Anthropic - modelos mais rápidos primeiro
            'claude-3-haiku-20240307': 1,
            'claude-3-sonnet-20240229': 2,
            'claude-3-opus-20240229': 3,
        }
        
        return priority_map.get(model_id, 999)  # Prioridade baixa para modelos não mapeados
    
    def _get_model_description(self, model_id: str, provider: Dict) -> str:
        """Gera descrição do modelo"""
        descriptions = {
            # Groq
            'llama-3.1-8b-instant': 'Llama 3.1 8B - Modelo rápido e eficiente',
            'llama-3.1-70b-versatile': 'Llama 3.1 70B - Modelo versátil e poderoso',
            'mixtral-8x7b-32768': 'Mixtral 8x7B - Modelo misto de especialistas',
            'gemma2-9b-it': 'Gemma2 9B - Modelo compacto e eficiente',
            
            # OpenAI
            'gpt-3.5-turbo': 'GPT-3.5 Turbo - Modelo rápido e econômico',
            'gpt-4': 'GPT-4 - Modelo mais avançado',
            'gpt-4-turbo': 'GPT-4 Turbo - Versão otimizada do GPT-4',
            
            # Anthropic
            'claude-3-haiku-20240307': 'Claude 3 Haiku - Modelo rápido e eficiente',
            'claude-3-sonnet-20240229': 'Claude 3 Sonnet - Modelo equilibrado',
            'claude-3-opus-20240229': 'Claude 3 Opus - Modelo mais poderoso',
        }
        
        return descriptions.get(model_id, f'{model_id} - Modelo disponível na {provider["display_name"]}')
    
    def is_provider_available(self, provider_name: str) -> bool:
        """Verifica se um provedor está disponível"""
        try:
            models = self.list_models(provider_name)
            return len(models) > 0
        except:
            return False
