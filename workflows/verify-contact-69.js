const axios = require('axios');

const CHATWOOT_BASE_URL = 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = 'mK9K2nucp4vKhpQs3xT2x8HX';

async function verifyContact69() {
  try {
    console.log('🔍 Verificando contato ID 69 na conta 3...');
    
    // Buscar o contato diretamente por ID
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts/69`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN }
    });
    
    const contact = response.data.payload;
    console.log('✅ Contato encontrado:');
    console.log(`   • ID: ${contact.id}`);
    console.log(`   • Nome: ${contact.name}`);
    console.log(`   • Telefone: ${contact.phone_number}`);
    console.log(`   • Email: ${contact.email || 'N/A'}`);
    console.log(`   • Criado em: ${contact.created_at}`);
    
    // Testar busca por telefone com diferentes formatos
    console.log('\n🔍 Testando busca por telefone...');
    
    const phoneVariations = [
      '+553175012310',  // formato original
      '+55 3175012310', // formato com espaço
      '553175012310',   // sem +
      '3175012310',     // sem código do país
      '+553175012310'.replace(/\s/g, ''), // removendo espaços
      '+55 3175012310'.replace(/\s/g, '') // removendo espaços
    ];
    
    for (const phone of phoneVariations) {
      try {
        console.log(`\n📱 Testando formato: "${phone}"`);
        
        const searchResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts`, {
          headers: { 'api_access_token': CHATWOOT_API_TOKEN },
          params: { q: phone }
        });
        
        const contacts = searchResponse.data.payload || [];
        console.log(`   📊 Contatos encontrados: ${contacts.length}`);
        
        if (contacts.length > 0) {
          contacts.forEach(contact => {
            console.log(`   • ${contact.name} (ID: ${contact.id}, Telefone: ${contact.phone_number})`);
          });
        }
      } catch (error) {
        console.log(`   ❌ Erro: ${error.response?.status}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.status, error.response?.data);
  }
}

verifyContact69();
