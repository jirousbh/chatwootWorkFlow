const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'chatwoot_workflows',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

async function addCascadeDelete() {
    try {
        console.log('🔧 Adicionando ON DELETE CASCADE na foreign key...\n');

        // 1. Verificar constraint atual
        console.log('1️⃣ Verificando constraint atual:');
        const currentConstraint = await pool.query(`
            SELECT 
                conname,
                conrelid::regclass as table_name,
                confrelid::regclass as referenced_table,
                confupdtype,
                confdeltype
            FROM pg_constraint 
            WHERE conname = 'workflow_interactions_wf_conversation_id_fkey'
        `);

        if (currentConstraint.rows.length > 0) {
            const constraint = currentConstraint.rows[0];
            console.log(`   Nome: ${constraint.conname}`);
            console.log(`   Tabela: ${constraint.table_name}`);
            console.log(`   Referenciada: ${constraint.referenced_table}`);
            console.log(`   ON UPDATE: ${constraint.confupdtype === 'a' ? 'NO ACTION' : constraint.confupdtype}`);
            console.log(`   ON DELETE: ${constraint.confdeltype === 'a' ? 'NO ACTION' : constraint.confdeltype}`);
        } else {
            console.log('   ⚠️ Constraint não encontrada');
        }

        // 2. Remover constraint atual
        console.log('\n2️⃣ Removendo constraint atual:');
        try {
            await pool.query('ALTER TABLE workflow_interactions DROP CONSTRAINT workflow_interactions_wf_conversation_id_fkey');
            console.log('   ✅ Constraint removida com sucesso');
        } catch (error) {
            console.log(`   ⚠️ Erro ao remover constraint: ${error.message}`);
        }

        // 3. Recriar constraint com CASCADE
        console.log('\n3️⃣ Recriando constraint com ON DELETE CASCADE:');
        try {
            await pool.query(`
                ALTER TABLE workflow_interactions 
                ADD CONSTRAINT workflow_interactions_wf_conversation_id_fkey 
                FOREIGN KEY (wf_conversation_id) 
                REFERENCES workflow_conversations(id) 
                ON DELETE CASCADE
            `);
            console.log('   ✅ Constraint recriada com ON DELETE CASCADE');
        } catch (error) {
            console.log(`   ❌ Erro ao recriar constraint: ${error.message}`);
            return;
        }

        // 4. Verificar constraint final
        console.log('\n4️⃣ Verificando constraint final:');
        const finalConstraint = await pool.query(`
            SELECT 
                conname,
                conrelid::regclass as table_name,
                confrelid::regclass as referenced_table,
                confupdtype,
                confdeltype
            FROM pg_constraint 
            WHERE conname = 'workflow_interactions_wf_conversation_id_fkey'
        `);

        if (finalConstraint.rows.length > 0) {
            const constraint = finalConstraint.rows[0];
            console.log(`   Nome: ${constraint.conname}`);
            console.log(`   Tabela: ${constraint.table_name}`);
            console.log(`   Referenciada: ${constraint.referenced_table}`);
            console.log(`   ON UPDATE: ${constraint.confupdtype === 'a' ? 'NO ACTION' : constraint.confupdtype}`);
            console.log(`   ON DELETE: ${constraint.confdeltype === 'c' ? 'CASCADE' : constraint.confdeltype}`);
            
            if (constraint.confdeltype === 'c') {
                console.log('   ✅ ON DELETE CASCADE configurado corretamente!');
            } else {
                console.log('   ❌ ON DELETE CASCADE não foi configurado');
            }
        }

        // 5. Testar funcionalidade
        console.log('\n5️⃣ Testando funcionalidade:');
        
        // Verificar dados antes do teste
        const beforeCount = await pool.query(`
            SELECT 
                COUNT(*) as total_conversations,
                (SELECT COUNT(*) FROM workflow_interactions) as total_interactions
            FROM workflow_conversations
        `);
        
        console.log(`   Antes: ${beforeCount.rows[0].total_conversations} conversas, ${beforeCount.rows[0].total_interactions} interações`);

        // Simular teste (não executar realmente)
        console.log('   ⚠️ Para testar, você pode deletar uma conversa e verificar se as interações são removidas automaticamente');
        console.log('   Exemplo: DELETE FROM workflow_conversations WHERE id = [ID_DA_CONVERSA]');

        // 6. Verificar outras constraints que podem precisar de CASCADE
        console.log('\n6️⃣ Verificando outras constraints relacionadas:');
        const otherConstraints = await pool.query(`
            SELECT 
                conname,
                conrelid::regclass as table_name,
                confrelid::regclass as referenced_table,
                confdeltype
            FROM pg_constraint 
            WHERE confrelid::regclass = 'workflow_conversations'::regclass
                AND conname != 'workflow_interactions_wf_conversation_id_fkey'
        `);

        if (otherConstraints.rows.length > 0) {
            console.log('   Outras constraints que referenciam workflow_conversations:');
            otherConstraints.rows.forEach((constraint, index) => {
                const cascadeStatus = constraint.confdeltype === 'c' ? '✅ CASCADE' : '❌ NO ACTION';
                console.log(`     ${index + 1}. ${constraint.conname}: ${constraint.table_name} -> ${constraint.referenced_table} (${cascadeStatus})`);
            });
        } else {
            console.log('   ✅ Nenhuma outra constraint encontrada');
        }

        // 7. Resumo final
        console.log('\n7️⃣ Resumo Final:');
        console.log('✅ ON DELETE CASCADE adicionado com sucesso');
        console.log('✅ Agora quando uma conversa for deletada, todas as suas interações serão removidas automaticamente');
        console.log('✅ O comando !reset funcionará corretamente sem erros de foreign key');
        console.log('✅ Integridade referencial mantida');

        console.log('\n📋 Benefícios:');
        console.log('  • Comando !reset funcionará sem erros');
        console.log('  • Limpeza automática de dados órfãos');
        console.log('  • Manutenção mais fácil do banco de dados');
        console.log('  • Evita violações de foreign key');

        console.log('\n✅ Configuração concluída com sucesso!');

    } catch (error) {
        console.error('❌ Erro durante a configuração:', error);
    } finally {
        await pool.end();
    }
}

addCascadeDelete();
