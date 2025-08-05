#!/usr/bin/env node

const axios = require('axios');

// Configurações
const BASE_URL = 'http://localhost:3008';
const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN;
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || '1';

async function testYouTubeThumbnail() {
  console.log('🎬 TESTE DE THUMBNAIL DO YOUTUBE PARA WHATSAPP\n');
  
  try {
    // 1. Verificar configurações
    console.log('📋 Verificando configurações...');
    console.log(`🌐 BASE_URL: ${BASE_URL}`);
    console.log(`🌐 CHATWOOT_BASE_URL: ${CHATWOOT_BASE_URL}`);
    console.log(`🔑 Token: ${CHATWOOT_API_TOKEN ? 'CONFIGURADO' : 'NÃO CONFIGURADO'}`);
    
    if (!CHATWOOT_API_TOKEN) {
      console.error('\n❌ CHATWOOT_API_TOKEN não configurado!');
      console.log('💡 Configure a variável de ambiente CHATWOOT_API_TOKEN');
      process.exit(1);
    }
    
    // 2. Buscar conversas ativas
    console.log('\n💬 Buscando conversas ativas...');
    const conversationsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN },
      params: { status: 'open' }
    });
    
    const conversations = conversationsResponse.data.data.payload || [];
    console.log(`📊 Conversas encontradas: ${conversations.length}`);
    
    if (conversations.length === 0) {
      console.log('⚠️ Nenhuma conversa aberta encontrada!');
      console.log('💡 Abra uma conversa no WhatsApp/Chatwoot antes de executar este teste');
      return;
    }
    
    const conversation = conversations[0];
    console.log(`🎯 Usando conversa: ${conversation.id}\n`);
    
    // 3. Testar envio de vídeo do YouTube via API do sistema
    console.log('🔄 Teste: Enviando vídeo do YouTube com thumbnail...');
    
    const testWorkflow = {
      name: 'teste_youtube_thumbnail',
      config: {
        blocks: {
          inicio: {
            id: 'inicio',
            name: 'Teste YouTube Thumbnail',
            message: 'Vamos testar o envio de vídeo do YouTube com thumbnail otimizado para WhatsApp:',
            media: {
              type: 'video',
              url: 'https://youtu.be/MN8vncZ8Iok?si=Q9orpQMaKXs3gvXS',
              title: 'Metodologia Wizard - Como Funciona',
              description: 'Este vídeo explica nossa metodologia de ensino exclusiva.\n\nO thumbnail deve aparecer como imagem no WhatsApp! 📱'
            },
            buttons: [
              { text: 'Funcionou!', next_block: 'sucesso' },
              { text: 'Não funcionou', next_block: 'problema' }
            ]
          },
          sucesso: {
            id: 'sucesso',
            name: 'Sucesso',
            message: '🎉 Perfeito! O thumbnail apareceu no WhatsApp!'
          },
          problema: {
            id: 'problema', 
            name: 'Problema',
            message: '😞 Algo deu errado. Vamos investigar...'
          }
        }
      }
    };
    
    // 4. Fazer login no sistema de workflows
    console.log('🔐 Fazendo login no sistema...');
    const loginResponse = await axios.post(`${BASE_URL}/api/login`, {
      username: 'admin',
      password: '123456'
    });
    
    const authToken = loginResponse.data.token;
    console.log('✅ Login realizado!\n');
    
    // 5. Criar/salvar workflow
    console.log('⚙️ Salvando workflow de teste...');
    await axios.post(`${BASE_URL}/api/workflows`, testWorkflow, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Workflow salvo!\n');
    
    // 6. Simular mensagem do usuário para acionar o workflow
    console.log('📨 Simulando mensagem do usuário...');
    const webhookPayload = {
      id: Date.now(),
      content: 'teste thumbnail',
      message_type: 'incoming',
      created_at: new Date().toISOString(),
      conversation: {
        id: conversation.id,
        inbox_id: conversation.inbox_id,
        meta: {
          sender: {
            phone_number: '+5531999999999' // Número fictício para teste
          }
        }
      }
    };
    
    await axios.post(`${BASE_URL}/webhook/chatwoot`, webhookPayload, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('✅ Mensagem simulada enviada!\n');
    
    console.log('🎉 TESTE CONCLUÍDO!');
    console.log('\n📱 Verificar no WhatsApp/Chatwoot:');
    console.log('   1. Mensagem de texto');
    console.log('   2. Imagem do thumbnail');
    console.log('   3. Link do vídeo');
    console.log('   4. Botões interativos');
    
    console.log('\n💡 O que deve aparecer:');
    console.log('   📝 "Vamos testar o envio de vídeo..."');
    console.log('   🖼️ Thumbnail do vídeo do YouTube');
    console.log('   🔗 "Assista ao vídeo: https://youtu.be/..."');
    console.log('   📤 Descrição do vídeo');
    console.log('   🔘 Botões: "Funcionou!" | "Não funcionou"');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

// Executar teste se chamado diretamente
if (require.main === module) {
  testYouTubeThumbnail();
}

module.exports = { testYouTubeThumbnail }; 