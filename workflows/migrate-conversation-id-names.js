const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'chatwoot_workflows',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

async function migrateConversationIdNames() {
    try {
        console.log('🔄 Iniciando migração dos nomes de campos conversation_id...\n');

        // 1. Verificar estrutura atual
        console.log('1️⃣ Verificando estrutura atual das tabelas:');
        
        const tables = ['workflow_conversations', 'workflow_interactions', 'bot_conversation_status'];
        
        for (const table of tables) {
            const result = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1 
                ORDER BY ordinal_position
            `, [table]);
            
            console.log(`\n${table}:`);
            result.rows.forEach(row => {
                console.log(`  ${row.column_name}: ${row.data_type}`);
            });
        }

        // 2. Verificar constraints existentes
        console.log('\n2️⃣ Verificando constraints existentes:');
        const constraints = await pool.query(`
            SELECT 
                conname,
                conrelid::regclass as table_name,
                confrelid::regclass as referenced_table,
                conkey,
                confkey
            FROM pg_constraint 
            WHERE conname LIKE '%conversation%' OR conname LIKE '%workflow%'
        `);

        console.log('\nConstraints encontradas:');
        constraints.rows.forEach(constraint => {
            console.log(`  ${constraint.conname}: ${constraint.table_name} -> ${constraint.referenced_table}`);
        });

        // 3. Backup dos dados atuais
        console.log('\n3️⃣ Fazendo backup dos dados atuais:');
        const backupData = await pool.query(`
            SELECT 
                id,
                conversation_id,
                contact_id,
                block_name,
                user_response,
                bot_message,
                buttons,
                timestamp
            FROM workflow_interactions
            ORDER BY id
        `);

        console.log(`✅ Backup criado com ${backupData.rows.length} registros`);

        // 4. Remover constraint existente
        console.log('\n4️⃣ Removendo constraint existente:');
        try {
            await pool.query('ALTER TABLE workflow_interactions DROP CONSTRAINT workflow_interactions_conversation_id_fkey');
            console.log('✅ Constraint removida com sucesso');
        } catch (error) {
            console.log('⚠️ Constraint não encontrada ou já removida');
        }

        // 5. Renomear coluna
        console.log('\n5️⃣ Renomeando coluna conversation_id para wf_conversation_id:');
        await pool.query('ALTER TABLE workflow_interactions RENAME COLUMN conversation_id TO wf_conversation_id');
        console.log('✅ Coluna renomeada com sucesso');

        // 6. Recriar constraint com novo nome
        console.log('\n6️⃣ Recriando constraint com novo nome:');
        await pool.query(`
            ALTER TABLE workflow_interactions 
            ADD CONSTRAINT workflow_interactions_wf_conversation_id_fkey 
            FOREIGN KEY (wf_conversation_id) REFERENCES workflow_conversations(id)
        `);
        console.log('✅ Constraint recriada com sucesso');

        // 7. Verificar estrutura final
        console.log('\n7️⃣ Verificando estrutura final:');
        const finalStructure = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'workflow_interactions' 
            ORDER BY ordinal_position
        `);

        console.log('\nworkflow_interactions (estrutura final):');
        finalStructure.rows.forEach(row => {
            console.log(`  ${row.column_name}: ${row.data_type}`);
        });

        // 8. Verificar constraints finais
        console.log('\n8️⃣ Verificando constraints finais:');
        const finalConstraints = await pool.query(`
            SELECT 
                conname,
                conrelid::regclass as table_name,
                confrelid::regclass as referenced_table
            FROM pg_constraint 
            WHERE conrelid::regclass = 'workflow_interactions'::regclass
        `);

        console.log('\nConstraints finais de workflow_interactions:');
        finalConstraints.rows.forEach(constraint => {
            console.log(`  ${constraint.conname}: ${constraint.table_name} -> ${constraint.referenced_table}`);
        });

        // 9. Testar consulta
        console.log('\n9️⃣ Testando consulta com novo nome de campo:');
        const testQuery = await pool.query(`
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
            LIMIT 5
        `);

        console.log('\nTeste de consulta (últimas 5 interações):');
        testQuery.rows.forEach((row, index) => {
            console.log(`  ${index + 1}. ID: ${row.id}, WF_Conversation: ${row.wf_conversation_id}, Chatwoot: ${row.chatwoot_conversation_id}, Bloco: ${row.block_name}`);
        });

        console.log('\n✅ Migração concluída com sucesso!');
        console.log('\n📋 Resumo das mudanças:');
        console.log('  ✅ Campo conversation_id renomeado para wf_conversation_id em workflow_interactions');
        console.log('  ✅ Constraint recriada com nome mais claro');
        console.log('  ✅ Estrutura agora é mais intuitiva e sem confusão');

    } catch (error) {
        console.error('❌ Erro durante a migração:', error);
        
        // Em caso de erro, tentar reverter
        console.log('\n🔄 Tentando reverter mudanças...');
        try {
            await pool.query('ALTER TABLE workflow_interactions RENAME COLUMN wf_conversation_id TO conversation_id');
            console.log('✅ Reversão concluída');
        } catch (revertError) {
            console.error('❌ Erro na reversão:', revertError);
        }
    } finally {
        await pool.end();
    }
}

migrateConversationIdNames();
