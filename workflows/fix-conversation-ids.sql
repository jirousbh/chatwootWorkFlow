-- Script para corrigir conversation_id na tabela workflow_conversations
-- Este script atualiza as conversas existentes que têm conversation_id no campo data
-- mas não na coluna conversation_id da tabela

-- Primeiro, vamos verificar quais conversas precisam ser corrigidas
SELECT 
    wc.id,
    wc.contact_id,
    wc.conversation_id as current_conversation_id,
    wc.data,
    CASE 
        WHEN wc.data::text LIKE '%"conversation_id"%' THEN 
            (wc.data->>'conversation_id')::integer
        ELSE NULL
    END as data_conversation_id
FROM workflow_conversations wc
WHERE wc.status = 'active'
    AND wc.data::text LIKE '%"conversation_id"%'
    AND (wc.conversation_id IS NULL OR wc.conversation_id != (wc.data->>'conversation_id')::integer);

-- Atualizar as conversas que têm conversation_id no data mas não na coluna
UPDATE workflow_conversations 
SET conversation_id = (data->>'conversation_id')::integer
WHERE status = 'active'
    AND data::text LIKE '%"conversation_id"%'
    AND (conversation_id IS NULL OR conversation_id != (data->>'conversation_id')::integer);

-- Verificar o resultado da correção
SELECT 
    id,
    contact_id,
    conversation_id,
    workflow_name,
    status
FROM workflow_conversations 
WHERE status = 'active'
ORDER BY id DESC
LIMIT 10;
