const axios = require('axios');

// Configurações do Chatwoot
const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN;

console.log('🔍 TESTANDO BUSCA DE CONTAS DISPONÍVEIS\n');
console.log(`🌐 Base URL: ${CHATWOOT_BASE_URL}`);
console.log(`🔐 Token: ${CHATWOOT_API_TOKEN ? CHATWOOT_API_TOKEN.substring(0, 20) + '...' : 'NÃO CONFIGURADO'}\n`);

async function testAccountsEndpoints() {
  const endpoints = [
    '/api/v1/accounts',
    '/platform/api/v1/accounts', 
    '/admin/api/v1/accounts',
    '/api/v2/accounts',
    '/api/v1/profile/accounts',
    '/api/v1/profile',
    '/api/v1/me/accounts'
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`\n🧪 Testando: ${endpoint}`);
      
      const response = await axios.get(`${CHATWOOT_BASE_URL}${endpoint}`, {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`✅ Sucesso! Status: ${response.status}`);
      
      if (response.data) {
        if (Array.isArray(response.data)) {
          console.log(`📊 Retornou array com ${response.data.length} item(s)`);
          response.data.forEach((account, index) => {
            console.log(`   ${index + 1}. ID: ${account.id || 'N/A'} | Nome: ${account.name || 'N/A'}`);
          });
        } else if (response.data.payload && Array.isArray(response.data.payload)) {
          console.log(`📊 Retornou payload com ${response.data.payload.length} item(s)`);
          response.data.payload.forEach((account, index) => {
            console.log(`   ${index + 1}. ID: ${account.id || 'N/A'} | Nome: ${account.name || 'N/A'}`);
          });
        } else if (response.data.data && Array.isArray(response.data.data)) {
          console.log(`📊 Retornou data com ${response.data.data.length} item(s)`);
          response.data.data.forEach((account, index) => {
            console.log(`   ${index + 1}. ID: ${account.id || 'N/A'} | Nome: ${account.name || 'N/A'}`);
          });
        } else {
          console.log('📊 Resposta (primeiros 500 chars):');
          console.log(JSON.stringify(response.data, null, 2).substring(0, 500));
        }
      }
      
    } catch (error) {
      console.log(`❌ Erro: ${error.response?.status || 'CONNECTION_ERROR'} - ${error.response?.statusText || error.message}`);
      
      if (error.response?.data) {
        console.log(`   Detalhes: ${JSON.stringify(error.response.data).substring(0, 200)}`);
      }
    }
  }
}

async function testSpecificAccountEndpoint() {
  try {
    console.log('\n\n🧪 Testando busca de conta específica (ID 1):');
    
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/1`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`✅ Sucesso! Status: ${response.status}`);
    console.log('📊 Dados da conta:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.log(`❌ Erro: ${error.response?.status || 'CONNECTION_ERROR'} - ${error.response?.statusText || error.message}`);
  }
}

async function testAgentsProfile() {
  try {
    console.log('\n\n🧪 Testando perfil do agente atual:');
    
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/profile`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`✅ Sucesso! Status: ${response.status}`);
    console.log('📊 Perfil do agente:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.log(`❌ Erro: ${error.response?.status || 'CONNECTION_ERROR'} - ${error.response?.statusText || error.message}`);
  }
}

// Executar testes
async function runTests() {
  try {
    await testAccountsEndpoints();
    await testSpecificAccountEndpoint();
    await testAgentsProfile();
    
    console.log('\n\n📝 RESUMO:');
    console.log('- Se algum endpoint retornou múltiplas contas, esse é o correto para usar');
    console.log('- Se apenas /api/v1/accounts/1 funcionou, o token tem acesso apenas a uma conta');
    console.log('- Verifique se o token é de super admin ou tem permissões limitadas');
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
}

runTests(); 