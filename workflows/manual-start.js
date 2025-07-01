const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function startWorkflowManually(contactId, contactName = 'Cliente', conversationId = null) {
  try {
    console.log(`🚀 INICIANDO WORKFLOW MANUALMENTE...`);
    console.log(`Contato: ${contactId}`);
    console.log(`Nome: ${contactName}`);
    console.log(`Conversa Chatwoot: ${conversationId || 'N/A'}\n`);
    
    // Verificar se já existe uma conversa ativa
    const existingConv = await pool.query(
      'SELECT * FROM workflow_conversations WHERE contact_id = $1 AND status = $2',
      [contactId, 'active']
    );
    
    if (existingConv.rows.length > 0) {
      console.log('⚠️ Já existe uma conversa ativa para este contato. Finalizando...');
      await pool.query(
        'UPDATE workflow_conversations SET status = $1 WHERE contact_id = $2 AND status = $3',
        ['completed', contactId, 'active']
      );
    }
    
    // Iniciar nova conversa
    const result = await pool.query(`
      INSERT INTO workflow_conversations 
      (contact_id, workflow_name, current_block, data, status) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING id
    `, [
      contactId,
      'wizard_bh_buritis',
      'bloco_1',
      JSON.stringify({ nome: contactName }),
      'active'
    ]);
    
    console.log(`✅ Workflow iniciado! ID da conversa: ${result.rows[0].id}`);
    
    // Buscar configuração do workflow
    const workflowResult = await pool.query(
      'SELECT config FROM workflow_configs WHERE workflow_name = $1',
      ['wizard_bh_buritis']
    );
    
    if (workflowResult.rows.length === 0) {
      throw new Error('Workflow wizard_bh_buritis não encontrado!');
    }
    
    const workflow = workflowResult.rows[0].config;
    const firstBlock = workflow.blocks.bloco_1;
    
    // Processar mensagem com variáveis
    let message = firstBlock.message;
    if (contactName) {
      message = message.replace('{{nome}}', contactName);
    }
    
    console.log(`\n📨 MENSAGEM DO BLOCO 1:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(message);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    console.log(`\n🔘 BOTÕES DISPONÍVEIS:`);
    firstBlock.buttons.forEach((btn, index) => {
      console.log(`${index + 1}. ${btn.text} → ${btn.next_block}`);
    });
    
    // Salvar interação
    await pool.query(`
      INSERT INTO workflow_interactions 
      (conversation_id, contact_id, block_name, bot_message, buttons) 
      VALUES ($1, $2, $3, $4, $5)
    `, [
      result.rows[0].id,
      contactId,
      'bloco_1',
      message,
      JSON.stringify(firstBlock.buttons)
    ]);
    
    console.log('\n✅ Workflow iniciado com sucesso!');
    console.log('📝 Agora você pode copiar a mensagem acima e enviar manualmente no Chatwoot.');
    console.log('🔄 O sistema irá processar as respostas automaticamente.');
    
    return result.rows[0].id;
    
  } catch (error) {
    console.error('❌ Erro ao iniciar workflow:', error.message);
    throw error;
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      console.log('🔍 INICIADOR MANUAL DE WORKFLOW - WIZARD BH BURITIS\n');
      console.log('💡 Como usar:');
      console.log('node manual-start.js <contact_id> [contact_name] [conversation_id]\n');
      console.log('📝 Exemplos:');
      console.log('node manual-start.js 5511999999999');
      console.log('node manual-start.js 5511999999999 "João Silva"');
      console.log('node manual-start.js 5511999999999 "João Silva" 123\n');
      console.log('📋 Parâmetros:');
      console.log('- contact_id: ID do contato no WhatsApp (ex: 5511999999999)');
      console.log('- contact_name: Nome do contato (opcional, padrão: "Cliente")');
      console.log('- conversation_id: ID da conversa no Chatwoot (opcional)');
      return;
    }
    
    const contactId = args[0];
    const contactName = args[1] || 'Cliente';
    const conversationId = args[2] || null;
    
    await startWorkflowManually(contactId, contactName, conversationId);
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await pool.end();
  }
}

main(); 