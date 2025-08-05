# Documentação - Sistema de Atribuições no Workflow

## Funcionalidades Implementadas

O sistema de workflow agora suporta as seguintes funcionalidades de atribuição automática:

### 1. Atribuição de Agente (`assign_agent`)
- **Descrição**: Atribui a conversa a um agente específico do Chatwoot
- **Uso**: Pode ser aplicado em blocos ou botões
- **Formato**: `"assign_agent": 123` (onde 123 é o ID do agente)

### 2. Atribuição de Time (`assign_team`)
- **Descrição**: Atribui a conversa a um time específico do Chatwoot (sem atribuir a agente específico)
- **Uso**: Pode ser aplicado em blocos ou botões
- **Formato**: `"assign_team": 456` (onde 456 é o ID do time)
- **Comportamento**: A conversa fica disponível para qualquer membro do time, sem ser atribuída a um agente específico

### 3. Etiquetas na Conversa (`assign_labels`)
- **Descrição**: Adiciona etiquetas/labels à conversa no Chatwoot
- **Uso**: Pode ser aplicado em blocos ou botões
- **Formato**: `"assign_labels": ["etiqueta1", "etiqueta2"]`

### 4. Etiquetas no Contato (`contact_labels`)
- **Descrição**: Adiciona etiquetas/labels ao contato no Chatwoot
- **Uso**: Pode ser aplicado em blocos ou botões
- **Formato**: `"contact_labels": ["etiqueta1", "etiqueta2"]`

## Estrutura dos Blocos

### Exemplo de Bloco com Atribuições:
```json
{
  "id": "exemplo_bloco",
  "name": "Exemplo de Bloco",
  "assign_agent": 123,
  "assign_team": 456,
  "assign_labels": ["etiqueta_bloco"],
  "contact_labels": ["etiqueta_contato"],
  "message": "Mensagem do bloco",
  "buttons": [
    {
      "text": "Opção 1",
      "assign_agent": 789,
      "assign_labels": ["etiqueta_botao"],
      "contact_labels": ["etiqueta_contato_botao"],
      "next_block": "proximo_bloco"
    }
  ]
}
```

### Exemplo de Botão com Atribuições:
```json
{
  "text": "Preciso de ajuda",
  "assign_agent": 123,
  "assign_team": 456,
  "assign_labels": ["ajuda_solicitada", "priority_high"],
  "contact_labels": ["necessita_suporte"],
  "next_block": "atendimento_humano"
}
```

## Quando as Atribuições São Executadas

1. **Início do Fluxo**: As atribuições do primeiro bloco são aplicadas quando o usuário inicia a conversa
2. **Seleção de Botão**: As atribuições do botão são aplicadas quando o usuário clica/seleciona uma opção
3. **Entrada em Novo Bloco**: As atribuições do bloco são aplicadas quando o fluxo entra em um novo bloco
4. **Fluxo Automático**: Em blocos sem botões, as atribuições são aplicadas automaticamente

## APIs Disponíveis

### Buscar Agentes
```
GET /api/chatwoot/agents
Headers: Authorization: Bearer <token>
```

### Buscar Times
```
GET /api/chatwoot/teams
Headers: Authorization: Bearer <token>
```

### Buscar Etiquetas Existentes
```
GET /api/chatwoot/tags
Headers: Authorization: Bearer <token>
```

### Criar Nova Etiqueta/Label
```
POST /api/chatwoot/labels
Headers: Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "title": "nome_do_label",
  "description": "Descrição opcional do label",
  "color": "#ff6b35"
}
```

