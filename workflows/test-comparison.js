const axios = require('axios');

const CHATWOOT_BASE_URL = 'https://crm.inovaianalytics.com.br';
const CHATWOOT_API_TOKEN = 'mK9K2nucp4vKhpQs3xT2x8HX';

async function testComparison() {
  try {
    console.log('🧪 Testando lógica de comparação de telefones...');
    
    const targetPhone = '+553175012310';
    console.log(`🎯 Telefone alvo: ${targetPhone}`);
    
    // Buscar todos os contatos da conta 3
    const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/accounts/3/contacts`, {
      headers: { 'api_access_token': CHATWOOT_API_TOKEN },
      params: { page: 1, per_page: 100 }
    });
    
    const contacts = response.data.payload || [];
    console.log(`📊 Total de contatos: ${contacts.length}`);
    
    // Filtrar contatos com telefone
    const contactsWithPhone = contacts.filter(c => c.phone_number);
    console.log(`📱 Contatos com telefone: ${contactsWithPhone.length}`);
    
    // Testar a lógica de comparação
    console.log('\n🔍 Testando comparação com cada contato:');
    
    let found = false;
    contactsWithPhone.forEach(contact => {
      console.log(`\n📱 Verificando: ${contact.name} - ${contact.phone_number}`);
      
      // Aplicar a mesma lógica do sistema
      const contactPhone = contact.phone_number.replace(/\D/g, '');
      const searchPhone = targetPhone.replace(/\D/g, '');
      
      console.log(`   • Telefone do contato (limpo): ${contactPhone}`);
      console.log(`   • Telefone buscado (limpo): ${searchPhone}`);
      
      const isMatch = contactPhone === searchPhone || 
                     contactPhone.endsWith(searchPhone) || 
                     searchPhone.endsWith(contactPhone);
      
      console.log(`   • É igual? ${contactPhone === searchPhone}`);
      console.log(`   • Contato termina com busca? ${contactPhone.endsWith(searchPhone)}`);
      console.log(`   • Busca termina com contato? ${searchPhone.endsWith(contactPhone)}`);
      console.log(`   • RESULTADO: ${isMatch ? '✅ MATCH!' : '❌ Não encontrado'}`);
      
      if (isMatch) {
        console.log(`   🎉 ENCONTRADO! ${contact.name} (ID: ${contact.id})`);
        found = true;
      }
    });
    
    if (!found) {
      console.log(`\n❌ Número ${targetPhone} não foi encontrado com a lógica atual`);
      
      // Verificar se o contato ID 69 está na lista
      const contact69 = contacts.find(c => c.id === 69);
      if (contact69) {
        console.log(`\n🔍 Contato ID 69 encontrado na lista:`);
        console.log(`   • Nome: ${contact69.name}`);
        console.log(`   • Telefone: ${contact69.phone_number}`);
        
        const contactPhone = contact69.phone_number.replace(/\D/g, '');
        const searchPhone = targetPhone.replace(/\D/g, '');
        
        console.log(`   • Telefone limpo: ${contactPhone}`);
        console.log(`   • Busca limpa: ${searchPhone}`);
        console.log(`   • São iguais? ${contactPhone === searchPhone}`);
      } else {
        console.log(`\n❌ Contato ID 69 não está na lista retornada pela API`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.status, error.response?.data);
  }
}

testComparison();
