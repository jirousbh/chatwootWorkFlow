#!/usr/bin/env python3
"""
Script de teste para a API do Agente IA
Este script demonstra como usar a API para criar e interagir com agentes
"""

import requests
import json
import os
from pathlib import Path

# Configuração da API
API_BASE_URL = "http://localhost:3006"

def test_health():
    """Testa o endpoint de health check"""
    print("🔍 Testando health check...")
    try:
        response = requests.get(f"{API_BASE_URL}/health")
        if response.status_code == 200:
            print("✅ API está funcionando!")
            print(f"   Resposta: {response.json()}")
        else:
            print(f"❌ Erro no health check: {response.status_code}")
    except Exception as e:
        print(f"❌ Erro de conexão: {e}")

def test_list_models():
    """Testa listagem de modelos disponíveis"""
    print("\n🤖 Testando listagem de modelos...")
    try:
        response = requests.get(f"{API_BASE_URL}/models?provider=groq")
        if response.status_code == 200:
            data = response.json()
            print("✅ Modelos listados com sucesso!")
            for model in data['models']:
                print(f"   - {model['id']}: {model['description']}")
        else:
            print(f"❌ Erro ao listar modelos: {response.status_code}")
    except Exception as e:
        print(f"❌ Erro: {e}")

def test_create_agent():
    """Testa criação de agente"""
    print("\n👤 Testando criação de agente...")
    
    agent_data = {
        "name": "Agente Teste",
        "api_provider": "groq",
        "model": "llama-3.1-8b-instant",
        "summary_prompt": "Analise este documento e crie um resumo conciso dos pontos principais em português brasileiro.",
        "custom_system_prompt": """Você é um assistente especializado em análise de documentos PDF. 
Use as informações fornecidas nos documentos para responder às perguntas do usuário de forma precisa e útil.

Instruções importantes:
- Responda SEMPRE em português brasileiro
- Base suas respostas exclusivamente nas informações dos documentos fornecidos
- Se a informação não estiver nos documentos, diga claramente "Não encontrei essa informação em minha base de dados"
- Seja preciso, conciso e direto nas respostas
- Mantenha um tom profissional e prestativo

Contexto dos documentos:
{context}

Histórico da conversa:
{chat_history}

Pergunta do usuário: {question}

Resposta:"""
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/agents",
            headers={"Content-Type": "application/json"},
            json=agent_data
        )
        
        if response.status_code == 201:
            data = response.json()
            agent_id = data['agent']['id']
            print("✅ Agente criado com sucesso!")
            print(f"   ID: {agent_id}")
            print(f"   Nome: {data['agent']['name']}")
            return agent_id
        else:
            print(f"❌ Erro ao criar agente: {response.status_code}")
            print(f"   Resposta: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Erro: {e}")
        return None

def test_list_agents():
    """Testa listagem de agentes"""
    print("\n📋 Testando listagem de agentes...")
    try:
        response = requests.get(f"{API_BASE_URL}/agents")
        if response.status_code == 200:
            data = response.json()
            print("✅ Agentes listados com sucesso!")
            for agent in data['agents']:
                print(f"   - {agent['name']} (ID: {agent['id']})")
        else:
            print(f"❌ Erro ao listar agentes: {response.status_code}")
    except Exception as e:
        print(f"❌ Erro: {e}")

def test_upload_pdf(agent_id, pdf_path):
    """Testa upload de PDF"""
    print(f"\n📄 Testando upload de PDF para agente {agent_id}...")
    
    if not os.path.exists(pdf_path):
        print(f"❌ Arquivo PDF não encontrado: {pdf_path}")
        return False
    
    try:
        with open(pdf_path, 'rb') as f:
            files = {'pdf_file': f}
            response = requests.post(
                f"{API_BASE_URL}/agents/{agent_id}/upload-pdf",
                files=files
            )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ PDF processado com sucesso!")
            print(f"   Arquivo: {data['agent']['pdf_filename']}")
            return True
        else:
            print(f"❌ Erro ao processar PDF: {response.status_code}")
            print(f"   Resposta: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Erro: {e}")
        return False

def test_chat_summary(agent_id):
    """Testa geração de resumo"""
    print(f"\n📝 Testando geração de resumo para agente {agent_id}...")
    
    chat_data = {
        "message": "",
        "is_first_interaction": True
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/agents/{agent_id}/chat",
            headers={"Content-Type": "application/json"},
            json=chat_data
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Resumo gerado com sucesso!")
            print(f"   Resumo: {data['response'][:200]}...")
            return True
        else:
            print(f"❌ Erro ao gerar resumo: {response.status_code}")
            print(f"   Resposta: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Erro: {e}")
        return False

def test_chat_question(agent_id):
    """Testa pergunta ao agente"""
    print(f"\n💬 Testando pergunta ao agente {agent_id}...")
    
    chat_data = {
        "message": "Qual é o assunto principal deste documento?",
        "is_first_interaction": False
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/agents/{agent_id}/chat",
            headers={"Content-Type": "application/json"},
            json=chat_data
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Resposta recebida com sucesso!")
            print(f"   Resposta: {data['response'][:200]}...")
            return True
        else:
            print(f"❌ Erro ao obter resposta: {response.status_code}")
            print(f"   Resposta: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Erro: {e}")
        return False

def main():
    """Função principal do teste"""
    print("🧪 Teste da API do Agente IA")
    print("=" * 40)
    
    # Teste básico
    test_health()
    test_list_models()
    
    # Criar agente
    agent_id = test_create_agent()
    if not agent_id:
        print("❌ Não foi possível criar agente. Parando testes.")
        return
    
    # Listar agentes
    test_list_agents()
    
    # Testar upload de PDF (se arquivo existir)
    pdf_path = "exemplo.pdf"  # Altere para um PDF real se tiver
    if os.path.exists(pdf_path):
        if test_upload_pdf(agent_id, pdf_path):
            # Testar conversa se PDF foi carregado
            test_chat_summary(agent_id)
            test_chat_question(agent_id)
    else:
        print(f"\n⚠️  Arquivo {pdf_path} não encontrado. Pulando testes de PDF.")
        print("   Para testar upload, coloque um arquivo PDF na pasta e execute novamente.")
    
    print("\n🎉 Testes concluídos!")

if __name__ == "__main__":
    main()
