const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function testTemplatesEndpoint() {
  try {
    console.log('🔍 Testando endpoint melhorado de templates...');
    
    // Primeiro, fazer login para obter token
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      username: 'admin',
      password: 'invoAI@76825'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login bem-sucedido');
    
    // Testar endpoint de templates
    console.log('🔍 Buscando templates...');
    const templatesResponse = await axios.get(`${BASE_URL}/api/chatwoot/templates`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('📊 Resultado:');
    console.log(`📋 Templates encontrados: ${templatesResponse.data.length}`);
    
    if (templatesResponse.data.length > 0) {
      console.log('\n📋 Templates disponíveis:');
      templatesResponse.data.forEach((template, index) => {
        console.log(`${index + 1}. ${template.displayName || template.name}`);
        console.log(`   Categoria: ${template.category}`);
        console.log(`   Status: ${template.status}`);
        console.log(`   Idioma: ${template.language}`);
        console.log('');
      });
    } else {
      console.log('⚠️ Nenhum template encontrado');
    }
    
    // Testar endpoint de sincronização
    console.log('🔄 Testando sincronização...');
    const syncResponse = await axios.post(`${BASE_URL}/api/chatwoot/templates/sync`, {}, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('📊 Resultado da sincronização:');
    console.log(JSON.stringify(syncResponse.data, null, 2));
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
  }
}

testTemplatesEndpoint(); 