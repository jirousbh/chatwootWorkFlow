const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'chatwoot_workflows',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

async function checkWorkflowLoading() {
    try {
        console.log('🔍 Verificando carregamento do workflow...\n');

        // 1. Verificar workflow na tabela inbox_workflows
        console.log('1️⃣ Verificando workflow na tabela inbox_workflows:');
        const inboxWorkflowResult = await pool.query(`
            SELECT 
                account_id,
                inbox_id,
                workflow_name,
                workflow_config
            FROM inbox_workflows
            WHERE workflow_name = 'teste disable auto follow up'
        `);

        if (inboxWorkflowResult.rows.length === 0) {
            console.log('❌ Workflow não encontrado na tabela inbox_workflows');
            return;
        }

        const inboxWorkflow = inboxWorkflowResult.rows[0];
        console.log(`✅ Workflow encontrado:`);
        console.log(`   Account ID: ${inboxWorkflow.account_id}`);
        console.log(`   Inbox ID: ${inboxWorkflow.inbox_id}`);
        console.log(`   Workflow Name: ${inboxWorkflow.workflow_name}`);
        console.log(`   Config type: ${typeof inboxWorkflow.workflow_config}`);
        console.log(`   Config keys: ${Object.keys(inboxWorkflow.workflow_config || {}).join(', ')}\n`);

        // 2. Verificar se o workflow tem blocos
        const config = inboxWorkflow.workflow_config;
        if (!config || !config.blocks) {
            console.log('❌ Workflow não tem blocos configurados');
            return;
        }

        console.log(`2️⃣ Verificando blocos do workflow:`);
        console.log(`   Total de blocos: ${Object.keys(config.blocks).length}`);
        console.log(`   Blocos: ${Object.keys(config.blocks).join(', ')}\n`);

        // 3. Verificar bloco_01 especificamente
        console.log('3️⃣ Verificando bloco_01:');
        const bloco01 = config.blocks.bloco_01;
        if (!bloco01) {
            console.log('❌ Bloco bloco_01 não encontrado');
            return;
        }

        console.log(`   Nome: ${bloco01.name}`);
        console.log(`   ID: ${bloco01.id}`);
        console.log(`   Mensagem: ${bloco01.message ? bloco01.message.substring(0, 100) + '...' : 'N/A'}`);
        console.log(`   Botões: ${bloco01.buttons ? bloco01.buttons.length : 0}`);

        if (bloco01.buttons) {
            bloco01.buttons.forEach((button, index) => {
                console.log(`   Botão ${index + 1}: "${button.text}"`);
                console.log(`     next_block: ${button.next_block}`);
                console.log(`     disable_auto_followup: ${button.disable_auto_followup}`);
                console.log(`     assign_labels: ${button.assign_labels ? JSON.stringify(button.assign_labels) : 'N/A'}`);
                console.log(`     contact_labels: ${button.contact_labels ? JSON.stringify(button.contact_labels) : 'N/A'}`);
            });
        }

        // 4. Verificar auto_followup configurado
        console.log('\n4️⃣ Verificando auto_followup configurado:');
        if (config.auto_followup) {
            console.log(`   Auto_followup configurado:`);
            Object.entries(config.auto_followup).forEach(([blockName, followupConfig]) => {
                console.log(`     ${blockName}: delay ${followupConfig.delay}s, condition: ${followupConfig.condition}`);
            });
        } else {
            console.log('   ❌ Nenhum auto_followup configurado');
        }

        // 5. Simular carregamento do workflow como o sistema faz
        console.log('\n5️⃣ Simulando carregamento do workflow:');
        
        // Simular a função loadWorkflowFromDatabase
        const workflowName = 'teste disable auto follow up';
        const workflowResult = await pool.query(`
            SELECT workflow_config
            FROM inbox_workflows
            WHERE workflow_name = $1
            LIMIT 1
        `, [workflowName]);

        if (workflowResult.rows.length === 0) {
            console.log(`❌ Workflow '${workflowName}' não encontrado no banco`);
            return;
        }

        const loadedWorkflow = workflowResult.rows[0].workflow_config;
        console.log(`✅ Workflow carregado com sucesso:`);
        console.log(`   Nome: ${loadedWorkflow.name}`);
        console.log(`   Blocos: ${Object.keys(loadedWorkflow.blocks).length}`);
        console.log(`   Auto_followup: ${loadedWorkflow.auto_followup ? 'Sim' : 'Não'}`);

        // 6. Verificar se o bloco_01 tem os botões corretos
        console.log('\n6️⃣ Verificando botões do bloco_01 no workflow carregado:');
        const loadedBloco01 = loadedWorkflow.blocks.bloco_01;
        if (loadedBloco01 && loadedBloco01.buttons) {
            loadedBloco01.buttons.forEach((button, index) => {
                console.log(`   Botão ${index + 1}: "${button.text}"`);
                console.log(`     disable_auto_followup: ${button.disable_auto_followup}`);
                console.log(`     Tipo: ${typeof button.disable_auto_followup}`);
                console.log(`     Valor exato: ${JSON.stringify(button.disable_auto_followup)}`);
            });
        }

        // 7. Testar processamento de botão
        console.log('\n7️⃣ Testando processamento de botão:');
        const testButton = loadedBloco01.buttons[0]; // "Já sou aluno"
        console.log(`   Testando botão: "${testButton.text}"`);
        console.log(`   disable_auto_followup: ${testButton.disable_auto_followup}`);
        console.log(`   disable_auto_followup === true: ${testButton.disable_auto_followup === true}`);
        console.log(`   disable_auto_followup === false: ${testButton.disable_auto_followup === false}`);

        if (testButton.disable_auto_followup === true) {
            console.log(`   ✅ Botão deve desativar auto_followup`);
        } else if (testButton.disable_auto_followup === false) {
            console.log(`   ✅ Botão deve ativar auto_followup`);
        } else {
            console.log(`   ❌ Botão não tem configuração de auto_followup`);
        }

        console.log('\n✅ Verificação do carregamento do workflow concluída!');

    } catch (error) {
        console.error('❌ Erro ao verificar carregamento do workflow:', error);
    } finally {
        await pool.end();
    }
}

checkWorkflowLoading();
