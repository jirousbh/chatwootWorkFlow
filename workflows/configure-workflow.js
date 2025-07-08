const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuração do PostgreSQL
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'chatwoot_workflows',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'invoAI@76825',
});

async function configureWorkflow(accountId, inboxId, workflowName) {
  try {
    console.log('🔧 CONFIGURANDO FLUXO PARA CAIXA DE ENTRADA\n');
    console.log(`Account ID: ${accountId}`);
    console.log(`Inbox ID: ${inboxId}`);
    console.log(`Workflow: ${workflowName}\n`);
    
    // 1. Verificar se o workflow existe no sistema
    const workflowResult = await pool.query(
      'SELECT * FROM workflow_configs WHERE workflow_name = $1 AND is_active = true',
      [workflowName]
    );
    
    let workflowConfig;
    
    if (workflowResult.rows.length === 0) {
      // Se não existir no banco, tentar carregar do arquivo
      const workflowPath = path.join(__dirname, `${workflowName}-workflow.json`);
      
      if (!fs.existsSync(workflowPath)) {
        console.error(`❌ Workflow "${workflowName}" não encontrado no banco nem em arquivo!`);
        console.log('\n📋 Fluxos disponíveis no banco:');
        const availableResult = await pool.query('SELECT workflow_name FROM workflow_configs WHERE is_active = true');
        availableResult.rows.forEach(row => {
          console.log(`   • ${row.workflow_name}`);
        });
        return;
      }
      
      console.log(`📁 Carregando workflow do arquivo: ${workflowPath}`);
      const fileContent = fs.readFileSync(workflowPath, 'utf8');
      const workflowData = JSON.parse(fileContent);
      workflowConfig = workflowData.config;
      
      // Salvar no banco para uso futuro
      await pool.query(
        'INSERT INTO workflow_configs (workflow_name, config) VALUES ($1, $2) ON CONFLICT (workflow_name) DO UPDATE SET config = $2',
        [workflowName, workflowConfig]
      );
      console.log(`✅ Workflow "${workflowName}" salvo no banco`);
    } else {
      console.log(`📋 Usando workflow do banco: ${workflowName}`);
      workflowConfig = workflowResult.rows[0].config;
    }
    
    // 2. Verificar se já existe configuração para esta caixa de entrada
    const existingResult = await pool.query(
      'SELECT * FROM inbox_workflows WHERE account_id = $1 AND inbox_id = $2',
      [accountId, inboxId]
    );
    
    if (existingResult.rows.length > 0) {
      console.log(`⚠️ Já existe um fluxo configurado para esta caixa de entrada: ${existingResult.rows[0].workflow_name}`);
      console.log('🔄 Atualizando configuração...');
    }
    
    // 3. Salvar ou atualizar a configuração do fluxo para a caixa de entrada
    await pool.query(
      `INSERT INTO inbox_workflows (account_id, inbox_id, workflow_name, workflow_config, is_active) 
       VALUES ($1, $2, $3, $4, true) 
       ON CONFLICT (account_id, inbox_id) 
       DO UPDATE SET workflow_name = $3, workflow_config = $4, is_active = true, updated_at = CURRENT_TIMESTAMP`,
      [accountId, inboxId, workflowName, workflowConfig]
    );
    
    console.log(`✅ Fluxo "${workflowName}" configurado com sucesso para a caixa de entrada ${inboxId}!`);
    
    // 4. Mostrar resumo da configuração
    console.log('\n📊 RESUMO DA CONFIGURAÇÃO:\n');
    console.log(`🏷️  Workflow: ${workflowName}`);
    console.log(`📦 Caixa de entrada: ${inboxId}`);
    console.log(`🏢 Conta: ${accountId}`);
    console.log(`📅 Configurado em: ${new Date().toLocaleString('pt-BR')}`);
    
    // 5. Mostrar próximos passos
    console.log('\n🚀 PRÓXIMOS PASSOS:\n');
    console.log('1. Reinicie o sistema de workflows se estiver rodando:');
    console.log('   • Pare o processo atual (Ctrl+C)');
    console.log('   • Execute novamente: npm start');
    console.log('');
    console.log('2. Teste o fluxo:');
    console.log('   • Envie uma mensagem para o WhatsApp conectado à caixa de entrada');
    console.log('   • Use palavras como "oi", "olá" ou "iniciar" para ativar o bot');
    console.log('');
    console.log('3. Monitore os logs para verificar se o fluxo está funcionando');
    console.log('');
    console.log('4. Para verificar o status: node check-inboxes.js');
    
  } catch (error) {
    console.error('❌ Erro ao configurar workflow:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Validar argumentos
const args = process.argv.slice(2);

if (args.length !== 3) {
  console.log('❌ Uso incorreto!');
  console.log('');
  console.log('📝 Uso correto:');
  console.log('node configure-workflow.js <account_id> <inbox_id> <workflow_name>');
  console.log('');
  console.log('📋 Exemplo:');
  console.log('node configure-workflow.js 3 5 wizard_bh_buritis');
  console.log('');
  console.log('💡 Para descobrir os IDs disponíveis, execute:');
  console.log('node check-inboxes.js');
  process.exit(1);
}

const [accountId, inboxId, workflowName] = args;

// Validar que accountId e inboxId são números
if (isNaN(accountId) || isNaN(inboxId)) {
  console.error('❌ Account ID e Inbox ID devem ser números!');
  process.exit(1);
}

// Executar configuração
configureWorkflow(parseInt(accountId), parseInt(inboxId), workflowName); 