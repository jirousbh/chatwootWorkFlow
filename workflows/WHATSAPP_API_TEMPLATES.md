# Integração com API Oficial do WhatsApp para Templates (Por Caixa de Entrada)

## Visão Geral

A aplicação agora busca templates diretamente via API oficial do WhatsApp usando as credenciais específicas da caixa de entrada selecionada no Chatwoot. Isso permite maior precisão e suporte a múltiplas contas WhatsApp no mesmo servidor.

## Configuração

### 1. Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env`:

```bash
# Configurações da API Oficial do WhatsApp
WHATSAPP_BUSINESS_ACCOUNT_ID=seu_business_account_id
WHATSAPP_API_TOKEN=seu_token_de_acesso_permanente
WHATSAPP_PHONE_ID=seu_phone_number_id
```

### 2. Como Obter as Credenciais

#### WHATSAPP_BUSINESS_ACCOUNT_ID
- Acesse o [Meta Business Manager](https://business.facebook.com/)
- Vá em "Configurações da conta" > "Contas do WhatsApp Business"
- Copie o ID da conta (ex: `102290129340398`)

#### WHATSAPP_API_TOKEN
- No Meta Business Manager, vá em "Ferramentas" > "Tokens de acesso"
- Gere um token de acesso permanente com as permissões:
  - `whatsapp_business_messaging`
  - `whatsapp_business_management`
- **Importante**: Use um token permanente, não temporário

#### WHATSAPP_PHONE_ID
- No Meta Business Manager, vá em "WhatsApp" > "Configuração da API"
- Copie o "Phone Number ID" (não o número de telefone)

### 3. Configurar Credenciais na Caixa de Entrada (Recomendado)

**⭐ Método Preferencial**: Configure as credenciais diretamente na caixa de entrada do Chatwoot:

1. **Acesse o Chatwoot Admin**
2. **Vá em "Caixas de Entrada" > Selecione sua caixa WhatsApp**
3. **Na aba "Configurações"**, adicione nos campos:
   - **Business Account ID**: Seu ID da conta business
   - **API Key**: Seu token de acesso permanente
   - **Phone Number ID**: ID do número de telefone

**Vantagens**:
- ✅ Templates específicos para cada caixa
- ✅ Não precisa reiniciar a aplicação
- ✅ Múltiplas contas WhatsApp no mesmo servidor
- ✅ Configuração mais granular

## Como Funciona

### Priorização de Métodos

1. **🚀 Caixa de Entrada Selecionada** (Primeira prioridade)
   - Usa as credenciais específicas da caixa de entrada selecionada no Chatwoot
   - Busca via `https://graph.facebook.com/v23.0/{business-account-id}/message_templates`
   - Cada caixa pode ter suas próprias credenciais do WhatsApp Business API
   - Mais preciso e específico para a operação

2. **🌐 Configurações Globais** (Segunda prioridade)
   - Usa as variáveis de ambiente globais quando a caixa não tem credenciais
   - Fallback para manter compatibilidade

3. **📱 Chatwoot** (Última opção)
   - Usado quando nenhuma API oficial está disponível
   - Busca via endpoints tradicionais do Chatwoot

### Exemplo de CURL

O comando equivalente ao que a aplicação executa (usando credenciais da caixa selecionada):

```bash
# Usando credenciais específicas da caixa de entrada selecionada
curl 'https://graph.facebook.com/v23.0/{business_account_id_da_caixa}/message_templates?fields=name,status,category,language,components&limit=100' \
-H 'Authorization: Bearer {api_key_da_caixa}'

# Exemplo prático:
curl 'https://graph.facebook.com/v23.0/102290129340398/message_templates?fields=name,status,category,language,components&limit=100' \
-H 'Authorization: Bearer EAAJB...'
```

## Interface do Usuário

### Carregamento de Templates

Na interface de campanhas, os templates são organizados por fonte:

- **🚀 [Nome da Caixa] - API Oficial (X)** - Templates específicos da caixa selecionada
- **🚀 API Oficial WhatsApp (X)** - Templates das configurações globais
- **📱 Chatwoot (Y)** - Templates via Chatwoot

### Indicador Visual

Quando templates são carregados de uma caixa específica, aparece um alerta informativo:

```
🚀 Templates da API Oficial
Carregados X templates da caixa de entrada: [Nome da Caixa]
```

### Seleção Automática

A aplicação automaticamente:
1. **Detecta** a conta e caixa selecionadas
2. **Busca** as credenciais específicas dessa caixa
3. **Carrega** templates usando as credenciais da caixa
4. **Indica** visualmente a fonte dos templates

### Sincronização

O botão "Sincronizar" agora:

1. Tenta primeiro via API oficial
2. Mostra mensagens específicas sobre a fonte:
   - `🚀 Templates via API oficial: X templates aprovados (API Oficial do WhatsApp)`
   - `⚠️ Sincronização via Chatwoot (API oficial falhou)`

## Logs e Debug

### Console do Servidor

```
🔍 Buscando templates via API oficial do WhatsApp...
🚀 Buscando templates via API oficial do WhatsApp (Business Account: 102290129340398)
🎉 25 templates APROVADOS encontrados via API oficial!
📊 Total de templates: 30, Aprovados: 25
📋 Retornando 25 templates da API oficial
```

### Console do Frontend

```
🔍 Carregando templates do WhatsApp...
📋 Templates recebidos: [25 templates]
✅ 25 templates carregados com sucesso
📊 API Oficial: 25, Chatwoot: 0
```

## Resolução de Problemas

### Erro: "API oficial não configurada"

**Causa**: Variáveis de ambiente não definidas
**Solução**: Configure `WHATSAPP_BUSINESS_ACCOUNT_ID` e `WHATSAPP_API_TOKEN`

### Erro: "Invalid OAuth access token"

**Causa**: Token expirado ou inválido
**Solução**: 
1. Gere um novo token permanente
2. Verifique as permissões necessárias
3. Atualize a variável `WHATSAPP_API_TOKEN`

### Erro: "Business account not found"

**Causa**: BUSINESS_ACCOUNT_ID incorreto
**Solução**: Verifique o ID no Meta Business Manager

### Templates não aparecem

**Possíveis causas**:
1. Templates não aprovados pelo WhatsApp
2. Token sem permissões adequadas
3. Aplicação fazendo fallback para Chatwoot

**Verificação**:
```bash
# Teste manual da API
curl 'https://graph.facebook.com/v23.0/SEU_BUSINESS_ACCOUNT_ID/message_templates?fields=name,status' \
-H 'Authorization: Bearer SEU_TOKEN'
```

## Benefícios da API Oficial

1. **Confiabilidade**: Dados direto do WhatsApp
2. **Performance**: Menos dependência do Chatwoot
3. **Atualização**: Templates sempre atualizados
4. **Compatibilidade**: Funciona independente da versão do Chatwoot
5. **Detalhes**: Informações completas sobre status, categoria e idioma

## Vantagens sobre Método Anterior

- ✅ Independente da configuração do Chatwoot
- ✅ Sempre atualizado com status real dos templates
- ✅ Mais rápido (menos requisições intermediárias)
- ✅ Compatível com qualquer versão do WhatsApp Business API
- ✅ Fallback automático para Chatwoot em caso de erro 