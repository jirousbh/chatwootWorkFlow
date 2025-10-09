#!/usr/bin/env python3
"""
Script de migração para adicionar campo temperature:
- Adiciona coluna temperature na tabela agent
- Define valor padrão de 0.1
"""

import os
import sys
from sqlalchemy import create_engine, text

def run_migration():
    """Executa a migração para adicionar campo temperature"""
    
    # Configuração do banco de dados
    database_url = os.getenv(
        'DATABASE_URL', 
        'postgresql://postgres:invoAI@76925@postgres-dev:5432/workflows_iaagent'
    )
    
    try:
        # Conectar ao banco
        engine = create_engine(database_url)
        
        with engine.connect() as connection:
            # Verificar se a coluna temperature já existe
            check_column_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'agent' AND column_name = 'temperature'
            """)
            
            result = connection.execute(check_column_query)
            temperature_exists = result.fetchone() is not None
            
            if temperature_exists:
                print("✅ Coluna 'temperature' já existe na tabela 'agent'")
                return True
            
            # Adicionar a nova coluna temperature
            add_temperature_query = text("""
                ALTER TABLE agent 
                ADD COLUMN temperature DECIMAL(3,2) DEFAULT 0.10
            """)
            
            connection.execute(add_temperature_query)
            print("✅ Coluna 'temperature' adicionada com sucesso!")
            
            # Atualizar agentes existentes com valor padrão
            update_existing_query = text("""
                UPDATE agent 
                SET temperature = 0.10 
                WHERE temperature IS NULL
            """)
            
            result = connection.execute(update_existing_query)
            print(f"✅ {result.rowcount} agentes atualizados com temperatura padrão")
            
            connection.commit()
            
            print("✅ Migração concluída com sucesso!")
            print("   - Nova coluna: temperature (DECIMAL(3,2) DEFAULT 0.10)")
            print("   - Agentes existentes atualizados")
            
            return True
            
    except Exception as e:
        print(f"❌ Erro na migração: {e}")
        return False

if __name__ == "__main__":
    print("🔄 Iniciando migração para adicionar campo 'temperature'...")
    
    success = run_migration()
    
    if success:
        print("✅ Migração concluída com sucesso!")
        sys.exit(0)
    else:
        print("❌ Migração falhou!")
        sys.exit(1)
