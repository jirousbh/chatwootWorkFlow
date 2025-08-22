const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'chatwoot_workflows',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

// Função para verificar status do auto_followup (copiada do sistema principal)
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

async function debugAutoFollowupStatus() {
    try {
        console.log('🔍 Debugando status do auto_followup...\n');

        // 1. Verificar todas as conversas ativas
        console.log('1️⃣ Verificando conversas ativas:');
        const activeConversations = await pool.query(`
            SELECT 
                wc.id,
                wc.conversation_id,
                wc.contact_id,
                wc.workflow_name,
                wc.current_block,
                wc.last_activity,
                bcs.auto_followup_disabled,
                bcs.followup_disabled_by,
                bcs.followup_disabled_at,
                bcs.bot_active,
                bcs.paused_reason
            FROM workflow_conversations wc
            LEFT JOIN bot_conversation_status bcs ON wc.conversation_id = bcs.conversation_id
            WHERE wc.status = 'active'
            ORDER BY wc.last_activity DESC
        `);

        if (activeConversations.rows.length === 0) {
            console.log('❌ Nenhuma conversa ativa encontrada.');
        } else {
            console.log(`✅ Encontradas ${activeConversations.rows.length} conversa(s) ativa(s):\n`);
            
            activeConversations.rows.forEach((conv, index) => {
                console.log(`${index + 1}. Conversa ${conv.conversation_id} (Contact: ${conv.contact_id})`);
                console.log(`   Workflow: ${conv.workflow_name}`);
                console.log(`   Bloco atual: ${conv.current_block}`);
                console.log(`   Última atividade: ${conv.last_activity}`);
                console.log(`   Bot ativo: ${conv.bot_active ? '✅' : '❌'}`);
                console.log(`   Auto_followup_disabled: ${conv.auto_followup_disabled ? '🚫' : '✅'}`);
                if (conv.auto_followup_disabled) {
                    console.log(`   Desativado por: ${conv.followup_disabled_by || 'N/A'}`);
                    console.log(`   Desativado em: ${conv.followup_disabled_at || 'N/A'}`);
                }
                console.log(`   Motivo da pausa: ${conv.paused_reason || 'N/A'}`);
                console.log('');
            });
        }

        // 2. Verificar status do bot para todas as conversas
        console.log('2️⃣ Verificando status do bot para todas as conversas:');
        const botStatuses = await pool.query(`
            SELECT 
                conversation_id,
                contact_id,
                bot_active,
                auto_followup_disabled,
                followup_disabled_by,
                followup_disabled_at,
                paused_reason,
                paused_by,
                last_interaction_at,
                updated_at
            FROM bot_conversation_status
            ORDER BY updated_at DESC
        `);

        if (botStatuses.rows.length === 0) {
            console.log('❌ Nenhum status de bot encontrado.');
        } else {
            console.log(`✅ Encontrados ${botStatuses.rows.length} status(es) de bot:\n`);
            
            botStatuses.rows.forEach((status, index) => {
                console.log(`${index + 1}. Conversa ${status.conversation_id} (Contact: ${status.contact_id})`);
                console.log(`   Bot ativo: ${status.bot_active ? '✅' : '❌'}`);
                console.log(`   Auto_followup_disabled: ${status.auto_followup_disabled ? '🚫' : '✅'}`);
                if (status.auto_followup_disabled) {
                    console.log(`   Desativado por: ${status.followup_disabled_by || 'N/A'}`);
                    console.log(`   Desativado em: ${status.followup_disabled_at || 'N/A'}`);
                }
                console.log(`   Motivo da pausa: ${status.paused_reason || 'N/A'}`);
                console.log(`   Última interação: ${status.last_interaction_at}`);
                console.log(`   Atualizado em: ${status.updated_at}`);
                console.log('');
            });
        }

        // 3. Verificar workflows com auto_followup
        console.log('3️⃣ Verificando workflows com auto_followup:');
        const workflowsWithFollowup = await pool.query(`
            SELECT 
                workflow_name,
                config
            FROM workflow_configs
            WHERE config::text LIKE '%auto_followup%'
            ORDER BY workflow_name
        `);

        if (workflowsWithFollowup.rows.length === 0) {
            console.log('❌ Nenhum workflow com auto_followup encontrado.');
        } else {
            console.log(`✅ Encontrados ${workflowsWithFollowup.rows.length} workflow(s) com auto_followup:\n`);
            
            workflowsWithFollowup.rows.forEach((workflow, index) => {
                console.log(`${index + 1}. ${workflow.workflow_name}`);
                const config = workflow.config;
                
                if (config.auto_followup) {
                    console.log(`   Auto_followup configurado:`);
                    Object.entries(config.auto_followup).forEach(([blockName, followupConfig]) => {
                        console.log(`     ${blockName}: delay ${followupConfig.delay}s, condition: ${followupConfig.condition}`);
                    });
                }
                
                // Verificar botões com disable_auto_followup
                const buttonsWithConfig = [];
                Object.values(config.blocks || {}).forEach(block => {
                    if (block.buttons) {
                        block.buttons.forEach(button => {
                            if (button.disable_auto_followup !== undefined) {
                                buttonsWithConfig.push({
                                    block: block.name || 'N/A',
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
                }
                
                console.log('');
            });
        }

        // 4. Testar função getBotConversationStatus para uma conversa específica
        console.log('4️⃣ Testando função getBotConversationStatus:');
        
        if (activeConversations.rows.length > 0) {
            const testConversation = activeConversations.rows[0];
            console.log(`Testando para conversa ${testConversation.conversation_id}:`);
            
            const botStatus = await getBotConversationStatus(testConversation.conversation_id, testConversation.contact_id);
            console.log(`   Bot ativo: ${botStatus.bot_active ? '✅' : '❌'}`);
            console.log(`   Auto_followup_disabled: ${botStatus.auto_followup_disabled ? '🚫' : '✅'}`);
            if (botStatus.auto_followup_disabled) {
                console.log(`   Desativado por: ${botStatus.followup_disabled_by || 'N/A'}`);
                console.log(`   Desativado em: ${botStatus.followup_disabled_at || 'N/A'}`);
            }
        } else {
            console.log('❌ Nenhuma conversa ativa para testar.');
        }

        console.log('\n✅ Debug do auto_followup concluído!');

    } catch (error) {
        console.error('❌ Erro ao debugar auto_followup:', error);
    } finally {
        await pool.end();
    }
}

debugAutoFollowupStatus();
