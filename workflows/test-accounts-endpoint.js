const axios = require('axios');

console.log('🧪 Testando endpoint /api/accounts com autenticação...\n');

async function testAccountsEndpoint() {
  try {
    // Primeiro fazer login para obter token
    console.log('1. Fazendo login...');
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'admin',
      password: 'uapfav'
    });
    
    if (!loginResponse.data.success) {
      console.error('❌ Erro no login:', loginResponse.data.error);
      return;
    }
    
    const token = loginResponse.data.token;
    console.log('✅ Login realizado com sucesso');
    
    // Agora buscar as contas
    console.log('\n2. Buscando contas...');
    const accountsResponse = await axios.get('http://localhost:3001/api/accounts', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Contas encontradas:');
    console.log(JSON.stringify(accountsResponse.data, null, 2));
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
  }
}

testAccountsEndpoint(); 