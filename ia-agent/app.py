import os
import json
import uuid
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.utils import secure_filename
import tempfile
import shutil

from agent_manager import AgentManager
from groq_client import GroqClient

app = Flask(__name__)
CORS(app)

# Configuração do banco de dados
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL', 
    'postgresql://postgres:invoAI@76925@postgres-dev:5432/workflows_iaagent'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

db = SQLAlchemy(app)

# Modelo do banco de dados para agentes
class Agent(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False)
    api_provider = db.Column(db.String(50), nullable=False, default='groq')
    model = db.Column(db.String(100), nullable=False)
    summary_prompt = db.Column(db.Text, nullable=False)
    custom_system_prompt = db.Column(db.Text, nullable=False)
    pdf_filename = db.Column(db.String(255), nullable=True)
    vectorstore_path = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'api_provider': self.api_provider,
            'model': self.model,
            'summary_prompt': self.summary_prompt,
            'custom_system_prompt': self.custom_system_prompt,
            'pdf_filename': self.pdf_filename,
            'vectorstore_path': self.vectorstore_path,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'is_active': self.is_active
        }

# Inicializar clientes
groq_client = GroqClient()
agent_manager = AgentManager()

# Criar tabelas
with app.app_context():
    db.create_all()

@app.route('/health', methods=['GET'])
def health_check():
    """Verifica se a API está funcionando"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'service': 'ia-agent-api'
    })

@app.route('/models', methods=['GET'])
def list_models():
    """Lista modelos disponíveis da Groq"""
    try:
        provider = request.args.get('provider', 'groq')
        
        if provider == 'groq':
            models = groq_client.list_models()
            return jsonify({
                'provider': 'groq',
                'models': models,
                'status': 'success'
            })
        else:
            return jsonify({
                'error': 'Provider não suportado',
                'supported_providers': ['groq']
            }), 400
            
    except Exception as e:
        return jsonify({
            'error': f'Erro ao listar modelos: {str(e)}'
        }), 500

@app.route('/agents', methods=['GET'])
def list_agents():
    """Lista todos os agentes criados"""
    try:
        agents = Agent.query.filter_by(is_active=True).all()
        return jsonify({
            'agents': [agent.to_dict() for agent in agents],
            'status': 'success'
        })
    except Exception as e:
        return jsonify({
            'error': f'Erro ao listar agentes: {str(e)}'
        }), 500

@app.route('/agents', methods=['POST'])
def create_agent():
    """Cria um novo agente IA"""
    try:
        data = request.get_json()
        
        # Validação dos campos obrigatórios
        required_fields = ['name', 'model', 'summary_prompt', 'custom_system_prompt']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({
                    'error': f'Campo obrigatório: {field}'
                }), 400
        
        # Validação do modelo
        if data.get('api_provider', 'groq') == 'groq':
            available_models = groq_client.list_models()
            if data['model'] not in [model['id'] for model in available_models]:
                return jsonify({
                    'error': f'Modelo {data["model"]} não está disponível na Groq',
                    'available_models': [model['id'] for model in available_models]
                }), 400
        
        # Criar agente no banco
        agent = Agent(
            name=data['name'],
            api_provider=data.get('api_provider', 'groq'),
            model=data['model'],
            summary_prompt=data['summary_prompt'],
            custom_system_prompt=data['custom_system_prompt']
        )
        
        db.session.add(agent)
        db.session.commit()
        
        return jsonify({
            'agent': agent.to_dict(),
            'status': 'success',
            'message': 'Agente criado com sucesso'
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': f'Erro ao criar agente: {str(e)}'
        }), 500

@app.route('/agents/<agent_id>/upload-pdf', methods=['POST'])
def upload_pdf(agent_id):
    """Faz upload de PDF para um agente específico"""
    try:
        agent = Agent.query.get_or_404(agent_id)
        
        if 'pdf_file' not in request.files:
            return jsonify({
                'error': 'Nenhum arquivo PDF enviado'
            }), 400
        
        pdf_file = request.files['pdf_file']
        
        if pdf_file.filename == '':
            return jsonify({
                'error': 'Nenhum arquivo selecionado'
            }), 400
        
        if not pdf_file.filename.lower().endswith('.pdf'):
            return jsonify({
                'error': 'Arquivo deve ser um PDF'
            }), 400
        
        # Criar diretório para o agente se não existir
        agent_dir = Path('/data/ia-agent-dev') / agent_id
        agent_dir.mkdir(parents=True, exist_ok=True)
        
        # Salvar arquivo PDF
        filename = secure_filename(pdf_file.filename)
        pdf_path = agent_dir / filename
        pdf_file.save(pdf_path)
        
        # Criar vectorstore
        vectorstore_path = agent_dir / 'vectorstore'
        success = agent_manager.create_vectorstore(str(pdf_path), str(vectorstore_path))
        
        if not success:
            # Remove arquivo se falhou
            pdf_path.unlink()
            return jsonify({
                'error': 'Falha ao processar PDF e criar vectorstore'
            }), 500
        
        # Atualizar agente no banco
        agent.pdf_filename = filename
        agent.vectorstore_path = str(vectorstore_path)
        agent.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'message': 'PDF processado e vectorstore criado com sucesso',
            'agent': agent.to_dict()
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': f'Erro ao processar PDF: {str(e)}'
        }), 500

@app.route('/agents/<agent_id>/chat', methods=['POST'])
def chat_with_agent(agent_id):
    """Conversa com um agente específico"""
    try:
        agent = Agent.query.get_or_404(agent_id)
        
        if not agent.is_active:
            return jsonify({
                'error': 'Agente não está ativo'
            }), 400
        
        if not agent.vectorstore_path:
            return jsonify({
                'error': 'Agente não possui documentos processados'
            }), 400
        
        data = request.get_json()
        message = data.get('message', '')
        
        if not message:
            return jsonify({
                'error': 'Mensagem não fornecida'
            }), 400
        
        # Verificar se é primeira interação (resumo)
        is_first_interaction = data.get('is_first_interaction', False)
        
        if is_first_interaction:
            # Usar summary_prompt
            response = agent_manager.generate_summary(
                agent_id,
                agent.vectorstore_path,
                agent.summary_prompt,
                agent.model,
                agent.api_provider
            )
        else:
            # Usar custom_system_prompt para conversa normal
            response = agent_manager.chat_with_agent(
                agent_id,
                agent.vectorstore_path,
                message,
                agent.custom_system_prompt,
                agent.model,
                agent.api_provider
            )
        
        return jsonify({
            'response': response,
            'agent_id': agent_id,
            'status': 'success'
        })
        
    except Exception as e:
        return jsonify({
            'error': f'Erro ao processar mensagem: {str(e)}'
        }), 500

@app.route('/agents/<agent_id>', methods=['GET'])
def get_agent(agent_id):
    """Obtém detalhes de um agente específico"""
    try:
        agent = Agent.query.get_or_404(agent_id)
        return jsonify({
            'agent': agent.to_dict(),
            'status': 'success'
        })
    except Exception as e:
        return jsonify({
            'error': f'Erro ao obter agente: {str(e)}'
        }), 500

@app.route('/agents/<agent_id>', methods=['DELETE'])
def delete_agent(agent_id):
    """Desativa um agente (soft delete)"""
    try:
        agent = Agent.query.get_or_404(agent_id)
        agent.is_active = False
        agent.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'message': 'Agente desativado com sucesso'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': f'Erro ao desativar agente: {str(e)}'
        }), 500

@app.route('/agents/<agent_id>/pdf', methods=['GET'])
def download_pdf(agent_id):
    """Download do PDF do agente"""
    try:
        agent = Agent.query.get_or_404(agent_id)
        
        if not agent.pdf_filename:
            return jsonify({
                'error': 'Agente não possui PDF'
            }), 404
        
        pdf_path = Path('/data/ia-agent-dev') / agent_id / agent.pdf_filename
        
        if not pdf_path.exists():
            return jsonify({
                'error': 'Arquivo PDF não encontrado'
            }), 404
        
        return send_file(
            str(pdf_path),
            as_attachment=True,
            download_name=agent.pdf_filename
        )
        
    except Exception as e:
        return jsonify({
            'error': f'Erro ao baixar PDF: {str(e)}'
        }), 500

if __name__ == '__main__':
    # Criar diretório de dados se não existir
    data_dir = Path('/data/ia-agent-dev')
    data_dir.mkdir(parents=True, exist_ok=True)
    
    app.run(host='0.0.0.0', port=3006, debug=False)
