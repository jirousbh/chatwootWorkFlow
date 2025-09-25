#!/usr/bin/env python3
"""
Script de migração para adicionar campos de calendário na tabela agents
"""

import os
import sys
import psycopg2
from psycopg2 import sql

def run_migration():
    """Executa a migração para adicionar campos de calendário"""
    
    # Configurações do banco de dados
    db_config = {
        'host': os.getenv('DB_HOST', 'localhost'),
        'port': os.getenv('DB_PORT', '5432'),
        'database': os.getenv('DB_NAME', 'chatwoot_workflows'),
        'user': os.getenv('DB_USER', 'postgres'),
        'password': os.getenv('DB_PASSWORD', 'postgres')
    }
    
    try:
        # Conectar ao banco
        print("🔗 Conectando ao banco de dados...")
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()
        
        # Verificar se as colunas já existem
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'agent' AND column_name IN (
                'calendar_enabled', 'calendar_credentials', 'calendar_id',
                'calendar_start_hour', 'calendar_end_hour', 'calendar_workdays',
                'calendar_duration_minutes'
            );
        """)
        
        existing_columns = [row[0] for row in cursor.fetchall()]
        print(f"📋 Colunas existentes: {existing_columns}")
        
        # Adicionar colunas que não existem
        columns_to_add = [
            ('calendar_enabled', 'BOOLEAN DEFAULT FALSE'),
            ('calendar_credentials', 'TEXT'),
            ('calendar_id', 'VARCHAR(255)'),
            ('calendar_start_hour', 'INTEGER DEFAULT 9'),
            ('calendar_end_hour', 'INTEGER DEFAULT 18'),
            ('calendar_workdays', 'VARCHAR(20) DEFAULT \'1,2,3,4,5\''),
            ('calendar_duration_minutes', 'INTEGER DEFAULT 60')
        ]
        
        for column_name, column_definition in columns_to_add:
            if column_name not in existing_columns:
                print(f"➕ Adicionando coluna: {column_name}")
                cursor.execute(sql.SQL("ALTER TABLE agent ADD COLUMN {} {}").format(
                    sql.Identifier(column_name),
                    sql.SQL(column_definition)
                ))
            else:
                print(f"✅ Coluna {column_name} já existe")
        
        # Commit das alterações
        conn.commit()
        print("✅ Migração concluída com sucesso!")
        
        # Verificar estrutura final da tabela
        cursor.execute("""
            SELECT column_name, data_type, column_default, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'agent'
            ORDER BY ordinal_position;
        """)
        
        print("\n📊 Estrutura final da tabela 'agent':")
        print("-" * 80)
        print(f"{'Coluna':<30} {'Tipo':<20} {'Padrão':<20} {'Nulo':<10}")
        print("-" * 80)
        
        for row in cursor.fetchall():
            column_name, data_type, column_default, is_nullable = row
            default_str = str(column_default) if column_default else 'NULL'
            print(f"{column_name:<30} {data_type:<20} {default_str:<20} {is_nullable:<10}")
        
    except Exception as e:
        print(f"❌ Erro durante a migração: {e}")
        if conn:
            conn.rollback()
        sys.exit(1)
        
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
        print("🔌 Conexão com banco de dados fechada")

if __name__ == '__main__':
    print("🚀 Iniciando migração para campos de calendário...")
    run_migration()
