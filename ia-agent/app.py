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
    
    # Configurações de Calendário
    calendar_enabled = db.Column(db.Boolean, default=False)
    calendar_credentials = db.Column(db.Text, nullable=True)  # JSON das credenciais
    calendar_id = db.Column(db.String(255), nullable=True)
    calendar_start_hour = db.Column(db.Integer, default=9)
    calendar_end_hour = db.Column(db.Integer, default=18)
    calendar_workdays = db.Column(db.String(20), default='1,2,3,4,5')  # 1=segunda, 7=domingo
    calendar_duration_minutes = db.Column(db.Integer, default=60)

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
            'is_active': self.is_active,
            'calendar_enabled': self.calendar_enabled,
            'calendar_credentials': self.calendar_credentials,
            'calendar_id': self.calendar_id,
            'calendar_start_hour': self.calendar_start_hour,
            'calendar_end_hour': self.calendar_end_hour,
            'calendar_workdays': self.calendar_workdays,
            'calendar_duration_minutes': self.calendar_duration_minutes
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
            custom_system_prompt=data['custom_system_prompt'],
            calendar_enabled=data.get('calendar_enabled', False),
            calendar_credentials=data.get('calendar_credentials'),
            calendar_id=data.get('calendar_id'),
            calendar_start_hour=data.get('calendar_start_hour', 9),
            calendar_end_hour=data.get('calendar_end_hour', 18),
            calendar_workdays=data.get('calendar_workdays', '1,2,3,4,5'),
            calendar_duration_minutes=data.get('calendar_duration_minutes', 60)
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
        required_fields = ['name', 'model', 'summary_prompt', 'custom_system_prompt']
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
        agent.summary_prompt = data['summary_prompt']
        agent.custom_system_prompt = data['custom_system_prompt']
        agent.is_active = data.get('is_active', agent.is_active)
        agent.calendar_enabled = data.get('calendar_enabled', agent.calendar_enabled)
        agent.calendar_credentials = data.get('calendar_credentials', agent.calendar_credentials)
        agent.calendar_id = data.get('calendar_id', agent.calendar_id)
        agent.calendar_start_hour = data.get('calendar_start_hour', agent.calendar_start_hour)
        agent.calendar_end_hour = data.get('calendar_end_hour', agent.calendar_end_hour)
        agent.calendar_workdays = data.get('calendar_workdays', agent.calendar_workdays)
        agent.calendar_duration_minutes = data.get('calendar_duration_minutes', agent.calendar_duration_minutes)
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
            
            return jsonify({
                'response': response,
                'agent_id': agent_id,
                'status': 'success',
                'should_transfer': False,
                'transfer_reason': None
            })
        else:
            # Usar custom_system_prompt para conversa normal
            response_data = agent_manager.chat_with_agent(
                agent_id,
                agent.vectorstore_path,
                message,
                agent.custom_system_prompt,
                agent.model,
                agent.api_provider,
                agent.calendar_credentials,
                agent.calendar_id,
                chat_history,
                whatsapp,
                agent.calendar_start_hour,
                agent.calendar_end_hour,
                agent.calendar_workdays,
                agent.calendar_duration_minutes
            )
            
        # Verificar se a resposta contém dados de arquivo .ics
        response_answer = response_data['answer']
        ics_content = None
        ics_filename = None
        
        print(f"🔍 DEBUG - Processando resposta do agente:")
        print(f"   Tipo da resposta: {type(response_answer)}")
        print(f"   É dicionário: {isinstance(response_answer, dict)}")
        
        # Se a resposta é um dicionário com dados de arquivo .ics
        if isinstance(response_answer, dict) and 'message' in response_answer:
            response_text = response_answer['message']
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
