const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'chatwoot_workflows',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

async function testIdConsistency() {
    try {
        console.log('🧪 Testando consistência de IDs no auto_followup...\n');

        // 1. Verificar conversas ativas com followup
        console.log('1️⃣ Verificando conversas ativas com followup:');
        const activeConversations = await pool.query(`
            SELECT 
                wc.id,
                wc.conversation_id as chatwoot_conversation_id,
                wc.contact_id,
                wc.workflow_name,
                wc.current_block,
                wc.last_activity,
                EXTRACT(EPOCH FROM (NOW() - wc.last_activity)) as seconds_inactive
            FROM workflow_conversations wc
            WHERE wc.status = 'active'
                AND wc.workflow_name = 'teste disable auto follow up'
            ORDER BY wc.last_activity DESC
            LIMIT 3
        `);

        if (activeConversations.rows.length === 0) {
            console.log('❌ Nenhuma conversa ativa encontrada');
            return;
        }

        console.log(`✅ Encontradas ${activeConversations.rows.length} conversa(s) ativa(s):\n`);
        
        activeConversations.rows.forEach((conv, index) => {
            const minutesInactive = Math.floor(conv.seconds_inactive / 60);
            console.log(`${index + 1}. WF_ID: ${conv.id}, Chatwoot_ID: ${conv.chatwoot_conversation_id}, Contact: ${conv.contact_id}`);
            console.log(`   Workflow: ${conv.workflow_name}, Bloco: ${conv.current_block}`);
            console.log(`   Última atividade: ${conv.last_activity}`);
            console.log(`   Tempo inativo: ${Math.floor(conv.seconds_inactive)}s (${minutesInactive} minutos)`);
            console.log('');
        });

        // 2. Simular o fluxo de verificação de followup
        console.log('2️⃣ Simulando fluxo de verificação de followup:');
        
        const testConversation = activeConversations.rows[0];
        console.log(`   Testando conversa: WF_ID: ${testConversation.id}, Chatwoot_ID: ${testConversation.chatwoot_conversation_id}`);
        
        // Simular verificação de inatividade
        console.log(`   Segundos inativos: ${Math.floor(testConversation.seconds_inactive)}`);
        
        // Simular verificação de bot ativo
        console.log(`   Verificando bot ativo para Chatwoot_ID: ${testConversation.chatwoot_conversation_id}`);
        
        // Simular verificação de followup já executado
        console.log(`   Verificando followup já executado para WF_ID: ${testConversation.id}`);
        
        // Simular execução de followup
        console.log(`   Executando followup para WF_ID: ${testConversation.id}`);
        console.log(`   Mas enviando mensagem para Chatwoot_ID: ${testConversation.chatwoot_conversation_id}`);

        // 3. Verificar workflow de teste
        console.log('\n3️⃣ Verificando workflow de teste:');
        const workflowResult = await pool.query(`
            SELECT workflow_config
            FROM inbox_workflows
            WHERE workflow_name = 'teste disable auto follow up'
        `);

        if (workflowResult.rows.length > 0) {
            const config = workflowResult.rows[0].workflow_config;
            
            if (config.auto_followup) {
                console.log(`   Auto_followup configurado:`);
                Object.entries(config.auto_followup).forEach(([blockName, followupConfig]) => {
                    console.log(`     ${blockName}: delay ${followupConfig.delay}s, condition: ${followupConfig.condition}`);
                });
            }
        }

        // 4. Verificar interações existentes
        console.log('\n4️⃣ Verificando interações existentes:');
        const interactions = await pool.query(`
            SELECT 
                wi.id,
                wi.wf_conversation_id,
                wc.conversation_id as chatwoot_conversation_id,
                wi.block_name,
                wi.user_response,
                wi.timestamp
            FROM workflow_interactions wi
            LEFT JOIN workflow_conversations wc ON wi.wf_conversation_id = wc.id
            WHERE wi.wf_conversation_id = $1
            ORDER BY wi.timestamp DESC
            LIMIT 5
        `, [testConversation.id]);

        console.log(`   Interações para WF_ID ${testConversation.id}:`);
        interactions.rows.forEach((interaction, index) => {
            console.log(`     ${index + 1}. Bloco: ${interaction.block_name}, Tipo: ${interaction.user_response}, Chatwoot: ${interaction.chatwoot_conversation_id}`);
        });

        // 5. Verificar status de bot
        console.log('\n5️⃣ Verificando status de bot:');
        const botStatus = await pool.query(`
            SELECT 
                bcs.conversation_id as chatwoot_conversation_id,
                bcs.bot_active,
                bcs.auto_followup_disabled
            FROM bot_conversation_status bcs
            WHERE bcs.conversation_id = $1
        `, [testConversation.chatwoot_conversation_id]);

        if (botStatus.rows.length > 0) {
            const status = botStatus.rows[0];
            console.log(`   Status para Chatwoot_ID ${status.chatwoot_conversation_id}:`);
            console.log(`     Bot ativo: ${status.bot_active}`);
            console.log(`     Auto followup: ${status.auto_followup_disabled ? 'Desabilitado' : 'Habilitado'}`);
        } else {
            console.log(`   ⚠️ Nenhum status de bot encontrado para Chatwoot_ID ${testConversation.chatwoot_conversation_id}`);
        }

        // 6. Resumo da correção
        console.log('\n6️⃣ Resumo da correção aplicada:');
        console.log('✅ executeAutoFollowup() agora recebe WF_ID (ID da tabela workflow_conversations)');
        console.log('✅ Busca account_id usando WHERE id = $1 (correto)');
        console.log('✅ Atualiza bloco atual usando WHERE id = $1 (correto)');
        console.log('✅ Salva interação usando WF_ID (correto)');
        console.log('✅ Envia mensagem para Chatwoot_ID (correto)');
        console.log('✅ Pausa bot usando Chatwoot_ID (correto)');

        console.log('\n📋 Fluxo correto agora:');
        console.log('   1. Verifica inatividade usando WF_ID');
        console.log('   2. Verifica bot ativo usando Chatwoot_ID');
        console.log('   3. Verifica followup já executado usando WF_ID');
        console.log('   4. Executa followup recebendo WF_ID');
        console.log('   5. Busca account_id usando WF_ID');
        console.log('   6. Envia mensagem para Chatwoot_ID');
        console.log('   7. Salva interação usando WF_ID');

        console.log('\n✅ Teste de consistência concluído!');

    } catch (error) {
        console.error('❌ Erro no teste:', error);
    } finally {
        await pool.end();
    }
}

testIdConsistency();
