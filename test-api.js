const axios = require('axios');

async function testChatwootAPI() {
  const CHATWOOT_BASE_URL = 'http://rails-dev:3000';
  const CHATWOOT_API_TOKEN = 'SxWfECMah8tFF7wBQHktWore';

  console.log('🔍 Testando conexão com API do Chatwoot...');
  console.log(`URL: ${CHATWOOT_BASE_URL}`);
  console.log(`Token: ${CHATWOOT_API_TOKEN.substring(0, 10)}...`);
  
  // Primeiro, vamos listar todas as contas disponíveis
  try {
    console.log('\n1️⃣ Testando /api/v1/accounts');
    const accountsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN
      }
    });
    
    console.log('✅ Contas encontradas:', accountsResponse.data.data?.payload?.length || 0);
    const accounts = accountsResponse.data.data?.payload || [];
    
    if (accounts.length > 0) {
      console.log('Contas disponíveis:');
      accounts.forEach(account => {
        console.log(`- ID: ${account.id}, Nome: ${account.name}`);
      });
      
      // Testar com a primeira conta
      const firstAccount = accounts[0];
      console.log(`\n2️⃣ Testando conversas na conta ${firstAccount.id}`);
      
      const conversationsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${firstAccount.id}/conversations`, {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN
        },
        params: {
          status: 'open'
        }
      });
      
      console.log('✅ Sucesso! API funcionando');
      console.log(`Status: ${conversationsResponse.status}`);
      console.log(`Conversas encontradas: ${conversationsResponse.data.data?.payload?.length || 0}`);
    }
    
  } catch (error) {
    console.log('❌ Erro na API:');
    console.log(`Status: ${error.response?.status}`);
    console.log(`Message: ${error.message}`);
    console.log(`Response:`, error.response?.data);
  }
}

testChatwootAPI();
