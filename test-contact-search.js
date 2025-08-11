// Teste para verificar busca de contatos na API do Chatwoot
const axios = require('axios');

// Configurações do Chatwoot
const CHATWOOT_BASE_URL = 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = 'mK9K2nucp4vKhpQs3xT2x8HX';
const CHATWOOT_ACCOUNT_ID = 3;

async function testContactSearch() {
  try {
    console.log('🧪 TESTE DE BUSCA DE CONTATOS NO CHATWOOT');
    console.log('==========================================\n');
    
    // Teste 1: Buscar todos os contatos
    console.log('📝 Teste 1: Listar todos os contatos');
    try {
      const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`, {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN
        },
        params: {
          page: 1,
          per_page: 50
        }
      });
      
      console.log(`✅ Contatos encontrados: ${response.data.payload.length}`);
      console.log('📊 Primeiros 5 contatos:');
      response.data.payload.slice(0, 5).forEach((contact, index) => {
        console.log(`  ${index + 1}. ID: ${contact.id}, Nome: ${contact.name}, Telefone: ${contact.phone_number}`);
      });
    } catch (error) {
      console.error('❌ Erro ao listar contatos:', error.response?.status, error.response?.data);
    }
    
    // Teste 2: Buscar por telefone específico
    console.log('\n📝 Teste 2: Buscar por telefone específico');
    const testPhones = [
      '+553193242358',
      '553193242358',
      '3193242358',
      '+553175012310',
      '553175012310',
      '3175012310'
    ];
    
    for (const phone of testPhones) {
      console.log(`\n🔍 Testando telefone: ${phone}`);
      try {
        const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`, {
          headers: {
            'api_access_token': CHATWOOT_API_TOKEN
          },
          params: { q: phone }
        });
        
        if (response.data.payload && response.data.payload.length > 0) {
          console.log(`✅ Encontrados ${response.data.payload.length} contatos:`);
          response.data.payload.forEach((contact, index) => {
            console.log(`  ${index + 1}. ID: ${contact.id}, Nome: ${contact.name}, Telefone: ${contact.phone_number}`);
          });
        } else {
          console.log(`❌ Nenhum contato encontrado para: ${phone}`);
        }
      } catch (error) {
        console.error(`❌ Erro ao buscar ${phone}:`, error.response?.status, error.response?.data);
      }
    }
    
    // Teste 3: Buscar contato por ID (se encontramos algum)
    console.log('\n📝 Teste 3: Buscar contato por ID');
    try {
      const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`, {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN
        },
        params: {
          page: 1,
          per_page: 1
        }
      });
      
      if (response.data.payload && response.data.payload.length > 0) {
        const contactId = response.data.payload[0].id;
        console.log(`🔍 Testando busca por ID: ${contactId}`);
        
        const contactResponse = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}`, {
          headers: {
            'api_access_token': CHATWOOT_API_TOKEN
          }
        });
        
        console.log('✅ Contato encontrado por ID:');
        console.log(`  ID: ${contactResponse.data.payload.id}`);
        console.log(`  Nome: ${contactResponse.data.payload.name}`);
        console.log(`  Telefone: ${contactResponse.data.payload.phone_number}`);
        console.log(`  Email: ${contactResponse.data.payload.email}`);
      }
    } catch (error) {
      console.error('❌ Erro ao buscar por ID:', error.response?.status, error.response?.data);
    }
    
    // Teste 4: Verificar configurações da API
    console.log('\n📝 Teste 4: Verificar configurações da API');
    console.log(`Base URL: ${CHATWOOT_BASE_URL}`);
    console.log(`Account ID: ${CHATWOOT_ACCOUNT_ID}`);
    console.log(`Token: ${CHATWOOT_API_TOKEN ? 'Configurado' : 'NÃO CONFIGURADO'}`);
    
    console.log('\n✅ Testes concluídos!');
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
}

// Executar testes
testContactSearch();
