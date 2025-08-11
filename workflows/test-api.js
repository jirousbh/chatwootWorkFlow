const axios = require('axios');

const CHATWOOT_BASE_URL = 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = 'mK9K2nucp4vKhpQs3xT2x8HX';

async function testAPI() {
  try {
    console.log('🧪 Testando API do Chatwoot...');
    console.log(`URL: ${CHATWOOT_BASE_URL}`);
    console.log(`Token: ${CHATWOOT_API_TOKEN.substring(0, 10)}...`);
    
    // Teste 1: Listar contas
    console.log('\n1️⃣ Testando /api/v1/accounts');
    try {
      const accountsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts`, {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN }
      });
      console.log('✅ Sucesso! Contas encontradas:', accountsResponse.data.payload?.length || 0);
      if (accountsResponse.data.payload) {
        accountsResponse.data.payload.forEach(account => {
          console.log(`   • ${account.name} (ID: ${account.id})`);
        });
      }
    } catch (error) {
      console.log('❌ Erro:', error.response?.status, error.response?.data);
    }
    
    // Teste 2: Buscar contatos na conta específica
    console.log('\n2️⃣ Testando busca de contatos na conta ID 3');
    try {
      const contactsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts`, {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN },
        params: { q: '+553175012310' }
      });
      console.log('✅ Sucesso! Contatos encontrados:', contactsResponse.data.payload?.length || 0);
      if (contactsResponse.data.payload) {
        contactsResponse.data.payload.forEach(contact => {
          console.log(`   • ${contact.name} (ID: ${contact.id}, Telefone: ${contact.phone_number})`);
        });
      }
    } catch (error) {
      console.log('❌ Erro:', error.response?.status, error.response?.data);
    }
    
    // Teste 3: Listar todos os contatos da conta (mais páginas)
    console.log('\n3️⃣ Listando TODOS os contatos da conta ID 3 (múltiplas páginas)');
    try {
      let allContacts = [];
      let page = 1;
      const perPage = 50;
      
      while (true) {
        const allContactsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts`, {
          headers: { 'api_access_token': CHATWOOT_API_TOKEN },
          params: { page: page, per_page: perPage }
        });
        
        const contacts = allContactsResponse.data.payload || [];
        if (contacts.length === 0) break;
        
        allContacts = allContacts.concat(contacts);
        console.log(`   📄 Página ${page}: ${contacts.length} contatos`);
        
        if (contacts.length < perPage) break;
        page++;
      }
      
      console.log(`✅ Total de contatos encontrados: ${allContacts.length}`);
      
      // Filtrar contatos com telefone
      const contactsWithPhone = allContacts.filter(c => c.phone_number);
      console.log(`📱 Contatos com telefone: ${contactsWithPhone.length}`);
      
      // Procurar especificamente pelo número +553175012310
      const targetPhone = '+553175012310';
      const targetPhoneVariations = [
        targetPhone,
        targetPhone.replace(/\D/g, ''),
        targetPhone.startsWith('+') ? targetPhone.substring(1) : '+' + targetPhone,
        targetPhone.replace(/^\+55/, ''),
        targetPhone.replace(/^\+/, '')
      ];
      
      console.log(`\n🔍 Procurando especificamente por: ${targetPhone}`);
      console.log(`📱 Variações testadas:`, targetPhoneVariations);
      
      let found = false;
      contactsWithPhone.forEach(contact => {
        const contactPhone = contact.phone_number.replace(/\D/g, '');
        
        for (const variation of targetPhoneVariations) {
          const searchPhone = variation.replace(/\D/g, '');
          
          if (contactPhone === searchPhone || 
              contactPhone.endsWith(searchPhone) || 
              searchPhone.endsWith(contactPhone)) {
            console.log(`✅ ENCONTRADO! ${contact.name} (ID: ${contact.id}, Telefone: ${contact.phone_number})`);
            found = true;
            break;
          }
        }
      });
      
      if (!found) {
        console.log(`❌ Número ${targetPhone} NÃO encontrado na conta ID 3`);
        console.log(`\n📋 Todos os telefones da conta:`);
        contactsWithPhone.forEach(contact => {
          console.log(`   • ${contact.name}: ${contact.phone_number}`);
        });
      }
      
    } catch (error) {
      console.log('❌ Erro:', error.response?.status, error.response?.data);
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
}

testAPI();
