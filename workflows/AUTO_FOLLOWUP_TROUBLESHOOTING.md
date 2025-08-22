# Auto Followup - Guia de Troubleshooting

## 🔍 Problema: Followup de 90 segundos não executou

### Passos para Diagnosticar

#### 1. **Verificar se o workflow está carregado**
```bash
# Verificar se o workflow aparece na lista
curl -X GET "http://localhost:3001/api/workflows-with-followup" \
  -H "Authorization: Bearer SEU_TOKEN"
```

**Problema comum**: Workflow não encontrado no banco de dados
**Solução**: Verificar se o workflow está salvo corretamente

#### 2. **Verificar conversas pendentes**
```bash
# Verificar se a conversa aparece na lista de pendentes
curl -X GET "http://localhost:3001/api/pending-followups" \
  -H "Authorization: Bearer SEU_TOKEN"
```

**Problema comum**: Conversa não aparece na lista
**Possíveis causas**:
- Conversa não está ativa
- Workflow não tem auto_followup configurado
- Conversa está em workflow diferente

#### 3. **Diagnóstico detalhado**
```bash
# Substitua pelos dados reais da sua conversa
curl -X GET "http://localhost:3001/api/diagnose-auto-followup?contactId=5511999999999&workflowName=wizard%20teste%20inovai" \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 🔧 Problemas Comuns e Soluções

#### **Problema 1: "Ainda não atingiu o delay"**
```
📋 Bloco bloco_7: Delay 90s, Pronto: ❌, Tempo restante: 45s
```

**Causa**: O tempo de inatividade ainda não atingiu 90 segundos
**Solução**: Aguardar ou verificar se o `last_activity` está correto

#### **Problema 2: "Bloco não existe no workflow"**
```
📋 Bloco bloco_7: Bloco existe: ❌
```

**Causa**: O bloco `bloco_7` não está definido no workflow
**Solução**: Verificar se o bloco existe no JSON do workflow

#### **Problema 3: "Já foi executado recentemente"**
```
📋 Bloco bloco_7: Já executado: ❌
```

**Causa**: O followup já foi executado e o sistema está prevenindo spam
**Solução**: Aguardar ou usar followup forçado para teste

#### **Problema 4: "Conversa não está inativa"**
```
📋 Bloco bloco_7: Conversa inativa: ❌
```

**Causa**: Usuário enviou mensagem recentemente (últimas 2 horas)
**Solução**: Verificar se há mensagens do usuário no Chatwoot

#### **Problema 5: "Bot está pausado"**
```
📋 Bloco bloco_7: Bot ativo: ❌
```

**Causa**: Bot foi pausado manualmente ou automaticamente
**Solução**: Reativar o bot para a conversa

### 🧪 Testes Manuais

#### **1. Testar Followup Forçado**
```bash
curl -X POST "http://localhost:3001/api/force-followup" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contactId": "5511999999999",
    "workflowName": "wizard teste inovai",
    "blockName": "bloco_7"
  }'
```

#### **2. Usar Script de Teste**
```bash
# Editar o arquivo test-diagnose.js com os dados corretos
node workflows/test-diagnose.js
```

### 📊 Verificações no Banco de Dados

#### **1. Verificar conversa**
```sql
SELECT * FROM workflow_conversations 
WHERE contact_id = '5511999999999' 
  AND status = 'active';
```

#### **2. Verificar última atividade**
```sql
SELECT 
  contact_id,
  workflow_name,
  current_block,
  last_activity,
  EXTRACT(EPOCH FROM (NOW() - last_activity)) / 1000 as seconds_inactive
FROM workflow_conversations 
WHERE contact_id = '5511999999999';
```

#### **3. Verificar mensagens do usuário**
```sql
SELECT COUNT(*) as count, MAX(created_at) as last_message
FROM messages m
JOIN conversations c ON m.conversation_id = c.id
WHERE c.meta->>'sender'->>'phone_number' = '5511999999999'
  AND m.message_type = 0
  AND m.created_at > NOW() - INTERVAL '2 hours';
```

#### **4. Verificar interações recentes**
```sql
SELECT * FROM workflow_interactions 
WHERE conversation_id = (SELECT id FROM workflow_conversations WHERE contact_id = '5511999999999')
  AND block_name = 'bloco_7'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### 🚨 Checklist de Verificação

- [ ] Workflow tem configuração de `auto_followup`
- [ ] Bloco `bloco_7` existe no workflow
- [ ] Conversa está ativa (`status = 'active'`)
- [ ] Tempo de inatividade >= 90 segundos
- [ ] Usuário não enviou mensagens nas últimas 2 horas
- [ ] Bot não está pausado para a conversa
- [ ] Followup não foi executado recentemente
- [ ] Scheduler está rodando (logs mostram verificação a cada 2 min)

### 📝 Logs Importantes para Verificar

```
🔄 Verificando auto followups... Horário atual: 2025-08-13 13:44:17
🔄 Encontrados 1 workflow(s) com auto_followup configurado
🔄 Verificando 1 conversa(s) em workflows com auto_followup
📋 Processando workflow 'wizard teste inovai' com 1 conversa(s)
```

Se não aparecer "⏰ Followup ativado", significa que alguma condição não foi atendida.

### 🎯 Próximos Passos

1. **Execute o diagnóstico** com os dados reais da sua conversa
2. **Verifique os logs** do sistema para ver se há erros
3. **Teste o followup forçado** para verificar se funciona
4. **Monitore os logs** na próxima execução do scheduler

### 📞 Suporte

Se o problema persistir, forneça:
- Resultado do diagnóstico (`/api/diagnose-auto-followup`)
- Logs do sistema durante a verificação
- Dados da conversa (contact_id, workflow_name)
- Configuração do workflow (JSON)
