# 📝 Changelog - Suporte à EvolutionAPI

## 🎯 Resumo das Mudanças

Implementado suporte completo para caixas de entrada da **EvolutionAPI** no sistema de workflows, permitindo que usuários configurem fluxos de chatbot tanto para caixas do WhatsApp Business API oficial quanto para caixas da EvolutionAPI.

## ✅ Funcionalidades Implementadas

### 1. **Identificação Automática de Caixas**
- ✅ Detecção automática de caixas da EvolutionAPI
- ✅ Suporte a múltiplos tipos de canal (`Channel::Api`, `Channel::Webhook`)
- ✅ Identificação por nome da caixa (contendo "evolution" ou "evo")
- ✅ Identificação por URL do webhook (contendo "evolution")

### 2. **Interface do Usuário**
- ✅ Indicadores visuais diferenciados (📱 WhatsApp API, 🔄 Evolution API)
- ✅ Validação automática de caixas suportadas
- ✅ Mensagens de erro informativas
- ✅ Suporte em todas as interfaces (admin e usuário)

### 3. **Backend e APIs**
- ✅ Funções utilitárias para identificação de caixas
- ✅ Suporte em todas as operações de workflow
- ✅ Compatibilidade com sistema de campanhas
- ✅ Suporte em arquivos de teste

## 🔧 Arquivos Modificados

### Frontend (`workflows/public/app.js`)
- ✅ Adicionadas funções utilitárias `isEvolutionAPIInbox()`, `isWhatsAppAPIInbox()`, `isSupportedInbox()`
- ✅ Atualizada função `populateInboxSelect()` para suportar EvolutionAPI
- ✅ Atualizada função `populateUnifiedInboxSelect()` para suportar EvolutionAPI
- ✅ Atualizada função `validateAccountAndInboxSelection()` para validar EvolutionAPI
- ✅ Atualizada função `loadInboxesDirectlyForAccount()` para suportar EvolutionAPI

### Backend (`workflows/chatbot-workflow-system.js`)
- ✅ Adicionadas funções utilitárias para identificação de caixas
- ✅ Atualizado filtro de caixas em campanhas para incluir EvolutionAPI
- ✅ Mantida compatibilidade com WhatsApp API oficial

### Arquivos de Teste
- ✅ `test-whatsapp-official-api.js`: Adicionado suporte à EvolutionAPI
- ✅ `test-chatwoot-message.js`: Adicionado suporte à EvolutionAPI
- ✅ `test-chatwoot-templates.js`: Adicionado suporte à EvolutionAPI

### Documentação
- ✅ `SUPORTE_EVOLUTION_API.md`: Documentação completa do suporte
- ✅ `CHANGELOG_EVOLUTION_API.md`: Este arquivo de changelog

## 🚀 Como Usar

### 1. **Configurar Caixa no Chatwoot**
```bash
# No painel do Chatwoot
1. Configurações → Inboxes
2. Nova caixa de entrada
3. Tipo: API ou Webhook
4. Configurar EvolutionAPI
```

### 2. **Configurar Workflow**
```bash
# No sistema de workflows
1. Acessar interface web
2. Selecionar conta e caixa (aparecerá com ícone 🔄)
3. Configurar fluxo normalmente
4. Salvar configuração
```

## 🔍 Critérios de Identificação

### Caixas da EvolutionAPI são identificadas por:

1. **Tipo de Canal**
   ```javascript
   channel_type === 'Channel::Api' ||
   channel_type === 'Channel::Webhook'
   ```

2. **Nome da Caixa**
   ```javascript
   name.toLowerCase().includes('evolution') ||
   name.toLowerCase().includes('evo')
   ```

3. **URL do Webhook**
   ```javascript
   provider_config?.webhook_url?.includes('evolution')
   ```

## 📊 Compatibilidade

### ✅ Funcionalidades Suportadas
- Criação e configuração de workflows
- Sistema de campanhas
- Envio de mensagens
- Botões interativos
- Mídia (imagens, vídeos, áudios)
- Atribuição de conversas
- Aplicação de tags

### ⚠️ Limitações
- Templates WhatsApp aprovados (apenas WhatsApp API oficial)
- Busca de templates via Meta Graph API (apenas WhatsApp API oficial)

## 🧪 Testes Realizados

### ✅ Testes de Identificação
- [x] Caixa com tipo `Channel::Api`
- [x] Caixa com tipo `Channel::Webhook`
- [x] Caixa com nome contendo "evolution"
- [x] Caixa com nome contendo "evo"
- [x] Caixa com URL do webhook contendo "evolution"

### ✅ Testes de Interface
- [x] Exibição correta de ícones
- [x] Validação de caixas suportadas
- [x] Mensagens de erro apropriadas
- [x] Funcionamento em interface admin
- [x] Funcionamento em interface usuário

### ✅ Testes de Backend
- [x] Filtro de caixas em campanhas
- [x] Processamento de workflows
- [x] Compatibilidade com sistema existente

## 🔄 Próximos Passos

### Melhorias Futuras
- [ ] Suporte a templates específicos da EvolutionAPI
- [ ] Integração direta com APIs da EvolutionAPI
- [ ] Métricas específicas para caixas da EvolutionAPI
- [ ] Configurações avançadas por tipo de caixa

### Documentação
- [ ] Guia de migração de caixas existentes
- [ ] Exemplos práticos de configuração
- [ ] Troubleshooting avançado

## 📞 Suporte

Para dúvidas ou problemas:

1. **Verificar logs**: `docker-compose logs chatbot-workflows`
2. **Testar identificação**: `node test-chatwoot-message.js`
3. **Consultar documentação**: `SUPORTE_EVOLUTION_API.md`
4. **Contato técnico**: Suporte especializado

---

**Versão**: 1.0.0  
**Data**: Dezembro 2024  
**Autor**: Sistema de Workflows  
**Compatibilidade**: EvolutionAPI + Chatwoot

