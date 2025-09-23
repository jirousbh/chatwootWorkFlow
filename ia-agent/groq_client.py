import os
import requests
from typing import List, Dict, Optional

class GroqClient:
    """Cliente para interagir com a API da Groq"""
    
    def __init__(self):
        self.api_key = os.getenv('GROQ_API_KEY')
        self.base_url = 'https://api.groq.com/openai/v1'
        self.headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
    
    def list_models(self) -> List[Dict]:
        """Lista modelos disponíveis na Groq"""
        try:
            if not self.api_key:
                return []
            
            response = requests.get(
                f'{self.base_url}/models',
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Filtrar modelos úteis para chat e análise de documentos
                useful_models = [
                    model for model in data.get('data', [])
                    if self._is_useful_model(model.get('id', ''))
                ]
                
                # Adicionar informações úteis
                formatted_models = []
                for model in useful_models:
                    formatted_models.append({
                        'id': model['id'],
                        'name': model['id'],
                        'provider': 'groq',
                        'description': self._get_model_description(model['id']),
                        'max_tokens': model.get('context_window', 8192)
                    })
                
                # Ordenar por prioridade (modelos mais rápidos primeiro)
                formatted_models.sort(key=lambda x: self._get_model_priority(x['id']))
                
                return formatted_models
            else:
                print(f"Erro ao listar modelos: {response.status_code}")
                return []
                
        except Exception as e:
            print(f"Erro ao conectar com Groq: {e}")
            return []
    
    def _is_useful_model(self, model_id: str) -> bool:
        """Verifica se o modelo é útil para chat e análise de documentos"""
        # Excluir modelos que não são úteis para chat
        exclude_patterns = [
            'whisper',        # Speech-to-text
            'playai-tts',     # Text-to-speech
            'llama-guard',    # Safety models
            'prompt-guard',   # Safety models
            'gpt-oss',        # OpenAI OSS models (not available)
        ]
        
        # Verificar se deve ser excluído
        for exclude in exclude_patterns:
            if exclude in model_id.lower():
                return False
        
        # Incluir todos os outros modelos (são úteis para chat)
        return True
    
    def _get_model_priority(self, model_id: str) -> int:
        """Retorna prioridade do modelo (menor número = maior prioridade)"""
        priority_map = {
            'llama-3.1-8b-instant': 1,      # Mais rápido
            'llama-3.3-70b-versatile': 2,   # Mais avançado
            'mixtral-8x7b': 3,              # Modelo misto
            'gemma2-9b-it': 4,              # Modelo leve
            'groq/compound-mini': 5,        # Modelo compacto
            'groq/compound': 6,             # Modelo completo
        }
        
        # Verificar correspondências parciais
        for pattern, priority in priority_map.items():
            if pattern in model_id.lower():
                return priority
        
        # Prioridade padrão para outros modelos
        return 99

    def _get_model_description(self, model_id: str) -> str:
        """Retorna descrição amigável do modelo"""
        descriptions = {
            'llama-3.1-8b-instant': 'Llama 3.1 8B - Rápido e eficiente para tarefas gerais',
            'llama-3.3-70b-versatile': 'Llama 3.3 70B - Modelo mais recente e avançado',
            'gemma2-9b-it': 'Gemma2 9B - Modelo leve e eficiente do Google',
            'groq/compound-mini': 'Groq Compound Mini - Modelo compacto e rápido',
            'groq/compound': 'Groq Compound - Modelo completo e avançado',
            'qwen/qwen3-32b': 'Qwen3 32B - Modelo avançado da Alibaba Cloud',
            'deepseek-r1-distill-llama-70b': 'DeepSeek R1 70B - Modelo avançado para raciocínio',
            'meta-llama/llama-4-maverick-17b-128e-instruct': 'Llama 4 Maverick 17B - Modelo experimental avançado',
            'meta-llama/llama-4-scout-17b-16e-instruct': 'Llama 4 Scout 17B - Modelo experimental para exploração',
            'moonshotai/kimi-k2-instruct': 'Kimi K2 - Modelo avançado da Moonshot AI',
            'moonshotai/kimi-k2-instruct-0905': 'Kimi K2 (v0905) - Versão atualizada do modelo Kimi',
            'allam-2-7b': 'Allam 2 7B - Modelo árabe avançado',
        }
        
        # Verificar correspondências exatas primeiro
        if model_id in descriptions:
            return descriptions[model_id]
        
        # Verificar correspondências parciais
        for pattern, description in descriptions.items():
            if pattern in model_id.lower():
                return description
        
        # Descrição genérica baseada no nome
        if 'llama' in model_id.lower():
            return f'{model_id} - Modelo Llama para chat e análise'
        elif 'gemma' in model_id.lower():
            return f'{model_id} - Modelo Gemma do Google'
        elif 'groq' in model_id.lower():
            return f'{model_id} - Modelo proprietário da Groq'
        else:
            return f'{model_id} - Modelo disponível na Groq'
    
    def generate_text(self, 
                     prompt: str, 
                     model: str = 'llama-3.1-8b-instant',
                     max_tokens: int = 2048,
                     temperature: float = 0.1) -> Optional[str]:
        """Gera texto usando a API da Groq"""
        try:
            if not self.api_key:
                return None
            
            payload = {
                'model': model,
                'messages': [
                    {
                        'role': 'user',
                        'content': prompt
                    }
                ],
                'max_tokens': max_tokens,
                'temperature': temperature,
                'stream': False
            }
            
            response = requests.post(
                f'{self.base_url}/chat/completions',
                headers=self.headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                return data['choices'][0]['message']['content']
            else:
                print(f"Erro na API Groq: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            print(f"Erro ao gerar texto: {e}")
            return None
    
    def is_available(self) -> bool:
        """Verifica se a API da Groq está disponível"""
        try:
            models = self.list_models()
            return len(models) > 0
        except:
            return False
