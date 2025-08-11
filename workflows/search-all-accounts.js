const axios = require('axios');

const CHATWOOT_BASE_URL = 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = 'mK9K2nucp4vKhpQs3xT2x8HX';

async function searchAllAccounts() {
  try {
    console.log('🔍 Buscando o número +553175012310 em todas as contas...');
    
    // Primeiro, vamos tentar obter as contas de diferentes formas
    console.log('\n1️⃣ Tentando diferentes endpoints para listar contas...');
    
    // Tentativa 1: Endpoint padrão
    try {
      const accountsResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts`, {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN }
      });
      console.log('✅ Endpoint padrão funcionou!');
      console.log('Contas encontradas:', accountsResponse.data.payload?.length || 0);
    } catch (error) {
      console.log('❌ Endpoint padrão falhou:', error.response?.status);
    }
    
    // Tentativa 2: Endpoint com ID específico
    try {
      const accountResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3`, {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN }
      });
      console.log('✅ Endpoint específico funcionou!');
      console.log('Conta ID 3:', accountResponse.data.payload?.name);
    } catch (error) {
      console.log('❌ Endpoint específico falhou:', error.response?.status);
    }
    
    // Agora vamos buscar o número em várias contas conhecidas
    console.log('\n2️⃣ Buscando o número em contas conhecidas...');
    
    const knownAccountIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const targetPhone = '+553175012310';
    
    for (const accountId of knownAccountIds) {
      try {
        console.log(`\n🔍 Verificando conta ID ${accountId}...`);
        
        const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts`, {
          headers: { 'api_access_token': CHATWOOT_API_TOKEN },
          params: { page: 1, per_page: 50 }
        });
        
        const contacts = response.data.payload || [];
        console.log(`   📊 Contatos encontrados: ${contacts.length}`);
        
        if (contacts.length > 0) {
          // Filtrar contatos com telefone
          const contactsWithPhone = contacts.filter(c => c.phone_number);
          console.log(`   📱 Contatos com telefone: ${contactsWithPhone.length}`);
          
          // Procurar pelo número específico
          let found = false;
          contactsWithPhone.forEach(contact => {
            const contactPhone = contact.phone_number.replace(/\D/g, '');
            const searchPhone = targetPhone.replace(/\D/g, '');
            
            if (contactPhone === searchPhone) {
              console.log(`   ✅ ENCONTRADO! ${contact.name} (ID: ${contact.id}) na conta ${accountId}`);
              found = true;
            }
          });
          
          if (!found) {
            console.log(`   ❌ Número não encontrado na conta ${accountId}`);
          }
        }
        
      } catch (error) {
        console.log(`   ⚠️ Erro na conta ${accountId}:`, error.response?.status);
      }
    }
    
    // Tentativa 3: Buscar diretamente pelo número
    console.log('\n3️⃣ Tentando busca direta pelo número...');
    
    try {
      const searchResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/contacts`, {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN },
        params: { q: targetPhone }
      });
      
      console.log('✅ Busca direta funcionou!');
      console.log('Contatos encontrados:', searchResponse.data.payload?.length || 0);
      
      if (searchResponse.data.payload) {
        searchResponse.data.payload.forEach(contact => {
          console.log(`   • ${contact.name} (ID: ${contact.id}, Telefone: ${contact.phone_number})`);
        });
      }
    } catch (error) {
      console.log('❌ Busca direta falhou:', error.response?.status);
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
}

searchAllAccounts();
