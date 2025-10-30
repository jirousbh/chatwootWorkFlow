# 🔄 Suporte à EvolutionAPI - Sistema de Workflows

## 📋 Visão Geral

O sistema de workflows agora suporta **caixas de entrada da EvolutionAPI** além das caixas do WhatsApp Business API oficial. Isso permite maior flexibilidade na configuração de fluxos de chatbot.

## ✅ Tipos de Caixas Suportadas

### 1. **WhatsApp Business API Oficial**
- **Tipo**: `Channel::Whatsapp`
- **Ícone**: 📱
- **Descrição**: Caixas configuradas com a API oficial do WhatsApp Business

### 2. **EvolutionAPI**
- **Tipos**: `Channel::Api`, `Channel::Webhook`
- **Ícone**: 🔄
- **Descrição**: Caixas configuradas com a EvolutionAPI

### 3. **Website/LiveChat**
- **Tipos**: `Channel::Website`, `Channel::Web`, `Channel::LiveChat`, `Channel::WebWidget`
- **Ícone**: 🌐
- **Descrição**: Caixas de entrada para chat ao vivo em websites

## 🔍 Como o Sistema Identifica Caixas da EvolutionAPI

O sistema identifica automaticamente caixas da EvolutionAPI através de:

### 1. **Tipo de Canal**
```javascript
inbox.channel_type === 'Channel::Api' ||
inbox.channel_type === 'Channel::Webhook'
```

### 2. **Nome da Caixa**
```javascript
inbox.name.toLowerCase().includes('evolution') ||
inbox.name.toLowerCase().includes('evo')
```

### 3. **URL do Webhook**
```javascript
inbox.provider_config?.webhook_url?.includes('evolution')
```

## 🚀 Como Configurar

### 1. **No Chatwoot**

1. Acesse o painel do Chatwoot
2. Vá em **Configurações → Inboxes**
3. Crie uma nova caixa de entrada
4. Configure como **API** ou **Webhook**
5. Configure a EvolutionAPI como provedor

### 2. **No Sistema de Workflows**

1. Acesse a interface web: `http://localhost:3001`
2. Faça login como administrador
3. Selecione a conta e a caixa da EvolutionAPI
4. A caixa aparecerá com o ícone 🔄 (Evolution API)
5. Configure o fluxo normalmente

## 📱 Interface do Usuário

### Indicadores Visuais

- **📱 WhatsApp API**: Caixas da API oficial do WhatsApp
- **🔄 Evolution API**: Caixas da EvolutionAPI
- **🌐 Website**: Caixas de entrada para chat ao vivo em websites
- **❌ Não suportado**: Outros tipos de caixa

### Validação Automática

O sistema valida automaticamente se a caixa é suportada:

```javascript
// Exemplo de validação
if (!this.isSupportedInbox(inbox)) {
    this.showAlert('Caixa não suportada. Apenas WhatsApp API e Evolution API são suportadas.');
    return false;
}
```

## 🔧 Funções Utilitárias

### Frontend (app.js)

```javascript
// Verificar se é caixa da EvolutionAPI
this.isEvolutionAPIInbox(inbox)

// Verificar se é caixa do WhatsApp API
this.isWhatsAppAPIInbox(inbox)

// Verificar se é caixa suportada
this.isSupportedInbox(inbox)
```

### Backend (chatbot-workflow-system.js)

```javascript
// Verificar se é caixa da EvolutionAPI
isEvolutionAPIInbox(inbox)

// Verificar se é caixa do WhatsApp API
isWhatsAppAPIInbox(inbox)

// Verificar se é caixa suportada
isSupportedInbox(inbox)
```

## 📊 Compatibilidade

### Funcionalidades Suportadas

✅ **Criação de fluxos**  
✅ **Configuração de workflows**  
✅ **Sistema de campanhas**  
✅ **Envio de mensagens**  
✅ **Botões interativos**  
✅ **Mídia (imagens, vídeos, áudios)**  
✅ **Templates de mensagem**  
✅ **Atribuição de conversas**  
✅ **Aplicação de tags**  

### Limitações

⚠️ **Templates WhatsApp**: Apenas caixas do WhatsApp API oficial podem usar templates aprovados  
⚠️ **API de Templates**: Busca de templates via Meta Graph API só funciona com WhatsApp API oficial  

## 🔄 Fluxo de Funcionamento

### 1. **Identificação**
```javascript
// O sistema identifica automaticamente o tipo de caixa
const inboxType = this.isEvolutionAPIInbox(inbox) ? 'EvolutionAPI' : 'WhatsAppAPI';
```

### 2. **Validação**
```javascript
// Valida se a caixa é suportada
if (!this.isSupportedInbox(inbox)) {
    // Mostra erro e impede continuidade
}
```

### 3. **Processamento**
```javascript
// Processa normalmente, independente do tipo
await this.processWorkflow(inbox, message);
```

## 🛠️ Troubleshooting

### Problema: Caixa não aparece como suportada

**Solução:**
1. Verifique se o nome contém "evolution" ou "evo"
2. Verifique se o tipo é `Channel::Api` ou `Channel::Webhook`
3. Verifique se a URL do webhook contém "evolution"

### Problema: Erro ao configurar fluxo

**Solução:**
1. Verifique se a EvolutionAPI está funcionando
2. Verifique se a caixa está ativa no Chatwoot
3. Verifique os logs do sistema

### Problema: Mensagens não são enviadas

**Solução:**
1. Verifique a configuração da EvolutionAPI
2. Verifique se o webhook está configurado corretamente
3. Verifique os logs da EvolutionAPI

## 📝 Exemplos de Configuração

### Exemplo 1: Caixa com Nome Específico
```javascript
{
  "id": 1,
  "name": "Evolution WhatsApp",
  "channel_type": "Channel::Api",
  "provider_config": {
    "webhook_url": "https://evolution-api.example.com/webhook"
  }
}
```

### Exemplo 2: Caixa com URL do Webhook
```javascript
{
  "id": 2,
  "name": "WhatsApp Principal",
  "channel_type": "Channel::Webhook",
  "provider_config": {
    "webhook_url": "https://evo-api.example.com/webhook"
  }
}
```

## 🔗 Links Úteis

- [Documentação da EvolutionAPI](https://doc.evolution-api.com/)
- [Configuração no Chatwoot](https://www.chatwoot.com/docs/product/channels/whatsapp)
- [Sistema de Workflows](../README.md)

## 📞 Suporte

Para dúvidas ou problemas:

1. Verifique os logs do sistema
2. Consulte a documentação da EvolutionAPI
3. Entre em contato com o suporte técnico

---

**Versão**: 1.0  
**Data**: Dezembro 2024  
**Compatibilidade**: EvolutionAPI + Chatwoot

