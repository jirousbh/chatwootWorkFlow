const axios = require('axios');
require('dotenv').config();

// Configurações do Chatwoot
const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN;
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || '1';

async function testVideoMessage() {
  console.log('🎬 TESTE DE ENVIO DE VÍDEO VIA CHATWOOT\n');
  
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
    // 2. Buscar conversas para teste
    console.log('\n💬 Buscando conversas para teste...');
    
    const conversationsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN },
      params: { status: 'open' }
    });
    
    const conversations = conversationsResponse.data.data.payload || [];
    console.log(`📊 Conversas encontradas: ${conversations.length}`);
    
    if (conversations.length === 0) {
      console.log('⚠️ Nenhuma conversa aberta encontrada');
      console.log('💡 Dica: Inicie uma conversa no WhatsApp/Chatwoot antes de executar este teste');
      return;
    }
    
    const conversation = conversations[0];
    console.log(`\n🎯 Usando conversa: ${conversation.id}`);
    
    // 3. Teste 1: Enviar card com vídeo do YouTube
    console.log('\n🔄 Teste 1: Card com vídeo do YouTube...');
    try {
      const videoPayload = {
        content: 'Aqui está um vídeo explicativo sobre nossa metodologia:',
        content_type: 'cards',
        content_attributes: {
          items: [{
            media_url: 'https://youtu.be/MN8vncZ8Iok?si=Q9orpQMaKXs3gvXS',
            title: 'Metodologia Wizard - Como Funciona',
            description: 'Vídeo explicativo sobre nossa metodologia de ensino',
            actions: [
              {
                type: 'postback',
                text: 'Entendi!',
                payload: 'VIDEO_UNDERSTOOD'
              },
              {
                type: 'postback',
                text: 'Tenho dúvidas',
                payload: 'VIDEO_QUESTIONS'
              }
            ]
          }]
        },
        message_type: 'outgoing'
      };
      
      const response1 = await axios.post(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversation.id}/messages`,
        videoPayload,
        { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
      );
      
      console.log('✅ Teste 1 SUCESSO - Card com vídeo enviado!');
      console.log(`📨 ID da mensagem: ${response1.data.id}`);
    } catch (error1) {
      console.log(`❌ Teste 1 FALHOU: ${error1.response?.status} - ${error1.response?.data?.message || error1.message}`);
    }
    
    // Aguardar antes do próximo teste
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 4. Teste 2: Enviar card com imagem
    console.log('\n🔄 Teste 2: Card com imagem...');
    try {
      const imagePayload = {
        content: 'Veja nosso catálogo de produtos:',
        content_type: 'cards',
        content_attributes: {
          items: [{
            media_url: 'https://via.placeholder.com/800x600/0066cc/ffffff?text=Cat%C3%A1logo+de+Produtos',
            title: 'Catálogo de Produtos 2024',
            description: 'Todos os nossos produtos e serviços disponíveis',
            actions: [
              {
                type: 'postback',
                text: 'Quero orçamento',
                payload: 'REQUEST_QUOTE'
              },
              {
                type: 'link',
                text: 'Ver mais',
                uri: 'https://www.wizard.com.br'
              }
            ]
          }]
        },
        message_type: 'outgoing'
      };
      
      const response2 = await axios.post(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversation.id}/messages`,
        imagePayload,
        { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
      );
      
      console.log('✅ Teste 2 SUCESSO - Card com imagem enviado!');
      console.log(`📨 ID da mensagem: ${response2.data.id}`);
    } catch (error2) {
      console.log(`❌ Teste 2 FALHOU: ${error2.response?.status} - ${error2.response?.data?.message || error2.message}`);
    }
    
    // Aguardar antes do próximo teste
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 5. Teste 3: Múltiplos cards
    console.log('\n🔄 Teste 3: Múltiplos cards...');
    try {
      const multipleCardsPayload = {
        content: 'Escolha uma das opções abaixo:',
        content_type: 'cards',
        content_attributes: {
          items: [
            {
              media_url: 'https://via.placeholder.com/400x300/ff6b35/ffffff?text=Op%C3%A7%C3%A3o+1',
              title: 'Curso Presencial',
              description: 'Aulas presenciais com toda estrutura',
              actions: [
                {
                  type: 'postback',
                  text: 'Quero presencial',
                  payload: 'PRESENCIAL'
                }
              ]
            },
            {
              media_url: 'https://via.placeholder.com/400x300/4ecdc4/ffffff?text=Op%C3%A7%C3%A3o+2',
              title: 'Curso Online',
              description: 'Flexibilidade total para estudar',
              actions: [
                {
                  type: 'postback',
                  text: 'Quero online',
                  payload: 'ONLINE'
                }
              ]
            }
          ]
        },
        message_type: 'outgoing'
      };
      
      const response3 = await axios.post(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversation.id}/messages`,
        multipleCardsPayload,
        { headers: { 'api_access_token': CHATWOOT_API_TOKEN } }
      );
      
      console.log('✅ Teste 3 SUCESSO - Múltiplos cards enviados!');
      console.log(`📨 ID da mensagem: ${response3.data.id}`);
    } catch (error3) {
      console.log(`❌ Teste 3 FALHOU: ${error3.response?.status} - ${error3.response?.data?.message || error3.message}`);
    }
    
    console.log('\n🎉 TESTES CONCLUÍDOS!');
    console.log('📱 Verifique o Chatwoot/WhatsApp para ver os cards com mídia');
    console.log('\n💡 Próximos passos:');
    console.log('   1. Teste diferentes tipos de mídia (vídeo, imagem)');
    console.log('   2. Experimente URLs diferentes');
    console.log('   3. Teste botões e interações');
    
  } catch (error) {
    console.error('\n❌ ERRO GERAL:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n🔑 Problema de autenticação - verifique o token');
    } else if (error.response?.status === 404) {
      console.log('\n🏢 Problema de conta - verifique o ACCOUNT_ID');
    }
  }
}

// Função para testar workflow com vídeo
async function testWorkflowWithVideo() {
  console.log('\n\n🔄 TESTE DE WORKFLOW COM VÍDEO\n');
  
  const workflowBlockExample = {
    "id": "video_demo",
    "name": "Demonstração com Vídeo",
    "message": "Veja como nossa solução funciona na prática:",
    "media": {
      "type": "video",
      "url": "https://youtu.be/MN8vncZ8Iok?si=Q9orpQMaKXs3gvXS",
      "title": "Demonstração do Produto",
      "description": "Vídeo mostrando todas as funcionalidades"
    },
    "buttons": [
      { "text": "Quero testar", "next_block": "teste" },
      { "text": "Preciso de mais info", "next_block": "informacoes" },
      { "text": "Falar com vendedor", "next_block": "atendimento" }
    ]
  };
  
  console.log('📋 Exemplo de bloco de workflow com vídeo:');
  console.log(JSON.stringify(workflowBlockExample, null, 2));
  
  console.log('\n✅ Este bloco pode ser usado diretamente em qualquer workflow');
  console.log('🔧 Basta substituir a URL do vídeo pela sua própria');
}

// Executar testes
async function runAllTests() {
  await testVideoMessage();
  await testWorkflowWithVideo();
}

// Executar se chamado diretamente
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testVideoMessage,
  testWorkflowWithVideo,
  runAllTests
}; 