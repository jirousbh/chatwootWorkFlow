const axios = require('axios');

// Configurações do Chatwoot
const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || 'http://localhost:3000';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN;

// Função para obter todas as contas disponíveis
async function getAllAvailableAccounts() {
  try {
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN }
    });
    return response.data.payload || [];
  } catch (error) {
    console.error('❌ Erro ao obter contas:', error.response?.status, error.response?.data);
    return [];
  }
}

// Função para buscar contato por telefone com debug detalhado
async function debugContactSearch(phoneNumber, targetAccountName = null) {
  try {
    console.log(`🔍 DEBUG: Buscando contato por telefone: ${phoneNumber}`);
    
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
    console.log(`📱 Formatos de telefone a testar:`, uniquePhones);
    
    // Obter todas as contas
    const accounts = await getAllAvailableAccounts();
    console.log(`🏢 Total de contas disponíveis: ${accounts.length}`);
    
    // Filtrar conta específica se fornecida
    let accountsToSearch = accounts;
    if (targetAccountName) {
      accountsToSearch = accounts.filter(a => a.name.toLowerCase().includes(targetAccountName.toLowerCase()));
      console.log(`🎯 Filtrando para conta que contém: "${targetAccountName}"`);
      console.log(`📋 Contas encontradas:`, accountsToSearch.map(a => `${a.name} (ID: ${a.id})`));
    }
    
    // Buscar em cada conta
    for (const account of accountsToSearch) {
      console.log(`\n🔍 Verificando conta: ${account.name} (ID: ${account.id})`);
      
      for (const phone of uniquePhones) {
        try {
          console.log(`  📱 Testando formato: ${phone}`);
          
          const response = await axios.get(
            `${CHATWOOT_BASE_URL}/api/v1/accounts/${account.id}/contacts`,
            {
              headers: { 'api_access_token': CHATWOOT_API_TOKEN },
              params: { q: phone }
            }
          );
          
          console.log(`  📊 Resposta da API: ${response.data.payload?.length || 0} contatos encontrados`);
          
          if (response.data.payload && response.data.payload.length > 0) {
            console.log(`  📋 Contatos retornados:`);
            response.data.payload.forEach((contact, index) => {
              console.log(`    ${index + 1}. ID: ${contact.id}, Nome: ${contact.name}, Telefone: ${contact.phone_number}`);
            });
            
            // Procurar contato que tenha o telefone correspondente
            const contact = response.data.payload.find(c => {
              if (!c.phone_number) return false;
              
              // Comparar removendo caracteres especiais
              const contactPhone = c.phone_number.replace(/\D/g, '');
              const searchPhone = phone.replace(/\D/g, '');
              
              const isMatch = contactPhone === searchPhone || 
                             contactPhone.endsWith(searchPhone) || 
                             searchPhone.endsWith(contactPhone);
              
              console.log(`    🔍 Comparando: "${contactPhone}" com "${searchPhone}" = ${isMatch}`);
              
              return isMatch;
            });
            
            if (contact && contact.id) {
              console.log(`✅ CONTATO ENCONTRADO! ID: ${contact.id}, Telefone: ${contact.phone_number}, Nome: ${contact.name}`);
              return { contactId: contact.id, accountId: account.id, accountName: account.name, contact: contact };
            } else {
              console.log(`❌ Nenhum contato com telefone correspondente encontrado`);
            }
          }
        } catch (searchError) {
          console.log(`  ⚠️ Erro ao buscar com formato ${phone}:`, searchError.response?.status, searchError.response?.data);
          continue;
        }
      }
    }
    
    console.log(`\n❌ Contato não encontrado para nenhum formato de: ${phoneNumber}`);
    return null;
  } catch (error) {
    console.error('❌ Erro geral:', error.response?.data || error.message);
    return null;
  }
}

// Função para buscar diretamente por ID de contato
async function searchContactById(contactId, accountId) {
  try {
    console.log(`🔍 Buscando contato diretamente por ID: ${contactId} na conta: ${accountId}`);
    
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts/${contactId}`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN }
    });
    
    console.log(`✅ Contato encontrado:`, response.data.payload);
    return response.data.payload;
  } catch (error) {
    console.log(`❌ Erro ao buscar por ID:`, error.response?.status, error.response?.data);
    return null;
  }
}

// Função para listar todos os contatos de uma conta
async function listAllContacts(accountId, limit = 50) {
  try {
    console.log(`📋 Listando todos os contatos da conta ${accountId} (limite: ${limit})`);
    
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/contacts`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN },
      params: { page: 1, per_page: limit }
    });
    
    const contacts = response.data.payload || [];
    console.log(`📊 Total de contatos: ${contacts.length}`);
    
    // Filtrar contatos com telefone
    const contactsWithPhone = contacts.filter(c => c.phone_number);
    console.log(`📱 Contatos com telefone: ${contactsWithPhone.length}`);
    
    contactsWithPhone.forEach((contact, index) => {
      console.log(`  ${index + 1}. ID: ${contact.id}, Nome: ${contact.name}, Telefone: ${contact.phone_number}`);
    });
    
    return contacts;
  } catch (error) {
    console.error('❌ Erro ao listar contatos:', error.response?.status, error.response?.data);
    return [];
  }
}

// Função principal de teste
async function main() {
  console.log('🧪 INICIANDO DEBUG DE BUSCA DE CONTATOS\n');
  
  const targetPhone = '+553175012310';
  const targetAccountName = 'Wizard Buritis';
  
  console.log(`🎯 Telefone alvo: ${targetPhone}`);
  console.log(`🎯 Conta alvo: ${targetAccountName}\n`);
  
  // 1. Buscar contato com debug detalhado
  console.log('='.repeat(60));
  console.log('1️⃣ BUSCA DETALHADA POR TELEFONE');
  console.log('='.repeat(60));
  
  const result = await debugContactSearch(targetPhone, targetAccountName);
  
  if (result) {
    console.log(`\n✅ SUCESSO! Contato encontrado:`);
    console.log(`   • ID: ${result.contactId}`);
    console.log(`   • Conta: ${result.accountName} (ID: ${result.accountId})`);
    console.log(`   • Nome: ${result.contact.name}`);
    console.log(`   • Telefone: ${result.contact.phone_number}`);
  } else {
    console.log(`\n❌ FALHA! Contato não encontrado`);
    
    // 2. Listar todos os contatos da conta para verificar
    console.log('\n' + '='.repeat(60));
    console.log('2️⃣ LISTANDO TODOS OS CONTATOS DA CONTA');
    console.log('='.repeat(60));
    
    const accounts = await getAllAvailableAccounts();
    const targetAccount = accounts.find(a => a.name.toLowerCase().includes(targetAccountName.toLowerCase()));
    
    if (targetAccount) {
      await listAllContacts(targetAccount.id, 100);
    } else {
      console.log(`❌ Conta "${targetAccountName}" não encontrada`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🏁 DEBUG CONCLUÍDO');
  console.log('='.repeat(60));
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  debugContactSearch,
  searchContactById,
  listAllContacts
};
