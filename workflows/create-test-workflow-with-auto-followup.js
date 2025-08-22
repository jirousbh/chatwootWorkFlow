const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'chatwoot_workflows',
  user: 'postgres',
  password: 'invoAI@76825'
});

async function createTestWorkflowWithAutoFollowup() {
  console.log('🔧 Criando workflow de teste com Auto Follow-up...');
  console.log('=' .repeat(60));

  try {
    const testWorkflow = {
      workflow_name: 'teste_auto_followup_frontend',
      config: {
        blocks: {
          bloco_1: {
            name: 'Início - Teste Auto Follow-up',
            message: 'Olá! Este é um teste do sistema de Auto Follow-up. Escolha uma opção:',
            buttons: [
              {
                text: 'Já sou aluno',
                next_block: 'bloco_2',
                disable_auto_followup: true,
                assign_labels: ['aluno_existente'],
                contact_labels: ['aluno_ativo']
              },
              {
                text: 'Ainda não sou aluno',
                next_block: 'bloco_3',
                disable_auto_followup: false,
                assign_labels: ['prospecto'],
                contact_labels: ['interessado']
              },
              {
                text: 'Quero saber mais',
                next_block: 'bloco_4',
                assign_labels: ['curioso']
              }
            ]
          },
          bloco_2: {
            name: 'Aluno Existente',
            message: 'Ótimo! Como aluno existente, você tem acesso a todos os nossos recursos. Precisa de ajuda com algo específico?',
            buttons: [
              {
                text: 'Sim, preciso de ajuda',
                next_block: 'atendimento_humano',
                assign_labels: ['precisa_ajuda']
              },
              {
                text: 'Não, obrigado',
                next_block: 'finalizar',
                assign_labels: ['satisfeito']
              }
            ]
          },
          bloco_3: {
            name: 'Novo Aluno',
            message: 'Perfeito! Vamos te ajudar a começar sua jornada. Qual é seu objetivo principal?',
            buttons: [
              {
                text: 'Aprender inglês',
                next_block: 'bloco_5',
                assign_labels: ['objetivo_ingles']
              },
              {
                text: 'Preparar para viagem',
                next_block: 'bloco_6',
                assign_labels: ['objetivo_viagem']
              }
            ]
          },
          bloco_4: {
            name: 'Mais Informações',
            message: 'Claro! Deixe-me te contar sobre nossos diferenciais. Quer que eu envie um material explicativo?',
            buttons: [
              {
                text: 'Sim, envie o material',
                next_block: 'bloco_7',
                assign_labels: ['quer_material']
              },
              {
                text: 'Não, obrigado',
                next_block: 'finalizar',
                assign_labels: ['nao_interessado']
              }
            ]
          },
          bloco_5: {
            name: 'Objetivo - Inglês',
            message: 'Excelente escolha! Temos planos específicos para quem quer aprender inglês. Quer conhecer nossos planos?',
            buttons: [
              {
                text: 'Sim, mostrar planos',
                next_block: 'bloco_8',
                assign_labels: ['quer_planos']
              },
              {
                text: 'Depois',
                next_block: 'bloco_9',
                assign_labels: ['depois']
              }
            ]
          },
          bloco_6: {
            name: 'Objetivo - Viagem',
            message: 'Perfeito! Para viagens, recomendamos nosso curso de conversação. Quer fazer um teste de nível?',
            buttons: [
              {
                text: 'Sim, fazer teste',
                next_block: 'bloco_10',
                assign_labels: ['quer_teste']
              },
              {
                text: 'Não agora',
                next_block: 'bloco_9',
                assign_labels: ['depois']
              }
            ]
          },
          bloco_7: {
            name: 'Enviar Material',
            message: 'Perfeito! Vou enviar um material completo sobre nossos cursos. Você receberá em alguns minutos.',
            buttons: [
              {
                text: 'Obrigado!',
                next_block: 'bloco_9',
                assign_labels: ['material_enviado']
              }
            ]
          },
          bloco_8: {
            name: 'Mostrar Planos',
            message: 'Aqui estão nossos planos de inglês:\n\n📚 Básico: R$ 99/mês\n📚 Intermediário: R$ 149/mês\n📚 Avançado: R$ 199/mês\n\nQual te interessa mais?',
            buttons: [
              {
                text: 'Básico',
                next_block: 'atendimento_humano',
                assign_labels: ['interesse_basico']
              },
              {
                text: 'Intermediário',
                next_block: 'atendimento_humano',
                assign_labels: ['interesse_intermediario']
              },
              {
                text: 'Avançado',
                next_block: 'atendimento_humano',
                assign_labels: ['interesse_avancado']
              }
            ]
          },
          bloco_9: {
            name: 'Follow-up Programado',
            message: 'Entendi! Vou programar um follow-up para te lembrar sobre nossos cursos. Você receberá uma mensagem em breve.',
            buttons: [
              {
                text: 'Ok, entendi',
                next_block: 'finalizar',
                assign_labels: ['followup_programado']
              }
            ]
          },
          bloco_10: {
            name: 'Teste de Nível',
            message: 'Ótimo! Vou te enviar um link para fazer o teste de nível. É rápido e gratuito!',
            buttons: [
              {
                text: 'Fazer teste agora',
                next_block: 'atendimento_humano',
                assign_labels: ['quer_teste_agora']
              },
              {
                text: 'Depois',
                next_block: 'bloco_9',
                assign_labels: ['depois']
              }
            ]
          },
          atendimento_humano: {
            name: 'Atendimento Humano',
            message: 'Perfeito! Vou te conectar agora mesmo com um de nossos especialistas. Eles entrarão em contato em breve!',
            type: 'end'
          },
          finalizar: {
            name: 'Finalizar',
            message: 'Obrigado por conversar conosco! Se precisar de mais informações, é só voltar a falar com a gente. Até logo!',
            type: 'end'
          }
        },
        auto_followup: {
          bloco_9: {
            delay: 1800, // 30 minutos
            condition: 'inactive'
          },
          bloco_10: {
            delay: 3600, // 1 hora
            condition: 'inactive'
          },
          atendimento_humano: {
            delay: 7200, // 2 horas
            condition: 'inactive'
          }
        }
      }
    };

    // Verificar se o workflow já existe
    const existingResult = await pool.query(
      'SELECT workflow_name FROM workflow_configs WHERE workflow_name = $1',
      [testWorkflow.workflow_name]
    );

    if (existingResult.rows.length > 0) {
      console.log('⚠️ Workflow já existe. Atualizando...');
      await pool.query(
        'UPDATE workflow_configs SET config = $1, updated_at = CURRENT_TIMESTAMP WHERE workflow_name = $2',
        [testWorkflow.config, testWorkflow.workflow_name]
      );
    } else {
      console.log('📝 Inserindo novo workflow...');
      await pool.query(
        'INSERT INTO workflow_configs (workflow_name, config, created_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [testWorkflow.workflow_name, testWorkflow.config]
      );
    }

    console.log('✅ Workflow criado/atualizado com sucesso!');
    console.log('\n📋 Resumo do workflow:');
    console.log(`   Nome: ${testWorkflow.workflow_name}`);
    console.log(`   Blocos: ${Object.keys(testWorkflow.config.blocks).length}`);
    console.log(`   Auto Follow-up configurado: ${Object.keys(testWorkflow.config.auto_followup).length} blocos`);
    
    console.log('\n🕐 Auto Follow-up configurado:');
    Object.entries(testWorkflow.config.auto_followup).forEach(([blockId, followup]) => {
      const block = testWorkflow.config.blocks[blockId];
      const blockName = block ? block.name : blockId;
      const delayMinutes = Math.round(followup.delay / 60);
      console.log(`   • ${blockName}: ${delayMinutes}min (${followup.delay}s)`);
    });

    console.log('\n🔘 Botões com disable_auto_followup:');
    Object.entries(testWorkflow.config.blocks).forEach(([blockId, block]) => {
      if (block.buttons) {
        block.buttons.forEach(button => {
          if (button.disable_auto_followup !== undefined) {
            const action = button.disable_auto_followup ? 'Desativar' : 'Ativar';
            const icon = button.disable_auto_followup ? '🚫' : '✅';
            console.log(`   • ${icon} "${button.text}" (${blockId}): ${action} Auto Follow-up`);
          }
        });
      }
    });

    console.log('\n🎯 Para testar no frontend:');
    console.log('   1. Acesse o sistema no navegador');
    console.log('   2. Faça login como admin');
    console.log('   3. Selecione uma conta e caixa de entrada');
    console.log('   4. Clique em "Configurar Fluxo"');
    console.log('   5. Verifique a seção "Auto Follow-up" na visualização');
    console.log('   6. Observe os botões com ícones 🚫 e ✅');

  } catch (error) {
    console.error('❌ Erro durante a criação:', error);
  } finally {
    await pool.end();
  }
}

createTestWorkflowWithAutoFollowup();
