const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'chatwoot_workflows',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

// Funções copiadas do sistema principal
async function disableAutoFollowupForConversation(conversationId, contactId, disabledBy = 'system') {
    try {
        console.log(`🚫 Desativando auto_followup para conversa ${conversationId}`);
        
        await pool.query(`
            INSERT INTO bot_conversation_status 
            (conversation_id, contact_id, auto_followup_disabled, followup_disabled_by, followup_disabled_at, last_interaction_at, updated_at) 
            VALUES ($1, $2, true, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (conversation_id) 
            DO UPDATE SET 
                auto_followup_disabled = true, 
                followup_disabled_by = $3, 
                followup_disabled_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
        `, [conversationId, contactId, disabledBy]);
        
        console.log(`✅ Auto_followup desativado com sucesso para conversa ${conversationId}`);
        return true;
    } catch (error) {
        console.error(`❌ Erro ao desativar auto_followup para conversa ${conversationId}:`, error);
        return false;
    }
}

async function enableAutoFollowupForConversation(conversationId, contactId, enabledBy = 'system') {
    try {
        console.log(`✅ Ativando auto_followup para conversa ${conversationId}`);
        
        await pool.query(`
            INSERT INTO bot_conversation_status 
            (conversation_id, contact_id, auto_followup_disabled, followup_disabled_by, followup_disabled_at, last_interaction_at, updated_at) 
            VALUES ($1, $2, false, $3, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (conversation_id) 
            DO UPDATE SET 
                auto_followup_disabled = false, 
                followup_disabled_by = $3, 
                followup_disabled_at = NULL,
                updated_at = CURRENT_TIMESTAMP
        `, [conversationId, contactId, enabledBy]);
        
        console.log(`✅ Auto_followup ativado com sucesso para conversa ${conversationId}`);
        return true;
    } catch (error) {
        console.error(`❌ Erro ao ativar auto_followup para conversa ${conversationId}:`, error);
        return false;
    }
}

async function getBotConversationStatus(conversationId, contactId) {
    try {
        // Tentar buscar status existente
        let result = await pool.query(
            'SELECT * FROM bot_conversation_status WHERE conversation_id = $1',
            [conversationId]
        );
        
        if (result.rows.length === 0) {
            // Criar novo status se não existir (auto_followup_disabled = true por padrão)
            console.log(`📝 Criando novo status de bot para conversa ${conversationId} (auto_followup_disabled = true por padrão)`);
            result = await pool.query(`
                INSERT INTO bot_conversation_status 
                (conversation_id, contact_id, bot_active, auto_followup_disabled, last_interaction_at, created_at, updated_at) 
                VALUES ($1, $2, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
                RETURNING *
            `, [conversationId, contactId]);
        }
        
        return result.rows[0];
    } catch (error) {
        console.error(`❌ Erro ao obter status do bot para conversa ${conversationId}:`, error);
        // Retornar status padrão ativo em caso de erro (auto_followup_disabled = true por padrão)
        return {
            conversation_id: conversationId,
            contact_id: contactId,
            bot_active: true,
            auto_followup_disabled: true,
            paused_reason: null,
            paused_by: null,
            has_human_agent: false
        };
    }
}

