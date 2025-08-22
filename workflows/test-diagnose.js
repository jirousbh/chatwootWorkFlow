const axios = require('axios');

// Configurações
const BASE_URL = 'http://localhost:3001';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc1NTEwMzg1NiwiZXhwIjoxNzU1MTkwMjU2fQ.X5s1CK5YF_7Cgz4RfbMvbJoIyyEynZr_1pVByHc0H3g'; // Substitua pelo token real

// Função para testar diagnóstico
async function testDiagnosis(contactId, workflowName) {
  try {
    console.log(`🔍 Testando diagnóstico para contact ${contactId} no workflow ${workflowName}`);
    
    const response = await axios.get(`${BASE_URL}/api/diagnose-auto-followup`, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      },
      params: {
        contactId: contactId,
        workflowName: workflowName
      }
    });
    
    const diagnosis = response.data;
    
    console.log('\n📊 RESULTADO DO DIAGNÓSTICO:');
    console.log('================================');
    
    if (diagnosis.error) {
      console.log(`❌ Erro: ${diagnosis.error}`);
      return;
    }
    
    console.log(`✅ Conversa ID: ${diagnosis.conversation_id}`);
    console.log(`✅ Status: ${diagnosis.conversation_status}`);
    console.log(`✅ Bloco atual: ${diagnosis.current_block}`);
    console.log(`⏰ Última atividade: ${diagnosis.last_activity}`);
    console.log(`⏰ Tempo inativo: ${diagnosis.seconds_inactive}s (${diagnosis.minutes_inactive} min)`);
    console.log(`💬 Mensagens usuário (2h): ${diagnosis.user_message_count_2h}`);
    
    if (diagnosis.last_user_message) {
      console.log(`💬 Última mensagem usuário: ${diagnosis.last_user_message}`);
    }
    
    console.log('\n📋 ANÁLISE DOS FOLLOWUPS:');
    console.log('==========================');
    
    for (const [blockName, analysis] of Object.entries(diagnosis.followup_analysis)) {
      console.log(`\n🔍 Bloco: ${blockName}`);
      console.log(`   Delay: ${analysis.delay_formatted} (${analysis.delay_seconds}s)`);
      console.log(`   Pronto: ${analysis.is_ready ? '✅' : '❌'}`);
      console.log(`   Bloco existe: ${analysis.block_exists ? '✅' : '❌'}`);
      console.log(`   Já executado: ${analysis.already_executed ? '❌' : '✅'}`);
      console.log(`   Conversa inativa: ${analysis.conversation_inactive ? '✅' : '❌'}`);
      console.log(`   Bot ativo: ${analysis.bot_active ? '✅' : '❌'}`);
      console.log(`   Pode executar: ${analysis.can_execute ? '✅' : '❌'}`);
      
      if (analysis.issues.length > 0) {
        console.log(`   ⚠️ Problemas:`);
        analysis.issues.forEach(issue => console.log(`      - ${issue}`));
      }
      
      if (!analysis.is_ready) {
        console.log(`   ⏰ Tempo restante: ${analysis.time_remaining}s`);
      }
    }
    
    console.log(`\n🎯 PODE EXECUTAR ALGUM FOLLOWUP: ${diagnosis.can_execute_any ? '✅ SIM' : '❌ NÃO'}`);
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.response?.data || error.message);
  }
}

// Função para testar followup forçado
async function testForceFollowup(contactId, workflowName, blockName) {
  try {
    console.log(`🚀 Testando followup forçado: ${blockName}`);
    
    const response = await axios.post(`${BASE_URL}/api/force-followup`, {
      contactId: contactId,
      workflowName: workflowName,
      blockName: blockName
    }, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Resultado:', response.data);
    
  } catch (error) {
    console.error('❌ Erro no followup forçado:', error.response?.data || error.message);
  }
}

// Função para listar workflows com followup
async function listWorkflowsWithFollowup() {
  try {
    console.log('📋 Listando workflows com auto_followup...');
    
    const response = await axios.get(`${BASE_URL}/api/workflows-with-followup`, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });
    
    console.log('\n📊 WORKFLOWS COM AUTO_FOLLOWUP:');
    console.log('==================================');
    
    response.data.workflows.forEach(workflow => {
      console.log(`\n🔧 Workflow: ${workflow.workflow_name}`);
      console.log(`   Fonte: ${workflow.source}`);
      console.log(`   Blocos de followup: ${workflow.total_followup_blocks}`);
      
      for (const [blockName, config] of Object.entries(workflow.followup_blocks)) {
        console.log(`   - ${blockName}: ${config.delay_formatted} (${config.condition})`);
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar workflows:', error.response?.data || error.message);
  }
}

// Função para listar followups pendentes
async function listPendingFollowups() {
  try {
    console.log('⏰ Listando followups pendentes...');
    
    const response = await axios.get(`${BASE_URL}/api/pending-followups`, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });
    
    console.log('\n📊 FOLLOWUPS PENDENTES:');
    console.log('=========================');
    console.log(`Total de conversas: ${response.data.total_conversations}`);
    
    response.data.conversations.forEach(conversation => {
      console.log(`\n💬 Conversa ${conversation.conversation_id} (${conversation.contact_id})`);
      console.log(`   Workflow: ${conversation.workflow_name}`);
      console.log(`   Bloco atual: ${conversation.current_block}`);
      console.log(`   Inativo há: ${conversation.minutes_inactive} minutos`);
      
      conversation.followups.forEach(followup => {
        console.log(`   - ${followup.block_name}: ${followup.delay_formatted} (${followup.is_ready ? '✅ Pronto' : '⏰ Aguardando'})`);
      });
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar followups pendentes:', error.response?.data || error.message);
  }
}

// Executar testes
async function runTests() {
  console.log('🧪 INICIANDO TESTES DE AUTO FOLLOWUP');
  console.log('=====================================\n');
  
  // 1. Listar workflows com followup
  await listWorkflowsWithFollowup();
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // 2. Listar followups pendentes
  await listPendingFollowups();
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // 3. Testar diagnóstico específico (substitua pelos dados reais)
  const contactId = '553175012310'; // Substitua pelo contact_id real
  const workflowName = 'wizard teste inovai';
  
  await testDiagnosis(contactId, workflowName);
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // 4. Testar followup forçado (descomente se necessário)
  // await testForceFollowup(contactId, workflowName, 'bloco_7');
}

// Executar se chamado diretamente
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testDiagnosis,
  testForceFollowup,
  listWorkflowsWithFollowup,
  listPendingFollowups
};
