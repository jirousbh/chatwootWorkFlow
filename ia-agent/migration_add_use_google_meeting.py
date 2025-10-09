#!/usr/bin/env python3
"""
Script de migração para adicionar a coluna use_google_meeting à tabela agents
"""

import os
import sys
from sqlalchemy import create_engine, text

def run_migration():
    """Executa a migração para adicionar a coluna use_google_meeting"""
    
    # Configuração do banco de dados
    database_url = os.getenv(
        'DATABASE_URL', 
        'postgresql://postgres:invoAI@76925@postgres-dev:5432/workflows_iaagent'
    )
    
    try:
        # Conectar ao banco
        engine = create_engine(database_url)
        
        with engine.connect() as connection:
            # Verificar se a coluna já existe
            check_column_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'agent' AND column_name = 'use_google_meeting'
            """)
            
            result = connection.execute(check_column_query)
            column_exists = result.fetchone() is not None
            
            if column_exists:
                print("✅ Coluna 'use_google_meeting' já existe na tabela 'agent'")
                return True
            
            # Adicionar a coluna
            add_column_query = text("""
                ALTER TABLE agent 
                ADD COLUMN use_google_meeting BOOLEAN DEFAULT FALSE
            """)
            
            connection.execute(add_column_query)
            connection.commit()
            
            print("✅ Coluna 'use_google_meeting' adicionada com sucesso!")
            print("   - Tipo: BOOLEAN")
            print("   - Valor padrão: FALSE")
            
            return True
            
    except Exception as e:
        print(f"❌ Erro na migração: {e}")
        return False

if __name__ == "__main__":
    print("🔄 Iniciando migração para adicionar coluna 'use_google_meeting'...")
    
    success = run_migration()
    
    if success:
        print("✅ Migração concluída com sucesso!")
        sys.exit(0)
    else:
        print("❌ Migração falhou!")
        sys.exit(1)

