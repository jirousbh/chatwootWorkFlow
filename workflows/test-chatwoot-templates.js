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

// Função utilitária para verificar se uma caixa é suportada
function isSupportedInbox(inbox) {
  return isWhatsAppAPIInbox(inbox) || isEvolutionAPIInbox(inbox);
}

async function testChatwootTemplates() {
  console.log('🔍 TESTANDO BUSCA DE TEMPLATES VIA CHATWOOT\n');
  
  // 1. Verificar configurações
  console.log('📋 Verificando configurações:');
  console.log(`🌐 CHATWOOT_BASE_URL: ${CHATWOOT_BASE_URL}`);
  console.log(`🏢 CHATWOOT_ACCOUNT_ID: ${CHATWOOT_ACCOUNT_ID}`);
  console.log(`🔑 CHATWOOT_API_TOKEN: ${CHATWOOT_API_TOKEN ? 'CONFIGURADO (' + CHATWOOT_API_TOKEN.substring(0, 10) + '...)' : 'NÃO CONFIGURADO'}`);
  
  if (!CHATWOOT_API_TOKEN) {
    console.error('\n❌ ERRO: Token do Chatwoot não configurado!');
    process.exit(1);
  }
  
  console.log('\n✅ Configurações OK!\n');
  
  try {
    // 2. Buscar caixas de entrada WhatsApp
    console.log('📱 Buscando caixas de entrada WhatsApp...');
    
    const inboxesResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN }
    });
    
    const allInboxes = inboxesResponse.data.payload || [];
    const whatsappInboxes = allInboxes.filter(i => isSupportedInbox(i));
    
    console.log(`📦 Total de caixas de entrada: ${allInboxes.length}`);
    console.log(`📱 Caixas WhatsApp: ${whatsappInboxes.length}`);
    
    if (whatsappInboxes.length === 0) {
      console.log('\n⚠️ ATENÇÃO: Nenhuma caixa de entrada WhatsApp encontrada!');
      console.log('Para usar templates, você precisa configurar pelo menos uma caixa WhatsApp no Chatwoot.');
      return;
    }
    
    console.log('\n📋 Caixas WhatsApp encontradas:');
    whatsappInboxes.forEach((inbox, index) => {
      console.log(`${index + 1}. ${inbox.name} (ID: ${inbox.id})`);
      console.log(`   Status: ${inbox.status || 'N/A'}`);
      console.log('');
    });
    
    // 3. Tentar buscar templates de cada caixa
    console.log('🔍 Buscando templates das caixas WhatsApp...\n');
    
    let totalTemplates = 0;
    
    for (const inbox of whatsappInboxes) {
      console.log(`📋 Testando caixa: ${inbox.name} (ID: ${inbox.id})`);
      
      // Endpoints possíveis para templates
      const endpoints = [
        `/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes/${inbox.id}/message_templates`,
        `/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes/${inbox.id}/whatsapp_templates`,
        `/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/whatsapp_templates?inbox_id=${inbox.id}`,
        `/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/message_templates?inbox_id=${inbox.id}`
      ];
      
      let foundTemplates = false;
      
      for (const endpoint of endpoints) {
        try {
          const response = await axios.get(`${CHATWOOT_BASE_URL}${endpoint}`, {
            headers: { 'api_access_token': CHATWOOT_API_TOKEN }
          });
          
          if (response.data && response.data.length > 0) {
            console.log(`   ✅ Templates encontrados via: ${endpoint}`);
            console.log(`   📊 Quantidade: ${response.data.length}`);
            
            response.data.slice(0, 3).forEach(template => {
              console.log(`      • ${template.name} (${template.category || 'N/A'})`);
            });
            
            if (response.data.length > 3) {
              console.log(`      ... e mais ${response.data.length - 3} templates`);
            }
            
            totalTemplates += response.data.length;
            foundTemplates = true;
            break;
          }
        } catch (error) {
          console.log(`   ❌ ${endpoint}: ${error.response?.status || 'Erro'}`);
        }
      }
      
      if (!foundTemplates) {
        console.log('   ⚠️ Nenhum template encontrado via API');
        
        // Tentar buscar detalhes da caixa
        try {
          const detailsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes/${inbox.id}`, {
            headers: { 'api_access_token': CHATWOOT_API_TOKEN }
          });
          
          const details = detailsResponse.data.payload;
          console.log('   🔧 Verificando configuração da caixa...');
          
          if (details.provider_config) {
            console.log('   📋 Provider config encontrado');
            if (details.provider_config.templates) {
              console.log(`   ✅ Templates na config: ${details.provider_config.templates.length}`);
              totalTemplates += details.provider_config.templates.length;
            } else {
              console.log('   ❌ Sem templates na configuração');
            }
          } else {
            console.log('   ❌ Sem provider_config');
          }
        } catch (detailsError) {
          console.log(`   ❌ Erro ao buscar detalhes: ${detailsError.response?.status || detailsError.message}`);
        }
      }
      
      console.log('');
    }
    
    // 4. Resumo
    console.log('📊 RESUMO:');
    console.log(`✅ Total de templates encontrados: ${totalTemplates}`);
    
    if (totalTemplates === 0) {
      console.log('\n⚠️ NENHUM TEMPLATE ENCONTRADO!');
      console.log('\n💡 Possíveis soluções:');
      console.log('1. Verificar se as caixas WhatsApp estão conectadas corretamente');
      console.log('2. Verificar se há templates aprovados no WhatsApp Business');
      console.log('3. Tentar sincronizar templates no painel do Chatwoot');
      console.log('4. Verificar logs do Chatwoot para erros de sincronização');
    } else {
      console.log('\n🎉 Templates encontrados com sucesso!');
      console.log('O modal de campanhas deve funcionar corretamente agora.');
    }
    
  } catch (error) {
    console.error('\n❌ ERRO:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n🔑 ERRO DE AUTENTICAÇÃO:');
      console.log('- Verifique se o token do Chatwoot está correto');
      console.log('- Verifique se o token não expirou');
    } else if (error.response?.status === 404) {
      console.log('\n🏢 ERRO DE CONTA:');
      console.log('- Verifique se o CHATWOOT_ACCOUNT_ID está correto');
    }
  }
}

// Executar teste
testChatwootTemplates(); 