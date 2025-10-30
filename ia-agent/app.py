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
from improved_agent_manager import ImprovedAgentManager
from groq_client import GroqClient

app = Flask(__name__)
CORS(app)

# Configuração do banco de dados
DATABASE_URL = os.getenv(
    'DATABASE_URL', 
    'postgresql://postgres:invoAI@76925@postgres-dev:5432/workflows_iaagent'
)
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

db = SQLAlchemy(app)

# Modelo do banco de dados para provedores de IA
class IAProvider(db.Model):
    __tablename__ = 'ia_providers'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), nullable=False, unique=True)
    display_name = db.Column(db.String(100), nullable=False)
    api_base_url = db.Column(db.String(255), nullable=False)
    api_key = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    max_tokens = db.Column(db.Integer, default=4096)
    supports_streaming = db.Column(db.Boolean, default=False)
    supports_embeddings = db.Column(db.Boolean, default=False)
    supports_vision = db.Column(db.Boolean, default=False)
    default_model = db.Column(db.String(100), nullable=True)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'display_name': self.display_name,
            'api_base_url': self.api_base_url,
            'api_key': self.api_key,
            'is_active': self.is_active,
            'max_tokens': self.max_tokens,
            'supports_streaming': self.supports_streaming,
            'supports_embeddings': self.supports_embeddings,
            'supports_vision': self.supports_vision,
            'default_model': self.default_model,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

# Modelo do banco de dados para agentes
class Agent(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False)
    api_provider = db.Column(db.String(50), nullable=False, default='groq')
    model = db.Column(db.String(100), nullable=False)
    system_prompt = db.Column(db.Text, nullable=False)
    pdf_filename = db.Column(db.String(255), nullable=True)
    vectorstore_path = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Configurações de Calendário
    calendar_enabled = db.Column(db.Boolean, default=False)
    calendar_credentials = db.Column(db.Text, nullable=True)  # JSON das credenciais
    calendar_id = db.Column(db.String(255), nullable=True)
    calendar_start_hour = db.Column(db.Integer, default=9)
    calendar_end_hour = db.Column(db.Integer, default=18)
    calendar_workdays = db.Column(db.String(20), default='1,2,3,4,5')  # 1=segunda, 7=domingo
    calendar_duration_minutes = db.Column(db.Integer, default=60)
    use_google_meeting = db.Column(db.Boolean, default=False)  # Usar Google Meet para reuniões
    temperature = db.Column(db.Numeric(3, 2), default=0.10)  # Temperatura do LLM (0.00 - 1.00)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'api_provider': self.api_provider,
            'model': self.model,
            'system_prompt': self.system_prompt,
            'pdf_filename': self.pdf_filename,
            'vectorstore_path': self.vectorstore_path,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'is_active': self.is_active,
            'calendar_enabled': self.calendar_enabled,
            'calendar_credentials': self.calendar_credentials,
            'calendar_id': self.calendar_id,
            'calendar_start_hour': self.calendar_start_hour,
            'calendar_end_hour': self.calendar_end_hour,
            'calendar_workdays': self.calendar_workdays,
            'calendar_duration_minutes': self.calendar_duration_minutes,
            'use_google_meeting': self.use_google_meeting,
            'temperature': float(self.temperature) if self.temperature else 0.10
        }

# Inicializar clientes
groq_client = GroqClient()
agent_manager = AgentManager()

# Inicializar cliente genérico de provedores
from ai_provider_client import AIProviderClient
ai_provider_client = AIProviderClient(DATABASE_URL)

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
    """Lista modelos disponíveis de provedores de IA"""
    try:
        provider = request.args.get('provider')
        
        if provider:
            # Listar modelos de um provedor específico
            models = ai_provider_client.list_models(provider)
            if not models:
                return jsonify({
                    'error': f'Provedor {provider} não encontrado ou inativo',
                    'available_providers': [p['name'] for p in ai_provider_client.get_active_providers()]
                }), 400
            
            return jsonify({
                'provider': provider,
                'models': models,
                'total_models': len(models),
                'status': 'success'
            })
        else:
            # Listar modelos de todos os provedores ativos
            all_models = []
            active_providers = ai_provider_client.get_active_providers()
            
            for provider in active_providers:
                models = ai_provider_client.list_models(provider['name'])
                all_models.extend(models)
            
            return jsonify({
                'providers': [p['name'] for p in active_providers],
                'models': all_models,
                'total_models': len(all_models),
                'status': 'success'
            })
            
    except Exception as e:
        return jsonify({
            'error': f'Erro ao listar modelos: {str(e)}'
        }), 500

