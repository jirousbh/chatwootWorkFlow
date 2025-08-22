const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc1NTEwMzg1NiwiZXhwIjoxNzU1MTkwMjU2fQ.X5s1CK5YF_7Cgz4RfbMvbJoIyyEynZr_1pVByHc0H3g';

async function checkFollowupStatus() {
  try {
    console.log('🔍 Verificando status dos followups...\n');
    
    // Listar workflows com followup
    console.log('📋 Workflows com followup configurado:');
    const workflowsResponse = await axios.get(`${BASE_URL}/api/workflows-with-followup`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (workflowsResponse.data.workflows) {
      workflowsResponse.data.workflows.forEach(workflow => {
        console.log(`   - ${workflow.name}: ${Object.keys(workflow.auto_followup).join(', ')}`);
      });
    }
    
    console.log('\n⏰ Followups pendentes:');
    const pendingResponse = await axios.get(`${BASE_URL}/api/pending-followups`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (pendingResponse.data.conversations && pendingResponse.data.conversations.length > 0) {
      pendingResponse.data.conversations.forEach(conv => {
        console.log(`   - Conversa ${conv.id} (${conv.contact_id}): ${conv.workflow_name} - ${conv.current_block}`);
        console.log(`     Segundos inativos: ${conv.seconds_inactive} (${Math.round(conv.seconds_inactive / 60)} min)`);
        conv.pending_followups.forEach(followup => {
          console.log(`     📋 ${followup.block_name}: ${followup.delay_formatted} - ${followup.can_execute ? '✅ Pronto' : '⏳ Aguardando'}`);
        });
      });
    } else {
      console.log('   Nenhum followup pendente encontrado');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
  }
}

checkFollowupStatus();
