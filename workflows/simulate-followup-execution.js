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

// Função para simular o salvamento de uma interação de followup
async function simulateFollowupInteraction(conversationId, contactId, blockName) {
    try {
        console.log(`💾 Simulando salvamento de interação de followup para bloco ${blockName}`);
        
        await pool.query(`
            INSERT INTO workflow_interactions 
            (conversation_id, contact_id, block_name, user_response, bot_message, buttons, timestamp) 
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        `, [conversationId, contactId, blockName, 'AUTO_FOLLOWUP', 'Mensagem de followup simulada', '[]']);
        
        console.log(`✅ Interação de followup salva para bloco ${blockName}`);
    } catch (error) {
        console.error(`❌ Erro ao salvar interação de followup:`, error);
    }
}

async function simulateFollowupExecution() {
    try {
        console.log('🧪 Simulando execução de followup...\n');

        // 1. Buscar uma conversa ativa para teste
        console.log('1️⃣ Buscando conversa ativa para teste:');
        const activeConversation = await pool.query(`
            SELECT 
                id,
                conversation_id,
                contact_id,
                workflow_name,
                current_block
            FROM workflow_conversations
            WHERE status = 'active'
            ORDER BY last_activity DESC
            LIMIT 1
        `);

        if (activeConversation.rows.length === 0) {
            console.log('❌ Nenhuma conversa ativa encontrada');
            return;
        }

        const testConversation = activeConversation.rows[0];
        console.log(`✅ Usando conversa ${testConversation.conversation_id} (Contact: ${testConversation.contact_id})`);
        console.log(`   Workflow: ${testConversation.workflow_name}`);
        console.log(`   Bloco atual: ${testConversation.current_block}\n`);

        // 2. Testar followup antes de qualquer execução
        console.log('2️⃣ Testando followup antes de qualquer execução:');
        const testBlockName = 'bloco_17';
        const testDelaySeconds = 90;
        
        console.log(`   Verificando se pode executar followup para bloco ${testBlockName}:`);
        const canExecute1 = await checkIfFollowupAlreadyExecuted(
            testConversation.id, 
            testBlockName, 
            testDelaySeconds
        );
        console.log(`   Resultado: ${canExecute1 ? 'Já executado' : 'Pode executar'}`);

        // 3. Simular primeira execução do followup
        console.log('\n3️⃣ Simulando primeira execução do followup:');
        if (!canExecute1) {
            console.log(`   🚀 Executando followup para bloco ${testBlockName}...`);
            await simulateFollowupInteraction(
                testConversation.id, 
                testConversation.contact_id, 
                testBlockName
            );
        }

        // 4. Testar followup após primeira execução
        console.log('\n4️⃣ Testando followup após primeira execução:');
        console.log(`   Verificando se pode executar followup para bloco ${testBlockName} novamente:`);
        const canExecute2 = await checkIfFollowupAlreadyExecuted(
            testConversation.id, 
            testBlockName, 
            testDelaySeconds
        );
        console.log(`   Resultado: ${canExecute2 ? 'Já executado' : 'Pode executar'}`);

        // 5. Simular segunda tentativa de execução
        console.log('\n5️⃣ Simulando segunda tentativa de execução:');
        if (canExecute2) {
            console.log(`   ⏭️ Followup já foi executado, pulando segunda execução`);
        } else {
            console.log(`   🚀 Executando followup para bloco ${testBlockName} novamente...`);
            await simulateFollowupInteraction(
                testConversation.id, 
                testConversation.contact_id, 
                testBlockName
            );
        }

        // 6. Verificar interações salvas
        console.log('\n6️⃣ Verificando interações salvas:');
        const savedInteractions = await pool.query(`
            SELECT 
                conversation_id,
                block_name,
                user_response,
                timestamp
            FROM workflow_interactions
            WHERE conversation_id = $1 
                AND block_name = $2 
                AND user_response = 'AUTO_FOLLOWUP'
            ORDER BY timestamp DESC
        `, [testConversation.id, testBlockName]);

        console.log(`   Interações de followup salvas para bloco ${testBlockName}: ${savedInteractions.rows.length}`);
        savedInteractions.rows.forEach((interaction, index) => {
            console.log(`   ${index + 1}. Timestamp: ${interaction.timestamp}`);
        });

        // 7. Testar com delay menor que o configurado
        console.log('\n7️⃣ Testando com delay menor que o configurado:');
        const shortDelaySeconds = 30; // Menor que o delay de 90s
        
        console.log(`   Verificando com delay de ${shortDelaySeconds}s (menor que ${testDelaySeconds}s):`);
        const canExecute3 = await checkIfFollowupAlreadyExecuted(
            testConversation.id, 
            testBlockName, 
            shortDelaySeconds
        );
        console.log(`   Resultado: ${canExecute3 ? 'Já executado' : 'Pode executar'}`);

        console.log('\n✅ Simulação de execução de followup concluída!');

    } catch (error) {
        console.error('❌ Erro ao simular execução de followup:', error);
    } finally {
        await pool.end();
    }
}

simulateFollowupExecution();