@app.route('/providers/<provider_name>/models', methods=['GET'])
def list_provider_models(provider_name):
    """Lista modelos de um provedor específico"""
    try:
        models = ai_provider_client.list_models(provider_name)
        if not models:
            return jsonify({
                'error': f'Provedor {provider_name} não encontrado ou inativo',
                'available_providers': [p['name'] for p in ai_provider_client.get_active_providers()]
            }), 400
        
        return jsonify({
            'provider': provider_name,
            'models': models,
            'total_models': len(models),
            'status': 'success'
        })
        
    except Exception as e:
        return jsonify({
            'error': f'Erro ao listar modelos do provedor {provider_name}: {str(e)}'
        }), 500

# Endpoints para gerenciar provedores de IA
@app.route('/providers', methods=['GET'])
def list_providers():
    """Lista todos os provedores de IA"""
    try:
        providers = IAProvider.query.all()
        return jsonify({
            'providers': [provider.to_dict() for provider in providers],
            'status': 'success'
        })
    except Exception as e:
        return jsonify({
            'error': f'Erro ao listar provedores: {str(e)}'
        }), 500

@app.route('/providers', methods=['POST'])
def create_provider():
    """Cria um novo provedor de IA"""
    try:
        data = request.get_json()
        
        # Validação dos campos obrigatórios
        required_fields = ['name', 'display_name', 'api_base_url']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    'error': f'Campo obrigatório: {field}'
                }), 400
        
        # Verificar se o nome já existe
        existing_provider = IAProvider.query.filter_by(name=data['name']).first()
        if existing_provider:
            return jsonify({
                'error': f'Provedor com nome "{data["name"]}" já existe'
            }), 400
        
        # Criar provedor
        provider = IAProvider(
            name=data['name'],
            display_name=data['display_name'],
            api_base_url=data['api_base_url'],
            api_key=data.get('api_key'),
            is_active=data.get('is_active', True),
            max_tokens=data.get('max_tokens', 4096),
            supports_streaming=data.get('supports_streaming', False),
            supports_embeddings=data.get('supports_embeddings', False),
            supports_vision=data.get('supports_vision', False),
            default_model=data.get('default_model'),
            description=data.get('description')
        )
        
        db.session.add(provider)
        db.session.commit()
        
        return jsonify({
            'provider': provider.to_dict(),
            'message': 'Provedor criado com sucesso',
            'status': 'success'
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': f'Erro ao criar provedor: {str(e)}'
        }), 500

@app.route('/providers/<provider_id>', methods=['PUT'])
def update_provider(provider_id):
    """Atualiza um provedor de IA"""
    try:
        provider = IAProvider.query.get_or_404(provider_id)
        data = request.get_json()
        
        # Atualizar campos
        if 'display_name' in data:
            provider.display_name = data['display_name']
        if 'api_base_url' in data:
            provider.api_base_url = data['api_base_url']
        if 'api_key' in data:
            provider.api_key = data['api_key']
        if 'is_active' in data:
            provider.is_active = data['is_active']
        if 'max_tokens' in data:
            provider.max_tokens = data['max_tokens']
        if 'supports_streaming' in data:
            provider.supports_streaming = data['supports_streaming']
        if 'supports_embeddings' in data:
            provider.supports_embeddings = data['supports_embeddings']
        if 'supports_vision' in data:
            provider.supports_vision = data['supports_vision']
        if 'default_model' in data:
            provider.default_model = data['default_model']
        if 'description' in data:
            provider.description = data['description']
        
        provider.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'provider': provider.to_dict(),
            'message': 'Provedor atualizado com sucesso',
            'status': 'success'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': f'Erro ao atualizar provedor: {str(e)}'
        }), 500

