# 🚫 Filtro EvolutionAPI - Sistema de Workflows

## 📋 Visão Geral

Implementado um sistema de filtro para evitar que o workflow envie mensagens para o contato **EvolutionAPI** (número +123456), que é usado pelo sistema para enviar QR codes e notificações.

## 🔍 Como Funciona

O sistema identifica automaticamente o contato EvolutionAPI através de:

1. **Nome do contato**: Contém "evolutionapi" (case insensitive)
2. **Número de telefone**: Contém "+123456" ou "123456"

## 🛡️ Pontos de Verificação Implementados

### 1. **Processamento de Mensagens de Usuário**
- **Função**: `processUserMessage()`
- **Localização**: Linha ~3006
- **Ação**: Ignora completamente mensagens vindas do contato EvolutionAPI

### 2. **Processamento de Conversas do Chatwoot**
- **Função**: `processChatwootConversation()`
- **Localização**: Linha ~2800
- **Ação**: Não processa conversas iniciadas pelo contato EvolutionAPI

### 3. **Auto Followups**
- **Função**: `executeAutoFollowup()`
- **Localização**: Linha ~2570
- **Ação**: Cancela auto followups para o contato EvolutionAPI

### 4. **Campanhas**
- **Função**: `processCampaign()`
- **Localização**: Linha ~5713
- **Ação**: Pula contatos EvolutionAPI durante o envio de campanhas

## 🔧 Função de Verificação

```javascript
async function isEvolutionAPIContact(contactId, accountId = CHATWOOT_ACCOUNT_ID) {
  try {
    // Buscar informações do contato
    const response = await axios.get(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts/${contactId}`,
      {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN }
      }
    );
    
    if (response.data && response.data.payload) {
      const contact = response.data.payload;
      const contactName = contact.name || '';
      const phoneNumber = contact.phone_number || '';
      
      // Verificar se é o contato EvolutionAPI pelo nome ou telefone
      const isEvolutionAPI = contactName.toLowerCase().includes('evolutionapi') || 
                            phoneNumber.includes('+123456') ||
                            phoneNumber.includes('123456');
      
      if (isEvolutionAPI) {
        console.log(`🚫 Contato EvolutionAPI detectado: ${contactName} (${phoneNumber})`);
      }
      
      return isEvolutionAPI;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Erro ao verificar se é contato EvolutionAPI:', error);
    return false;
  }
}
```

## 📝 Logs de Sistema

O sistema registra logs específicos quando detecta o contato EvolutionAPI:

- `🚫 Contato EvolutionAPI detectado: [nome] ([telefone])`
- `🚫 Ignorando mensagem do contato EvolutionAPI ([contactId]): [mensagem]`
- `🚫 Ignorando conversa do contato EvolutionAPI: [nome] ([telefone]) - ID: [conversationId]`
- `🚫 Auto followup cancelado: contato EvolutionAPI detectado ([contactId])`
- `🚫 Ignorando contato EvolutionAPI na campanha: [nome] ([telefone])`

## ✅ Benefícios

1. **Evita Spam**: Impede que o bot envie mensagens desnecessárias para o contato do sistema
2. **Melhora Performance**: Reduz processamento desnecessário
3. **Logs Limpos**: Evita logs confusos de interações com o sistema
4. **Segurança**: Protege contra loops de mensagens automáticas

## 🔄 Compatibilidade

- ✅ **WhatsApp Business API**
- ✅ **EvolutionAPI**
- ✅ **Campanhas**
- ✅ **Auto Followups**
- ✅ **Comandos de Sistema**

## 🚀 Como Testar

1. Envie uma mensagem do contato EvolutionAPI
2. Verifique os logs do sistema
3. Confirme que nenhuma resposta automática foi enviada
4. Verifique que o contato não aparece em campanhas ou auto followups

## 📋 Configuração

O filtro é **automático** e não requer configuração adicional. Ele funciona baseado na identificação do contato EvolutionAPI através do nome e número de telefone.

---

**Data de Implementação**: Dezembro 2024  
**Versão**: 1.0  
**Compatibilidade**: Todas as versões do sistema de workflows
