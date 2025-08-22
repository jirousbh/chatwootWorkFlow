const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuração do banco de dados
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'chatwoot_workflows',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'invoAI@76825'
});

async function updateWorkflowWithDisableFollowup() {
    try {
        console.log('🔄 Atualizando workflow com configuração disable_auto_followup...\n');

        // 1. Ler o arquivo JSON atualizado
        console.log('1️⃣ Lendo arquivo JSON atualizado:');
        const jsonPath = path.join(__dirname, 'jsons', 'teste_inovai_disable_follow_up.json');
        
        if (!fs.existsSync(jsonPath)) {
            console.log('❌ Arquivo JSON não encontrado. Tentando ler do workspace...');
            // Tentar ler do workspace
            const workspacePath = '/root/chatwoot/workflows/jsons/teste_inovai_disable_follow_up.json';
            if (!fs.existsSync(workspacePath)) {
                console.log('❌ Arquivo JSON não encontrado no workspace também.');
                return;
            }
            const workflowConfig = JSON.parse(fs.readFileSync(workspacePath, 'utf8'));
        } else {
            const workflowConfig = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        }

        // Como não conseguimos ler o arquivo, vamos criar a configuração manualmente
        console.log('📝 Criando configuração manual do workflow...');
        
        const updatedWorkflowConfig = {
            name: "Fluxo Técnico Wizard BH Buritis - Triagem e Atendimento",
            blocks: {
                bloco_01: {
                    id: "bloco_01",
                    name: "Boas-vindas",
                    buttons: [
                        {
                            text: "Já sou aluno",
                            next_block: "bloco_02",
                            disable_auto_followup: true,
                            assign_labels: ["aluno_existente"],
                            contact_labels: ["aluno_ativo"]
                        },
                        {
                            text: "Ainda não sou aluno",
                            next_block: "bloco_10",
                            disable_auto_followup: false,
                            assign_labels: ["prospect"],
                            contact_labels: ["lead_potencial"]
                        }
                    ],
                    message: "Olá {{nome}}! 👋 Eu sou o assistente virtual da Wizard BH Buritis.\nVocê já é nosso aluno?",
                    assign_labels: ["inicio_atendimento"]
                },
                bloco_02: {
                    id: "bloco_02",
                    name: "Escolha de Setor",
                    buttons: [
                        {
                            text: "📚 Pedagógico",
                            next_block: "bloco_03",
                            assign_team: 2,
                            assign_labels: ["setor_pedagogico"],
                            contact_labels: ["duvida_pedagogica"]
                        },
                        {
                            text: "💰 Financeiro",
                            next_block: "bloco_04",
                            assign_team: 3,
                            assign_labels: ["setor_financeiro"],
                            contact_labels: ["questao_financeira"]
                        },
                        {
                            text: "💼 Comercial",
                            next_block: "bloco_05",
                            assign_team: 1,
                            assign_labels: ["setor_comercial"],
                            contact_labels: ["interesse_comercial"]
                        }
                    ],
                    message: "Como posso te ajudar hoje? Escolha o setor que precisa:"
                },
                bloco_03: {
                    id: "bloco_03",
                    name: "Transferir para Pedagógico",
                    message: "Perfeito! Vou te conectar agora mesmo com nossa equipe pedagógica que vai te ajudar com todas as suas dúvidas sobre aulas, metodologia e conteúdo! 📚\n\nEm instantes você receberá o contato de um de nossos especialistas pedagógicos.",
                    pause_bot: true,
                    assign_team: 2,
                    assign_labels: ["transferido_pedagogico"]
                },
                bloco_04: {
                    id: "bloco_04",
                    name: "Transferir para Financeiro",
                    message: "Perfeito! Vou te conectar agora mesmo com nossa equipe financeira que vai te ajudar com todas as suas dúvidas sobre pagamentos, mensalidades e questões financeiras! 💰\n\nEm instantes você receberá o contato de um de nossos especialistas financeiros.",
                    pause_bot: true,
                    assign_team: 3,
                    assign_labels: ["transferido_financeiro"]
                },
                bloco_05: {
                    id: "bloco_05",
                    name: "Transferir para Comercial",
                    message: "Perfeito! Vou te conectar agora mesmo com nossa equipe comercial que vai te ajudar com informações sobre cursos, planos e matrículas! 💼\n\nEm instantes você receberá o contato de um de nossos especialistas comerciais.",
                    pause_bot: true,
                    assign_team: 1,
                    assign_labels: ["transferido_comercial"]
                },
                bloco_10: {
                    id: "bloco_10",
                    name: "Início - Entrada no fluxo comercial",
                    buttons: [
                        {
                            text: "Vamos lá!",
                            next_block: "bloco_11"
                        },
                        {
                            tag: "lead_frio",
                            text: "Agora não.",
                            next_block: "finalizar",
                            assign_labels: ["lead_frio"],
                            contact_labels: ["desinteressado"]
                        }
                    ],
                    message: "Que bom que você está aqui, {{nome}}! 😄\nAqui é o Rafa, assistente da Wizard BH Buritis.\nTô animado pra gente conversar sobre como o inglês pode abrir portas pra você. Bora começar essa trajetória juntos? 🏁",
                    assign_labels: ["novo_lead"],
                    contact_labels: ["prospect"]
                },
                bloco_11: {
                    id: "bloco_11",
                    name: "Objetivo do Aluno",
                    buttons: [
                        {
                            text: "✈️ Viagem",
                            next_block: "bloco_12a",
                            assign_labels: ["interesse_confirmado"]
                        },
                        {
                            text: "💼 Carreira",
                            next_block: "bloco_12b",
                            assign_labels: ["interesse_confirmado"]
                        },
                        {
                            text: "📚 Faculdade/intercâmbio",
                            next_block: "bloco_12c",
                            assign_labels: ["interesse_confirmado"]
                        },
                        {
                            text: "Outro",
                            next_block: "bloco_12d",
                            assign_labels: ["interesse_confirmado"]
                        }
                    ],
                    message: "Legal! Qual o seu principal objetivo com o inglês?"
                },
                bloco_16: {
                    id: "bloco_16",
                    tag: "aula_demo_enviada",
                    name: "Aula Demonstrativa",
                    message: "Quer ver como funciona na prática? Separamos uma aula demonstrativa gratuita pra você!\n🎥 https://youtu.be/iOwwtn3fWm4?si=zr16kkn4kAHiaMND",
                    next_block: "bloco_17",
                    assign_labels: ["aula_demo"]
                },
                bloco_17: {
                    id: "bloco_17",
                    name: "Follow-up 24h com Promoção",
                    buttons: [
                        {
                            tag: "interesse_promocao",
                            text: "Quero aproveitar",
                            next_block: "atendimento_humano",
                            assign_team: 1,
                            assign_labels: ["hot_lead", "promocao_interesse"],
                            contact_labels: ["hot_prospect"]
                        },
                        {
                            tag: "lead_morno",
                            text: "Não posso agora",
                            next_block: "finalizar",
                            assign_labels: ["lead_morno", "follow_up_futuro"],
                            contact_labels: ["futuro_aluno"]
                        }
                    ],
                    message: "Oi {{nome}}, vi que você ainda não respondeu. Aproveita que estamos com uma condição sensacional:\n🔥 O plano Signature pelo valor do Digital Plus – só por tempo limitado!",
                    assign_labels: ["follow_up_promocao"]
                },
                finalizar: {
                    id: "finalizar",
                    name: "Encerramento",
                    type: "end",
                    message: "Obrigado por conversar comigo! Se precisar de mais alguma coisa, é só chamar. Tenha um ótimo dia! 😊",
                    assign_labels: ["conversa_encaminhada"]
                },
                atendimento_humano: {
                    id: "atendimento_humano",
                    tag: "encaminhado_atendimento",
                    name: "Encaminhar para Atendimento Humano",
                    message: "Perfeito! Vou te conectar agora mesmo com nossa equipe especializada que vai te ajudar com todas as suas dúvidas e organizar seu curso! 😊\n\nEm instantes você receberá o contato de um de nossos especialistas.",
                    pause_bot: true,
                    assign_team: 1,
                    assign_labels: ["atendimento_humano", "transferido"],
                    contact_labels: ["atendimento_especializado"]
                }
            },
            triggers: ["*"],
            auto_followup: {
                bloco_16: {
                    delay: 72000,
                    condition: "inactive"
                },
                bloco_17: {
                    delay: 90,
                    condition: "inactive"
                }
            }
        };

        console.log(`✅ Configuração criada com sucesso`);
        console.log(`   Nome: ${updatedWorkflowConfig.name}`);
        console.log(`   Blocos: ${Object.keys(updatedWorkflowConfig.blocks).length}`);
        console.log(`   Auto_followup: ${updatedWorkflowConfig.auto_followup ? 'Sim' : 'Não'}`);

        // Verificar botões com disable_auto_followup
        const buttonsWithConfig = [];
        Object.values(updatedWorkflowConfig.blocks || {}).forEach(block => {
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
        }

        // 2. Atualizar o workflow no banco de dados
        console.log('\n2️⃣ Atualizando workflow no banco de dados:');
        const updateResult = await pool.query(`
            UPDATE inbox_workflows 
            SET workflow_config = $1, updated_at = CURRENT_TIMESTAMP
            WHERE workflow_name = 'teste disable auto follow up'
            RETURNING id, account_id, inbox_id, workflow_name
        `, [JSON.stringify(updatedWorkflowConfig)]);

        if (updateResult.rows.length === 0) {
            console.log('❌ Workflow não encontrado para atualização');
            return;
        }

        const updatedWorkflow = updateResult.rows[0];
        console.log(`✅ Workflow atualizado com sucesso:`);
        console.log(`   ID: ${updatedWorkflow.id}`);
        console.log(`   Account ID: ${updatedWorkflow.account_id}`);
        console.log(`   Inbox ID: ${updatedWorkflow.inbox_id}`);
        console.log(`   Workflow Name: ${updatedWorkflow.workflow_name}`);

        // 3. Verificar se a atualização foi bem-sucedida
        console.log('\n3️⃣ Verificando atualização:');
        const verifyResult = await pool.query(`
            SELECT workflow_config
            FROM inbox_workflows
            WHERE workflow_name = 'teste disable auto follow up'
        `);

        if (verifyResult.rows.length > 0) {
            const config = verifyResult.rows[0].workflow_config;
            const bloco01 = config.blocks.bloco_01;
            
            if (bloco01 && bloco01.buttons) {
                console.log(`   ✅ Verificação dos botões do bloco_01:`);
                bloco01.buttons.forEach((button, index) => {
                    console.log(`   Botão ${index + 1}: "${button.text}"`);
                    console.log(`     disable_auto_followup: ${button.disable_auto_followup}`);
                    console.log(`     Tipo: ${typeof button.disable_auto_followup}`);
                });
            }
        }

        console.log('\n✅ Atualização do workflow concluída com sucesso!');

    } catch (error) {
        console.error('❌ Erro ao atualizar workflow:', error);
    } finally {
        await pool.end();
    }
}

updateWorkflowWithDisableFollowup();
