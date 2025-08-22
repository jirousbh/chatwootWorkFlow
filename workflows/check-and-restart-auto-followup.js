const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'chatwoot_workflows',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

async function checkAndRestartAutoFollowup() {
    try {
        console.log('🔍 Verificando status atual do auto_followup...\n');

        // 1. Verificar conversas ativas com followup
        console.log('1️⃣ Verificando conversas ativas com followup:');
        const activeConversations = await pool.query(`
            SELECT 
                wc.id,
                wc.conversation_id,
                wc.contact_id,
                wc.workflow_name,
                wc.current_block,
                wc.last_activity,
                EXTRACT(EPOCH FROM (NOW() - wc.last_activity)) as seconds_inactive
            FROM workflow_conversations wc
            WHERE wc.status = 'active'
                AND wc.workflow_name = 'teste disable auto follow up'
            ORDER BY wc.last_activity DESC
        `);

        if (activeConversations.rows.length === 0) {
            console.log('❌ Nenhuma conversa ativa encontrada');
            return;
        }

        console.log(`✅ Encontradas ${activeConversations.rows.length} conversa(s) ativa(s):\n`);
        
        activeConversations.rows.forEach((conv, index) => {
            const minutesInactive = Math.floor(conv.seconds_inactive / 60);
            console.log(`${index + 1}. Conversa ${conv.conversation_id} (Contact: ${conv.contact_id})`);
            console.log(`   Bloco atual: ${conv.current_block}`);
            console.log(`   Última atividade: ${conv.last_activity}`);
            console.log(`   Tempo inativo: ${Math.floor(conv.seconds_inactive)}s (${minutesInactive} minutos)`);
            console.log('');
        });

        // 2. Verificar interações de followup existentes
        console.log('2️⃣ Verificando interações de followup existentes:');
        const followupInteractions = await pool.query(`
            SELECT 
                conversation_id,
                block_name,
                user_response,
                timestamp,
                COUNT(*) as count
            FROM workflow_interactions
            WHERE user_response = 'AUTO_FOLLOWUP'
                AND conversation_id IN (${activeConversations.rows.map(c => c.id).join(',')})
            GROUP BY conversation_id, block_name, user_response, timestamp
            ORDER BY timestamp DESC
        `);

        if (followupInteractions.rows.length === 0) {
            console.log('ℹ️ Nenhuma interação de followup encontrada');
        } else {
            console.log(`✅ Encontradas ${followupInteractions.rows.length} interação(ões) de followup:\n`);
            
            followupInteractions.rows.forEach((interaction, index) => {
                console.log(`${index + 1}. Conversa ${interaction.conversation_id}`);
                console.log(`   Bloco: ${interaction.block_name}`);
                console.log(`   Tipo: ${interaction.user_response}`);
                console.log(`   Timestamp: ${interaction.timestamp}`);
                console.log(`   Contagem: ${interaction.count}`);
                console.log('');
            });
        }

        // 3. Verificar se há múltiplas execuções do mesmo bloco
        console.log('3️⃣ Verificando múltiplas execuções do mesmo bloco:');
        const multipleExecutions = await pool.query(`
            SELECT 
                conversation_id,
                block_name,
                COUNT(*) as execution_count,
                MIN(timestamp) as first_execution,
                MAX(timestamp) as last_execution
            FROM workflow_interactions
            WHERE user_response = 'AUTO_FOLLOWUP'
                AND conversation_id IN (${activeConversations.rows.map(c => c.id).join(',')})
            GROUP BY conversation_id, block_name
            HAVING COUNT(*) > 1
            ORDER BY execution_count DESC
        `);

        if (multipleExecutions.rows.length === 0) {
            console.log('✅ Nenhuma execução múltipla encontrada');
        } else {
            console.log(`⚠️ Encontradas ${multipleExecutions.rows.length} execução(ões) múltipla(s):\n`);
            
            multipleExecutions.rows.forEach((execution, index) => {
                console.log(`${index + 1}. Conversa ${execution.conversation_id}, Bloco ${execution.block_name}`);
                console.log(`   Execuções: ${execution.execution_count}`);
                console.log(`   Primeira execução: ${execution.first_execution}`);
                console.log(`   Última execução: ${execution.last_execution}`);
                console.log('');
            });
        }

        // 4. Verificar workflow de teste
        console.log('4️⃣ Verificando workflow de teste:');
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

        // 5. Recomendações
        console.log('\n5️⃣ Recomendações:');
        
        if (multipleExecutions.rows.length > 0) {
            console.log('⚠️ PROBLEMA DETECTADO: Múltiplas execuções de followup encontradas!');
            console.log('   Ações recomendadas:');
            console.log('   1. Reiniciar o sistema de workflows');
            console.log('   2. Verificar se o scheduler está usando a versão corrigida');
            console.log('   3. Limpar execuções duplicadas se necessário');
        } else {
            console.log('✅ Sistema parece estar funcionando corretamente');
        }

        console.log('\n✅ Verificação do auto_followup concluída!');

    } catch (error) {
        console.error('❌ Erro ao verificar auto_followup:', error);
    } finally {
        await pool.end();
    }
}

checkAndRestartAutoFollowup();
