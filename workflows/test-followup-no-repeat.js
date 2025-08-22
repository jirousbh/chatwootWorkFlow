const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'chatwoot_workflows',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

// Função para verificar se o followup já foi executado (copiada do sistema principal)
async function checkIfFollowupAlreadyExecuted(conversationId, blockName, delaySeconds) {
    try {
        // Verificar se há uma interação com este bloco desde que o delay foi atingido
        const recentInteraction = await pool.query(`
            SELECT timestamp 
            FROM workflow_interactions 
            WHERE conversation_id = $1 
                AND block_name = $2 
                AND timestamp > NOW() - INTERVAL '1 day'
            ORDER BY timestamp DESC 
            LIMIT 1
        `, [conversationId, blockName]);
        
        if (recentInteraction.rows.length > 0) {
            const lastExecution = recentInteraction.rows[0].timestamp;
            const timeSinceExecution = (Date.now() - new Date(lastExecution).getTime()) / 1000;
            
            // Se foi executado há menos tempo que o delay, considerar como já executado
            if (timeSinceExecution < delaySeconds) {
                console.log(`⏭️ Followup ${blockName} executado há ${Math.round(timeSinceExecution / 60)} minutos, aguardando mais ${Math.round((delaySeconds - timeSinceExecution) / 60)} minutos`);
                return true;
            }
        }
        
        // Verificar se já foi executado um followup para este bloco (independente do tempo)
        const followupExecuted = await pool.query(`
            SELECT timestamp 
            FROM workflow_interactions 
            WHERE conversation_id = $1 
                AND block_name = $2 
                AND user_response = 'AUTO_FOLLOWUP'
            ORDER BY timestamp DESC 
            LIMIT 1
        `, [conversationId, blockName]);
        
        if (followupExecuted.rows.length > 0) {
            console.log(`⏭️ Followup ${blockName} já foi executado anteriormente para esta conversa`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('❌ Erro ao verificar execução recente de followup:', error);
        return false;
    }
}

async function testFollowupNoRepeat() {
    try {
        console.log('🧪 Testando se o followup não está mais repetindo...\n');

        // 1. Verificar conversas ativas
        console.log('1️⃣ Verificando conversas ativas:');
        const activeConversations = await pool.query(`
            SELECT 
                conversation_id,
                contact_id,
                workflow_name,
                current_block,
                last_activity
            FROM workflow_conversations
            WHERE status = 'active'
            ORDER BY last_activity DESC
            LIMIT 5
        `);

        if (activeConversations.rows.length === 0) {
            console.log('❌ Nenhuma conversa ativa encontrada');
            return;
        }

        console.log(`✅ Encontradas ${activeConversations.rows.length} conversa(s) ativa(s):\n`);
        
        activeConversations.rows.forEach((conv, index) => {
            console.log(`${index + 1}. Conversa ${conv.conversation_id} (Contact: ${conv.contact_id})`);
            console.log(`   Workflow: ${conv.workflow_name}`);
            console.log(`   Bloco atual: ${conv.current_block}`);
            console.log(`   Última atividade: ${conv.last_activity}`);
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
            GROUP BY conversation_id, block_name, user_response, timestamp
            ORDER BY timestamp DESC
            LIMIT 10
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

        // 3. Testar a função checkIfFollowupAlreadyExecuted
        console.log('3️⃣ Testando função checkIfFollowupAlreadyExecuted:');
        
        if (activeConversations.rows.length > 0) {
            const testConversation = activeConversations.rows[0];
            const testBlockName = 'bloco_17'; // Bloco de followup do workflow de teste
            const testDelaySeconds = 90; // Delay do bloco_17
            
            console.log(`   Testando para conversa ${testConversation.conversation_id}, bloco ${testBlockName}, delay ${testDelaySeconds}s`);
            
            const alreadyExecuted = await checkIfFollowupAlreadyExecuted(
                testConversation.conversation_id, 
                testBlockName, 
                testDelaySeconds
            );
            
            console.log(`   Resultado: ${alreadyExecuted ? 'Já executado' : 'Pode executar'}`);
        }

        // 4. Verificar workflow de teste
        console.log('\n4️⃣ Verificando workflow de teste:');
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

        // 5. Simular múltiplas verificações para o mesmo bloco
        console.log('\n5️⃣ Simulando múltiplas verificações para o mesmo bloco:');
        
        if (activeConversations.rows.length > 0) {
            const testConversation = activeConversations.rows[0];
            const testBlockName = 'bloco_17';
            const testDelaySeconds = 90;
            
            console.log(`   Simulando 3 verificações consecutivas para conversa ${testConversation.conversation_id}:`);
            
            for (let i = 1; i <= 3; i++) {
                console.log(`   Verificação ${i}:`);
                const alreadyExecuted = await checkIfFollowupAlreadyExecuted(
                    testConversation.conversation_id, 
                    testBlockName, 
                    testDelaySeconds
                );
                console.log(`     Resultado: ${alreadyExecuted ? 'Já executado' : 'Pode executar'}`);
            }
        }

        console.log('\n✅ Teste de followup sem repetição concluído!');

    } catch (error) {
        console.error('❌ Erro ao testar followup sem repetição:', error);
    } finally {
        await pool.end();
    }
}

testFollowupNoRepeat();
