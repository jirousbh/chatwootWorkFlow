-- Workflow de teste para envio de vídeo via multipart/form-data
-- Execute este SQL no banco do sistema de workflows

INSERT INTO workflow_configs (workflow_name, config, is_active) VALUES 
('teste_video_multipart', '{
  "name": "Teste Video Multipart",
  "description": "Workflow para testar envio de vídeo via multipart/form-data",
  "blocks": {
    "bloco_1": {
      "id": "bloco_1",
      "name": "Início",
      "message": "Olá {{nome}}! 👋 Este é um teste do novo sistema de envio de vídeos via multipart/form-data.",
      "buttons": [
        {
          "text": "Ver vídeo de teste",
          "next_block": "bloco_video"
        },
        {
          "text": "Pular teste",
          "next_block": "bloco_fim"
        }
      ]
    },
    "bloco_video": {
      "id": "bloco_video", 
      "name": "Envio de Vídeo",
      "message": "🎬 Aqui está o vídeo de teste! Agora usando o método multipart/form-data que funciona:",
      "media": {
        "attachment": {
          "file_id": "1752608369518"
        }
      },
      "buttons": [
        {
          "text": "Funcionou! ✅",
          "next_block": "bloco_sucesso",
          "contact_labels": ["teste_video_ok"]
        },
        {
          "text": "Não funcionou ❌", 
          "next_block": "bloco_erro",
          "contact_labels": ["teste_video_erro"]
        }
      ]
    },
    "bloco_sucesso": {
      "id": "bloco_sucesso",
      "name": "Sucesso",
      "message": "🎉 Excelente! O novo sistema multipart/form-data está funcionando perfeitamente!\n\n✅ Vídeo enviado sem erro 131053\n✅ Método correto implementado\n✅ Sistema atualizado com sucesso",
      "next_block": "finalizar",
      "contact_labels": ["sistema_video_ok"]
    },
    "bloco_erro": {
      "id": "bloco_erro", 
      "name": "Erro",
      "message": "❌ Ops! Parece que ainda há algum problema. Por favor, reporte este erro para que possamos investigar.\n\nDetalhes para reportar:\n- Data/hora do teste\n- Se apareceu erro 131053\n- Se o vídeo não carregou",
      "next_block": "finalizar",
      "contact_labels": ["sistema_video_erro", "requer_investigacao"]
    },
    "bloco_fim": {
      "id": "bloco_fim",
      "name": "Fim sem teste",
      "message": "Ok, teste pulado. Você pode testar mais tarde enviando \"teste video\" novamente.",
      "next_block": "finalizar"
    }
  }
}', true)
ON CONFLICT (workflow_name) 
DO UPDATE SET 
  config = EXCLUDED.config,
  is_active = EXCLUDED.is_active,
  updated_at = CURRENT_TIMESTAMP;

-- Associar o workflow de teste ao inbox 4 (WhatsApp)
INSERT INTO inbox_workflows (account_id, inbox_id, workflow_name, workflow_config, is_active)
VALUES (
  3, -- account_id
  4, -- inbox_id (WhatsApp)
  'teste_video_multipart',
  '{
    "name": "Teste Video Multipart",
    "description": "Workflow para testar envio de vídeo via multipart/form-data", 
    "blocks": {
      "bloco_1": {
        "id": "bloco_1",
        "name": "Início",
        "message": "Olá {{nome}}! 👋 Este é um teste do novo sistema de envio de vídeos via multipart/form-data.",
        "buttons": [
          {
            "text": "Ver vídeo de teste",
            "next_block": "bloco_video"
          },
          {
            "text": "Pular teste", 
            "next_block": "bloco_fim"
          }
        ]
      },
      "bloco_video": {
        "id": "bloco_video",
        "name": "Envio de Vídeo",
        "message": "🎬 Aqui está o vídeo de teste! Agora usando o método multipart/form-data que funciona:",
        "media": {
          "attachment": {
            "file_id": "1752608369518"
          }
        },
        "buttons": [
          {
            "text": "Funcionou! ✅",
            "next_block": "bloco_sucesso",
            "contact_labels": ["teste_video_ok"]
          },
          {
            "text": "Não funcionou ❌",
            "next_block": "bloco_erro", 
            "contact_labels": ["teste_video_erro"]
          }
        ]
      },
      "bloco_sucesso": {
        "id": "bloco_sucesso",
        "name": "Sucesso",
        "message": "🎉 Excelente! O novo sistema multipart/form-data está funcionando perfeitamente!\n\n✅ Vídeo enviado sem erro 131053\n✅ Método correto implementado\n✅ Sistema atualizado com sucesso",
        "next_block": "finalizar",
        "contact_labels": ["sistema_video_ok"]
      },
      "bloco_erro": {
        "id": "bloco_erro",
        "name": "Erro", 
        "message": "❌ Ops! Parece que ainda há algum problema. Por favor, reporte este erro para que possamos investigar.\n\nDetalhes para reportar:\n- Data/hora do teste\n- Se apareceu erro 131053\n- Se o vídeo não carregou",
        "next_block": "finalizar",
        "contact_labels": ["sistema_video_erro", "requer_investigacao"]
      },
      "bloco_fim": {
        "id": "bloco_fim",
        "name": "Fim sem teste",
        "message": "Ok, teste pulado. Você pode testar mais tarde enviando \"teste video\" novamente.",
        "next_block": "finalizar"
      }
    }
  }',
  true
)
ON CONFLICT (account_id, inbox_id)
DO UPDATE SET
  workflow_name = EXCLUDED.workflow_name,
  workflow_config = EXCLUDED.workflow_config,
  is_active = EXCLUDED.is_active,
  updated_at = CURRENT_TIMESTAMP;

-- Verificar se foi inserido corretamente
SELECT 
  workflow_name, 
  is_active,
  created_at,
  updated_at
FROM workflow_configs 
WHERE workflow_name = 'teste_video_multipart';

SELECT 
  account_id,
  inbox_id, 
  workflow_name,
  is_active,
  created_at,
  updated_at
FROM inbox_workflows 
WHERE workflow_name = 'teste_video_multipart'; 