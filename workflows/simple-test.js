const axios = require('axios');

const CHATWOOT_BASE_URL = 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = 'mK9K2nucp4vKhpQs3xT2x8HX';

async function simpleTest() {
  try {
    console.log('🔍 Verificando se o número +553175012310 existe na conta ID 3...');
    
    // Buscar todos os contatos da conta
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN },
      params: { page: 1, per_page: 100 }
    });
    
    const contacts = response.data.payload || [];
    console.log(`📊 Total de contatos: ${contacts.length}`);
    
    // Filtrar contatos com telefone
    const contactsWithPhone = contacts.filter(c => c.phone_number);
    console.log(`📱 Contatos com telefone: ${contactsWithPhone.length}`);
    
    // Procurar pelo número específico
    const targetPhone = '+553175012310';
    console.log(`\n🔍 Procurando por: ${targetPhone}`);
    
    let found = false;
    contactsWithPhone.forEach(contact => {
      console.log(`   Verificando: ${contact.name} - ${contact.phone_number}`);
      
      // Comparar números
      const contactPhone = contact.phone_number.replace(/\D/g, '');
      const searchPhone = targetPhone.replace(/\D/g, '');
      
      if (contactPhone === searchPhone) {
        console.log(`✅ ENCONTRADO! ${contact.name} (ID: ${contact.id})`);
        found = true;
      }
    });
    
    if (!found) {
      console.log(`❌ Número ${targetPhone} NÃO encontrado na conta ID 3`);
      console.log('\n📋 Todos os telefones da conta:');
      contactsWithPhone.forEach(contact => {
        console.log(`   • ${contact.name}: ${contact.phone_number}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.status, error.response?.data);
  }
}

simpleTest();
