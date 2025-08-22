# Correção do Problema de AccountId na Reinicialização de Bots

## Problema Identificado

O sistema estava apresentando o erro:
```
⚠️ Não foi possível obter accountId para conversa 72, usando padrão
```

Isso acontecia porque:

1. **Falta de `conversation_id` na tabela `workflow_conversations`**: O `conversation_id` estava sendo salvo apenas no campo `data` (JSON), mas não na coluna `conversation_id` da tabela.

2. **Busca inadequada do `accountId`**: O código tentava buscar o `accountId` apenas na tabela `workflow_conversations` usando `conversation_id`, mas como essa coluna estava vazia, a busca falhava.

## Correções Implementadas

### 1. Correção na Função `startConversation`

**Arquivo**: `workflows/chatbot-workflow-system.js`

**Problema**: A função não estava salvando o `conversation_id` na coluna correta da tabela.

**Solução**: Modificada para salvar o `conversation_id` tanto no campo `data` quanto na coluna `conversation_id`:

```javascript
// Antes
const result = await pool.query(
  'INSERT INTO workflow_conversations (contact_id, workflow_name, current_block, data, account_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
  [contactId, workflowName, 'bloco_1', JSON.stringify(initialData), accountId]
);

// Depois
const result = await pool.query(
  'INSERT INTO workflow_conversations (contact_id, workflow_name, current_block, data, account_id, conversation_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
  [contactId, workflowName, 'bloco_1', JSON.stringify(initialData), accountId, initialData.conversation_id || null]
);
```

### 2. Nova Função Auxiliar `getAccountIdForConversation`

**Arquivo**: `workflows/chatbot-workflow-system.js`

**Função**: Busca o `accountId` de forma robusta, considerando múltiplas fontes:

```javascript
async function getAccountIdForConversation(conversationId) {
  try {
    // 1. Buscar na tabela workflow_conversations
    const conversationResult = await pool.query(
      'SELECT account_id FROM workflow_conversations WHERE conversation_id = $1',
      [conversationId]
    );
    
    if (conversationResult.rows.length > 0 && conversationResult.rows[0].account_id) {
      return conversationResult.rows[0].account_id;
    }
    
    // 2. Buscar via bot_conversation_status usando contact_id
    const botStatusResult = await pool.query(
      'SELECT contact_id FROM bot_conversation_status WHERE conversation_id = $1',
      [conversationId]
    );
    
    if (botStatusResult.rows.length > 0) {
      const contactId = botStatusResult.rows[0].contact_id;
      
      const contactResult = await pool.query(
        'SELECT account_id FROM workflow_conversations WHERE contact_id = $1 AND status = $2',
        [contactId, 'active']
      );
      
      if (contactResult.rows.length > 0 && contactResult.rows[0].account_id) {
        return contactResult.rows[0].account_id;
      }
    }
    
    // 3. Fallback para o padrão
    return CHATWOOT_ACCOUNT_ID;
  } catch (error) {
    console.error(`❌ Erro ao buscar accountId para conversa ${conversationId}:`, error);
    return CHATWOOT_ACCOUNT_ID;
  }
}
```

### 3. Atualização da Função `checkAndReactivateBotsAfter24Hours`

**Arquivo**: `workflows/chatbot-workflow-system.js`

**Problema**: Usava busca direta no banco que falhava quando `conversation_id` não estava salvo.

**Solução**: Substituída pela nova função auxiliar:

```javascript
// Antes
let accountId = CHATWOOT_ACCOUNT_ID;
try {
  const conversationResult = await pool.query(
    'SELECT account_id FROM workflow_conversations WHERE conversation_id = $1',
    [conversation_id]
  );
  if (conversationResult.rows.length > 0 && conversationResult.rows[0].account_id) {
    accountId = conversationResult.rows[0].account_id;
  }
} catch (err) {
  console.log(`⚠️ Não foi possível obter accountId para conversa ${conversation_id}, usando padrão`);
}

// Depois
const accountId = await getAccountIdForConversation(conversation_id);
```

## Script de Migração

**Arquivo**: `workflows/fix-conversation-ids.sql`

Script para corrigir conversas existentes que não têm o `conversation_id` salvo corretamente:

```sql
-- Atualizar conversas que têm conversation_id no data mas não na coluna
UPDATE workflow_conversations 
SET conversation_id = (data->>'conversation_id')::integer
WHERE status = 'active'
    AND data::text LIKE '%"conversation_id"%'
    AND (conversation_id IS NULL OR conversation_id != (data->>'conversation_id')::integer);
```

## Como Aplicar as Correções

### 1. Reiniciar o Sistema

```bash
# Reiniciar o sistema de workflows
pm2 restart chatbot-workflow-system

# Verificar logs
pm2 logs chatbot-workflow-system
```

### 2. Executar Script de Migração (Opcional)

Se houver conversas antigas que precisam ser corrigidas:

```bash
# Conectar ao banco de dados
psql -h postgres -U postgres -d chatwoot_workflows

# Executar o script
\i workflows/fix-conversation-ids.sql
```

### 3. Verificar Funcionamento

Monitorar os logs para confirmar que o erro não aparece mais:

```bash
# Verificar logs em tempo real
pm2 logs chatbot-workflow-system --lines 100

# Procurar por mensagens de sucesso
grep "Bot reinicializado" data/workflows-logs/chatwoot-*.log
```

## Benefícios das Correções

1. **Identificação correta do `accountId`**: O sistema agora consegue identificar o `accountId` correto para cada conversa.

2. **Robustez**: A nova função auxiliar tenta múltiplas estratégias para encontrar o `accountId`.

3. **Consistência de dados**: O `conversation_id` agora é salvo corretamente na coluna da tabela.

4. **Eliminação de erros**: O erro "Não foi possível obter accountId" não deve mais aparecer.

5. **Compatibilidade**: As correções são retrocompatíveis e não afetam conversas existentes.

## Monitoramento

Após aplicar as correções, monitore:

- Logs do sistema para confirmar que não há mais erros de `accountId`
- Funcionamento da reinicialização automática de bots
- Performance geral do sistema

## Notas Importantes

- As correções são aplicadas automaticamente para novas conversas
- Conversas antigas podem precisar do script de migração
- O sistema mantém compatibilidade com a estrutura existente
- Não há necessidade de downtime para aplicar as correções