@app.route('/providers/<provider_id>', methods=['DELETE'])
def delete_provider(provider_id):
    """Remove um provedor de IA"""
    try:
        provider = IAProvider.query.get_or_404(provider_id)
        
        # Verificar se há agentes usando este provedor
        agents_using_provider = Agent.query.filter_by(api_provider=provider.name).count()
        if agents_using_provider > 0:
            return jsonify({
                'error': f'Não é possível remover o provedor. {agents_using_provider} agente(s) estão usando este provedor.'
            }), 400
        
        db.session.delete(provider)
        db.session.commit()
        
        return jsonify({
            'message': 'Provedor removido com sucesso',
            'status': 'success'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': f'Erro ao remover provedor: {str(e)}'
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
        required_fields = ['name', 'model', 'system_prompt']
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
            system_prompt=data['system_prompt'],
            calendar_enabled=data.get('calendar_enabled', False),
            calendar_credentials=data.get('calendar_credentials'),
            calendar_id=data.get('calendar_id'),
            calendar_start_hour=data.get('calendar_start_hour', 9),
            calendar_end_hour=data.get('calendar_end_hour', 18),
            calendar_workdays=data.get('calendar_workdays', '1,2,3,4,5'),
            calendar_duration_minutes=data.get('calendar_duration_minutes', 60),
            use_google_meeting=data.get('use_google_meeting', False),
            temperature=data.get('temperature', 0.10)
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

@app.route('/agents/<agent_id>', methods=['PUT'])
def update_agent(agent_id):
    """Atualiza um agente IA existente"""
    try:
        agent = Agent.query.get_or_404(agent_id)
        data = request.get_json()
        
        
        # Validação dos campos obrigatórios
        required_fields = ['name', 'model', 'system_prompt']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({
                    'error': f'Campo obrigatório: {field}'
                }), 400
        
        # Validação do modelo
        if data.get('api_provider', agent.api_provider) == 'groq':
            available_models = groq_client.list_models()
            if data['model'] not in [model['id'] for model in available_models]:
                return jsonify({
                    'error': f'Modelo {data["model"]} não está disponível na Groq',
                    'available_models': [model['id'] for model in available_models]
                }), 400
        
        # Atualizar campos do agente
        agent.name = data['name']
        agent.api_provider = data.get('api_provider', agent.api_provider)
        agent.model = data['model']
        agent.system_prompt = data['system_prompt']
        agent.is_active = data.get('is_active', agent.is_active)
        agent.calendar_enabled = data.get('calendar_enabled', agent.calendar_enabled)
        agent.calendar_credentials = data.get('calendar_credentials', agent.calendar_credentials)
        agent.calendar_id = data.get('calendar_id', agent.calendar_id)
        agent.calendar_start_hour = data.get('calendar_start_hour', agent.calendar_start_hour)
        agent.calendar_end_hour = data.get('calendar_end_hour', agent.calendar_end_hour)
        agent.calendar_workdays = data.get('calendar_workdays', agent.calendar_workdays)
        agent.calendar_duration_minutes = data.get('calendar_duration_minutes', agent.calendar_duration_minutes)
        agent.use_google_meeting = data.get('use_google_meeting', agent.use_google_meeting)
        agent.temperature = data.get('temperature', agent.temperature)
        agent.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({
            'agent': agent.to_dict(),
            'status': 'success',
            'message': 'Agente atualizado com sucesso'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': f'Erro ao atualizar agente: {str(e)}'
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
        chat_history = data.get('chat_history', [])
        whatsapp = data.get('whatsapp', None)
        contact_name = data.get('contact_name', None)
        conversation_id = data.get('conversation_id', None)
        account_id = data.get('account_id', None)
        inbox_id = data.get('inbox_id', None)
        
        if not message:
            return jsonify({
                'error': 'Mensagem não fornecida'
            }), 400
        
        # Usar fluxo melhorado se calendário estiver habilitado
        if agent.calendar_enabled:
            print(f"🤖 Usando fluxo melhorado com prioridade para agendamento")
            improved_manager = ImprovedAgentManager()
            response_data = improved_manager.chat_with_agent_improved(
                agent_id,
                agent.vectorstore_path,
                message,
                agent.system_prompt,
                agent.model,
                agent.api_provider,
                agent.calendar_credentials,
                agent.calendar_id,
                chat_history,
                whatsapp,
                agent.calendar_start_hour,
                agent.calendar_end_hour,
                agent.calendar_workdays,
                agent.calendar_duration_minutes,
                agent.use_google_meeting,
                agent.temperature,
                agent.calendar_enabled,
                contact_name,
                conversation_id,
                account_id,
                inbox_id
            )
        else:
            # Usar system_prompt para conversa normal (fluxo antigo)
            print(f"🤖 Usando fluxo normal (calendário desabilitado)")
            response_data = agent_manager.chat_with_agent(
                agent_id,
                agent.vectorstore_path,
                message,
                agent.system_prompt,
                agent.model,
                agent.api_provider,
                agent.calendar_credentials,
                agent.calendar_id,
                chat_history,
                whatsapp,
                agent.calendar_start_hour,
                agent.calendar_end_hour,
                agent.calendar_workdays,
                agent.calendar_duration_minutes,
                agent.use_google_meeting,
                agent.temperature
            )
            
        # Verificar se a resposta contém dados de arquivo .ics
        response_answer = response_data['answer']
        ics_content = None
        ics_filename = None
        
        print(f"🔍 DEBUG - Processando resposta do agente:")
        print(f"   Tipo da resposta: {type(response_answer)}")
        print(f"   É dicionário: {isinstance(response_answer, dict)}")
        
        # Se a resposta é um dicionário com dados de arquivo .ics
        if isinstance(response_answer, dict) and ('message' in response_answer or 'answer' in response_answer):
            response_text = response_answer.get('message') or response_answer.get('answer')
            ics_content = response_answer.get('ics_content')
            ics_filename = response_answer.get('ics_filename')
            print(f"   ics_content: {'Sim' if ics_content else 'Não'}")
            print(f"   ics_filename: {ics_filename}")
        else:
            response_text = response_answer
            print(f"   Resposta é string simples")
        
        response_json = {
            'response': response_text,
            'agent_id': agent_id,
            'status': 'success',
            'should_transfer': response_data['should_transfer'],
            'transfer_reason': response_data['transfer_reason'],
            'has_scheduling_intent': response_data['has_scheduling_intent'],
            'scheduling_info': response_data['scheduling_info'],
            'scheduling_confidence': response_data['scheduling_confidence']
        }
        
        # Adicionar dados do arquivo .ics se disponíveis
        if ics_content and ics_filename:
            response_json['ics_content'] = ics_content
            response_json['ics_filename'] = ics_filename
        
        return jsonify(response_json)
        
    except Exception as e:
        return jsonify({
            'error': f'Erro ao processar mensagem: {str(e)}'
        }), 500

@app.route('/agents/<agent_id>/transcribe-audio', methods=['POST'])
def transcribe_audio(agent_id):
    """Transcreve um arquivo de áudio usando Groq Whisper.

    - Suporta apenas agentes com provider 'groq'
    - Requer multipart/form-data com campo 'audio_file'
    - Usa modelo whisper-large-v3-turbo
    """
    try:
        agent = Agent.query.get_or_404(agent_id)

        # Guard para providers não suportados
        if agent.api_provider != 'groq':
            return jsonify({
                'status': 'success',
                'agent_id': agent_id,
                'response': 'Esse agente não tem suporte para ouvir mensagens de áudio. Favor enviar mensagens de texto.',
                'transcription_supported': False
            })

        if 'audio_file' not in request.files:
            return jsonify({'error': 'Nenhum arquivo de áudio enviado (campo: audio_file)'}), 400

        audio_file = request.files['audio_file']
        if audio_file.filename == '':
            return jsonify({'error': 'Nenhum arquivo selecionado'}), 400

        # Validar tipo simples por extensão
        allowed_ext = ('.mp3', '.wav', '.ogg', '.m4a')
        filename = secure_filename(audio_file.filename)
        if not any(filename.lower().endswith(ext) for ext in allowed_ext):
            return jsonify({'error': 'Formato de áudio não suportado. Use mp3, wav, ogg ou m4a.'}), 400

        # Salvar temporariamente
        tmp_dir = tempfile.mkdtemp(prefix='audio_')
        tmp_path = os.path.join(tmp_dir, filename)
        audio_file.save(tmp_path)

        try:
            # Transcrever com Groq
            transcript = groq_client.transcribe_audio(
                file_path=tmp_path,
                model='whisper-large-v3-turbo',
                language='pt'
            )

            if not transcript:
                return jsonify({'error': 'Falha ao transcrever áudio'}), 500

            return jsonify({
                'status': 'success',
                'agent_id': agent_id,
                'transcript': transcript,
                'model': 'whisper-large-v3-turbo',
                'provider': 'groq'
            })
        finally:
            # Limpar arquivo temporário
            try:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass

    except Exception as e:
        return jsonify({'error': f'Erro ao transcrever áudio: {str(e)}'}), 500

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

@app.route('/agents/<agent_id>/calendar/availability', methods=['POST'])
def check_calendar_availability(agent_id):
    """Verifica disponibilidade no calendário de um agente específico"""
    try:
        agent = Agent.query.get_or_404(agent_id)
        
        if not agent.calendar_enabled:
            return jsonify({'error': 'Calendário não habilitado para este agente'}), 400
        
        if not agent.calendar_credentials:
            return jsonify({'error': 'Credenciais de calendário não configuradas'}), 400
        
        data = request.get_json()
        date = data.get('date')
        start_hour = data.get('start_hour', agent.calendar_start_hour)
        end_hour = data.get('end_hour', agent.calendar_end_hour)
        duration_minutes = data.get('duration_minutes', agent.calendar_duration_minutes)
        
        if not date:
            return jsonify({'error': 'Data não fornecida'}), 400
        
        # Converter string para datetime
        try:
            target_date = datetime.fromisoformat(date.replace('Z', ''))
        except ValueError:
            return jsonify({'error': 'Formato de data inválido'}), 400
        
        # Buscar horários disponíveis
        available_slots = agent_manager.get_available_slots(
            agent_id, agent.calendar_credentials, agent.calendar_id,
            target_date, start_hour, end_hour, duration_minutes
        )
        
        return jsonify({
            'status': 'success',
            'agent_id': agent_id,
            'date': target_date.strftime('%d/%m/%Y'),
            'available_slots': available_slots,
            'total_slots': len(available_slots)
        })
        
    except Exception as e:
        return jsonify({
            'error': f'Erro ao verificar disponibilidade: {str(e)}'
        }), 500

@app.route('/agents/<agent_id>/calendar/create-event', methods=['POST'])
def create_calendar_event(agent_id):
    """Cria um evento no calendário de um agente específico"""
    try:
        agent = Agent.query.get_or_404(agent_id)
        
        if not agent.calendar_enabled:
            return jsonify({'error': 'Calendário não habilitado para este agente'}), 400
        
        if not agent.calendar_credentials:
            return jsonify({'error': 'Credenciais de calendário não configuradas'}), 400
        
        data = request.get_json()
        
        required_fields = ['summary', 'start_datetime']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Campo obrigatório não fornecido: {field}'}), 400
        
        # Converter strings para datetime
        try:
            start_datetime = datetime.fromisoformat(data['start_datetime'].replace('Z', ''))
            end_datetime = None
            if 'end_datetime' in data:
                end_datetime = datetime.fromisoformat(data['end_datetime'].replace('Z', ''))
        except ValueError:
            return jsonify({'error': 'Formato de data/hora inválido'}), 400
        
        # Criar evento
        result = agent_manager.create_calendar_event(
            agent_id, agent.calendar_credentials, agent.calendar_id,
            summary=data['summary'],
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            description=data.get('description', ''),
            attendees=data.get('attendees', []),
            location=data.get('location', '')
        )
        
        if result['success']:
            return jsonify({
                'status': 'success',
                'agent_id': agent_id,
                'event_id': result['event_id'],
                'event_link': result['event_link'],
                'start_time': result['start_time'],
                'end_time': result['end_time'],
                'summary': result['summary']
            })
        else:
            return jsonify({
                'error': result['error']
            }), 500
            
    except Exception as e:
        return jsonify({
            'error': f'Erro ao criar evento: {str(e)}'
        }), 500

@app.route('/agents/<agent_id>/calendar/check-availability', methods=['POST'])
def check_specific_availability(agent_id):
    """Verifica disponibilidade em horário específico para um agente"""
    try:
        agent = Agent.query.get_or_404(agent_id)
        
        if not agent.calendar_enabled:
            return jsonify({'error': 'Calendário não habilitado para este agente'}), 400
        
        if not agent.calendar_credentials:
            return jsonify({'error': 'Credenciais de calendário não configuradas'}), 400
        
        data = request.get_json()
        start_datetime = data.get('start_datetime')
        end_datetime = data.get('end_datetime')
        
        if not start_datetime:
            return jsonify({'error': 'start_datetime não fornecido'}), 400
        
        # Converter strings para datetime
        try:
            start_dt = datetime.fromisoformat(start_datetime.replace('Z', ''))
            end_dt = None
            if end_datetime:
                end_dt = datetime.fromisoformat(end_datetime.replace('Z', ''))
        except ValueError:
            return jsonify({'error': 'Formato de data/hora inválido'}), 400
        
        # Verificar disponibilidade
        result = agent_manager.check_calendar_availability(
            agent_id, agent.calendar_credentials, agent.calendar_id, start_dt, end_dt
        )
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'error': f'Erro ao verificar disponibilidade: {str(e)}'
        }), 500

if __name__ == '__main__':
    # Criar diretório de dados se não existir
    data_dir = Path('/data/ia-agent-dev')
    data_dir.mkdir(parents=True, exist_ok=True)
    
    app.run(host='0.0.0.0', port=3006, debug=False)
