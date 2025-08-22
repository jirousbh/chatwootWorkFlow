const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function checkDisableAutoFollowupButtons() {
  console.log('🔍 Verificando botões com disable_auto_followup...');
  console.log('=' .repeat(60));

  try {
    // Buscar workflows com botões que têm disable_auto_followup
    const workflowsResult = await pool.query(`
      SELECT 
        workflow_name,
        config
      FROM workflow_configs 
      WHERE config::text LIKE '%disable_auto_followup%'
      ORDER BY workflow_name
    `);

    if (workflowsResult.rows.length === 0) {
      console.log('❌ Nenhum workflow com botões disable_auto_followup encontrado');
      return;
    }

    console.log(`✅ Encontrados ${workflowsResult.rows.length} workflow(s) com botões disable_auto_followup:`);
    
    workflowsResult.rows.forEach((workflow, index) => {
      const config = workflow.config;
      console.log(`\n📋 ${index + 1}. ${workflow.workflow_name}:`);
      
      if (config.blocks) {
        Object.entries(config.blocks).forEach(([blockId, block]) => {
          if (block.buttons) {
            block.buttons.forEach(button => {
              if (button.disable_auto_followup !== undefined) {
                const action = button.disable_auto_followup ? 'Desativar' : 'Ativar';
                const icon = button.disable_auto_followup ? '🚫' : '✅';
                console.log(`   🔘 ${icon} Botão "${button.text}" (${blockId}): ${action} Auto Follow-up`);
                
                // Mostrar próximo bloco se existir
                if (button.next_block) {
                  const nextBlock = config.blocks[button.next_block];
                  const nextBlockName = nextBlock ? (nextBlock.name || button.next_block) : button.next_block;
                  console.log(`      ➡️ Próximo: ${nextBlockName}`);
                }
              }
            });
          }
        });
      }
    });

    // Verificar se há workflows de teste com essa configuração
    console.log('\n🔍 Verificando workflows de teste...');
    const testWorkflowsResult = await pool.query(`
      SELECT 
        workflow_name,
        config
      FROM workflow_configs 
      WHERE workflow_name LIKE '%teste%' OR workflow_name LIKE '%disable%'
      ORDER BY workflow_name
    `);

    if (testWorkflowsResult.rows.length > 0) {
      console.log(`✅ Encontrados ${testWorkflowsResult.rows.length} workflow(s) de teste:`);
      
      testWorkflowsResult.rows.forEach((workflow, index) => {
        const config = workflow.config;
        console.log(`\n📋 ${index + 1}. ${workflow.workflow_name}:`);
        
        // Verificar auto_followup
        if (config.auto_followup) {
          console.log('   🕐 Auto Follow-up configurado:');
          Object.entries(config.auto_followup).forEach(([blockId, followup]) => {
            const delayMinutes = Math.round(followup.delay / 60);
            console.log(`      Bloco ${blockId}: ${delayMinutes}min (${followup.delay}s)`);
          });
        }
        
        // Verificar botões com disable_auto_followup
        if (config.blocks) {
          Object.entries(config.blocks).forEach(([blockId, block]) => {
            if (block.buttons) {
              block.buttons.forEach(button => {
                if (button.disable_auto_followup !== undefined) {
                  const action = button.disable_auto_followup ? 'Desativar' : 'Ativar';
                  const icon = button.disable_auto_followup ? '🚫' : '✅';
                  console.log(`   🔘 ${icon} Botão "${button.text}" (${blockId}): ${action} Auto Follow-up`);
                }
              });
            }
          });
        }
      });
    }

    console.log('\n✅ Verificação concluída!');

  } catch (error) {
    console.error('❌ Erro durante a verificação:', error);
  } finally {
    await pool.end();
  }
}

checkDisableAutoFollowupButtons();
