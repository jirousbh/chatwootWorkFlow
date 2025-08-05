const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'chatwoot_workflows',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

async function fixCampaignDeletion() {
  try {
    console.log('🔧 Iniciando correção de problemas de exclusão de campanhas...\n');

    // 1. Verificar campanhas com execuções pendentes
    console.log('1️⃣ Verificando campanhas com execuções pendentes...');
    const campaignsWithExecutions = await pool.query(`
      SELECT 
        c.id as campaign_id,
        c.name as campaign_name,
        COUNT(ce.id) as executions_count,
        COUNT(cs.id) as status_count,
        COUNT(cc.id) as contacts_count
      FROM campaigns c
      LEFT JOIN campaign_executions ce ON c.id = ce.campaign_id
      LEFT JOIN campaign_status cs ON c.id = cs.campaign_id
      LEFT JOIN campaign_contacts cc ON c.id = cc.campaign_id
      GROUP BY c.id, c.name
      HAVING COUNT(ce.id) > 0 OR COUNT(cs.id) > 0 OR COUNT(cc.id) > 0
      ORDER BY executions_count DESC, status_count DESC
    `);

    if (campaignsWithExecutions.rows.length === 0) {
      console.log('   ✅ Nenhuma campanha com registros relacionados encontrada');
    } else {
      console.log(`   📊 Encontradas ${campaignsWithExecutions.rows.length} campanhas com registros relacionados:`);
      campaignsWithExecutions.rows.forEach(campaign => {
        console.log(`      - ID ${campaign.campaign_id}: "${campaign.campaign_name}"`);
        console.log(`        Execuções: ${campaign.executions_count}, Status: ${campaign.status_count}, Contatos: ${campaign.contacts_count}`);
      });
    }

    // 2. Verificar registros órfãos
    console.log('\n2️⃣ Verificando registros órfãos...');
    
    const orphanedExecutions = await pool.query(`
      SELECT COUNT(*) as count
      FROM campaign_executions ce
      LEFT JOIN campaigns c ON ce.campaign_id = c.id
      WHERE c.id IS NULL
    `);
    
    const orphanedStatus = await pool.query(`
      SELECT COUNT(*) as count
      FROM campaign_status cs
      LEFT JOIN campaigns c ON cs.campaign_id = c.id
      WHERE c.id IS NULL
    `);
    
    const orphanedContacts = await pool.query(`
      SELECT COUNT(*) as count
      FROM campaign_contacts cc
      LEFT JOIN campaigns c ON cc.campaign_id = c.id
      WHERE c.id IS NULL
    `);

    console.log(`   Execuções órfãs: ${orphanedExecutions.rows[0].count}`);
    console.log(`   Status órfãos: ${orphanedStatus.rows[0].count}`);
    console.log(`   Contatos órfãos: ${orphanedContacts.rows[0].count}`);

    // 3. Perguntar se deve limpar registros órfãos
    if (orphanedExecutions.rows[0].count > 0 || orphanedStatus.rows[0].count > 0 || orphanedContacts.rows[0].count > 0) {
      console.log('\n⚠️  Encontrados registros órfãos!');
      console.log('   Para limpar registros órfãos, execute:');
      console.log('   node fix-campaign-deletion.js --clean-orphans');
    }

    // 4. Função para excluir campanha específica
    console.log('\n3️⃣ Para excluir uma campanha específica, use:');
    console.log('   node fix-campaign-deletion.js --delete-campaign <ID>');

    console.log('\n✅ Verificação concluída!');

  } catch (error) {
    console.error('❌ Erro durante a verificação:', error);
  } finally {
    await pool.end();
  }
}

async function cleanOrphans() {
  try {
    console.log('🧹 Limpando registros órfãos...\n');

    // Limpar execuções órfãs
    const orphanedExecutions = await pool.query(`
      DELETE FROM campaign_executions 
      WHERE campaign_id IN (
        SELECT ce.campaign_id
        FROM campaign_executions ce
        LEFT JOIN campaigns c ON ce.campaign_id = c.id
        WHERE c.id IS NULL
      )
    `);
    console.log(`   ✅ ${orphanedExecutions.rowCount} execuções órfãs removidas`);

    // Limpar status órfãos
    const orphanedStatus = await pool.query(`
      DELETE FROM campaign_status 
      WHERE campaign_id IN (
        SELECT cs.campaign_id
        FROM campaign_status cs
        LEFT JOIN campaigns c ON cs.campaign_id = c.id
        WHERE c.id IS NULL
      )
    `);
    console.log(`   ✅ ${orphanedStatus.rowCount} status órfãos removidos`);

    // Limpar contatos órfãos
    const orphanedContacts = await pool.query(`
      DELETE FROM campaign_contacts 
      WHERE campaign_id IN (
        SELECT cc.campaign_id
        FROM campaign_contacts cc
        LEFT JOIN campaigns c ON cc.campaign_id = c.id
        WHERE c.id IS NULL
      )
    `);
    console.log(`   ✅ ${orphanedContacts.rowCount} contatos órfãos removidos`);

    console.log('\n✅ Limpeza concluída!');

  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error);
  } finally {
    await pool.end();
  }
}

async function deleteCampaign(campaignId) {
  try {
    console.log(`🗑️  Excluindo campanha ID ${campaignId}...\n`);

    // Verificar se a campanha existe
    const campaign = await pool.query('SELECT id, name FROM campaigns WHERE id = $1', [campaignId]);
    if (campaign.rows.length === 0) {
      console.log('❌ Campanha não encontrada!');
      return;
    }

    console.log(`   Campanha: "${campaign.rows[0].name}"`);

    // Excluir registros relacionados
    const executions = await pool.query('DELETE FROM campaign_executions WHERE campaign_id = $1', [campaignId]);
    console.log(`   ✅ ${executions.rowCount} execuções removidas`);

    const status = await pool.query('DELETE FROM campaign_status WHERE campaign_id = $1', [campaignId]);
    console.log(`   ✅ ${status.rowCount} status removidos`);

    const contacts = await pool.query('DELETE FROM campaign_contacts WHERE campaign_id = $1', [campaignId]);
    console.log(`   ✅ ${contacts.rowCount} contatos removidos`);

    // Excluir a campanha
    const result = await pool.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);
    console.log(`   ✅ Campanha removida`);

    console.log('\n✅ Campanha excluída com sucesso!');

  } catch (error) {
    console.error('❌ Erro ao excluir campanha:', error);
  } finally {
    await pool.end();
  }
}

// Processar argumentos da linha de comando
const args = process.argv.slice(2);

if (args.includes('--clean-orphans')) {
  cleanOrphans();
} else if (args.includes('--delete-campaign')) {
  const campaignId = args[args.indexOf('--delete-campaign') + 1];
  if (!campaignId) {
    console.log('❌ Por favor, forneça o ID da campanha: node fix-campaign-deletion.js --delete-campaign <ID>');
  } else {
    deleteCampaign(parseInt(campaignId));
  }
} else {
  fixCampaignDeletion();
} 