**Parâmetros:**
- `title` (obrigatório): Nome do label
- `description` (opcional): Descrição do label
- `color` (opcional): Cor em formato hexadecimal (ex: #ff6b35)

## Exemplos Práticos

### 1. Lead Quente - Atribuir Agente Específico
```json
{
  "text": "Quero comprar agora",
  "assign_agent": 123,
  "assign_labels": ["hot_lead", "urgente"],
  "contact_labels": ["cliente_potencial"],
  "next_block": "fechamento"
}
```

### 2. Dúvida Técnica - Atribuir Time de Suporte
```json
{
  "text": "Tenho problemas técnicos",
  "assign_team": 456,
  "assign_labels": ["suporte_tecnico", "bug_report"],
  "contact_labels": ["usuario_com_problema"],
  "next_block": "suporte_tecnico"
}
```

### 3. Segmentação por Interesse
```json
{
  "id": "escolha_produto",
  "name": "Escolha do Produto",
  "assign_labels": ["produto_visualizado"],
  "buttons": [
    {
      "text": "Produto Premium",
      "assign_labels": ["interesse_premium"],
      "contact_labels": ["high_value"],
      "next_block": "premium_info"
    },
    {
      "text": "Produto Básico",
      "assign_labels": ["interesse_basico"],
      "contact_labels": ["price_sensitive"],
      "next_block": "basico_info"
    }
  ]
}
```

### 4. Criação Automática de Labels em Ação
Quando um usuário entra no fluxo e escolhe "Produto Premium", o sistema fará:

```
🔍 Verificando se label "produto_visualizado" existe...
✅ Label "produto_visualizado" criado com sucesso
🔍 Verificando se label "interesse_premium" existe...
✅ Label "interesse_premium" criado com sucesso
🔍 Verificando se label "high_value" existe...
✅ Label "high_value" criado com sucesso
✅ Etiquetas [produto_visualizado] adicionadas à conversa 456
✅ Etiquetas [interesse_premium] adicionadas à conversa 456
✅ Labels [high_value] adicionadas ao contato 123
```

## Criação Automática de Labels

✅ **O sistema cria automaticamente os labels que não existirem!**

### Como Funciona:
1. **Verificação**: Antes de aplicar qualquer label, o sistema verifica se ele já existe
2. **Criação Automática**: Se o label não existir, ele é criado automaticamente
3. **Cache Inteligente**: Os labels são armazenados em cache por 5 minutos para melhor performance
4. **Cor Padrão**: Labels criados automaticamente usam a cor `#1f2937` (cinza escuro)

### Exemplo de Log:
```
✅ Label "hot_lead" criado com sucesso
🔍 Tentando adicionar etiquetas à conversa 123: [hot_lead, promocao_interesse]
✅ Etiquetas [hot_lead, promocao_interesse] adicionadas à conversa 123
```

### Tratamento de Erros:
Se uma conversa não for encontrada, o sistema irá:
```
🔍 Tentando adicionar etiquetas à conversa 456: [interesse_confirmado]
❌ Conversa 456 não encontrada: 404
⚠️ Conversa 456 não existe, pulando adição de etiquetas
```

## Funções de Atribuição de Time

### `assignConversationToTeam(conversationId, teamId)`
- **Comportamento**: Atribui a conversa ao time e remove automaticamente a atribuição de agente específico
- **Processo**: 
  1. Atribui ao time
  2. Define `assignee_id` como `null` para remover atribuição de agente
- **Resultado**: Conversa fica disponível para qualquer membro do time

### `assignConversationToTeamOnly(conversationId, teamId)`
- **Comportamento**: Atribui ao time e remove agente em uma única operação
- **Processo**: Envia `team_id` e `assignee_id: null` simultaneamente
- **Resultado**: Conversa fica disponível para qualquer membro do time

## Notas Importantes

1. **IDs Válidos**: Certifique-se de usar IDs válidos de agentes e times do seu Chatwoot
2. **Etiquetas**: As etiquetas serão criadas automaticamente se não existirem
3. **Múltiplas Atribuições**: Você pode combinar todas as funcionalidades no mesmo bloco/botão
4. **Ordem de Execução**: As atribuições são processadas na seguinte ordem:
   - Criação automática de labels (se necessário)
   - Atribuição de agente
   - Atribuição de time  
   - Etiquetas na conversa
   - Etiquetas no contato
5. **Cache de Performance**: Labels são cacheados por 5 minutos para reduzir chamadas à API
6. **Atribuição de Time**: A função `assign_team` agora garante que a conversa não seja atribuída a um agente específico

## Casos de Uso Recomendados

### Marketing e Vendas
- Segmentar leads por interesse
- Priorizar atendimento de leads quentes
- Identificar origem do lead

### Suporte ao Cliente
- Rotear por tipo de problema
- Atribuir especialistas por área
- Categorizar tipos de solicitação

### Qualificação de Leads
- Marcar estágio no funil
- Identificar perfil do cliente
- Priorizar follow-up

## Troubleshooting

### Erro: "Resource could not be found"

**Causa**: O ID da conversa não foi encontrado no Chatwoot.

**Solução**: O sistema agora:
1. ✅ **Valida** se o conversationId existe antes de tentar aplicar atribuições
2. ✅ **Pula** operações se a conversa não existir (evita erros)
3. ✅ **Logs detalhados** para debug
4. ✅ **Fallback seguro** - continua funcionando mesmo com erros

### Debug de ConversationId

O sistema agora mostra logs detalhados:
```
🔧 Processando ações do bloco "Início" - ConversationId: 123, ContactId: +5511999999999
🔍 Tentando adicionar etiquetas à conversa 123: [novo_lead]
✅ Etiquetas [novo_lead] adicionadas à conversa 123
```

### Problemas Comuns

1. **ConversationId null/undefined**
   - Logs: `⚠️ ConversationId inválido, pulando adição de etiquetas à conversa`
   - Causa: Problema na integração com Chatwoot
   - Solução: Verificar configuração do polling

2. **Conversa não existe (404)**
   - Logs: `❌ Conversa 123 não encontrada: 404`
   - Causa: Conversa foi deletada ou ID incorreto
   - Solução: Sistema pula a operação automaticamente

3. **Labels criados mas não aplicados**
   - Logs: `✅ Label "teste" criado com sucesso` + `⚠️ Conversa não existe`
   - Causa: ConversationId inválido
   - Solução: Labels ficam criados para uso futuro 