# Correção do Problema de Exclusão de Campanhas

## Problema
O erro `violates foreign key constraint "campaign_executions_campaign_id_fkey"` ocorre quando você tenta excluir uma campanha que tem registros relacionados na tabela `campaign_executions`.

## Causa
A tabela `campaign_executions` tem uma chave estrangeira que referencia a tabela `campaigns`. Quando você tenta excluir uma campanha, o PostgreSQL impede a operação se existem registros na tabela `campaign_executions` que referenciam essa campanha.

## Solução Implementada

### 1. Correção no Código Principal
O arquivo `chatbot-workflow-system.js` foi corrigido para excluir os registros relacionados na ordem correta:

```javascript
// Excluir execuções de campanhas primeiro (devido à foreign key constraint)
await pool.query('DELETE FROM campaign_executions WHERE campaign_id = $1', [id]);

// Excluir status/envios
await pool.query('DELETE FROM campaign_status WHERE campaign_id = $1', [id]);

// Excluir contatos da campanha
await pool.query('DELETE FROM campaign_contacts WHERE campaign_id = $1', [id]);

// Excluir a campanha
const result = await pool.query('DELETE FROM campaigns WHERE id = $1 RETURNING *', [id]);
```

### 2. Correção nos Arquivos de Teste
Os arquivos `test-scheduling.js` e `test-template-language.js` também foram corrigidos para lidar corretamente com as foreign keys.

## Como Resolver o Problema Atual

### Opção 1: Usar o Script Node.js (Recomendado)

1. **Verificar o estado atual:**
   ```bash
   node fix-campaign-deletion.js
   ```

2. **Limpar registros órfãos (se necessário):**
   ```bash
   node fix-campaign-deletion.js --clean-orphans
   ```

3. **Excluir uma campanha específica:**
   ```bash
   node fix-campaign-deletion.js --delete-campaign <ID_DA_CAMPANHA>
   ```

### Opção 2: Usar o Script SQL

1. **Conectar ao PostgreSQL:**
   ```bash
   psql -d chatwoot
   ```

2. **Executar o script:**
   ```sql
   \i fix-campaign-deletion.sql
   ```

3. **Para excluir uma campanha específica:**
   ```sql
   SELECT delete_campaign_with_related_data(<ID_DA_CAMPANHA>);
   ```

### Opção 3: Exclusão Manual via SQL

```sql
-- 1. Excluir execuções da campanha
DELETE FROM campaign_executions WHERE campaign_id = <ID_DA_CAMPANHA>;

-- 2. Excluir status da campanha
DELETE FROM campaign_status WHERE campaign_id = <ID_DA_CAMPANHA>;

-- 3. Excluir contatos da campanha
DELETE FROM campaign_contacts WHERE campaign_id = <ID_DA_CAMPANHA>;

-- 4. Excluir a campanha
DELETE FROM campaigns WHERE id = <ID_DA_CAMPANHA>;
```

## Verificações Importantes

### 1. Verificar Campanhas com Registros Relacionados
```sql
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
HAVING COUNT(ce.id) > 0 OR COUNT(cs.id) > 0 OR COUNT(cc.id) > 0
ORDER BY executions_count DESC;
```

### 2. Verificar Registros Órfãos
```sql
-- Execuções órfãs
SELECT COUNT(*) FROM campaign_executions ce
LEFT JOIN campaigns c ON ce.campaign_id = c.id
WHERE c.id IS NULL;

-- Status órfãos
SELECT COUNT(*) FROM campaign_status cs
LEFT JOIN campaigns c ON cs.campaign_id = c.id
WHERE c.id IS NULL;

-- Contatos órfãos
SELECT COUNT(*) FROM campaign_contacts cc
LEFT JOIN campaigns c ON cc.campaign_id = c.id
WHERE c.id IS NULL;
```

## Prevenção Futura

1. **Sempre use a API correta** para excluir campanhas através da interface web
2. **Evite exclusões diretas no banco** sem considerar as foreign keys
3. **Teste as operações** em ambiente de desenvolvimento primeiro
4. **Mantenha backups** antes de operações críticas

## Estrutura das Tabelas

### Tabela `campaigns`
- `id` (PRIMARY KEY)
- `name`, `description`, `workflow_name`, etc.

### Tabela `campaign_executions`
- `id` (PRIMARY KEY)
- `campaign_id` (FOREIGN KEY → campaigns.id)
- `contact_id`, `conversation_id`, `status`, etc.

### Tabela `campaign_status`
- `id` (PRIMARY KEY)
- `campaign_id` (FOREIGN KEY → campaigns.id)
- `contact_id`, `status`, `message_id`, etc.

### Tabela `campaign_contacts`
- `id` (PRIMARY KEY)
- `campaign_id` (FOREIGN KEY → campaigns.id)
- `name`, `phone`, etc.

## Contato para Suporte

Se você continuar enfrentando problemas, verifique:
1. Se todas as tabelas foram criadas corretamente
2. Se as foreign keys estão configuradas adequadamente
3. Se há permissões suficientes no banco de dados
4. Os logs do sistema para mensagens de erro detalhadas 