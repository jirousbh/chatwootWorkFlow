const axios = require('axios');

const CHATWOOT_BASE_URL = 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = 'mK9K2nucp4vKhpQs3xT2x8HX';

async function checkPagination() {
  try {
    console.log('🔍 Verificando paginação para encontrar o contato ID 69...');
    
    let allContacts = [];
    let page = 1;
    const perPage = 50;
    
    while (true) {
      console.log(`\n📄 Verificando página ${page}...`);
      
      const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts`, {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN },
        params: { page: page, per_page: perPage }
      });
      
      const contacts = response.data.payload || [];
      console.log(`   📊 Contatos na página ${page}: ${contacts.length}`);
      
      if (contacts.length === 0) {
        console.log(`   ⚠️ Página ${page} vazia, parando...`);
        break;
      }
      
      // Verificar se o contato ID 69 está nesta página
      const contact69 = contacts.find(c => c.id === 69);
      if (contact69) {
        console.log(`   🎉 CONTATO ID 69 ENCONTRADO na página ${page}!`);
        console.log(`   • Nome: ${contact69.name}`);
        console.log(`   • Telefone: ${contact69.phone_number}`);
        console.log(`   • Email: ${contact69.email || 'N/A'}`);
      }
      
      allContacts = allContacts.concat(contacts);
      
      // Mostrar alguns contatos da página
      contacts.slice(0, 3).forEach(contact => {
        console.log(`   • ${contact.name} (ID: ${contact.id}, Telefone: ${contact.phone_number})`);
      });
      
      if (contacts.length < perPage) {
        console.log(`   ✅ Última página (${contacts.length} < ${perPage})`);
        break;
      }
      
      page++;
      
      // Limitar a 10 páginas para evitar loop infinito
      if (page > 10) {
        console.log(`   ⚠️ Limite de 10 páginas atingido`);
        break;
      }
    }
    
    console.log(`\n📊 Total de contatos encontrados: ${allContacts.length}`);
    
    // Verificar se o contato ID 69 está na lista completa
    const contact69 = allContacts.find(c => c.id === 69);
    if (contact69) {
      console.log(`✅ Contato ID 69 está na lista completa!`);
      console.log(`   • Nome: ${contact69.name}`);
      console.log(`   • Telefone: ${contact69.phone_number}`);
    } else {
      console.log(`❌ Contato ID 69 NÃO está na lista completa`);
      
      // Verificar se há algum contato com o telefone +553175012310
      const targetPhone = '+553175012310';
      const contactWithPhone = allContacts.find(c => c.phone_number === targetPhone);
      if (contactWithPhone) {
        console.log(`🔍 Encontrado contato com telefone ${targetPhone}:`);
        console.log(`   • Nome: ${contactWithPhone.name}`);
        console.log(`   • ID: ${contactWithPhone.id}`);
        console.log(`   • Telefone: ${contactWithPhone.phone_number}`);
      } else {
        console.log(`❌ Nenhum contato com telefone ${targetPhone} encontrado`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.status, error.response?.data);
  }
}

checkPagination();

