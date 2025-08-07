const axios = require('axios');

// Configurações do Chatwoot
const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN;

console.log('🔍 TESTANDO SISTEMA DE MÚLTIPLAS CONTAS\n');

// Função para obter todas as contas disponíveis
async function getAllAvailableAccounts() {
  try {
    console.log('🔍 Buscando todas as contas disponíveis...');
    
    // Usar o endpoint que funcionou no teste anterior
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/profile`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    let accounts = [];
    
    // Extrair contas da resposta
    if (response.data.accounts && Array.isArray(response.data.accounts)) {
      accounts = response.data.accounts;
    }

    if (accounts.length > 0) {
      console.log(`✅ Encontradas ${accounts.length} contas via /api/v1/profile`);
      return accounts;
    }

    console.log('⚠️ Nenhuma conta encontrada');
    return [];

  } catch (error) {
    console.error('❌ Erro ao obter contas disponíveis:', error);
    return [];
  }
}

// Função para testar o polling de múltiplas contas
async function testMultiAccountPolling() {
  try {
    console.log('\n🧪 Testando polling de múltiplas contas...');
    
    const accounts = await getAllAvailableAccounts();
    console.log(`🏢 Monitorando ${accounts.length} conta(s)`);
    
    let totalConversations = 0;
    
    // Iterar por cada conta
    for (const account of accounts) {
      try {
        console.log(`📋 Verificando conta: ${account.name} (ID: ${account.id})`);
        
        // Obter conversas ativas da conta atual
        const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${account.id}/conversations`, {
          headers: {
            'api_access_token': CHATWOOT_API_TOKEN
          },
          params: {
            status: 'open'
          }
        });
        
        const conversations = response.data.data?.payload || [];
        console.log(`   📋 Encontradas ${conversations.length} conversas ativas na conta ${account.name}`);
        
        totalConversations += conversations.length;
        
      } catch (error) {
        console.error(`❌ Erro ao processar conta ${account.name} (ID: ${account.id}):`, error.response?.status || error.message);
      }
    }
    
    console.log(`✅ Teste concluído - ${totalConversations} conversas encontradas em ${accounts.length} conta(s)`);
    
  } catch (error) {
    console.error('❌ Erro no teste de polling:', error);
  }
}

// Executar teste
async function runTest() {
  try {
    await testMultiAccountPolling();
    
    console.log('\n\n📝 RESUMO:');
    console.log('- Se o teste passou, o sistema está pronto para monitorar múltiplas contas');
    console.log('- O sistema agora irá iterar por todas as contas disponíveis');
    console.log('- Cada conta terá suas conversas processadas independentemente');
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
}

runTest();
