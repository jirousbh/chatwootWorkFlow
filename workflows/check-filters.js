const axios = require('axios');

const CHATWOOT_BASE_URL = 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = 'mK9K2nucp4vKhpQs3xT2x8HX';

async function checkFilters() {
  try {
    console.log('🔍 Verificando filtros que podem afetar a busca de contatos...');
    
    // Teste 1: Busca sem filtros
    console.log('\n1️⃣ Busca sem filtros:');
    const response1 = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN },
      params: { page: 1, per_page: 100 }
    });
    console.log(`   📊 Contatos encontrados: ${response1.data.payload?.length || 0}`);
    
    // Teste 2: Busca com filtro de status ativo
    console.log('\n2️⃣ Busca com filtro status=active:');
    const response2 = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN },
      params: { page: 1, per_page: 100, status: 'active' }
    });
    console.log(`   📊 Contatos ativos encontrados: ${response2.data.payload?.length || 0}`);
    
    // Teste 3: Busca com filtro de status inativo
    console.log('\n3️⃣ Busca com filtro status=inactive:');
    const response3 = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN },
      params: { page: 1, per_page: 100, status: 'inactive' }
    });
    console.log(`   📊 Contatos inativos encontrados: ${response3.data.payload?.length || 0}`);
    
    // Teste 4: Busca com filtro de status bloqueado
    console.log('\n4️⃣ Busca com filtro status=blocked:');
    const response4 = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN },
      params: { page: 1, per_page: 100, status: 'blocked' }
    });
    console.log(`   📊 Contatos bloqueados encontrados: ${response4.data.payload?.length || 0}`);
    
    // Teste 5: Busca com filtro de status arquivado
    console.log('\n5️⃣ Busca com filtro status=archived:');
    const response5 = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN },
      params: { page: 1, per_page: 100, status: 'archived' }
    });
    console.log(`   📊 Contatos arquivados encontrados: ${response5.data.payload?.length || 0}`);
    
    // Verificar se o contato ID 69 está em alguma dessas listas
    console.log('\n🔍 Verificando se o contato ID 69 está em alguma lista:');
    
    const allResponses = [
      { name: 'Sem filtros', data: response1.data.payload || [] },
      { name: 'Ativos', data: response2.data.payload || [] },
      { name: 'Inativos', data: response3.data.payload || [] },
      { name: 'Bloqueados', data: response4.data.payload || [] },
      { name: 'Arquivados', data: response5.data.payload || [] }
    ];
    
    allResponses.forEach(response => {
      const contact69 = response.data.find(c => c.id === 69);
      if (contact69) {
        console.log(`   ✅ Contato ID 69 encontrado na lista "${response.name}"`);
        console.log(`      • Nome: ${contact69.name}`);
        console.log(`      • Telefone: ${contact69.phone_number}`);
        console.log(`      • Status: ${contact69.status || 'N/A'}`);
      } else {
        console.log(`   ❌ Contato ID 69 NÃO encontrado na lista "${response.name}"`);
      }
    });
    
    // Teste 6: Busca direta por ID para verificar o status
    console.log('\n6️⃣ Verificando status do contato ID 69 diretamente:');
    try {
      const directResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts/69`, {
        headers: { 'api_access_token': CHATWOOT_API_TOKEN }
      });
      
      const contact = directResponse.data.payload;
      console.log(`   ✅ Contato ID 69 encontrado diretamente:`);
      console.log(`      • Nome: ${contact.name}`);
      console.log(`      • Telefone: ${contact.phone_number}`);
      console.log(`      • Status: ${contact.status || 'N/A'}`);
      console.log(`      • Criado em: ${contact.created_at}`);
      console.log(`      • Atualizado em: ${contact.updated_at}`);
      
      // Verificar se há campos adicionais que podem indicar o status
      console.log(`      • Campos disponíveis:`, Object.keys(contact));
      
    } catch (error) {
      console.log(`   ❌ Erro ao buscar contato ID 69 diretamente:`, error.response?.status);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.status, error.response?.data);
  }
}

checkFilters();

