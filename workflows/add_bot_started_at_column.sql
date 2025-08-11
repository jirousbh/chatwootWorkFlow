-- Script para adicionar o campo last_interaction_at à tabela bot_conversation_status
-- Execute este script se a tabela já existir e não tiver o campo last_interaction_at

-- Adicionar coluna last_interaction_at se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bot_conversation_status' 
        AND column_name = 'last_interaction_at'
    ) THEN
        ALTER TABLE bot_conversation_status 
        ADD COLUMN last_interaction_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        
        -- Atualizar registros existentes para ter last_interaction_at igual a created_at
        UPDATE bot_conversation_status 
        SET last_interaction_at = created_at 
        WHERE last_interaction_at IS NULL;
        
        RAISE NOTICE 'Coluna last_interaction_at adicionada com sucesso à tabela bot_conversation_status';
    ELSE
        RAISE NOTICE 'Coluna last_interaction_at já existe na tabela bot_conversation_status';
    END IF;
END $$;
