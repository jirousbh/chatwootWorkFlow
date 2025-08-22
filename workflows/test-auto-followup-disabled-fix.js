const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'chatwoot_workflows',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

async function testAutoFollowupDisabledFix() {
    try {
        console.log('🧪 Testando correção do auto_followup_disabled...\n');

        // 1. Verificar workflow atual no banco
        console.log('1️⃣ Verificando workflow atual no banco:');
        const workflowResult = await pool.query(`
            SELECT workflow_config
            FROM inbox_workflows
            WHERE workflow_name = 'teste disable auto follow up'
        `);

        if (workflowResult.rows.length === 0) {
            console.log('❌ Workflow não encontrado');
            return;
        }

        const config = workflowResult.rows[0].workflow_config;
        const bloco01 = config.blocks.bloco_01;
        
        if (bloco01 && bloco01.buttons) {
            console.log(`✅ Verificação dos botões do bloco_01:`);
            bloco01.buttons.forEach((button, index) => {
                console.log(`   Botão ${index + 1}: "${button.text}"`);
                console.log(`     auto_followup_disabled: ${button.auto_followup_disabled}`);
                console.log(`     Tipo: ${typeof button.auto_followup_disabled}`);
                console.log(`     Valor exato: ${JSON.stringify(button.auto_followup_disabled)}`);
            });
        }

        // 2. Simular processamento de botão como o sistema faz
        console.log('\n2️⃣ Simulando processamento de botão:');
        
        const testButton = bloco01.buttons[0]; // "Já sou aluno"
        console.log(`   Testando botão: "${testButton.text}"`);
        console.log(`   auto_followup_disabled: ${testButton.auto_followup_disabled}`);
        console.log(`   auto_followup_disabled === true: ${testButton.auto_followup_disabled === true}`);
        console.log(`   auto_followup_disabled === false: ${testButton.auto_followup_disabled === false}`);

        if (testButton.auto_followup_disabled === true) {
            console.log(`   ✅ Botão deve desativar auto_followup`);
        } else if (testButton.auto_followup_disabled === false) {
            console.log(`   ✅ Botão deve ativar auto_followup`);
        } else {
            console.log(`   ❌ Botão não tem configuração de auto_followup`);
        }

        // 3. Testar com o segundo botão
        console.log('\n3️⃣ Testando segundo botão:');
        const testButton2 = bloco01.buttons[1]; // "Ainda não sou aluno"
        console.log(`   Testando botão: "${testButton2.text}"`);
        console.log(`   auto_followup_disabled: ${testButton2.auto_followup_disabled}`);
        console.log(`   auto_followup_disabled === true: ${testButton2.auto_followup_disabled === true}`);
        console.log(`   auto_followup_disabled === false: ${testButton2.auto_followup_disabled === false}`);

        if (testButton2.auto_followup_disabled === true) {
            console.log(`   ✅ Botão deve desativar auto_followup`);
        } else if (testButton2.auto_followup_disabled === false) {
            console.log(`   ✅ Botão deve ativar auto_followup`);
        } else {
            console.log(`   ❌ Botão não tem configuração de auto_followup`);
        }

        // 4. Verificar se o workflow tem auto_followup configurado
        console.log('\n4️⃣ Verificando auto_followup configurado:');
        if (config.auto_followup) {
            console.log(`   Auto_followup configurado:`);
            Object.entries(config.auto_followup).forEach(([blockName, followupConfig]) => {
                console.log(`     ${blockName}: delay ${followupConfig.delay}s, condition: ${followupConfig.condition}`);
            });
        } else {
            console.log('   ❌ Nenhum auto_followup configurado');
        }

        // 5. Simular a lógica do sistema
        console.log('\n5️⃣ Simulando lógica do sistema:');
        
        // Simular processButtonActions
        function simulateProcessButtonActions(button, conversationId, contactId) {
            console.log(`   🔧 Processando ações do botão "${button.text}"`);
            
            if (button.auto_followup_disabled === true) {
                console.log(`   🚫 Botão "${button.text}" solicita desativação do auto_followup - desativando automaticamente`);
                return 'disable';
            } else if (button.auto_followup_disabled === false) {
                console.log(`   ✅ Botão "${button.text}" solicita ativação do auto_followup - ativando automaticamente`);
                return 'enable';
            } else {
                console.log(`   ℹ️ Botão "${button.text}" não tem configuração de auto_followup`);
                return 'none';
            }
        }

        const action1 = simulateProcessButtonActions(testButton, 23, '+553175012310');
        const action2 = simulateProcessButtonActions(testButton2, 23, '+553175012310');

        console.log(`\n   Resultado da simulação:`);
        console.log(`   Botão 1 ("${testButton.text}"): ${action1}`);
        console.log(`   Botão 2 ("${testButton2.text}"): ${action2}`);

        console.log('\n✅ Teste da correção do auto_followup_disabled concluído!');

    } catch (error) {
        console.error('❌ Erro ao testar correção do auto_followup_disabled:', error);
    } finally {
        await pool.end();
    }
}

testAutoFollowupDisabledFix();
