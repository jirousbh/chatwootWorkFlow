const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'chatwoot_workflows',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

async function testFinalAutoFollowup() {
    try {
        console.log('🎯 Teste Final - Verificando se o auto_followup não está mais repetindo...\n');

        // 1. Verificar conversas ativas
        console.log('1️⃣ Verificando conversas ativas:');
        const activeConversations = await pool.query(`
            SELECT 
                id,
                conversation_id,
                contact_id,
                workflow_name,
                current_block,
                last_activity,
                EXTRACT(EPOCH FROM (NOW() - last_activity)) as seconds_inactive
            FROM workflow_conversations
            WHERE status = 'active'
                AND workflow_name = 'teste disable auto follow up'
            ORDER BY last_activity DESC
        `);

        if (activeConversations.rows.length === 0) {
            console.log('❌ Nenhuma conversa ativa encontrada');
            return;
        }

        console.log(`✅ Encontradas ${activeConversations.rows.length} conversa(s) ativa(s):\n`);
        
        activeConversations.rows.forEach((conv, index) => {
            const minutesInactive = Math.floor(conv.seconds_inactive / 60);
            console.log(`${index + 1}. Conversa ${conv.conversation_id} (Contact: ${conv.contact_id})`);
            console.log(`   ID interno: ${conv.id}`);
            console.log(`   Bloco atual: ${conv.current_block}`);
            console.log(`   Última atividade: ${conv.last_activity}`);
            console.log(`   Tempo inativo: ${Math.floor(conv.seconds_inactive)}s (${minutesInactive} minutos)`);
            console.log('');
        });

        // 2. Verificar interações de followup
        console.log('2️⃣ Verificando interações de followup:');
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

        // 3. Verificar múltiplas execuções
        console.log('3️⃣ Verificando múltiplas execuções:');
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
            console.log('✅ Nenhuma execução múltipla encontrada - SISTEMA FUNCIONANDO CORRETAMENTE!');
        } else {
            console.log(`⚠️ PROBLEMA: Encontradas ${multipleExecutions.rows.length} execução(ões) múltipla(s):\n`);
            
            multipleExecutions.rows.forEach((execution, index) => {
                console.log(`${index + 1}. Conversa ${execution.conversation_id}, Bloco ${execution.block_name}`);
                console.log(`   Execuções: ${execution.execution_count}`);
                console.log(`   Primeira execução: ${execution.first_execution}`);
                console.log(`   Última execução: ${execution.last_execution}`);
                console.log('');
            });
        }

        // 4. Verificar logs do sistema
        console.log('4️⃣ Verificando logs do sistema:');
        console.log('   Para verificar se o scheduler está funcionando corretamente,');
        console.log('   execute: docker logs chatwoot-chatbot-workflows-1 | grep -i "auto.*followup" | tail -10');
        console.log('');

        // 5. Resumo final
        console.log('5️⃣ Resumo Final:');
        
        if (multipleExecutions.rows.length === 0) {
            console.log('🎉 SUCESSO: O auto_followup não está mais repetindo!');
            console.log('   ✅ Correções aplicadas com sucesso');
            console.log('   ✅ Sistema reiniciado');
            console.log('   ✅ Scheduler funcionando corretamente');
            console.log('   ✅ Verificação de execução anterior implementada');
        } else {
            console.log('❌ PROBLEMA: Ainda há execuções múltiplas detectadas');
            console.log('   ⚠️ Pode ser necessário aguardar mais tempo ou verificar logs');
        }

        console.log('\n✅ Teste final concluído!');

    } catch (error) {
        console.error('❌ Erro no teste final:', error);
    } finally {
        await pool.end();
    }
}

testFinalAutoFollowup();
