const axios = require('axios');

const CHATWOOT_BASE_URL = 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = 'mK9K2nucp4vKhpQs3xT2x8HX';

async function debugContact69() {
  try {
    console.log('🔍 Debug completo do contato ID 69...');
    
    // Buscar o contato diretamente
    const directResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts/69`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN }
    });
    
    const contact = directResponse.data.payload;
    console.log('✅ Contato ID 69 encontrado diretamente:');
    console.log(JSON.stringify(contact, null, 2));
    
    // Verificar se o contato está bloqueado
    console.log(`\n🔒 Contato está bloqueado? ${contact.blocked}`);
    
    // Verificar status de disponibilidade
    console.log(`📊 Status de disponibilidade: ${contact.availability_status}`);
    
    // Verificar última atividade
    console.log(`⏰ Última atividade: ${contact.last_activity_at}`);
    
    // Verificar contact_inboxes
    console.log(`📬 Contact inboxes:`, contact.contact_inboxes);
    
    // Testar busca por telefone específico
    console.log('\n🔍 Testando busca por telefone específico...');
    
    const phoneVariations = [
      '+553175012310',
      '553175012310',
      '3175012310',
      '+55 3175012310',
      '55 3175012310'
    ];
    
    for (const phone of phoneVariations) {
      try {
        console.log(`\n📱 Testando: "${phone}"`);
        
        const searchResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts`, {
          headers: { 'api_access_token': CHATWOOT_API_TOKEN },
          params: { q: phone }
        });
        
        const contacts = searchResponse.data.payload || [];
        console.log(`   📊 Contatos encontrados: ${contacts.length}`);
        
        // Verificar se o contato ID 69 está na lista
        const found = contacts.find(c => c.id === 69);
        if (found) {
          console.log(`   ✅ Contato ID 69 encontrado na busca por "${phone}"`);
        } else {
          console.log(`   ❌ Contato ID 69 NÃO encontrado na busca por "${phone}"`);
        }
        
        // Mostrar todos os contatos encontrados
        contacts.forEach(c => {
          console.log(`   • ${c.name} (ID: ${c.id}, Telefone: ${c.phone_number})`);
        });
        
      } catch (error) {
        console.log(`   ❌ Erro: ${error.response?.status}`);
      }
    }
    
    // Testar busca sem parâmetro de query
    console.log('\n🔍 Testando busca sem parâmetro de query...');
    try {
      const allResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts`, {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN }
      });
      
      const allContacts = allResponse.data.payload || [];
      console.log(`📊 Total de contatos sem query: ${allContacts.length}`);
      
      const contact69 = allContacts.find(c => c.id === 69);
      if (contact69) {
        console.log(`✅ Contato ID 69 encontrado na lista sem query`);
      } else {
        console.log(`❌ Contato ID 69 NÃO encontrado na lista sem query`);
        
        // Verificar se há algum contato com o mesmo telefone
        const samePhone = allContacts.find(c => c.phone_number === '+553175012310');
        if (samePhone) {
          console.log(`🔍 Encontrado contato com mesmo telefone: ${samePhone.name} (ID: ${samePhone.id})`);
        }
      }
      
    } catch (error) {
      console.log(`❌ Erro na busca sem query: ${error.response?.status}`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.status, error.response?.data);
  }
}

debugContact69();

