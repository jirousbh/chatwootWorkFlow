INSERT INTO workflows (name, config, created_at, updated_at) 
VALUES (
  'teste_video_url', 
  '{
    "blocks": {
      "start": {
        "id": "start",
        "name": "Teste Video URL",
        "message": "🎬 Aqui está um vídeo via URL pública (teste anti-131053):",
        "media": {
          "attachment": {
            "file_id": "1752608369518"
          }
        },
        "buttons": [
          {"text": "✅ Funcionou!", "next_block": "success"},
          {"text": "❌ Não funcionou", "next_block": "error"}
        ]
      },
      "success": {
        "id": "success",
        "name": "Sucesso",
        "message": "🎉 Perfeito! O vídeo foi entregue via URL pública sem erro 131053!"
      },
      "error": {
        "id": "error",
        "name": "Erro",
        "message": "😞 Vamos investigar. Me conte o que aconteceu: viu algum erro? O vídeo não apareceu?"
      }
    }
  }',
  NOW(),
  NOW()
) 
ON CONFLICT (name) 
DO UPDATE SET 
  config = EXCLUDED.config, 
  updated_at = NOW(); 