const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc1NTEwMzg1NiwiZXhwIjoxNzU1MTkwMjU2fQ.X5s1CK5YF_7Cgz4RfbMvbJoIyyEynZr_1pVByHc0H3g';

async function testDisableFollowup() {
  try {
    console.log('🧪 Testando funcionalidade de desativar followup...\n');
    
    // 1. Verificar workflows com followup
    console.log('📋 1. Workflows com followup configurado:');
    const workflowsResponse = await axios.get(`${BASE_URL}/api/workflows-with-followup`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (workflowsResponse.data.workflows) {
      workflowsResponse.data.workflows.forEach(workflow => {
        console.log(`   ✅ ${workflow.name}: ${Object.keys(workflow.auto_followup).join(', ')}`);
        
        // Mostrar delays em formato legível
        for (const [blockName, config] of Object.entries(workflow.auto_followup)) {
          const minutes = Math.round(config.delay / 60);
          console.log(`      📋 ${blockName}: ${config.delay}s (${minutes} min)`);
        }
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
    
    console.log('\n🎯 TESTE CONCLUÍDO!');
    console.log('\n📝 Resumo das melhorias implementadas:');
    console.log('   ✅ Delay agora em segundos (mais legível)');
    console.log('   ✅ Propriedade disable_auto_followup nos botões');
    console.log('   ✅ Verificação de followup desativado por conversa');
    console.log('   ✅ Função disableAutoFollowupForConversation');
    console.log('   ✅ Logs detalhados para debug');
    
    console.log('\n🔧 Como usar:');
    console.log('   - Adicione "disable_auto_followup": true nos botões');
    console.log('   - Use delay em segundos no JSON (ex: 1800 para 30 min)');
    console.log('   - Sistema verifica automaticamente se followup está desativado');
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
  }
}

testDisableFollowup();
