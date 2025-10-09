#!/usr/bin/env python3
"""
Script de migração para criar tabela ia_providers:
- Cria tabela para gerenciar provedores de IA
- Insere provedores padrão (Groq, OpenAI, etc.)
"""

import os
import sys
from sqlalchemy import create_engine, text

def run_migration():
    """Executa a migração para criar tabela ia_providers"""
    
    # Configuração do banco de dados
    database_url = os.getenv(
        'DATABASE_URL', 
        'postgresql://postgres:invoAI@76925@postgres-dev:5432/workflows_iaagent'
    )
    
    try:
        # Conectar ao banco
        engine = create_engine(database_url)
        
        with engine.connect() as connection:
            # Verificar se a tabela já existe
            check_table_query = text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_name = 'ia_providers'
            """)
            
            result = connection.execute(check_table_query)
            table_exists = result.fetchone() is not None
            
            if table_exists:
                print("✅ Tabela 'ia_providers' já existe")
                return True
            
            # Criar a tabela ia_providers
            create_table_query = text("""
                CREATE TABLE ia_providers (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name VARCHAR(100) NOT NULL UNIQUE,
                    display_name VARCHAR(100) NOT NULL,
                    api_base_url VARCHAR(255) NOT NULL,
                    api_key_env_var VARCHAR(100),
                    is_active BOOLEAN DEFAULT TRUE,
                    max_tokens INTEGER DEFAULT 4096,
                    supports_streaming BOOLEAN DEFAULT FALSE,
                    supports_embeddings BOOLEAN DEFAULT FALSE,
                    supports_vision BOOLEAN DEFAULT FALSE,
                    default_model VARCHAR(100),
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            connection.execute(create_table_query)
            print("✅ Tabela 'ia_providers' criada com sucesso!")
            
            # Inserir provedores padrão
            default_providers = [
                {
                    'name': 'groq',
                    'display_name': 'Groq',
                    'api_base_url': 'https://api.groq.com/openai/v1',
                    'api_key_env_var': 'GROQ_API_KEY',
                    'is_active': True,
                    'max_tokens': 8192,
                    'supports_streaming': True,
                    'supports_embeddings': False,
                    'supports_vision': False,
                    'default_model': 'llama-3.1-8b-instant',
                    'description': 'Groq - Fast inference for open source models'
                },
                {
                    'name': 'openai',
                    'display_name': 'OpenAI',
                    'api_base_url': 'https://api.openai.com/v1',
                    'api_key_env_var': 'OPENAI_API_KEY',
                    'is_active': False,
                    'max_tokens': 4096,
                    'supports_streaming': True,
                    'supports_embeddings': True,
                    'supports_vision': True,
                    'default_model': 'gpt-3.5-turbo',
                    'description': 'OpenAI - GPT models and embeddings'
                },
                {
                    'name': 'anthropic',
                    'display_name': 'Anthropic',
                    'api_base_url': 'https://api.anthropic.com',
                    'api_key_env_var': 'ANTHROPIC_API_KEY',
                    'is_active': False,
                    'max_tokens': 4096,
                    'supports_streaming': True,
                    'supports_embeddings': False,
                    'supports_vision': False,
                    'default_model': 'claude-3-haiku-20240307',
                    'description': 'Anthropic - Claude models'
                }
            ]
            
            for provider in default_providers:
                insert_query = text("""
                    INSERT INTO ia_providers (
                        name, display_name, api_base_url, api_key_env_var, is_active,
                        max_tokens, supports_streaming, supports_embeddings, supports_vision,
                        default_model, description
                    ) VALUES (
                        :name, :display_name, :api_base_url, :api_key_env_var, :is_active,
                        :max_tokens, :supports_streaming, :supports_embeddings, :supports_vision,
                        :default_model, :description
                    )
                """)
                
                connection.execute(insert_query, provider)
                print(f"✅ Provedor '{provider['display_name']}' inserido")
            
            connection.commit()
            
            print("✅ Migração concluída com sucesso!")
            print("   - Tabela: ia_providers")
            print("   - Provedores inseridos: Groq (ativo), OpenAI, Anthropic")
            
            return True
            
    except Exception as e:
        print(f"❌ Erro na migração: {e}")
        return False

if __name__ == "__main__":
    print("🔄 Iniciando migração para criar tabela 'ia_providers'...")
    
    success = run_migration()
    
    if success:
        print("✅ Migração concluída com sucesso!")
        sys.exit(0)
    else:
        print("❌ Migração falhou!")
        sys.exit(1)
