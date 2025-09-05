# 📸 Como Habilitar o Canal Instagram no Chatwoot

## 📋 Visão Geral

Este guia explica como configurar e habilitar o canal do Instagram no Chatwoot, permitindo receber e responder mensagens diretas do Instagram através da plataforma.

## ⚠️ Pré-requisitos

### 1. **Conta Instagram Business**
- A conta Instagram deve ser uma **conta Business** ou **Creator**
- Deve estar conectada a uma **página do Facebook**
- Precisa ter **Instagram Basic Display** ou **Instagram Graph API** habilitado

### 2. **Página do Facebook**
- Uma página do Facebook ativa
- A página deve estar conectada à conta Instagram Business
- Você deve ser administrador da página

### 3. **App Facebook Developers**
- Conta no Facebook Developers
- App criado com as permissões necessárias

## 🚀 Passo a Passo

### **Passo 1: Criar App no Facebook Developers**

1. **Acesse o Facebook Developers:**
   - URL: https://developers.facebook.com/
   - Faça login com sua conta Facebook

2. **Criar Novo App:**
   - Clique em **"Create App"**
   - Selecione **"Business"** como tipo de app
   - Preencha as informações:
     - **App Name**: Nome do seu app (ex: "Chatwoot Instagram Integration")
     - **App Contact Email**: Seu email
     - **Business Account**: Selecione sua conta business

3. **Adicionar Produtos:**
   - No painel do app, adicione os produtos:
     - **Instagram Basic Display**
     - **Instagram Graph API**
     - **Facebook Login** (se necessário)

### **Passo 2: Configurar Instagram Graph API**

1. **No painel do app, vá em "Instagram Graph API"**

2. **Configurar Webhook:**
   - **Callback URL**: `https://crm.inovaianalytics.com.br/webhooks/facebook`
   - **Verify Token**: `chatwoot_instagram_2024`
   - **Webhook Fields**: Selecione:
     - `messages`
     - `messaging_postbacks`
     - `messaging_optins`

3. **Obter Credenciais:**
   - **App ID**: Copie o ID do app
   - **App Secret**: Gere e copie a chave secreta
   - **Page Access Token**: Gere um token de acesso permanente

### **Passo 3: Configurar no Chatwoot**

1. **Acesse o Chatwoot:**
   - URL: `https://crm.inovaianalytics.com.br`
   - Faça login como administrador

2. **Criar Nova Caixa de Entrada:**
   - Vá em **Configurações** → **Inboxes**
   - Clique em **"Adicionar Caixa de Entrada"**
   - Selecione **"Facebook"**

3. **Configurar Credenciais:**
   - **App ID**: Cole o App ID do Facebook
   - **App Secret**: Cole o App Secret
   - **Page Access Token**: Cole o Page Access Token
   - **Instagram Business Account ID**: ID da conta Instagram Business

4. **Configurar Webhook:**
   - **Webhook URL**: `https://crm.inovaianalytics.com.br/webhooks/facebook`
   - **Verify Token**: `chatwoot_instagram_2024`

### **Passo 4: Testar a Configuração**

1. **Verificar Conexão:**
   - No Chatwoot, vá em **Configurações** → **Inboxes**
   - Verifique se a caixa do Instagram aparece como "Conectada"

2. **Testar Mensagens:**
   - Envie uma mensagem direta para sua conta Instagram Business
   - Verifique se a mensagem aparece no Chatwoot
   - Responda pelo Chatwoot e verifique se chega no Instagram

## 🔧 Configurações Avançadas

### **Permissões Necessárias no Facebook App**

Certifique-se de que seu app tem as seguintes permissões:

```
instagram_basic
instagram_manage_messages
pages_manage_metadata
pages_read_engagement
pages_show_list
```

### **Configuração de Webhook no Nginx**

Se você estiver usando Nginx, adicione esta configuração:

```nginx
# Configuração para webhooks do Instagram/Facebook
location /webhooks/facebook {
    proxy_pass http://localhost:4500;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Timeouts para webhooks
    proxy_read_timeout 60;
    proxy_send_timeout 60;
    proxy_connect_timeout 60;
}
```

## 🚨 Resolução de Problemas

### **Erro: "App not approved"**
- **Causa**: App não foi aprovado pelo Facebook
- **Solução**: Complete o processo de revisão do app no Facebook Developers

### **Erro: "Invalid access token"**
- **Causa**: Token expirado ou inválido
- **Solução**: 
  1. Gere um novo Page Access Token
  2. Certifique-se de que é um token permanente
  3. Verifique as permissões do token

### **Erro: "Webhook verification failed"**
- **Causa**: Verify Token incorreto
- **Solução**: 
  1. Verifique se o Verify Token no Facebook é igual ao do Chatwoot
  2. Certifique-se de que a URL do webhook está correta

### **Mensagens não chegam no Chatwoot**
- **Possíveis causas**:
  1. Webhook não configurado corretamente
  2. Permissões insuficientes no app
  3. Conta Instagram não é Business

- **Verificação**:
  1. Teste o webhook manualmente
  2. Verifique os logs do Chatwoot
  3. Confirme se a conta Instagram é Business

## 📊 Limitações Atuais do Sistema de Workflows

⚠️ **Importante**: O sistema de workflows atual **não suporta Instagram** diretamente.

### **Canais Suportados:**
- ✅ **WhatsApp Business API** (oficial)
- ✅ **EvolutionAPI** (WhatsApp)
- ❌ **Instagram** (não implementado)

### **Para Adicionar Suporte ao Instagram nos Workflows:**

Se você quiser que o sistema de workflows funcione com Instagram, seria necessário:

1. **Estender o código** para suportar `Channel::Facebook` ou `Channel::Instagram`
2. **Adicionar APIs** específicas do Instagram Graph API
3. **Modificar as funções** de identificação de canais no arquivo `chatbot-workflow-system.js`

## 🔄 Próximos Passos

### **Imediato:**
1. Configure o Instagram no Chatwoot seguindo este guia
2. Teste se as mensagens chegam e podem ser respondidas
3. Configure agentes e regras de atribuição

### **Futuro (se necessário):**
1. Estender o sistema de workflows para suportar Instagram
2. Implementar templates específicos para Instagram
3. Adicionar funcionalidades específicas da plataforma

## 📞 Suporte

Se encontrar problemas durante a configuração:

1. **Verifique os logs** do Chatwoot em `/var/log/chatwoot/`
2. **Teste o webhook** manualmente usando curl
3. **Consulte a documentação** oficial do Facebook Developers
4. **Verifique as permissões** do app no Facebook

## 📚 Recursos Úteis

- [Facebook Developers - Instagram Graph API](https://developers.facebook.com/docs/instagram-api/)
- [Chatwoot - Facebook Integration](https://www.chatwoot.com/docs/product/channels/facebook)
- [Instagram Business - Getting Started](https://business.instagram.com/getting-started)

---

**Última atualização**: Janeiro 2025  
**Versão**: 1.0  
**Compatibilidade**: Chatwoot v3.0+, Instagram Graph API v18.0+
