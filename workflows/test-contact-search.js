const axios = require('axios');

// Configurações do Chatwoot
const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN;

console.log('🔍 TESTANDO BUSCA DE CONTATOS EM MÚLTIPLAS CONTAS\n');

// Função para obter todas as contas disponíveis
async function getAllAvailableAccounts() {
  try {
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/profile`, {
      headers: {
        'api_access_token': CHATWOOT_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    let accounts = [];
    
    if (response.data.accounts && Array.isArray(response.data.accounts)) {
      accounts = response.data.accounts;
    }

    return accounts;
  } catch (error) {
    console.error('❌ Erro ao obter contas disponíveis:', error);
    return [];
  }
}

// Função para buscar contato por telefone em todas as contas
async function getContactIdByPhone(phoneNumber) {
  try {
    console.log(`🔍 Buscando contato por telefone: ${phoneNumber}`);
    
    // Tentar diferentes formatos do número
    const phoneVariations = [
      phoneNumber,
      phoneNumber.replace(/\D/g, ''), // apenas números
      phoneNumber.startsWith('+') ? phoneNumber.substring(1) : '+' + phoneNumber,
      phoneNumber.replace(/^\+55/, ''), // remover código do país
      phoneNumber.replace(/^\+/, ''), // remover apenas o +
    ];
    
    // Remover duplicatas
    const uniquePhones = [...new Set(phoneVariations)];
    console.log(`📱 Tentando formatos de telefone:`, uniquePhones);
    
    // Obter todas as contas disponíveis
    const accounts = await getAllAvailableAccounts();
    console.log(`🏢 Buscando em ${accounts.length} conta(s)`);
    
    // Buscar em todas as contas
    for (const account of accounts) {
      console.log(`🔍 Verificando conta: ${account.name} (ID: ${account.id})`);
      
      for (const phone of uniquePhones) {
        try {
          const response = await axios.get(
            `${CHATWOOT_BASE_URL}/api/v1/accounts/${account.id}/contacts`,
            {
              headers: { 'api_access_token': CHATWOOT_API_TOKEN },
              params: { q: phone }
            }
          );
          
          if (response.data.payload && response.data.payload.length > 0) {
            // Procurar contato que tenha o telefone correspondente
            const contact = response.data.payload.find(c => {
              if (!c.phone_number) return false;
              
              // Comparar removendo caracteres especiais
              const contactPhone = c.phone_number.replace(/\D/g, '');
              const searchPhone = phone.replace(/\D/g, '');
              
              return contactPhone === searchPhone || 
                     contactPhone.endsWith(searchPhone) || 
                     searchPhone.endsWith(contactPhone);
            });
            
            if (contact && contact.id) {
              console.log(`✅ Contato encontrado na conta ${account.name}! ID: ${contact.id}, Telefone: ${contact.phone_number}, Nome: ${contact.name}`);
              return { contactId: contact.id, accountId: account.id, accountName: account.name, contact: contact };
            }
          }
        } catch (searchError) {
          console.log(`⚠️ Erro ao buscar com formato ${phone} na conta ${account.name}:`, searchError.response?.status);
          continue;
        }
      }
    }
    
    console.log(`❌ Contato não encontrado para nenhum formato de: ${phoneNumber} em nenhuma conta`);
    return null;
  } catch (error) {
    console.error('❌ Erro geral ao buscar ID do contato pelo telefone:', error.response?.data || error.message);
    return null;
  }
}

// Função para obter nome do contato
async function getContactName(contactId, accountId = null) {
  try {
    console.log(`👤 Buscando nome para contactId: ${contactId}`);
    
    // Se temos accountId específico, buscar apenas nessa conta
    if (accountId) {
      try {
        const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts/${contactId}`, {
          headers: {
            'api_access_token': CHATWOOT_API_TOKEN
          }
        });
        const fullName = response.data.payload.name || 'Cliente';
        const firstName = fullName.split(' ')[0];
        console.log(`✅ Nome encontrado na conta específica: ${firstName}`);
        return firstName;
      } catch (error) {
        console.log(`⚠️ Erro ao buscar na conta específica:`, error.response?.status);
      }
    }
    
    // Buscar em todas as contas
    const accounts = await getAllAvailableAccounts();
    
    for (const account of accounts) {
      try {
        const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${account.id}/contacts/${contactId}`, {
          headers: {
            'api_access_token': CHATWOOT_API_TOKEN
          }
        });
        const fullName = response.data.payload.name || 'Cliente';
        const firstName = fullName.split(' ')[0];
        console.log(`✅ Nome encontrado na conta ${account.name}: ${firstName}`);
        return firstName;
      } catch (error) {
        console.log(`⚠️ Contato não encontrado na conta ${account.name}`);
        continue;
      }
    }
    
    console.log(`⚠️ Contato não encontrado em nenhuma conta`);
    return 'Cliente';
  } catch (error) {
    console.error('❌ Erro ao obter nome do contato:', error.response?.data || error.message);
    return 'Cliente';
  }
}

// Teste principal
async function testContactSearch() {
  try {
    console.log('🧪 Testando busca de contatos em múltiplas contas...\n');
    
    // Listar algumas contas para teste
    const accounts = await getAllAvailableAccounts();
    console.log(`📋 Contas disponíveis (${accounts.length}):`);
    accounts.forEach(account => {
      console.log(`   • ${account.name} (ID: ${account.id})`);
    });
    
    console.log('\n🔍 Testando busca de contatos...');
    
    // Buscar contatos em cada conta para encontrar alguns telefones para teste
    const testPhones = [];
    
    for (const account of accounts) {
      try {
        console.log(`\n📋 Buscando contatos na conta: ${account.name}`);
        const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${account.id}/contacts`, {
          headers: { 'api_access_token': CHATWOOT_API_TOKEN },
          params: { page: 1, per_page: 5 } // Buscar apenas 5 contatos por conta
        });
        
        if (response.data.payload && response.data.payload.length > 0) {
          console.log(`   ✅ Encontrados ${response.data.payload.length} contatos`);
          
          // Pegar o primeiro contato com telefone
          const contactWithPhone = response.data.payload.find(c => c.phone_number);
          if (contactWithPhone) {
            testPhones.push({
              phone: contactWithPhone.phone_number,
              accountName: account.name,
              accountId: account.id,
              contactId: contactWithPhone.id,
              contactName: contactWithPhone.name
            });
            console.log(`   📱 Telefone para teste: ${contactWithPhone.phone_number} (${contactWithPhone.name})`);
          }
        } else {
          console.log(`   ⚠️ Nenhum contato encontrado`);
        }
      } catch (error) {
        console.log(`   ❌ Erro ao buscar contatos na conta ${account.name}:`, error.response?.status);
      }
    }
    
    // Testar busca por telefone
    if (testPhones.length > 0) {
      console.log('\n🧪 Testando busca por telefone...');
      
      for (const testData of testPhones.slice(0, 2)) { // Testar apenas os 2 primeiros
        console.log(`\n📱 Testando telefone: ${testData.phone} (esperado: ${testData.contactName} na conta ${testData.accountName})`);
        
        const result = await getContactIdByPhone(testData.phone);
        
        if (result) {
          console.log(`✅ SUCESSO! Contato encontrado:`);
          console.log(`   • ID: ${result.contactId}`);
          console.log(`   • Conta: ${result.accountName} (ID: ${result.accountId})`);
          console.log(`   • Nome: ${result.contact.name}`);
          console.log(`   • Telefone: ${result.contact.phone_number}`);
          
          // Testar busca de nome
          console.log(`\n👤 Testando busca de nome para ID ${result.contactId}...`);
          const name = await getContactName(result.contactId, result.accountId);
          console.log(`✅ Nome obtido: ${name}`);
        } else {
          console.log(`❌ FALHA! Contato não encontrado`);
        }
      }
    } else {
      console.log('\n⚠️ Nenhum telefone encontrado para teste');
    }
    
    console.log('\n\n📝 RESUMO:');
    console.log('- Se os testes passaram, as funções de busca estão funcionando corretamente');
    console.log('- O sistema agora busca contatos em todas as contas disponíveis');
    console.log('- As funções getContactIdByPhone e getContactName estão adaptadas para múltiplas contas');
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
}

// Executar teste
testContactSearch();