async function testDisableAutoFollowupBehavior() {
    try {
        console.log('🧪 Testando comportamento do disable_auto_followup...\n');

        // 1. Buscar uma conversa ativa para testar
        console.log('1️⃣ Buscando conversa ativa para teste:');
        const activeConversation = await pool.query(`
            SELECT 
                wc.conversation_id,
                wc.contact_id,
                wc.workflow_name,
                wc.current_block
            FROM workflow_conversations wc
            WHERE wc.status = 'active'
            ORDER BY wc.last_activity DESC
            LIMIT 1
        `);

        if (activeConversation.rows.length === 0) {
            console.log('❌ Nenhuma conversa ativa encontrada para teste.');
            return;
        }

        const testConversation = activeConversation.rows[0];
        console.log(`✅ Usando conversa ${testConversation.conversation_id} (Contact: ${testConversation.contact_id})`);
        console.log(`   Workflow: ${testConversation.workflow_name}`);
        console.log(`   Bloco atual: ${testConversation.current_block}\n`);

        // 2. Verificar status inicial
        console.log('2️⃣ Verificando status inicial:');
        let botStatus = await getBotConversationStatus(testConversation.conversation_id, testConversation.contact_id);
        console.log(`   Auto_followup_disabled: ${botStatus.auto_followup_disabled ? '🚫' : '✅'}`);
        console.log(`   Desativado por: ${botStatus.followup_disabled_by || 'N/A'}`);
        console.log(`   Desativado em: ${botStatus.followup_disabled_at || 'N/A'}\n`);

        // 3. Testar ativação do auto_followup
        console.log('3️⃣ Testando ativação do auto_followup:');
        const enableResult = await enableAutoFollowupForConversation(testConversation.conversation_id, testConversation.contact_id, 'test_script');
        
        if (enableResult) {
            botStatus = await getBotConversationStatus(testConversation.conversation_id, testConversation.contact_id);
            console.log(`   ✅ Após ativação:`);
            console.log(`   Auto_followup_disabled: ${botStatus.auto_followup_disabled ? '🚫' : '✅'}`);
            console.log(`   Desativado por: ${botStatus.followup_disabled_by || 'N/A'}`);
            console.log(`   Desativado em: ${botStatus.followup_disabled_at || 'N/A'}\n`);
        }

        // 4. Testar desativação do auto_followup
        console.log('4️⃣ Testando desativação do auto_followup:');
        const disableResult = await disableAutoFollowupForConversation(testConversation.conversation_id, testConversation.contact_id, 'test_script');
        
        if (disableResult) {
            botStatus = await getBotConversationStatus(testConversation.conversation_id, testConversation.contact_id);
            console.log(`   ✅ Após desativação:`);
            console.log(`   Auto_followup_disabled: ${botStatus.auto_followup_disabled ? '🚫' : '✅'}`);
            console.log(`   Desativado por: ${botStatus.followup_disabled_by || 'N/A'}`);
            console.log(`   Desativado em: ${botStatus.followup_disabled_at || 'N/A'}\n`);
        }

        // 5. Verificar workflow de teste
        console.log('5️⃣ Verificando workflow de teste:');
        const workflowResult = await pool.query(`
            SELECT config
            FROM workflow_configs
            WHERE workflow_name = 'teste_inovai_disable_follow_up'
        `);

        if (workflowResult.rows.length > 0) {
            const config = workflowResult.rows[0].config;
            console.log(`   ✅ Workflow encontrado: teste_inovai_disable_follow_up`);
            
            // Verificar botões com disable_auto_followup
            const buttonsWithConfig = [];
            Object.values(config.blocks || {}).forEach(block => {
                if (block.buttons) {
                    block.buttons.forEach(button => {
                        if (button.disable_auto_followup !== undefined) {
                            buttonsWithConfig.push({
                                block: block.name || block.id,
                                button: button.text,
                                action: button.disable_auto_followup ? 'Desativar' : 'Ativar'
                            });
                        }
                    });
                }
            });
            
            if (buttonsWithConfig.length > 0) {
                console.log(`   Botões com disable_auto_followup:`);
                buttonsWithConfig.forEach(btn => {
                    console.log(`     ${btn.block} > "${btn.button}": ${btn.action}`);
                });
            } else {
                console.log(`   ❌ Nenhum botão com disable_auto_followup encontrado`);
            }
            
            // Verificar auto_followup configurado
            if (config.auto_followup) {
                console.log(`   Auto_followup configurado:`);
                Object.entries(config.auto_followup).forEach(([blockName, followupConfig]) => {
                    console.log(`     ${blockName}: delay ${followupConfig.delay}s, condition: ${followupConfig.condition}`);
                });
            }
        } else {
            console.log(`   ❌ Workflow 'teste_inovai_disable_follow_up' não encontrado`);
        }

        // 6. Simular processamento de botão
        console.log('\n6️⃣ Simulando processamento de botão:');
        
        // Simular botão "Já sou aluno" (disable_auto_followup: true)
        console.log('   Simulando clique no botão "Já sou aluno" (disable_auto_followup: true):');
        const disableButtonResult = await disableAutoFollowupForConversation(testConversation.conversation_id, testConversation.contact_id, 'button_action');
        
        if (disableButtonResult) {
            botStatus = await getBotConversationStatus(testConversation.conversation_id, testConversation.contact_id);
            console.log(`   ✅ Após simular botão "Já sou aluno":`);
            console.log(`   Auto_followup_disabled: ${botStatus.auto_followup_disabled ? '🚫' : '✅'}`);
            console.log(`   Desativado por: ${botStatus.followup_disabled_by || 'N/A'}`);
            console.log(`   Desativado em: ${botStatus.followup_disabled_at || 'N/A'}`);
        }

        // Simular botão "Ainda não sou aluno" (disable_auto_followup: false)
        console.log('\n   Simulando clique no botão "Ainda não sou aluno" (disable_auto_followup: false):');
        const enableButtonResult = await enableAutoFollowupForConversation(testConversation.conversation_id, testConversation.contact_id, 'button_action');
        
        if (enableButtonResult) {
            botStatus = await getBotConversationStatus(testConversation.conversation_id, testConversation.contact_id);
            console.log(`   ✅ Após simular botão "Ainda não sou aluno":`);
            console.log(`   Auto_followup_disabled: ${botStatus.auto_followup_disabled ? '🚫' : '✅'}`);
            console.log(`   Desativado por: ${botStatus.followup_disabled_by || 'N/A'}`);
            console.log(`   Desativado em: ${botStatus.followup_disabled_at || 'N/A'}`);
        }

        console.log('\n✅ Teste do comportamento do disable_auto_followup concluído!');

    } catch (error) {
        console.error('❌ Erro ao testar comportamento do disable_auto_followup:', error);
    } finally {
        await pool.end();
    }
}

testDisableAutoFollowupBehavior();
