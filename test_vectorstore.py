#!/usr/bin/env python3
"""
Script de teste para verificar se conseguimos ler o vectorstore
"""

import os
import sys
from pathlib import Path

# Adicionar o diretório do ia-agent ao path
sys.path.append('/root/chatwoot-dev/ia-agent')

from improved_agent_manager import ImprovedAgentManager

def test_vectorstore_loading():
    """Testa o carregamento do vectorstore"""
    
    print("🔍 TESTE DE CARREGAMENTO DO VECTORSTORE")
    print("=" * 50)
    
    # Caminhos para testar
    paths_to_test = [
        "/data/ia-agent-dev/24dbd1e1-e50c-49ec-bc4e-3dbcbc1aef11/vectorstore",
        "/root/chatwoot-dev/data/ia-agent-dev/24dbd1e1-e50c-49ec-bc4e-3dbcbc1aef11/vectorstore",
        "~/chatwoot-dev/data/ia-agent-dev/24dbd1e1-e50c-49ec-bc4e-3dbcbc1aef11/vectorstore"
    ]
    
    # Inicializar o manager
    manager = ImprovedAgentManager()
    
    for i, path in enumerate(paths_to_test, 1):
        print(f"\n📁 TESTE {i}: {path}")
        print("-" * 30)
        
        # Expandir ~ se presente
        expanded_path = os.path.expanduser(path)
        
        # Verificar se o diretório existe
        if os.path.exists(expanded_path):
            print(f"✅ Diretório existe: {expanded_path}")
            
            # Listar arquivos no diretório
            try:
                files = os.listdir(expanded_path)
                print(f"📄 Arquivos encontrados: {files}")
                
                # Verificar se tem os arquivos necessários
                required_files = ['index.faiss', 'index.pkl']
                has_required = all(f in files for f in required_files)
                
                if has_required:
                    print("✅ Arquivos necessários encontrados")
                    
                    # Tentar carregar o vectorstore
                    try:
                        vectorstore = manager.load_vectorstore(expanded_path)
                        if vectorstore:
                            print("✅ Vectorstore carregado com sucesso!")
                            
                            # Testar busca
                            try:
                                docs = vectorstore.similarity_search("empresa", k=2)
                                print(f"✅ Busca funcionando! Encontrados {len(docs)} documentos")
                                
                                if docs:
                                    print("📄 Primeiro documento:")
                                    print(f"   Conteúdo: {docs[0].page_content[:200]}...")
                                    print(f"   Metadados: {docs[0].metadata}")
                                
                                return expanded_path  # Retornar o caminho que funcionou
                                
                            except Exception as e:
                                print(f"❌ Erro na busca: {e}")
                        else:
                            print("❌ Falha ao carregar vectorstore")
                    except Exception as e:
                        print(f"❌ Erro ao carregar vectorstore: {e}")
                else:
                    print("❌ Arquivos necessários não encontrados")
                    missing = [f for f in required_files if f not in files]
                    print(f"   Faltando: {missing}")
            except Exception as e:
                print(f"❌ Erro ao listar arquivos: {e}")
        else:
            print(f"❌ Diretório não existe: {expanded_path}")
    
    return None

def test_agent_chain():
    """Testa a criação da chain do agente"""
    
    print("\n\n🔗 TESTE DE CRIAÇÃO DA CHAIN")
    print("=" * 50)
    
    # Caminho que funcionou no teste anterior
    working_path = test_vectorstore_loading()
    
    if not working_path:
        print("❌ Nenhum vectorstore funcionou. Não é possível testar a chain.")
        return
    
    print(f"\n🔧 Testando chain com caminho: {working_path}")
    
    manager = ImprovedAgentManager()
    
    # Parâmetros do agente (baseados no que vimos na API)
    agent_id = "24dbd1e1-e50c-49ec-bc4e-3dbcbc1aef11"
    system_prompt = """Você é Ivone, uma assistente de IA especializada em análise de documentos PDF fornecidos pela empresa.

Regras de comportamento:

1. Sempre responda em português brasileiro.

2. Sua função é responder perguntas com base exclusivamente nas informações presentes nos documentos fornecidos.

3. Analise o conteúdo da entrada do usuário com cuidado:

   - Se a entrada for **uma pergunta** (ex: "Quais serviços vocês oferecem?", "O que a empresa faz?", "Como posso contratar?"):
     - Responda diretamente com base nos documentos.
     - Seja precisa, concisa, direta e mantenha um tom profissional e prestativo.
     - Use no máximo 90 palavras.
     - **Não responda como se fosse uma saudação.**
   
   - Se a entrada for **uma saudação** simples (ex: "olá", "bom dia", "boa noite"):
     - Responda a saudação e apresente-se como "Sou Ivone, assistente de IA da empresa mencionada nos documentos".
     - Resuma as atividades da empresa com base nas informações dos documentos.
     - Não mencione planos ou produtos avulsos.
     - Use no máximo 100 palavras.
     - Finalize com: "Se quiser saber mais, estou à disposição. Você também pode digitar 'agendar reunião' para marcarmos um horário."

4. Caso a informação solicitada não esteja presente nos documentos, diga claramente:
   - **"Não encontrei essa informação em minha base de dados."**

5. Você não deve inventar, presumir ou alucinar informações que não estejam nos documentos.

Importante: **Se houver qualquer indício de pergunta, trate como uma pergunta e não como saudação. Perguntas têm prioridade.**"""
    
    model = "llama-3.1-8b-instant"
    api_provider = "groq"
    temperature = 0.1
    
    try:
        # Criar chain
        chain = manager._get_or_create_chain(
            agent_id, working_path, system_prompt, model, api_provider, temperature
        )
        
        if chain:
            print("✅ Chain criada com sucesso!")
            print(f"   Componentes: {list(chain.keys())}")
            
            # Testar processamento de mensagem
            test_message = "olá"
            print(f"\n💬 Testando mensagem: '{test_message}'")
            
            try:
                answer = manager._simple_chat_processing(chain, test_message)
                print(f"✅ Resposta gerada:")
                print(f"   {answer}")
                
                # Verificar se a resposta contém informações dos documentos
                if "empresa" in answer.lower() or "inovai" in answer.lower():
                    print("✅ Resposta parece usar informações dos documentos!")
                else:
                    print("⚠️ Resposta pode não estar usando os documentos")
                    
            except Exception as e:
                print(f"❌ Erro no processamento: {e}")
        else:
            print("❌ Falha ao criar chain")
            
    except Exception as e:
        print(f"❌ Erro ao criar chain: {e}")

if __name__ == "__main__":
    print("🚀 INICIANDO TESTES DO VECTORSTORE")
    print("=" * 60)
    
    # Teste 1: Carregamento do vectorstore
    test_vectorstore_loading()
    
    # Teste 2: Criação da chain
    test_agent_chain()
    
    print("\n\n🏁 TESTES CONCLUÍDOS")
    print("=" * 60)
