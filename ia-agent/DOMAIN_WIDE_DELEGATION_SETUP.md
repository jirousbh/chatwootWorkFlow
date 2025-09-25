# Configuração de Domain-Wide Delegation para Service Account

## 📋 Pré-requisitos
- Acesso de **Super Admin** ao Google Workspace
- Service Account já criada
- Calendário compartilhado com a Service Account

## 🔧 Passos para Configurar

### 1. **Obter Client ID da Service Account**
1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Vá em **IAM & Admin** > **Service Accounts**
3. Encontre sua Service Account
4. Copie o **Client ID** (não o Email)

### 2. **Configurar no Google Workspace Admin**
1. Acesse [Google Admin Console](https://admin.google.com/)
2. Vá em **Security** > **API Controls**
3. Clique em **Domain-wide Delegation**
4. Clique em **Add new**
5. Cole o **Client ID** da Service Account
6. Adicione os seguintes **OAuth Scopes**:
   ```
   https://www.googleapis.com/auth/calendar
   https://www.googleapis.com/auth/calendar.events
   https://www.googleapis.com/auth/calendar.settings.readonly
   ```
7. Clique em **Authorize**

### 3. **Atualizar Credenciais da Service Account**
1. Volte ao Google Cloud Console
2. Gere uma nova **chave JSON** da Service Account
3. Substitua as credenciais no sistema

## ⚠️ **Importante:**
- Domain-Wide Delegation só funciona com **Google Workspace** (não Gmail pessoal)
- Requer acesso de **Super Admin**
- Pode levar até 24h para propagar as mudanças

## 🧪 **Teste:**
Após configurar, teste criando um evento com participantes externos.
