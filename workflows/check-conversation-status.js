const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc1NTEwMzg1NiwiZXhwIjoxNzU1MTkwMjU2fQ.X5s1CK5YF_7Cgz4RfbMvbJoIyyEynZr_1pVByHc0H3g';

async function checkConversationStatus() {
  try {
    console.log('🔍 Verificando status da conversa...\n');
    
    const response = await axios.get(`${BASE_URL}/api/diagnose-auto-followup`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      params: {
        contactId: '+553175012310',
        workflowName: 'wizard teste inovai'
      }
    });
    
    const data = response.data;
    
    if (data.error) {
      console.log(`❌ Erro: ${data.error}`);
      return;
    }
    
    console.log(`✅ Status da conversa:`);
    console.log(`   ID: ${data.conversation_id}`);
    console.log(`   Bloco atual: ${data.current_block}`);
    console.log(`   Status: ${data.conversation_status}`);
    console.log(`   Segundos inativos: ${data.seconds_inactive}`);
    console.log(`   Minutos inativos: ${data.minutes_inactive}`);
    
    console.log(`\n📋 Análise dos followups:`);
    for (const [blockName, analysis] of Object.entries(data.followup_analysis)) {
      console.log(`\n   📋 Bloco ${blockName}:`);
      console.log(`      Delay: ${analysis.delay_formatted}`);
      console.log(`      Pronto: ${analysis.is_ready ? '✅' : '❌'}`);
      console.log(`      Já executado: ${analysis.already_executed ? '❌' : '✅'}`);
      console.log(`      Bot ativo: ${analysis.bot_active ? '✅' : '❌'}`);
      console.log(`      Pode executar: ${analysis.can_execute ? '✅' : '❌'}`);
      
      if (analysis.issues.length > 0) {
        console.log(`      Problemas: ${analysis.issues.join(', ')}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
  }
}

checkConversationStatus();
