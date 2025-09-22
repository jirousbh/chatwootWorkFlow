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
                # Filtrar apenas modelos da Groq
                groq_models = [
                    model for model in data.get('data', [])
                    if model.get('id', '').startswith('llama-3.1')
                ]
                
                # Adicionar informações úteis
                formatted_models = []
                for model in groq_models:
                    formatted_models.append({
                        'id': model['id'],
                        'name': model['id'],
                        'provider': 'groq',
                        'description': self._get_model_description(model['id']),
                        'max_tokens': model.get('context_window', 8192)
                    })
                
                return formatted_models
            else:
                print(f"Erro ao listar modelos: {response.status_code}")
                return []
                
        except Exception as e:
            print(f"Erro ao conectar com Groq: {e}")
            return []
    
    def _get_model_description(self, model_id: str) -> str:
        """Retorna descrição amigável do modelo"""
        descriptions = {
            'llama-3.1-8b-instant': 'Llama 3.1 8B - Rápido e eficiente para tarefas gerais',
            'llama-3.1-70b-versatile': 'Llama 3.1 70B - Modelo avançado para tarefas complexas',
            'llama-3.1-gemma-7b-it': 'Llama 3.1 Gemma 7B - Equilibrado entre velocidade e qualidade',
            'llama-3.1-sonar-small-128k-online': 'Llama 3.1 Sonar Small - Otimizado para busca online',
            'llama-3.1-sonar-large-128k-online': 'Llama 3.1 Sonar Large - Modelo grande para busca online'
        }
        return descriptions.get(model_id, 'Modelo Groq disponível')
    
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
