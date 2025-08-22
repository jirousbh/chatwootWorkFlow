const axios = require('axios');

// Configurações
const BASE_URL = 'http://localhost:3001';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc1NTEwMzg1NiwiZXhwIjoxNzU1MTkwMjU2fQ.X5s1CK5YF_7Cgz4RfbMvbJoIyyEynZr_1pVByHc0H3g';

async function testSimpleFollowup() {
  try {
    console.log('🧪 Testando lógica simplificada de followup...\n');
    
    // 1. Listar followups pendentes
    console.log('⏰ Listando followups pendentes...');
    const pendingResponse = await axios.get(`${BASE_URL}/api/pending-followups`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    console.log(`✅ Encontradas ${pendingResponse.data.total_conversations} conversa(s) com followups pendentes`);
    
    // 2. Testar diagnóstico em uma conversa específica
    if (pendingResponse.data.conversations.length > 0) {
      const testConversation = pendingResponse.data.conversations[0];
      console.log(`\n🔍 Testando diagnóstico para conversa ${testConversation.conversation_id} (${testConversation.contact_id})`);
      
      const diagnosisResponse = await axios.get(`${BASE_URL}/api/diagnose-auto-followup`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` },
        params: {
          contactId: testConversation.contact_id,
          workflowName: testConversation.workflow_name
        }
      });
      
      const diagnosis = diagnosisResponse.data;
      
      if (diagnosis.error) {
        console.log(`❌ Erro no diagnóstico: ${diagnosis.error}`);
      } else {
        console.log(`✅ Diagnóstico concluído:`);
        console.log(`   Conversa ID: ${diagnosis.conversation_id}`);
        console.log(`   Segundos inativos: ${diagnosis.seconds_inactive}`);
        console.log(`   Minutos inativos: ${diagnosis.minutes_inactive}`);
        console.log(`   Pode executar algum followup: ${diagnosis.can_execute_any ? 'SIM' : 'NÃO'}`);
        
        // Mostrar detalhes dos followups
        for (const [blockName, analysis] of Object.entries(diagnosis.followup_analysis)) {
          console.log(`\n   📋 Bloco ${blockName}:`);
          console.log(`      Delay: ${analysis.delay_formatted}`);
          console.log(`      Pronto: ${analysis.is_ready ? '✅' : '❌'}`);
          console.log(`      Bloco existe: ${analysis.block_exists ? '✅' : '❌'}`);
          console.log(`      Já executado: ${analysis.already_executed ? '❌' : '✅'}`);
          console.log(`      Bot ativo: ${analysis.bot_active ? '✅' : '❌'}`);
          console.log(`      Pode executar: ${analysis.can_execute ? '✅' : '❌'}`);
          
          if (analysis.issues.length > 0) {
            console.log(`      Problemas: ${analysis.issues.join(', ')}`);
          }
        }
        
        // 3. Testar followup forçado se possível
        const readyFollowups = Object.entries(diagnosis.followup_analysis)
          .filter(([blockName, analysis]) => analysis.can_execute);
        
        if (readyFollowups.length > 0) {
          const [blockName, analysis] = readyFollowups[0];
          console.log(`\n🚀 Testando followup forçado para bloco ${blockName}...`);
          
          const forceResponse = await axios.post(`${BASE_URL}/api/force-followup`, {
            contactId: testConversation.contact_id,
            workflowName: testConversation.workflow_name,
            blockName: blockName
          }, {
            headers: { 
              'Authorization': `Bearer ${TOKEN}`,
              'Content-Type': 'application/json'
            }
          });
          
          console.log(`✅ Resultado do followup forçado:`, forceResponse.data);
        } else {
          console.log(`\n⚠️ Nenhum followup pode ser executado no momento.`);
        }
      }
    }
    
    console.log('\n🎯 TESTE CONCLUÍDO!');
    console.log('Agora verifique os logs do sistema para ver se o followup está sendo executado corretamente.');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.response?.data || error.message);
  }
}

// Executar teste
testSimpleFollowup();
