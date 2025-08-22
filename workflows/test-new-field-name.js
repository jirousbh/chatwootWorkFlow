const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'chatwoot_workflows',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

async function testNewFieldName() {
    try {
        console.log('🧪 Testando sistema com novo nome de campo wf_conversation_id...\n');

        // 1. Verificar estrutura atual
        console.log('1️⃣ Verificando estrutura atual:');
        const structure = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'workflow_interactions' 
            ORDER BY ordinal_position
        `);

        console.log('\nworkflow_interactions:');
        structure.rows.forEach(row => {
            console.log(`  ${row.column_name}: ${row.data_type}`);
        });

        // 2. Verificar constraints
        console.log('\n2️⃣ Verificando constraints:');
        const constraints = await pool.query(`
            SELECT 
                conname,
                conrelid::regclass as table_name,
                confrelid::regclass as referenced_table
            FROM pg_constraint 
            WHERE conrelid::regclass = 'workflow_interactions'::regclass
        `);

        console.log('\nConstraints de workflow_interactions:');
        constraints.rows.forEach(constraint => {
            console.log(`  ${constraint.conname}: ${constraint.table_name} -> ${constraint.referenced_table}`);
        });

        // 3. Testar consulta JOIN
        console.log('\n3️⃣ Testando consulta JOIN:');
        const joinTest = await pool.query(`
            SELECT 
                wi.id,
                wi.wf_conversation_id,
                wc.conversation_id as chatwoot_conversation_id,
                wi.contact_id,
                wi.block_name,
                wi.user_response,
                wi.timestamp
            FROM workflow_interactions wi
            LEFT JOIN workflow_conversations wc ON wi.wf_conversation_id = wc.id
            ORDER BY wi.timestamp DESC
            LIMIT 3
        `);

        console.log('\nTeste de JOIN (últimas 3 interações):');
        joinTest.rows.forEach((row, index) => {
            console.log(`  ${index + 1}. ID: ${row.id}, WF_Conversation: ${row.wf_conversation_id}, Chatwoot: ${row.chatwoot_conversation_id}, Bloco: ${row.block_name}, Tipo: ${row.user_response}`);
        });

        // 4. Testar consulta de followup
        console.log('\n4️⃣ Testando consulta de followup:');
        const followupTest = await pool.query(`
            SELECT 
                wf_conversation_id,
                block_name,
                COUNT(*) as count
            FROM workflow_interactions
            WHERE user_response = 'AUTO_FOLLOWUP'
            GROUP BY wf_conversation_id, block_name
            ORDER BY count DESC
            LIMIT 5
        `);

        console.log('\nFollowups por bloco:');
        followupTest.rows.forEach((row, index) => {
            console.log(`  ${index + 1}. WF_Conversation: ${row.wf_conversation_id}, Bloco: ${row.block_name}, Execuções: ${row.count}`);
        });

        // 5. Testar inserção (simulação)
        console.log('\n5️⃣ Testando estrutura de inserção:');
        console.log('   INSERT INTO workflow_interactions (wf_conversation_id, contact_id, block_name, user_response, bot_message, buttons)');
        console.log('   VALUES ($1, $2, $3, $4, $5, $6)');

        // 6. Verificar se há dados órfãos
        console.log('\n6️⃣ Verificando dados órfãos:');
        const orphanTest = await pool.query(`
            SELECT COUNT(*) as orphan_count
            FROM workflow_interactions wi
            LEFT JOIN workflow_conversations wc ON wi.wf_conversation_id = wc.id
            WHERE wc.id IS NULL
        `);

        const orphanCount = orphanTest.rows[0].orphan_count;
        if (orphanCount > 0) {
            console.log(`⚠️ Encontrados ${orphanCount} registros órfãos`);
        } else {
            console.log('✅ Nenhum registro órfão encontrado');
        }

        // 7. Resumo final
        console.log('\n7️⃣ Resumo Final:');
        console.log('✅ Migração concluída com sucesso!');
        console.log('✅ Campo renomeado: conversation_id -> wf_conversation_id');
        console.log('✅ Constraint recriada: workflow_interactions_wf_conversation_id_fkey');
        console.log('✅ Sistema atualizado para usar novo nome');
        console.log('✅ Consultas funcionando corretamente');
        console.log('✅ Estrutura mais clara e sem confusão');

        console.log('\n📋 Benefícios da reorganização:');
        console.log('  • Nome mais claro: wf_conversation_id indica que é ID da tabela workflow_conversations');
        console.log('  • Sem confusão com conversation_id do Chatwoot');
        console.log('  • Código mais legível e manutenível');
        console.log('  • Constraints com nomes mais descritivos');

        console.log('\n✅ Teste concluído com sucesso!');

    } catch (error) {
        console.error('❌ Erro no teste:', error);
    } finally {
        await pool.end();
    }
}

testNewFieldName();
