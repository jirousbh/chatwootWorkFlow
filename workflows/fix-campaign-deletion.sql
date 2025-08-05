-- Script para resolver problemas de exclusão de campanhas
-- Execute este script no PostgreSQL para limpar registros órfãos ou forçar exclusão

-- 1. Verificar campanhas que têm execuções pendentes
SELECT 
    c.id as campaign_id,
    c.name as campaign_name,
    COUNT(ce.id) as executions_count,
    COUNT(cs.id) as status_count,
    COUNT(cc.id) as contacts_count
FROM campaigns c
LEFT JOIN campaign_executions ce ON c.id = ce.campaign_id
LEFT JOIN campaign_status cs ON c.id = cs.campaign_id
LEFT JOIN campaign_contacts cc ON c.id = cc.campaign_id
GROUP BY c.id, c.name
ORDER BY executions_count DESC, status_count DESC;

-- 2. Verificar execuções órfãs (campaign_id que não existe mais em campaigns)
SELECT 
    ce.campaign_id,
    COUNT(*) as orphaned_executions
FROM campaign_executions ce
LEFT JOIN campaigns c ON ce.campaign_id = c.id
WHERE c.id IS NULL
GROUP BY ce.campaign_id;

-- 3. Verificar status órfãos
SELECT 
    cs.campaign_id,
    COUNT(*) as orphaned_status
FROM campaign_status cs
LEFT JOIN campaigns c ON cs.campaign_id = c.id
WHERE c.id IS NULL
GROUP BY cs.campaign_id;

-- 4. Verificar contatos órfãos
SELECT 
    cc.campaign_id,
    COUNT(*) as orphaned_contacts
FROM campaign_contacts cc
LEFT JOIN campaigns c ON cc.campaign_id = c.id
WHERE c.id IS NULL
GROUP BY cc.campaign_id;

-- 5. Limpar execuções órfãs (execute apenas se necessário)
-- DELETE FROM campaign_executions 
-- WHERE campaign_id IN (
--     SELECT ce.campaign_id
--     FROM campaign_executions ce
--     LEFT JOIN campaigns c ON ce.campaign_id = c.id
--     WHERE c.id IS NULL
-- );

-- 6. Limpar status órfãos (execute apenas se necessário)
-- DELETE FROM campaign_status 
-- WHERE campaign_id IN (
--     SELECT cs.campaign_id
--     FROM campaign_status cs
--     LEFT JOIN campaigns c ON cs.campaign_id = c.id
--     WHERE c.id IS NULL
-- );

-- 7. Limpar contatos órfãos (execute apenas se necessário)
-- DELETE FROM campaign_contacts 
-- WHERE campaign_id IN (
--     SELECT cc.campaign_id
--     FROM campaign_contacts cc
--     LEFT JOIN campaigns c ON cc.campaign_id = c.id
--     WHERE c.id IS NULL
-- );

-- 8. Função para excluir campanha com todos os registros relacionados
-- Execute esta função para excluir uma campanha específica:
-- SELECT delete_campaign_with_related_data(campaign_id);

CREATE OR REPLACE FUNCTION delete_campaign_with_related_data(campaign_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    -- Excluir execuções de campanhas primeiro
    DELETE FROM campaign_executions WHERE campaign_id = $1;
    
    -- Excluir status/envios
    DELETE FROM campaign_status WHERE campaign_id = $1;
    
    -- Excluir contatos da campanha
    DELETE FROM campaign_contacts WHERE campaign_id = $1;
    
    -- Excluir a campanha
    DELETE FROM campaigns WHERE id = $1;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- 9. Exemplo de uso da função (substitua X pelo ID da campanha):
-- SELECT delete_campaign_with_related_data(X); 