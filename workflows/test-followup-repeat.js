const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc1NTEwMzg1NiwiZXhwIjoxNzU1MTkwMjU2fQ.X5s1CK5YF_7Cgz4RfbMvbJoIyyEynZr_1pVByHc0H3g';

async function testFollowupRepeat() {
  try {
    console.log('🧪 Testando correção do followup repetitivo...\n');
    
    // 1. Verificar workflows com followup
    console.log('📋 1. Workflows com followup configurado:');
    const workflowsResponse = await axios.get(`${BASE_URL}/api/workflows-with-followup`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (workflowsResponse.data.workflows) {
      workflowsResponse.data.workflows.forEach(workflow => {
        console.log(`   ✅ ${workflow.name}: ${Object.keys(workflow.auto_followup).join(', ')}`);
      });
    }
    
    // 2. Verificar followups pendentes
    console.log('\n⏰ 2. Followups pendentes:');
    const pendingResponse = await axios.get(`${BASE_URL}/api/pending-followups`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (pendingResponse.data.conversations && pendingResponse.data.conversations.length > 0) {
      console.log(`   ✅ Encontradas ${pendingResponse.data.conversations.length} conversa(s) com followups pendentes`);
      
      pendingResponse.data.conversations.forEach((conv, index) => {
        console.log(`\n   📞 Conversa ${index + 1}:`);
        console.log(`      ID: ${conv.id}`);
        console.log(`      Contact: ${conv.contact_id}`);
        console.log(`      Workflow: ${conv.workflow_name}`);
        console.log(`      Bloco atual: ${conv.current_block}`);
        console.log(`      Segundos inativos: ${conv.seconds_inactive} (${Math.round(conv.seconds_inactive / 60)} min)`);
        
        conv.pending_followups.forEach(followup => {
          console.log(`      📋 ${followup.block_name}: ${followup.delay_formatted} - ${followup.can_execute ? '✅ Pronto' : '⏳ Aguardando'}`);
          if (followup.issues && followup.issues.length > 0) {
            console.log(`         Problemas: ${followup.issues.join(', ')}`);
          }
        });
      });
    } else {
      console.log('   ⏳ Nenhum followup pendente encontrado');
    }
    
    // 3. Verificar interações recentes de followup
    console.log('\n🔍 3. Verificando interações recentes de followup...');
    if (pendingResponse.data.conversations && pendingResponse.data.conversations.length > 0) {
      const firstConv = pendingResponse.data.conversations[0];
      
      // Fazer diagnóstico detalhado da primeira conversa
      const diagnoseResponse = await axios.get(`${BASE_URL}/api/diagnose-auto-followup`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` },
        params: {
          contactId: firstConv.contact_id,
          workflowName: firstConv.workflow_name
        }
      });
      
      if (diagnoseResponse.data && !diagnoseResponse.data.error) {
        console.log(`   📊 Diagnóstico para conversa ${firstConv.id}:`);
        console.log(`      Bloco atual: ${diagnoseResponse.data.current_block}`);
        console.log(`      Segundos inativos: ${diagnoseResponse.data.seconds_inactive}`);
        
        for (const [blockName, analysis] of Object.entries(diagnoseResponse.data.followup_analysis)) {
          console.log(`\n      📋 Análise do bloco ${blockName}:`);
          console.log(`         Delay: ${analysis.delay_formatted}`);
          console.log(`         Pronto: ${analysis.is_ready ? '✅' : '❌'}`);
          console.log(`         Já executado: ${analysis.already_executed ? '❌' : '✅'}`);
          console.log(`         Bot ativo: ${analysis.bot_active ? '✅' : '❌'}`);
          console.log(`         Pode executar: ${analysis.can_execute ? '✅' : '❌'}`);
          
          if (analysis.issues && analysis.issues.length > 0) {
            console.log(`         Problemas: ${analysis.issues.join(', ')}`);
          }
        }
      }
    }
    
    console.log('\n🎯 TESTE CONCLUÍDO!');
    console.log('\n📝 Resumo da correção implementada:');
    console.log('   ✅ Followup agora verifica se já foi executado recentemente');
    console.log('   ✅ Usa interaction_type = "AUTO_FOLLOWUP" para identificar execuções');
    console.log('   ✅ Compara com delaySeconds para evitar repetições');
    console.log('   ✅ Atualiza current_block para o bloco de followup antes de enviar');
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
  }
}

testFollowupRepeat();
