# Solução: Sistema de Debounce para Botões

## Problema Identificado

Conforme a imagem anexada, o usuário clicou em "Presencial" e depois em "Virtual" rapidamente no mesmo bloco do fluxo, causando:

1. **Processamento de múltiplos cliques**: O sistema processou ambas as respostas
2. **Labels inconsistentes**: Foram aplicadas as labels `preferencia_presencial` e `preferencia_virtual` simultaneamente
3. **Fluxo confuso**: O sistema tentou processar ambas as ações, gerando inconsistências

## Solução Implementada

### 1. Nova Tabela: `button_debounce`

```sql
CREATE TABLE IF NOT EXISTS button_debounce (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  contact_id VARCHAR(255) NOT NULL,
  block_id VARCHAR(255) NOT NULL,
  button_text VARCHAR(500) NOT NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(conversation_id, block_id, button_text)
);
```

**Propósito**: Controlar quais botões foram processados recentemente para evitar cliques duplicados.

### 2. Funções de Controle

#### `isButtonRecentlyProcessed(conversationId, blockId, buttonText)`
- Verifica se um botão específico foi processado nos últimos 5 segundos
- Retorna `true` se o botão foi processado recentemente
- Retorna `false` se o botão pode ser processado

#### `markButtonAsProcessed(conversationId, contactId, blockId, buttonText)`
- Marca um botão como processado no momento atual
- Usa `ON CONFLICT` para atualizar o timestamp se o botão já existir

### 3. Integração no Fluxo de Processamento

Na função `processResponse()` da classe `ConversationManager`:

```javascript
if (button) {
  // ===== VERIFICAÇÃO DE DEBOUNCE DE BOTÃO =====
  const isRecentlyProcessed = await isButtonRecentlyProcessed(conversationId, conversation.current_block, button.text);
  if (isRecentlyProcessed) {
    console.log(`🚫 Botão "${button.text}" já foi processado recentemente para o bloco ${conversation.current_block}. Ignorando clique duplicado.`);
    return { 
      type: 'duplicate_button', 
      message: `Botão "${button.text}" já foi processado. Aguarde um momento antes de clicar novamente.` 
    };
  }

  // Marcar botão como processado para evitar cliques duplicados
  await markButtonAsProcessed(conversationId, contactId, conversation.current_block, button.text);
  
  console.log(`✅ Processando botão "${button.text}" para o bloco ${conversation.current_block}`);
  
  // ... resto do processamento
}
```

### 4. Sistema de Debounce Inteligente

#### **Lógica de Tempo Inteligente**
- **0-5 segundos**: Bloqueio total (evita cliques acidentais)
- **5 segundos - 5 minutos**: Bloqueio mantido (proteção contra spam)
- **5+ minutos**: Reutilização permitida (usuário pode ter voltado ao bloco)

#### **Reset Automático ao Navegar**
- Quando o usuário navega para um bloco diferente, o debounce do bloco anterior é resetado
- Permite que o usuário volte e use os botões novamente
- Funciona tanto para navegação manual quanto automática

#### `cleanOldButtonDebounce()`
- Remove registros de debounce com mais de 1 hora
- Executa automaticamente a cada 6 horas
- Evita acúmulo desnecessário de dados

#### Limpeza em Reset
- Todos os comandos de reset (`!reset`, reset via API, reset automático) agora limpam os registros de debounce
- Garante que após um reset, o usuário possa clicar nos botões novamente

## Benefícios da Solução

### ✅ Prevenção de Cliques Duplicados
- Evita processamento de múltiplos cliques no mesmo botão
- Mantém consistência no fluxo de conversa

### ✅ Performance Otimizada
- Não processa ações desnecessárias
- Reduz carga no banco de dados

### ✅ Experiência do Usuário
- Evita confusão com respostas duplicadas
- Mantém o fluxo limpo e previsível

### ✅ Manutenibilidade
- Sistema automático de limpeza
- Logs detalhados para debugging

## Configurações

### Tempo de Debounce Inteligente
- **Bloqueio imediato**: 5 segundos (evita cliques acidentais)
- **Bloqueio intermediário**: 5 segundos a 5 minutos (mantém proteção)
- **Reutilização automática**: Após 5 minutos (permite navegação de volta)
- **Reset inteligente**: Ao navegar entre blocos (reset automático do bloco anterior)

### Limpeza Automática
- **Frequência**: A cada 6 horas
- **Critério**: Registros com mais de 1 hora
- **Configurável**: Ambos os valores podem ser ajustados

## Instalação e Teste da Solução

### Instalação Automática (Recomendado)

```bash
# Navegar para o diretório workflows
cd workflows

# Executar script de instalação completo
./install-button-debounce.sh
```

### Instalação Manual

#### 1. Criar a Tabela

```bash
# Executar script SQL para criar a tabela
psql -h [DB_HOST] -p [DB_PORT] -d [DB_NAME] -U [DB_USERNAME] -f create-button-debounce-table.sql
```

#### 2. Executar Teste

```bash
# Testar se a implementação está funcionando
node test-button-debounce.js
```

### Arquivos de Instalação

- **Script SQL**: `create-button-debounce-table.sql` - Cria a tabela e índices
- **Script de Instalação**: `install-button-debounce.sh` - Instalação automática completa
- **Script de Teste**: `test-button-debounce.js` - Testes de validação
- **Documentação de Instalação**: `README_INSTALACAO_DEBOUNCE.md` - Guia detalhado

O teste verifica:
- ✅ Criação da tabela
- ✅ Verificação de debounce
- ✅ Marcação de botões processados
- ✅ Limpeza automática
- ✅ Reset de conversa

## Monitoramento

### Logs Importantes
- `🚫 Botão já foi processado recentemente` - Clique duplicado detectado
- `✅ Processando botão` - Botão processado com sucesso
- `🧹 Limpeza de debounce` - Limpeza automática executada

### Métricas
- Registros na tabela `button_debounce`
- Frequência de cliques duplicados
- Performance da limpeza automática

## Compatibilidade

### ✅ Backward Compatible
- Não afeta conversas existentes
- Funciona com todos os workflows atuais
- Não requer mudanças na configuração

### ✅ Escalável
- Sistema de limpeza automática
- Índices otimizados na tabela
- Performance mantida

## Próximos Passos

1. **Deploy**: Implementar em produção
2. **Monitoramento**: Acompanhar logs e métricas
3. **Ajustes**: Refinar tempo de debounce se necessário
4. **Documentação**: Atualizar documentação para usuários

---

**Status**: ✅ Implementado e Testado  
**Data**: 2025-01-27  
**Responsável**: Sistema de Workflow Chatbot
