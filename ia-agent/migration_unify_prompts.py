#!/usr/bin/env python3
"""
Script de migração para unificar prompts:
- Remove summary_prompt e custom_system_prompt
- Adiciona system_prompt
- Migra dados existentes
"""

import os
import sys
from sqlalchemy import create_engine, text

def run_migration():
    """Executa a migração para unificar prompts"""
    
    # Configuração do banco de dados
    database_url = os.getenv(
        'DATABASE_URL', 
        'postgresql://postgres:invoAI@76925@postgres-dev:5432/workflows_iaagent'
    )
    
    try:
        # Conectar ao banco
        engine = create_engine(database_url)
        
        with engine.connect() as connection:
            # Verificar se a coluna system_prompt já existe
            check_column_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'agent' AND column_name = 'system_prompt'
            """)
            
            result = connection.execute(check_column_query)
            system_prompt_exists = result.fetchone() is not None
            
            if system_prompt_exists:
                print("✅ Coluna 'system_prompt' já existe na tabela 'agent'")
                return True
            
            # 1. Adicionar a nova coluna system_prompt
            add_system_prompt_query = text("""
                ALTER TABLE agent 
                ADD COLUMN system_prompt TEXT
            """)
            
            connection.execute(add_system_prompt_query)
            print("✅ Coluna 'system_prompt' adicionada com sucesso!")
            
            # 2. Migrar dados existentes
            # Combinar summary_prompt e custom_system_prompt em system_prompt
            migrate_data_query = text("""
                UPDATE agent 
                SET system_prompt = CONCAT(
                    COALESCE(summary_prompt, ''), 
                    CASE 
                        WHEN summary_prompt IS NOT NULL AND custom_system_prompt IS NOT NULL 
                        THEN E'\n\n' 
                        ELSE '' 
                    END,
                    COALESCE(custom_system_prompt, '')
                )
                WHERE system_prompt IS NULL
            """)
            
            result = connection.execute(migrate_data_query)
            print(f"✅ Dados migrados para {result.rowcount} agentes")
            
            # 3. Tornar system_prompt NOT NULL
            make_not_null_query = text("""
                ALTER TABLE agent 
                ALTER COLUMN system_prompt SET NOT NULL
            """)
            
            connection.execute(make_not_null_query)
            print("✅ Coluna 'system_prompt' definida como NOT NULL")
            
            # 4. Remover colunas antigas
            drop_summary_query = text("""
                ALTER TABLE agent 
                DROP COLUMN summary_prompt
            """)
            
            connection.execute(drop_summary_query)
            print("✅ Coluna 'summary_prompt' removida")
            
            drop_custom_query = text("""
                ALTER TABLE agent 
                DROP COLUMN custom_system_prompt
            """)
            
            connection.execute(drop_custom_query)
            print("✅ Coluna 'custom_system_prompt' removida")
            
            connection.commit()
            
            print("✅ Migração concluída com sucesso!")
            print("   - Nova coluna: system_prompt (TEXT NOT NULL)")
            print("   - Colunas removidas: summary_prompt, custom_system_prompt")
            print("   - Dados migrados automaticamente")
            
            return True
            
    except Exception as e:
        print(f"❌ Erro na migração: {e}")
        return False

if __name__ == "__main__":
    print("🔄 Iniciando migração para unificar prompts...")
    
    success = run_migration()
    
    if success:
        print("✅ Migração concluída com sucesso!")
        sys.exit(0)
    else:
        print("❌ Migração falhou!")
        sys.exit(1)
