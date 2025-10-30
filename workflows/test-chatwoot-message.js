const axios = require('axios');
require('dotenv').config();

// Configurações do Chatwoot
const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN;
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || '1';

// Função utilitária para identificar caixas da EvolutionAPI
function isEvolutionAPIInbox(inbox) {
  return inbox.channel_type === 'Channel::Api' || 
         inbox.channel_type === 'Channel::Webhook' ||
         (inbox.name && inbox.name.toLowerCase().includes('evolution')) ||
         (inbox.name && inbox.name.toLowerCase().includes('evo')) ||
         (inbox.provider_config && inbox.provider_config.webhook_url && 
          inbox.provider_config.webhook_url.includes('evolution'));
}

// Função utilitária para identificar caixas do WhatsApp API
function isWhatsAppAPIInbox(inbox) {
  return inbox.channel_type === 'Channel::Whatsapp';
}

// Função utilitária para identificar caixas de entrada do tipo Website
function isWebsiteInbox(inbox) {
  return inbox.channel_type === 'Channel::Website' || 
         inbox.channel_type === 'Channel::Web' ||
         inbox.channel_type === 'Channel::LiveChat' ||
         inbox.channel_type === 'Channel::WebWidget' ||
         (inbox.name && inbox.name.toLowerCase().includes('website')) ||
         (inbox.name && inbox.name.toLowerCase().includes('site')) ||
         (inbox.name && inbox.name.toLowerCase().includes('web')) ||
         (inbox.name && inbox.name.toLowerCase().includes('livechat'));
}

// Função utilitária para verificar se uma caixa é suportada
function isSupportedInbox(inbox) {
  return isWhatsAppAPIInbox(inbox) || isEvolutionAPIInbox(inbox) || isWebsiteInbox(inbox);
}

async function testChatwootMessage() {
  console.log('🧪 TESTE DE ENVIO DE MENSAGEM VIA CHATWOOT\n');
  
  // 1. Verificar configurações
  console.log('📋 Configurações:');
  console.log(`🌐 CHATWOOT_BASE_URL: ${CHATWOOT_BASE_URL}`);
  console.log(`🏢 CHATWOOT_ACCOUNT_ID: ${CHATWOOT_ACCOUNT_ID}`);
  console.log(`🔑 Token: ${CHATWOOT_API_TOKEN ? 'CONFIGURADO' : 'NÃO CONFIGURADO'}`);
  
  if (!CHATWOOT_API_TOKEN) {
    console.error('\n❌ Token não configurado!');
    process.exit(1);
  }
  
  try {
    // 2. Buscar caixas de entrada WhatsApp
    console.log('\n📱 Buscando caixas WhatsApp...');
    
    const inboxesResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN }
    });
    
    const whatsappInboxes = (inboxesResponse.data.payload || []).filter(i => isSupportedInbox(i));
    
    if (whatsappInboxes.length === 0) {
      console.log('❌ Nenhuma caixa WhatsApp encontrada!');
      return;
    }
    
    const inbox = whatsappInboxes[0];
    console.log(`✅ Usando caixa: ${inbox.name} (ID: ${inbox.id})`);
    
    // 3. Buscar conversas da caixa
    console.log('\n💬 Buscando conversas...');
    
    const conversationsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN },
      params: { inbox_id: inbox.id, status: 'open' }
    });
    
        // A estrutura correta é conversationsResponse.data.data.payload
    const conversations = conversationsResponse.data.data.payload || [];
    
    console.log(`📊 Conversas encontradas: ${conversations.length}`);
    
    if (conversations.length === 0) {
      console.log('⚠️ Nenhuma conversa aberta encontrada para teste');
      
      // Tentar criar uma conversa de teste
      console.log('\n🔧 Tentando criar contato e conversa de teste...');
      
      const testPhone = '+5531999887766'; // Número de teste (formato E.164)
      
      // Criar contato
      const contactResponse = await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`, {
        name: 'Teste Campanha',
        phone_number: testPhone
      }, {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN }
      });
      
      const contact = contactResponse.data.payload.contact;
      console.log(`👤 Contato criado: ${contact.name} (${contact.phone_number})`);
      
      // Criar conversa
      const conversationResponse = await axios.post(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`, {
        source_id: contact.phone_number,
        inbox_id: inbox.id,
        contact_id: contact.id
      }, {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN }
      });
      
      const conversation = conversationResponse.data;
      console.log(`💬 Conversa criada: ${conversation.id}`);
      
      // Usar esta conversa para teste
      conversations.push(conversation);
    }
    
    // 4. Testar envio de mensagem na primeira conversa
    const conversation = conversations[0];
    console.log(`\n📤 Testando envio na conversa: ${conversation.id}`);
    
    // Teste 1: Payload básico
    console.log('🔄 Teste 1: Payload básico...');
    try {
      const basicPayload = {
        content: 'Teste de mensagem básica via API'
      };
      
      const response1 = await axios.post(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversation.id}/messages`,
        basicPayload,
        { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
      );
      
      console.log('✅ Teste 1 SUCESSO - Payload básico funcionou!');
      console.log(`📨 ID da mensagem: ${response1.data.id}`);
    } catch (error1) {
      console.log(`❌ Teste 1 FALHOU: ${error1.response?.status} - ${error1.response?.data?.message || error1.message}`);
    }
    
    // Teste 2: Payload com message_type
    console.log('\n🔄 Teste 2: Payload com message_type...');
    try {
      const messageTypePayload = {
        content: 'Teste com message_type outgoing',
        message_type: 'outgoing'
      };
      
      const response2 = await axios.post(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversation.id}/messages`,
        messageTypePayload,
        { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
      );
      
      console.log('✅ Teste 2 SUCESSO - Payload com message_type funcionou!');
      console.log(`📨 ID da mensagem: ${response2.data.id}`);
    } catch (error2) {
      console.log(`❌ Teste 2 FALHOU: ${error2.response?.status} - ${error2.response?.data?.message || error2.message}`);
    }
    
    // Teste 3: Payload completo
    console.log('\n🔄 Teste 3: Payload mais completo...');
    try {
      const fullPayload = {
        content: 'Teste de campanha - Template: hello_world',
        message_type: 'outgoing',
        private: false
      };
      
      const response3 = await axios.post(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversation.id}/messages`,
        fullPayload,
        { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
      );
      
      console.log('✅ Teste 3 SUCESSO - Payload completo funcionou!');
      console.log(`📨 ID da mensagem: ${response3.data.id}`);
    } catch (error3) {
      console.log(`❌ Teste 3 FALHOU: ${error3.response?.status} - ${error3.response?.data?.message || error3.message}`);
    }
    
    console.log('\n🎉 TESTE CONCLUÍDO!');
    console.log('Verifique as mensagens no Chatwoot para confirmar o envio.');
    
  } catch (error) {
    console.error('\n❌ ERRO GERAL:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n🔑 Problema de autenticação - verifique o token');
    } else if (error.response?.status === 404) {
      console.log('\n🏢 Problema de conta - verifique o ACCOUNT_ID');
    }
  }
}

// Executar teste
testChatwootMessage(); 