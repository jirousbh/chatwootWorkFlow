const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function testAutoFollowupVisualization() {
  console.log('🔍 Testando visualização do Auto Follow-up...');
  console.log('=' .repeat(60));

  try {
    // 1. Buscar workflows com auto_followup configurado
    console.log('\n1️⃣ Workflows com Auto Follow-up configurado:');
    const workflowsResult = await pool.query(`
      SELECT 
        workflow_name,
        config
      FROM workflow_configs 
      WHERE config::text LIKE '%auto_followup%'
      ORDER BY workflow_name
    `);

    if (workflowsResult.rows.length === 0) {
      console.log('❌ Nenhum workflow com auto_followup encontrado');
      return;
    }

    console.log(`✅ Encontrados ${workflowsResult.rows.length} workflow(s) com auto_followup:`);
    
    workflowsResult.rows.forEach((workflow, index) => {
      const config = workflow.config;
      console.log(`\n📋 ${index + 1}. ${workflow.workflow_name}:`);
      
      if (config.auto_followup) {
        Object.entries(config.auto_followup).forEach(([blockId, followup]) => {
          const delayMinutes = Math.round(followup.delay / 60);
          const delayHours = Math.round(followup.delay / 3600);
          
          let delayText = '';
          if (delayHours >= 1) {
            delayText = `${delayHours}h ${Math.round((followup.delay % 3600) / 60)}min`;
          } else {
            delayText = `${delayMinutes}min`;
          }
          
          console.log(`   🕐 Bloco ${blockId}: ${delayText} (${followup.delay}s)`);
        });
      }
      
      // Verificar botões com disable_auto_followup
      if (config.blocks) {
        Object.entries(config.blocks).forEach(([blockId, block]) => {
          if (block.buttons) {
            block.buttons.forEach(button => {
              if (button.disable_auto_followup !== undefined) {
                const action = button.disable_auto_followup ? 'Desativar' : 'Ativar';
                console.log(`   🔘 Botão "${button.text}" (${blockId}): ${action} Auto Follow-up`);
              }
            });
          }
        });
      }
    });

    // 2. Verificar conversas ativas com auto_followup
    console.log('\n2️⃣ Conversas ativas com auto_followup:');
    const conversationsResult = await pool.query(`
      SELECT 
        wc.conversation_id,
        wc.workflow_name,
        wc.current_block,
        EXTRACT(EPOCH FROM (NOW() - wc.last_activity)) as seconds_inactive,
        bcs.auto_followup_disabled,
        bcs.followup_disabled_by
      FROM workflow_conversations wc
      LEFT JOIN bot_conversation_status bcs ON wc.conversation_id = bcs.conversation_id
      WHERE wc.status = 'active'
        AND wc.last_activity IS NOT NULL
      ORDER BY wc.conversation_id
      LIMIT 10
    `);

    console.log(`✅ Encontradas ${conversationsResult.rows.length} conversa(s) ativa(s):`);
    conversationsResult.rows.forEach(conv => {
      const minutesInactive = Math.round(conv.seconds_inactive / 60);
      const autoFollowupStatus = conv.auto_followup_disabled ? 'Desativado' : 'Ativado';
      const disabledBy = conv.followup_disabled_by || 'padrão';
      
      console.log(`   💬 ID ${conv.conversation_id}: ${conv.workflow_name} - ${conv.current_block}`);
      console.log(`      Inativo há: ${minutesInactive}min | Auto_followup: ${autoFollowupStatus} (${disabledBy})`);
    });

    // 3. Simular dados para o frontend
    console.log('\n3️⃣ Dados simulados para o frontend:');
    const sampleWorkflow = workflowsResult.rows[0];
    if (sampleWorkflow) {
      const config = sampleWorkflow.config;
      console.log(`📋 Workflow: ${sampleWorkflow.workflow_name}`);
      
      // Simular seção de auto_followup
      if (config.auto_followup) {
        console.log('🎨 Seção Auto Follow-up (frontend):');
        console.log('┌─────────────────────────────────────────────────────────┐');
        console.log('│ 🕐 Auto Follow-up                    [Configurado]      │');
        console.log('│ ┌─────────────────────────────────────────────────────┐ │');
        
        Object.entries(config.auto_followup).forEach(([blockId, followup]) => {
          const block = config.blocks[blockId];
          const blockName = block ? (block.name || blockId) : blockId;
          const delayMinutes = Math.round(followup.delay / 60);
          const delayHours = Math.round(followup.delay / 3600);
          
          let delayText = '';
          if (delayHours >= 1) {
            delayText = `${delayHours}h ${Math.round((followup.delay % 3600) / 60)}min`;
          } else {
            delayText = `${delayMinutes}min`;
          }
          
          console.log(`│ │ ➡️ ${blockName} (${delayText})                    │ │`);
          console.log(`│ │    Delay: ${followup.delay}s | Condição: ${followup.condition || 'inactive'} │ │`);
        });
        
        console.log('│ └─────────────────────────────────────────────────────┘ │');
        console.log('└─────────────────────────────────────────────────────────┘');
      }
      
      // Simular blocos com indicadores
      if (config.blocks) {
        console.log('\n🎨 Blocos com indicadores (frontend):');
        Object.entries(config.blocks).forEach(([blockId, block]) => {
          const hasAutoFollowup = config.auto_followup && config.auto_followup[blockId];
          const blockName = block.name || blockId;
          
          console.log(`┌─ Bloco: ${blockName} ─${'─'.repeat(50 - blockName.length)}┐`);
          console.log(`│ Mensagem: ${(block.message || '').substring(0, 40)}${(block.message || '').length > 40 ? '...' : ''} │`);
          
          if (hasAutoFollowup) {
            const followup = config.auto_followup[blockId];
            const delayMinutes = Math.round(followup.delay / 60);
            console.log(`│ 🕐 Auto Follow-up: ${delayMinutes}min (${followup.delay}s)        │`);
          }
          
          if (block.buttons) {
            block.buttons.forEach(button => {
              const hasConfig = button.disable_auto_followup !== undefined;
              const icon = hasConfig ? (button.disable_auto_followup ? '🚫' : '✅') : '';
              const configText = hasConfig ? ` ${icon}` : '';
              console.log(`│ 🔘 ${button.text}${configText}${' '.repeat(50 - button.text.length - configText.length)} │`);
            });
          }
          
          console.log(`└${'─'.repeat(52)}┘`);
        });
      }
    }

    console.log('\n✅ Teste de visualização concluído!');
    console.log('\n📝 Para testar no frontend:');
    console.log('   1. Acesse o sistema no navegador');
    console.log('   2. Faça login como admin');
    console.log('   3. Selecione uma conta e caixa de entrada');
    console.log('   4. Clique em "Configurar Fluxo"');
    console.log('   5. Verifique a seção "Auto Follow-up" na visualização');

  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  } finally {
    await pool.end();
  }
}

testAutoFollowupVisualization();
