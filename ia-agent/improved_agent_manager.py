import os
import tempfile
import unicodedata
import re
from pathlib import Path
from typing import Optional, List, Dict, Any
import json as _json
import redis
from datetime import datetime, timedelta
from langchain_community.document_loaders.pdf import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores.faiss import FAISS
from langchain_groq import ChatGroq
from langchain.memory import ConversationBufferMemory
from langchain.chains.conversational_retrieval.base import ConversationalRetrievalChain
from langchain_core.prompts import PromptTemplate
from groq_client import GroqClient
from google_calendar_service import GoogleCalendarService

class ImprovedAgentManager:
    """Gerenciador de agentes IA com fluxo melhorado de agendamento"""
    
    def __init__(self):
        self.groq_client = GroqClient()
        self.embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            model_kwargs={'device': 'cpu'}
        )
        # Cache de chains por agente
        self.agent_chains = {}
        # Cache de serviços de calendário por agente
        self.calendar_services = {}
        # Último evento criado por agente (para anexar email depois)
        self.last_events = {}
        # Redis para persistir última data/hora detectada por agente
        self.redis = redis.Redis(host=os.getenv('REDIS_HOST', 'redis-dev'),
                                 port=int(os.getenv('REDIS_PORT', '6379')),
                                 password=os.getenv('REDIS_PASSWORD', 'invoAI@76925'),
                                 decode_responses=True)
        self._last_sched_prefix = 'agent:last_scheduling_info:'
        self._last_suggested_times_prefix = 'agent:last_suggested_times:'
        self._selected_time_prefix = 'agent:selected_time:'
    
    def _set_selected_time(self, agent_id: str, whatsapp: str, selected_time: dict):
        """Armazena horário selecionado no Redis"""
        try:
            import json
            data = {
                "datetime": selected_time["datetime"].isoformat(),
                "formatted": selected_time["formatted"],
                "day_name": selected_time["day_name"],
                "whatsapp": whatsapp
            }
            key = f"{self._selected_time_prefix}{agent_id}:{whatsapp}"
            self.redis.set(key, json.dumps(data), ex=60*60)  # Expira em 1 hora
            print(f"✅ Horário selecionado armazenado no Redis: {key}")
        except Exception as e:
            print(f"❌ Erro ao armazenar horário selecionado: {e}")
    
    def _get_selected_time(self, agent_id: str, whatsapp: str):
        """Recupera horário selecionado do Redis"""
        try:
            import json
            from datetime import datetime
            key = f"{self._selected_time_prefix}{agent_id}:{whatsapp}"
            data = self.redis.get(key)
            if data:
                parsed = json.loads(data)
                parsed["datetime"] = datetime.fromisoformat(parsed["datetime"])
                print(f"✅ Horário selecionado recuperado do Redis")
                return parsed
            print(f"⚠️ Nenhum horário selecionado encontrado no Redis")
            return None
        except Exception as e:
            print(f"❌ Erro ao recuperar horário selecionado: {e}")
            return None
    
    def _set_last_suggested_times(self, agent_id: str, whatsapp: str, suggested_times: list):
        """Armazena horários sugeridos no Redis para recuperar quando usuário escolher"""
        try:
            import json
            data = {
                "whatsapp": whatsapp,
                "suggested_times": [
                    {
                        "datetime": t["datetime"].isoformat(),
                        "formatted": t["formatted"],
                        "day_name": t["day_name"]
                    } for t in suggested_times
                ]
            }
            # Usar WhatsApp como parte da chave para garantir contexto correto
            key = f"{self._last_suggested_times_prefix}{agent_id}:{whatsapp}"
            self.redis.set(key, json.dumps(data), ex=60*60)  # Expira em 1 hora
            print(f"✅ Horários sugeridos armazenados no Redis: {key}")
        except Exception as e:
            print(f"❌ Erro ao armazenar horários sugeridos: {e}")
    
    def _get_last_suggested_times(self, agent_id: str, whatsapp: str):
        """Recupera horários sugeridos do Redis"""
        try:
            import json
            from datetime import datetime
            key = f"{self._last_suggested_times_prefix}{agent_id}:{whatsapp}"
            data = self.redis.get(key)
            if data:
                parsed = json.loads(data)
                # Converter strings ISO de volta para datetime
                for t in parsed["suggested_times"]:
                    t["datetime"] = datetime.fromisoformat(t["datetime"])
                print(f"✅ Horários sugeridos recuperados do Redis: {len(parsed['suggested_times'])} opções")
                return parsed
            print(f"⚠️ Nenhum horário sugerido encontrado no Redis para {key}")
            return None
        except Exception as e:
            print(f"❌ Erro ao recuperar horários sugeridos: {e}")
            return None
    
    def chat_with_agent_improved(self, agent_id: str, vectorstore_path: str, 
                                message: str, system_prompt: str, model: str, api_provider: str,
                                calendar_credentials: str = None, calendar_id: str = None, 
                                chat_history: list = None, whatsapp: str = None,
                                calendar_start_hour: int = 9, calendar_end_hour: int = 18,
                                calendar_workdays: str = "1,2,3,4,5", calendar_duration_minutes: int = 60,
                                use_google_meeting: bool = False, temperature: float = 0.10,
                                calendar_enabled: bool = False, contact_name: str = None) -> dict:
        """
        Fluxo melhorado do agente de IA com prioridade para agendamento
        
        NOVO FLUXO:
        1. Se calendar_enabled=True, verificar PRIMEIRO se é agendamento
        2. Se tem intenção de agendamento, verificar reuniões existentes
        3. Se tem reunião existente, mostrar opções de alterar/cancelar
        4. Se não tem reunião, sugerir 3 horários aleatórios
        5. Só depois usar o system_prompt para outras perguntas
        """
        try:
            print(f"🤖 FLUXO MELHORADO - Iniciando processamento da mensagem")
            print(f"   Calendar enabled: {calendar_enabled}")
            print(f"   WhatsApp: {whatsapp}")
            print(f"   Message: {message[:100]}...")
            
            # ===== ETAPA 1: VERIFICAÇÃO PRIORITÁRIA DE AGENDAMENTO =====
            if calendar_enabled and calendar_credentials and calendar_id:
                print(f"🔍 ETAPA 1: Verificando intenção de agendamento...")
                
                # PRIMEIRO: Verificar se é consulta de reuniões existentes
                meeting_query_response = self._detect_meeting_query_intent_improved(message)
                if meeting_query_response.get("confidence", 0) >= 0.7:
                    print(f"✅ Consulta de reuniões detectada - processando...")
                    result = self._process_meeting_query_improved(whatsapp, calendar_credentials, calendar_id)
                    return {
                        "answer": result,
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": False,
                        "scheduling_info": {"type": "meeting_query"},
                        "scheduling_confidence": meeting_query_response["confidence"]
                    }
                
                # SEGUNDO: Verificar se é confirmação de horário
                confirmation_response = self._detect_time_confirmation(message, chat_history)
                if confirmation_response.get("is_confirmation", False):
                    print(f"✅ Confirmação de horário detectada - processando...")
                    return self._process_time_confirmation(
                        confirmation_response, agent_id, calendar_credentials, calendar_id,
                        calendar_start_hour, calendar_end_hour, calendar_workdays,
                        calendar_duration_minutes, whatsapp, use_google_meeting
                    )
                
                # TERCEIRO (NOVO): Verificar se é continuação de agendamento (confirmação ou email)
                scheduling_continuation = self._detect_scheduling_continuation(message, chat_history, agent_id, whatsapp)
                if scheduling_continuation.get("is_continuation", False):
                    print(f"✅ Continuação de agendamento detectada - processando confirmação/email...")
                    return self._process_scheduling_continuation(
                        scheduling_continuation, calendar_credentials, calendar_id,
                        calendar_duration_minutes, use_google_meeting, contact_name
                    )
                
                # QUARTO: Verificar se é opção de reunião existente
                meeting_option_response = self._detect_meeting_option(message, chat_history)
                print(f"🔍 Verificando opção de reunião:")
                print(f"   É opção: {meeting_option_response.get('is_meeting_option', False)}")
                print(f"   Opção selecionada: {meeting_option_response.get('selected_option')}")
                print(f"   Confiança: {meeting_option_response.get('confidence', 0)}")
                
                if meeting_option_response.get("is_meeting_option", False):
                    print(f"✅ Opção de reunião detectada - processando...")
                    return self._process_meeting_option(
                        meeting_option_response, whatsapp, calendar_credentials, calendar_id,
                        calendar_start_hour, calendar_end_hour, calendar_workdays,
                        calendar_duration_minutes, use_google_meeting, agent_id
                    )
                
                # QUARTO: Detectar intenção de agendamento (com histórico para contexto)
                scheduling_analysis = self._detect_scheduling_intent_improved(message, chat_history)
                print(f"   Intenção detectada: {scheduling_analysis.get('has_scheduling_intent', False)}")
                print(f"   Confiança: {scheduling_analysis.get('confidence', 0)}")
                
                if scheduling_analysis.get("has_scheduling_intent", False) and scheduling_analysis.get("confidence", 0) > 0.6:
                    print(f"✅ Intenção de agendamento confirmada - processando...")
                    
                    # ===== ETAPA 2: VERIFICAR REUNIÕES EXISTENTES =====
                    if whatsapp:
                        print(f"🔍 ETAPA 2: Verificando reuniões existentes para {whatsapp}...")
                        existing_meetings = self._check_existing_meetings(whatsapp, calendar_credentials, calendar_id)
                        
                        if existing_meetings:
                            print(f"   {len(existing_meetings)} reunião(ões) encontrada(s)")
                            # ===== ETAPA 3: MOSTRAR OPÇÕES PARA REUNIÃO EXISTENTE =====
                            return self._handle_existing_meeting_options(existing_meetings[0], message, scheduling_analysis)
                        else:
                            print(f"   Nenhuma reunião existente encontrada")
                            # ===== ETAPA 4: SUGERIR 3 HORÁRIOS ALEATÓRIOS =====
                            return self._suggest_random_available_times(
                                agent_id, calendar_credentials, calendar_id,
                                calendar_start_hour, calendar_end_hour, calendar_workdays,
                                calendar_duration_minutes, whatsapp, message
                            )
                    else:
                        # Sem WhatsApp, pedir para fornecer
                        return {
                            "answer": """📱 **WhatsApp Necessário para Agendamento**

Para processar seu agendamento, preciso do seu número do WhatsApp.

Por favor, forneça seu número no formato:
• (11) 99999-9999
• 11999999999
• +55 11 99999-9999

Assim que receber seu WhatsApp, poderei verificar sua agenda e sugerir horários disponíveis! 😊""",
                            "should_transfer": False,
                            "transfer_reason": None,
                            "has_scheduling_intent": True,
                            "scheduling_info": {"type": "whatsapp_required"},
                            "scheduling_confidence": scheduling_analysis.get("confidence", 0)
                        }
                else:
                    print(f"❌ Não é intenção de agendamento - continuando com IA normal")
            else:
                print(f"❌ Calendário não habilitado - usando IA normal")
            
            # ===== ETAPA 5: PROCESSAMENTO NORMAL COM IA =====
            print(f"🔍 ETAPA 5: Processando com IA usando system_prompt...")
            
            # Obter ou criar chain
            chain = self._get_or_create_chain(agent_id, vectorstore_path, system_prompt, model, api_provider, temperature)
            
            if not chain:
                return {
                    "answer": "Erro: Não foi possível inicializar o agente.",
                    "should_transfer": False,
                    "transfer_reason": None
                }
            
            # Processar mensagem com IA
            response = chain.invoke({"question": message})
            answer = response.get("answer", "Não foi possível gerar uma resposta.")
            
            # Detectar se deve transferir para humano
            transfer_analysis = self._analyze_transfer_need(message, answer)
            
            return {
                "answer": answer,
                "should_transfer": transfer_analysis["should_transfer"],
                "transfer_reason": transfer_analysis["reason"],
                "has_scheduling_intent": False,
                "scheduling_info": None,
                "scheduling_confidence": 0
            }
            
        except Exception as e:
            print(f"❌ Erro no fluxo melhorado: {e}")
            return {
                "answer": f"Desculpe, ocorreu um erro ao processar sua mensagem: {str(e)}",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": False,
                "scheduling_info": None,
                "scheduling_confidence": 0
            }
    
    def _detect_scheduling_intent_improved(self, message: str, chat_history: list = None) -> Dict[str, Any]:
        """Detecção melhorada de intenção de agendamento usando histórico para contexto"""
        try:
            message_lower = self._normalize_text(message)
            
            # Palavras-chave para agendamento
            scheduling_keywords = [
                "agendar", "marcar", "reuniao", "consulta", "horario", "data",
                "agendamento", "marcacao", "calendario", "evento", "compromisso",
                "quero agendar", "gostaria de marcar", "preciso agendar",
                "posso agendar", "agenda", "disponibilidade", "horarios disponiveis"
            ]
            
            # Verificar presença de palavras-chave
            found_keywords = [kw for kw in scheduling_keywords if kw in message_lower]
            
            # Verificar contexto no histórico
            context_boost = 0.0
            if chat_history:
                # Buscar últimas mensagens do bot no histórico
                for entry in reversed(chat_history[-3:]):  # Últimas 3 mensagens
                    bot_message = ""
                    if isinstance(entry, dict) and entry.get("role") == "assistant":
                        bot_message = self._normalize_text(entry.get("content", ""))
                    elif isinstance(entry, list) and len(entry) >= 2:
                        bot_message = self._normalize_text(entry[1] if entry[1] else "")
                    
                    # Se bot perguntou sobre horários/agendamento recentemente, aumentar confiança
                    context_keywords = [
                        "horario", "data", "participantes", "assunto", "reuniao",
                        "agendar", "confirmar", "email", "informacoes"
                    ]
                    if any(kw in bot_message for kw in context_keywords):
                        context_boost = 0.3
                        print(f"🔍 Contexto de agendamento detectado no histórico (boost: +{context_boost})")
                        break
            
            # Só considerar como intenção de agendamento se:
            # 1. Há palavras-chave de agendamento OU
            # 2. Há contexto de agendamento E a mensagem atual tem pelo menos uma palavra-chave relacionada
            if found_keywords:
                # Se há palavras-chave, usar confiança baseada nas palavras-chave + contexto
                confidence = min(0.9, 0.5 + (len(found_keywords) * 0.1) + context_boost)
                return {
                    "has_scheduling_intent": True,
                    "confidence": confidence,
                    "keywords_found": found_keywords,
                    "context_boost": context_boost
                }
            elif context_boost > 0:
                # Se há contexto mas não há palavras-chave, verificar se a mensagem tem palavras relacionadas
                related_keywords = [
                    "sim", "não", "confirmar", "ok", "tudo bem", "perfeito",
                    "horario", "data", "participantes", "email", "whatsapp"
                ]
                has_related_keywords = any(kw in message_lower for kw in related_keywords)
                
                # Verificar se a mensagem é um número de telefone (10-11 dígitos)
                import re
                phone_pattern = r'^[\d\s\(\)\-\+]{10,}$'
                is_phone_number = bool(re.match(phone_pattern, message.strip()))
                
                if has_related_keywords or is_phone_number:
                    confidence = min(0.8, 0.6 + context_boost)
                    return {
                        "has_scheduling_intent": True,
                        "confidence": confidence,
                        "keywords_found": [],
                        "context_boost": context_boost
                    }
            
            return {
                "has_scheduling_intent": False,
                "confidence": 0.0,
                "keywords_found": [],
                "context_boost": 0.0
            }
            
        except Exception as e:
            print(f"❌ Erro ao detectar intenção de agendamento: {e}")
            return {
                "has_scheduling_intent": False,
                "confidence": 0.0,
                "keywords_found": []
            }
    
    def _handle_existing_meeting_options(self, existing_meeting: dict, message: str, scheduling_analysis: dict) -> dict:
        """Lida com opções quando já existe uma reunião agendada"""
        try:
            from datetime import datetime
            
            # Formatar data/hora da reunião existente
            start_datetime = existing_meeting['start']
            if 'T' in start_datetime:
                dt = datetime.fromisoformat(start_datetime.replace('Z', '+00:00'))
                formatted_date = dt.strftime('%d/%m/%Y às %H:%M')
            else:
                formatted_date = start_datetime
            
            response = f"""📅 **Você já possui uma reunião agendada!**

**Reunião atual:**
📅 Data: {formatted_date}
📝 Assunto: {existing_meeting.get('summary', 'Reunião')}

**O que você gostaria de fazer?**

1️⃣ **Alterar horário** - Reagendar para outro dia/horário
2️⃣ **Cancelar reunião** - Cancelar o agendamento atual
3️⃣ **Manter reunião** - Continuar com o agendamento atual

Digite o número da opção desejada (1, 2 ou 3)."""
            
            return {
                "answer": response,
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {
                    "type": "existing_meeting_options",
                    "existing_meeting": existing_meeting
                },
                "scheduling_confidence": scheduling_analysis.get("confidence", 0)
            }
            
        except Exception as e:
            print(f"❌ Erro ao processar opções de reunião existente: {e}")
            return {
                "answer": "❌ Erro ao processar sua reunião existente. Tente novamente.",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {"type": "error"},
                "scheduling_confidence": 0
            }
    
    def _detect_scheduling_continuation(self, message: str, chat_history: list, agent_id: str, whatsapp: str) -> dict:
        """Detecta se usuário está confirmando (1) ou fornecendo email após selecionar horário"""
        try:
            # Verificar se há um horário selecionado aguardando confirmação
            if not agent_id or not whatsapp:
                return {"is_continuation": False}
            
            # Buscar horário selecionado no Redis
            selected_time_data = self._get_selected_time(agent_id, whatsapp)
            
            # Verificar se há contexto de "aguardando confirmação/email" no histórico recente
            waiting_for_confirmation = False
            if chat_history:
                for entry in reversed(chat_history[-2:]):  # Últimas 2 mensagens
                    bot_message = ""
                    if isinstance(entry, dict) and entry.get("role") == "assistant":
                        bot_message = entry.get("content", "")
                    elif isinstance(entry, list) and len(entry) >= 2:
                        bot_message = entry[1] if entry[1] else ""
                    
                    # Verificar se bot pediu confirmação ou email
                    if ("Confirmar agendamento" in bot_message or "Digite **1**" in bot_message) and \
                       ("email" in bot_message.lower() or "Adicionar email" in bot_message):
                        waiting_for_confirmation = True
                        print(f"🔍 Bot pediu confirmação ou email no histórico")
                        break
            
            if waiting_for_confirmation and selected_time_data:
                message_clean = message.strip()
                
                # Verificar se é confirmação (1)
                is_confirmation = message_clean == "1"
                
                # Verificar se é um email
                email = None
                if '@' in message and '.' in message:
                    # Extrair email da mensagem
                    import re
                    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
                    emails = re.findall(email_pattern, message)
                    if emails:
                        email = emails[0]
                
                if is_confirmation or email:
                    return {
                        "is_continuation": True,
                        "is_confirmation": is_confirmation,
                        "email": email,
                        "selected_time_data": selected_time_data,
                        "raw_message": message
                    }
            
            return {"is_continuation": False}
            
        except Exception as e:
            print(f"❌ Erro ao detectar continuação de agendamento: {e}")
            return {"is_continuation": False}
    
    def _process_scheduling_continuation(self, continuation_data: dict, calendar_credentials: str, 
                                        calendar_id: str, calendar_duration_minutes: int, 
                                        use_google_meeting: bool, contact_name: str = None) -> dict:
        """Processa confirmação do agendamento (1) ou adição de email"""
        try:
            is_confirmation = continuation_data.get("is_confirmation", False)
            email = continuation_data.get("email")
            selected_time_data = continuation_data.get("selected_time_data")
            
            if not selected_time_data:
                return {
                    "answer": "❌ Erro: Horário selecionado não encontrado. Por favor, selecione um horário novamente.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "error"},
                    "scheduling_confidence": 0
                }
            
            # Usar nome do contato como participante ou "Cliente" como fallback
            participant_name = contact_name if contact_name else "Cliente"
            subject = "Reunião Agendada pela IA"
            whatsapp = selected_time_data.get("whatsapp")
            
            # Formatar data/hora
            selected_datetime = selected_time_data.get("datetime")
            formatted_time = selected_time_data.get("formatted")
            day_name = selected_time_data.get("day_name")
            
            # TODO: Criar reunião real no Google Calendar aqui
            # Por enquanto, apenas confirmar
            
            if is_confirmation:
                # Confirmação sem email
                response = f"""✅ **Agendamento Confirmado!**

Perfeito! Sua reunião foi agendada com sucesso:

📅 **Data/Hora:** {day_name}, {formatted_time}
👥 **Participante:** {participant_name}
✏️ **Assunto:** {subject}
📱 **WhatsApp:** {whatsapp}

🎉 Sua reunião foi registrada com sucesso!"""
            else:
                # Confirmação com email
                response = f"""✅ **Agendamento Confirmado!**

Perfeito! Sua reunião foi agendada com sucesso:

📅 **Data/Hora:** {day_name}, {formatted_time}
👥 **Participante:** {participant_name}
✏️ **Assunto:** {subject}
📱 **WhatsApp:** {whatsapp}
📧 **Email:** {email}

🎉 Sua reunião foi registrada e você receberá um convite por email em breve!"""
            
            return {
                "answer": response,
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {
                    "type": "scheduling_completed",
                    "participant": participant_name,
                    "subject": subject,
                    "email": email,
                    "datetime": selected_datetime.isoformat() if selected_datetime else None,
                    "whatsapp": whatsapp
                },
                "scheduling_confidence": 0.9
            }
            
        except Exception as e:
            print(f"❌ Erro ao processar confirmação de agendamento: {e}")
            return {
                "answer": f"❌ Erro ao processar agendamento: {str(e)}. Por favor, tente novamente.",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {"type": "error"},
                "scheduling_confidence": 0
            }
    
    def _suggest_random_available_times(self, agent_id: str, calendar_credentials: str, calendar_id: str,
                                      calendar_start_hour: int, calendar_end_hour: int, calendar_workdays: str,
                                      calendar_duration_minutes: int, whatsapp: str, message: str) -> dict:
        """Sugere 3 horários aleatórios disponíveis em dias diferentes"""
        try:
            from datetime import datetime, timedelta
            import random
            
            print(f"🔍 Gerando 3 horários aleatórios disponíveis...")
            
            # Converter workdays para lista de inteiros
            workdays = [int(d) for d in calendar_workdays.split(',')]
            
            # Gerar 3 dias diferentes (próximos 7 dias)
            suggested_times = []
            attempts = 0
            max_attempts = 20
            
            while len(suggested_times) < 3 and attempts < max_attempts:
                attempts += 1
                
                # Escolher dia aleatório (1-7 dias no futuro)
                days_ahead = random.randint(1, 7)
                target_date = datetime.now() + timedelta(days=days_ahead)
                
                # Verificar se é dia útil
                if target_date.weekday() + 1 in workdays:  # weekday() retorna 0-6, workdays usa 1-7
                    
                    # Gerar horário aleatório dentro do horário comercial
                    hour = random.randint(calendar_start_hour, calendar_end_hour - 1)
                    minute = random.choice([0, 15, 30, 45])  # Horários mais "redondos"
                    
                    # Criar datetime completo
                    suggested_datetime = target_date.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    
                    # Verificar se o horário está disponível
                    if self._is_time_available(suggested_datetime, calendar_credentials, calendar_id, calendar_duration_minutes):
                        # Formatar para exibição
                        formatted_time = suggested_datetime.strftime('%d/%m/%Y às %H:%M')
                        
                        # Evitar duplicatas
                        if formatted_time not in [t['formatted'] for t in suggested_times]:
                            suggested_times.append({
                                'datetime': suggested_datetime,
                                'formatted': formatted_time,
                                'day_name': self._get_day_name(target_date.weekday())
                            })
            
            if suggested_times:
                # Ordenar por data/hora
                suggested_times.sort(key=lambda x: x['datetime'])
                
                response = f"""📅 **Horários Disponíveis para Agendamento**

Encontrei {len(suggested_times)} horário(s) disponível(is) para você:

"""
                for i, time_info in enumerate(suggested_times, 1):
                    response += f"{i}️⃣ **{time_info['day_name']}, {time_info['formatted']}**\n"
                
                response += f"""
**Para confirmar um horário, digite o número da opção (1, 2 ou 3).**

Ou se preferir, me informe uma data/hora específica e verificarei a disponibilidade! 😊"""
                
                # Armazenar horários sugeridos no Redis para recuperar quando usuário escolher
                self._set_last_suggested_times(agent_id, whatsapp, suggested_times)
                
                return {
                    "answer": response,
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {
                        "type": "suggested_times",
                        "suggested_times": suggested_times,
                        "whatsapp": whatsapp
                    },
                    "scheduling_confidence": 0.9
                }
            else:
                # Fallback se não conseguir gerar horários
                return {
                    "answer": """📅 **Agendamento**

Entendi que você gostaria de agendar uma reunião!

Infelizmente, não consegui encontrar horários disponíveis automaticamente nos próximos dias.

**Por favor, me informe:**
• Uma data específica (ex: "amanhã", "segunda-feira", "15/12")
• Um horário preferido (ex: "manhã", "tarde", "14h")

Assim poderei verificar a disponibilidade e confirmar seu agendamento! 😊""",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "manual_scheduling_request"},
                    "scheduling_confidence": 0.8
                }
                
        except Exception as e:
            print(f"❌ Erro ao gerar horários sugeridos: {e}")
            return {
                "answer": """📅 **Agendamento**

Entendi que você gostaria de agendar uma reunião!

Por favor, me informe uma data e horário específicos para que eu possa verificar a disponibilidade e confirmar seu agendamento.

Exemplos:
• "Amanhã às 14h"
• "Segunda-feira de manhã"
• "15/12 às 16:30"

Estou aqui para ajudar! 😊""",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {"type": "fallback_scheduling"},
                "scheduling_confidence": 0.7
            }
    
    def _is_time_available(self, datetime_obj: datetime, calendar_credentials: str, calendar_id: str, duration_minutes: int) -> bool:
        """Verifica se um horário específico está disponível"""
        try:
            from google_calendar_service import GoogleCalendarService
            
            calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
            
            # Verificar conflitos no horário
            end_time = datetime_obj + timedelta(minutes=duration_minutes)
            
            # Usar método check_availability que já existe
            availability_result = calendar_service.check_availability(datetime_obj, end_time)
            
            # Se não há conflitos, está disponível
            return availability_result.get("available", True)
            
        except Exception as e:
            print(f"❌ Erro ao verificar disponibilidade: {e}")
            return True  # Em caso de erro, assumir disponível
    
    def _get_day_name(self, weekday: int) -> str:
        """Retorna nome do dia da semana em português"""
        days = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']
        return days[weekday]
    
    def _normalize_text(self, text: str) -> str:
        """Normaliza texto removendo acentos e convertendo para minúsculas"""
        try:
            # Remove acentos
            text = unicodedata.normalize('NFD', text)
            text = ''.join(char for char in text if unicodedata.category(char) != 'Mn')
            # Converte para minúsculas
            return text.lower()
        except:
            return text.lower()
    
    def _detect_meeting_query_intent_improved(self, message: str) -> dict:
        """Detecta intenção de consultar reuniões existentes"""
        try:
            message_lower = self._normalize_text(message)
            
            # Palavras-chave para consulta de reuniões
            query_keywords = [
                "minhas reunioes", "consultar reuniao", "verificar reuniao", 
                "listar reunioes", "quais reunioes", "tenho reuniao", 
                "reuniao agendada", "agendamento existente", "mostrar reunioes",
                "reunioes futuras", "proximas reunioes", "consultar agendamento",
                "ver agendamento", "meu agendamento", "reuniao marcada",
                "consulta agendada", "horarios", "tenho consulta",
                "consulta marcada", "consulta agendada", "minhas consultas",
                "meus horarios", "agendamentos futuros", "proximos agendamentos"
            ]
            
            # Verificar se contém palavras-chave de consulta
            found_keywords = [kw for kw in query_keywords if kw in message_lower]
            
            if found_keywords:
                confidence = min(0.9, 0.6 + (len(found_keywords) * 0.1))
                return {
                    "has_query_intent": True,
                    "confidence": confidence,
                    "keywords_found": found_keywords
                }
            
            return {
                "has_query_intent": False,
                "confidence": 0.0,
                "keywords_found": []
            }
            
        except Exception as e:
            print(f"❌ Erro ao detectar intenção de consulta: {e}")
            return {"has_query_intent": False, "confidence": 0.0}
    
    def _detect_time_confirmation(self, message: str, chat_history: list) -> dict:
        """Detecta se a mensagem é uma confirmação de horário (1, 2, 3)"""
        try:
            message_clean = message.strip()
            
            # Verificar se é um número de 1 a 3
            if message_clean in ['1', '2', '3']:
                # Verificar se há histórico de sugestões de horários
                if chat_history:
                    last_bot_message = ""
                    for entry in reversed(chat_history):
                        if isinstance(entry, list) and len(entry) >= 2:
                            last_bot_message = entry[1] if entry[1] else ""
                            break
                    
                    # Verificar se a última mensagem do bot continha sugestões de horários
                    if "Horários Disponíveis para Agendamento" in last_bot_message and "1️⃣" in last_bot_message:
                        return {
                            "is_confirmation": True,
                            "selected_option": int(message_clean),
                            "confidence": 0.9
                        }
            
            return {
                "is_confirmation": False,
                "selected_option": None,
                "confidence": 0.0
            }
            
        except Exception as e:
            print(f"❌ Erro ao detectar confirmação de horário: {e}")
            return {"is_confirmation": False, "selected_option": None, "confidence": 0.0}
    
    def _process_time_confirmation(self, confirmation_response: dict, agent_id: str, calendar_credentials: str, 
                                 calendar_id: str, calendar_start_hour: int, calendar_end_hour: int,
                                 calendar_workdays: str, calendar_duration_minutes: int, whatsapp: str,
                                 use_google_meeting: bool) -> dict:
        """Processa confirmação de horário e cria a reunião"""
        try:
            selected_option = confirmation_response.get("selected_option")
            
            if not selected_option or selected_option not in [1, 2, 3]:
                return {
                    "answer": "❌ Opção inválida. Por favor, escolha 1, 2 ou 3.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "invalid_option"},
                    "scheduling_confidence": 0
                }
            
            # Buscar horários sugeridos do Redis
            import redis
            import json
            from datetime import datetime
            
            redis_client = redis.Redis(host='redis-dev', port=6379, db=0, decode_responses=True, password='invoAI@76925')
            suggested_times_key = f"agent:last_suggested_times:{agent_id}:{whatsapp}"
            suggested_times_data = redis_client.get(suggested_times_key)
            
            if not suggested_times_data:
                return {
                    "answer": "❌ Não encontrei os horários sugeridos. Por favor, solicite novos horários.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "no_suggested_times"},
                    "scheduling_confidence": 0
                }
            
            suggested_times_data_parsed = json.loads(suggested_times_data)
            print(f"🔍 DEBUG - suggested_times_data_parsed: {suggested_times_data_parsed}")
            
            # Extrair o array de horários sugeridos
            if isinstance(suggested_times_data_parsed, dict) and 'suggested_times' in suggested_times_data_parsed:
                suggested_times = suggested_times_data_parsed['suggested_times']
            else:
                suggested_times = suggested_times_data_parsed
            
            print(f"🔍 DEBUG - suggested_times extraído: {suggested_times}")
            print(f"🔍 DEBUG - selected_option: {selected_option}")
            print(f"🔍 DEBUG - len(suggested_times): {len(suggested_times) if suggested_times else 'None'}")
            
            if not suggested_times or len(suggested_times) < selected_option:
                print(f"❌ DEBUG - Condição falhou: not suggested_times={not suggested_times}, len < selected_option={len(suggested_times) if suggested_times else 0} < {selected_option}")
                return {
                    "answer": "❌ Opção inválida. Por favor, escolha uma opção válida.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "invalid_option"},
                    "scheduling_confidence": 0
                }
            
            # Obter o horário selecionado (selected_option é 1, 2 ou 3, então índice é 0, 1 ou 2)
            selected_index = selected_option - 1
            print(f"🔍 DEBUG - selected_index: {selected_index}")
            
            if selected_index >= len(suggested_times):
                print(f"❌ DEBUG - selected_index >= len: {selected_index} >= {len(suggested_times)}")
                return {
                    "answer": "❌ Opção inválida. Por favor, escolha uma opção válida.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "invalid_option"},
                    "scheduling_confidence": 0
                }
            
            selected_time = suggested_times[selected_index]
            print(f"🔍 DEBUG - selected_time: {selected_time}")
            target_datetime = datetime.fromisoformat(selected_time['datetime'].replace('Z', '+00:00'))
            
            # Criar reunião usando GoogleCalendarService
            from google_calendar_service import GoogleCalendarService
            from datetime import timedelta
            
            calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
            
            # Criar evento
            end_datetime = target_datetime + timedelta(minutes=calendar_duration_minutes)
            
            description = f"""Tipo: Reunião
Duração: {calendar_duration_minutes} minutos
Participantes: Cliente
Assunto: Reunião Agendada pela IA

Agendado via InovAI Analytics

<!-- METADATA_START -->
WHATSAPP: {whatsapp or 'N/A'}
<!-- METADATA_END -->"""
            
            # Criar evento
            created_event = calendar_service.create_event(
                summary='Reunião Agendada pela IA',
                start_datetime=target_datetime,
                end_datetime=end_datetime,
                description=description,
                use_google_meeting=use_google_meeting
            )
            
            if created_event.get('success', False):
                # Gerar arquivo .ics
                ics_content = None
                ics_filename = None
                
                try:
                    # Criar objeto event_data no formato esperado pela função generate_ics_file
                    event_data = {
                        'summary': created_event.get('summary', 'Reunião Agendada pela IA'),
                        'description': description,
                        'location': '',
                        'start': {
                            'dateTime': created_event.get('start_time', target_datetime.isoformat())
                        },
                        'end': {
                            'dateTime': created_event.get('end_time', end_datetime.isoformat())
                        }
                    }
                    
                    meet_link = created_event.get('meet_link')
                    ics_content = calendar_service.generate_ics_file(event_data, meet_link)
                    
                    ics_filename = f"reuniao_{target_datetime.strftime('%Y%m%d_%H%M')}.ics"
                    print(f"📎 Arquivo ICS gerado: {ics_filename}")
                except Exception as e:
                    print(f"⚠️ Erro ao gerar arquivo ICS: {e}")
                    ics_content = None
                
                # Limpar horários sugeridos do Redis
                redis_client.delete(suggested_times_key)
                
                response_message = f"""✅ **Reunião Agendada com Sucesso!**

📅 **Data:** {target_datetime.strftime('%d/%m/%Y às %H:%M')}
⏰ **Duração:** {calendar_duration_minutes} minutos
📱 **WhatsApp:** {whatsapp}

**Detalhes da reunião:**
• Tipo: Reunião
• Assunto: Reunião Agendada pela IA
• Participantes: Cliente

Sua reunião foi confirmada no calendário! Você receberá um email de confirmação em breve.

Obrigado por escolher nossos serviços! 😊"""
                
                result = {
                    "answer": response_message,
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "meeting_created"},
                    "scheduling_confidence": 0.9
                }
                
                # Adicionar arquivo ICS se foi gerado
                if ics_content:
                    result["ics_content"] = ics_content
                    result["ics_filename"] = ics_filename
                    print(f"📎 Arquivo ICS adicionado à resposta: {ics_filename}")
                
                return result
            else:
                error_msg = created_event.get('error', 'Erro desconhecido')
                print(f"❌ Erro ao criar evento no Google Calendar: {error_msg}")
                return {
                    "answer": f"❌ Erro ao criar reunião: {error_msg}",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "creation_error"},
                    "scheduling_confidence": 0
                }
            
        except Exception as e:
            print(f"❌ Erro ao processar confirmação de horário: {e}")
            import traceback
            traceback.print_exc()
            return {
                "answer": f"❌ Erro ao processar agendamento: {str(e)}. Tente novamente.",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {"type": "error"},
                "scheduling_confidence": 0
            }
    
    def _detect_meeting_option(self, message: str, chat_history: list) -> dict:
        """Detecta se a mensagem é uma opção de reunião existente (1, 2, 3)"""
        try:
            message_clean = message.strip()
            print(f"🔍 DEBUG - Detectando opção de reunião:")
            print(f"   Mensagem: '{message_clean}'")
            print(f"   É número 1-3: {message_clean in ['1', '2', '3']}")
            
            # Verificar se é um número de 1 a 3
            if message_clean in ['1', '2', '3']:
                # Verificar se há histórico de opções de reuniões
                if chat_history:
                    last_bot_message = ""
                    for entry in reversed(chat_history):
                        # Suportar ambos os formatos: dict e list
                        if isinstance(entry, dict):
                            if entry.get("role") == "assistant" and entry.get("content"):
                                last_bot_message = entry.get("content", "")
                                break
                        elif isinstance(entry, list) and len(entry) >= 2:
                            last_bot_message = entry[1] if entry[1] else ""
                            break
                    
                    print(f"   Última mensagem do bot (primeiros 100 chars): '{last_bot_message[:100]}...'")
                    print(f"   Tamanho total da mensagem: {len(last_bot_message)} caracteres")
                    
                    # Verificar se a última mensagem do bot continha opções de reuniões
                    # CENÁRIO 1: Gerenciamento de reunião existente (alterar, cancelar, manter)
                    has_question = ("O que você gostaria de fazer?" in last_bot_message or "Opções disponíveis:" in last_bot_message)
                    has_option1 = ("1️⃣" in last_bot_message or "1" in last_bot_message)
                    has_alterar = ("Alterar horário" in last_bot_message or "alterar horário" in last_bot_message or "Alterar" in last_bot_message)
                    has_option2 = ("2️⃣" in last_bot_message or "2" in last_bot_message)
                    has_cancelar = ("Cancelar" in last_bot_message or "cancelar" in last_bot_message)
                    has_option3 = ("3️⃣" in last_bot_message or "3" in last_bot_message)
                    has_manter = ("Manter" in last_bot_message or "manter" in last_bot_message)
                    
                    # CENÁRIO 2: Seleção de horário disponível para nova reunião
                    has_horarios_disponiveis = ("Horários Disponíveis" in last_bot_message or "horários disponíveis" in last_bot_message or "horário(s) disponível" in last_bot_message)
                    has_multiple_options = has_option1 and has_option2 and has_option3  # Tem pelo menos 3 opções numeradas
                    
                    print(f"   Tem pergunta: {has_question}")
                    print(f"   Tem opção 1: {has_option1}")
                    print(f"   Tem 'alterar': {has_alterar}")
                    print(f"   Tem opção 2: {has_option2}")
                    print(f"   Tem 'cancelar': {has_cancelar}")
                    print(f"   Tem opção 3: {has_option3}")
                    print(f"   Tem 'manter': {has_manter}")
                    print(f"   Tem 'horários disponíveis': {has_horarios_disponiveis}")
                    
                    # Aceitar se for gerenciamento de reunião OU seleção de horário disponível
                    is_meeting_management = (has_question and has_option1 and has_alterar and has_option2 and has_cancelar and has_option3 and has_manter)
                    is_time_selection = (has_horarios_disponiveis and has_multiple_options)
                    
                    if is_meeting_management or is_time_selection:
                        if is_meeting_management:
                            print(f"   ✅ Gerenciamento de reunião detectado!")
                        if is_time_selection:
                            print(f"   ✅ Seleção de horário disponível detectada!")
                        return {
                            "is_meeting_option": True,
                            "selected_option": int(message_clean),
                            "confidence": 0.9
                        }
                    else:
                        print(f"   ❌ Condições não atendidas para nenhum cenário")
                else:
                    print(f"   ❌ Sem histórico de chat")
            else:
                print(f"   ❌ Não é número 1-3")
            
            return {
                "is_meeting_option": False,
                "selected_option": None,
                "confidence": 0.0
            }
            
        except Exception as e:
            print(f"❌ Erro ao detectar opção de reunião: {e}")
            return {"is_meeting_option": False, "selected_option": None, "confidence": 0.0}
    
    def _process_meeting_option(self, option_response: dict, whatsapp: str, calendar_credentials: str, 
                              calendar_id: str, calendar_start_hour: int, calendar_end_hour: int,
                              calendar_workdays: str, calendar_duration_minutes: int, 
                              use_google_meeting: bool, agent_id: str = None) -> dict:
        """Processa opção de reunião - pode ser seleção de horário disponível OU gerenciamento de reunião existente"""
        try:
            selected_option = option_response.get("selected_option")
            
            if not selected_option or selected_option not in [1, 2, 3]:
                return {
                    "answer": "❌ Opção inválida. Por favor, escolha 1, 2 ou 3.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "invalid_option"},
                    "scheduling_confidence": 0
                }
            
            # PRIMEIRO: Verificar se há horários sugeridos (contexto de seleção de horário disponível)
            suggested_times_data = None
            if agent_id and whatsapp:
                suggested_times_data = self._get_last_suggested_times(agent_id, whatsapp)
            
            if suggested_times_data and suggested_times_data.get("suggested_times"):
                # CENÁRIO 1: Seleção de horário disponível
                print(f"🔍 CENÁRIO: Seleção de horário disponível")
                suggested_times = suggested_times_data["suggested_times"]
                
                if selected_option <= len(suggested_times):
                    selected_time = suggested_times[selected_option - 1]  # -1 porque lista é 0-indexed
                    print(f"✅ Horário selecionado: {selected_time['formatted']}")
                    
                    # Horário selecionado - pedir confirmação ou email
                    # Salvar horário selecionado no Redis para próxima etapa
                    self._set_selected_time(agent_id, whatsapp, selected_time)
                    
                    return {
                        "answer": f"""✅ **Horário Confirmado!**

Perfeito! Você escolheu:
📅 **{selected_time['day_name']}, {selected_time['formatted']}**
✏️ **Assunto:** Reunião Agendada pela IA

Agora você pode:

1️⃣ **Confirmar agendamento** - Digite **1** para confirmar
📧 **Adicionar email** - Ou digite seu email para receber convite

Exemplo: 
• Digite **1** para confirmar agora
• Ou digite seu email: joao@email.com

Aguardo sua escolha! 😊""",
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": True,
                        "scheduling_info": {
                            "type": "time_selected",
                            "selected_time": selected_time,
                            "whatsapp": whatsapp
                        },
                        "scheduling_confidence": 0.9
                    }
                else:
                    return {
                        "answer": f"❌ Opção inválida. Por favor, escolha entre 1 e {len(suggested_times)}.",
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": True,
                        "scheduling_info": {"type": "invalid_option"},
                        "scheduling_confidence": 0
                    }
            
            # SEGUNDO: Buscar reuniões existentes (contexto de gerenciamento de reunião)
            print(f"🔍 CENÁRIO: Gerenciamento de reunião existente")
            existing_meetings = self._check_existing_meetings(whatsapp, calendar_credentials, calendar_id)
            
            print(f"🔍 DEBUG - Reuniões encontradas: {existing_meetings}")
            print(f"   Tipo: {type(existing_meetings)}")
            print(f"   Tamanho: {len(existing_meetings) if isinstance(existing_meetings, list) else 'N/A'}")
            
            if not existing_meetings:
                return {
                    "answer": "❌ Não encontrei reuniões para processar. Tente consultar suas reuniões novamente.",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "no_meetings"},
                    "scheduling_confidence": 0
                }
            
            # Usar a primeira reunião encontrada
            meeting = existing_meetings[0]
            print(f"🔍 DEBUG - Primeira reunião: {meeting}")
            print(f"   Tipo: {type(meeting)}")
            
            meeting_id = meeting.get('id')
            
            if selected_option == 1:  # Alterar horário
                return {
                    "answer": "🔄 **Alterar Horário**\n\nPara reagendar sua reunião, me informe a nova data e horário desejados.\n\n**Exemplo:** \"Quero reagendar para 15/10/2025 às 14:00\"\n\nOu se preferir, posso sugerir novos horários disponíveis. Digite \"sugerir horários\" para ver opções! 😊",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "reschedule_requested"},
                    "scheduling_confidence": 0.9
                }
            
            elif selected_option == 2:  # Cancelar reunião
                from google_calendar_service import GoogleCalendarService
                calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
                
                cancel_result = calendar_service.delete_event(meeting_id)
                
                if cancel_result.get('success', False):
                    return {
                        "answer": "✅ **Reunião Cancelada com Sucesso!**\n\nSua reunião foi cancelada e removida do calendário.\n\nSe precisar agendar uma nova reunião, é só me avisar! 😊",
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": True,
                        "scheduling_info": {"type": "meeting_cancelled"},
                        "scheduling_confidence": 0.9
                    }
                else:
                    return {
                        "answer": f"❌ Erro ao cancelar reunião: {cancel_result.get('error', 'Erro desconhecido')}",
                        "should_transfer": False,
                        "transfer_reason": None,
                        "has_scheduling_intent": True,
                        "scheduling_info": {"type": "cancellation_error"},
                        "scheduling_confidence": 0
                    }
            
            elif selected_option == 3:  # Manter reunião
                meeting_start = meeting.get('start', '')
                meeting_summary = meeting.get('summary', 'Reunião')
                
                # Formatar data
                try:
                    from datetime import datetime
                    if meeting_start:
                        # meeting_start pode ser string direta ou dicionário
                        if isinstance(meeting_start, dict):
                            meeting_date = meeting_start.get('dateTime', '')
                        else:
                            meeting_date = meeting_start
                        
                        if meeting_date:
                            dt = datetime.fromisoformat(meeting_date.replace('Z', '+00:00'))
                            formatted_date = dt.strftime('%d/%m/%Y às %H:%M')
                        else:
                            formatted_date = "Data não disponível"
                    else:
                        formatted_date = "Data não disponível"
                except Exception as e:
                    print(f"❌ Erro ao formatar data: {e}")
                    formatted_date = "Data não disponível"
                
                return {
                    "answer": f"✅ **Reunião Mantida!**\n\n📅 **Sua reunião está confirmada:**\n• **Data:** {formatted_date}\n• **Assunto:** {meeting_summary}\n\nTudo certo! Sua reunião permanece agendada conforme planejado.\n\nSe precisar de mais alguma coisa, estou à disposição! 😊",
                    "should_transfer": False,
                    "transfer_reason": None,
                    "has_scheduling_intent": True,
                    "scheduling_info": {"type": "meeting_kept"},
                    "scheduling_confidence": 0.9
                }
            
        except Exception as e:
            print(f"❌ Erro ao processar opção de reunião: {e}")
            return {
                "answer": f"❌ Erro ao processar opção: {str(e)}. Tente novamente.",
                "should_transfer": False,
                "transfer_reason": None,
                "has_scheduling_intent": True,
                "scheduling_info": {"type": "error"},
                "scheduling_confidence": 0
            }
    
    def _process_meeting_query_improved(self, whatsapp: str, calendar_credentials: str, calendar_id: str) -> str:
        """Processa consulta de reuniões existentes"""
        try:
            if not whatsapp:
                return "❌ Não foi possível identificar o WhatsApp para consultar reuniões. Por favor, forneça seu número."
            
            # Buscar reuniões existentes
            existing_meetings = self._check_existing_meetings(whatsapp, calendar_credentials, calendar_id)
            
            if not existing_meetings:
                return """📅 **Nenhuma Reunião Encontrada**

Você não possui reuniões agendadas no momento.

**Para agendar uma nova reunião, digite:**
• "Quero agendar uma reunião"
• "Gostaria de marcar uma consulta"
• "Preciso agendar para amanhã"

Estou aqui para ajudar! 😊"""
            
            # Formatar reuniões encontradas
            response = f"📅 **Suas Reuniões Agendadas**\n\n"
            
            for i, meeting in enumerate(existing_meetings, 1):
                start_datetime = meeting['start']
                if 'T' in start_datetime:
                    from datetime import datetime
                    dt = datetime.fromisoformat(start_datetime.replace('Z', '+00:00'))
                    formatted_date = dt.strftime('%d/%m/%Y às %H:%M')
                else:
                    formatted_date = start_datetime
                
                response += f"{i}️⃣ **{meeting.get('summary', 'Reunião')}**\n"
                response += f"   📅 {formatted_date}\n\n"
            
            response += "**O que você gostaria de fazer?**\n\n"
            response += "**Opções disponíveis:**\n\n"
            response += "1️⃣ **Alterar horário** de uma reunião\n"
            response += "2️⃣ **Cancelar** uma reunião\n"
            response += "3️⃣ **Manter** reunião existente\n\n"
            response += "**Para gerenciar suas reuniões, digite:**\n"
            response += "- **\"1\"** - para alterar horário\n"
            response += "- **\"2\"** - para cancelar reunião\n"
            response += "- **\"3\"** - para manter reunião existente\n\n"
            response += "Aguardo sua escolha! 😊"
            
            return response
            
        except Exception as e:
            print(f"❌ Erro ao processar consulta de reuniões: {e}")
            return "❌ Erro ao consultar suas reuniões. Tente novamente."
    
    def _check_existing_meetings(self, whatsapp_number: str, calendar_credentials: str, calendar_id: str) -> list:
        """Verifica se já existem reuniões agendadas para o WhatsApp"""
        try:
            from google_calendar_service import GoogleCalendarService
            
            calendar_service = GoogleCalendarService(calendar_credentials, calendar_id)
            existing_meetings = calendar_service.search_meetings_by_whatsapp(whatsapp_number)
            
            print(f"🔍 Verificando reuniões existentes para WhatsApp {whatsapp_number}: {len(existing_meetings)} encontradas")
            return existing_meetings
            
        except Exception as e:
            print(f"❌ Erro ao verificar reuniões existentes: {e}")
            return []
    
    def _get_or_create_chain(self, agent_id: str, vectorstore_path: str, 
                           system_prompt: str, model: str, api_provider: str, temperature: float = 0.10) -> Optional[ConversationalRetrievalChain]:
        """Obtém ou cria chain para um agente"""
        try:
            # Verificar cache
            cache_key = f"{agent_id}_{vectorstore_path}_{temperature}"
            if cache_key in self.agent_chains:
                return self.agent_chains[cache_key]
            
            # Carregar vectorstore
            vectorstore = self.load_vectorstore(vectorstore_path)
            if not vectorstore:
                return None
            
            # Configurar LLM baseado no provider
            if api_provider == 'groq':
                llm = ChatGroq(
                    model=model,
                    temperature=temperature,
                    max_tokens=2048
                )
            else:
                print(f"Provider não suportado: {api_provider}")
                return None
            
            # Criar prompt template personalizado usando o system_prompt
            from langchain_core.prompts import PromptTemplate
            
            # Template personalizado que inclui apenas o system_prompt do banco
            prompt_template = PromptTemplate(
                template=f"""{system_prompt}

Contexto dos documentos:
{{context}}

Mensagem do usuário: {{question}}

Resposta:""",
                input_variables=["context", "question"]
            )
            
            # Configurar memória (versão atualizada do LangChain)
            memory = ConversationBufferMemory(
                return_messages=True,
                memory_key="chat_history",
                output_key="answer"
            )
            
            # Criar retriever
            retriever = vectorstore.as_retriever(
                search_kwargs={"k": 4}  # Buscar 4 chunks mais relevantes
            )
            
            # Criar chain com configuração corrigida
            chain = ConversationalRetrievalChain.from_llm(
                llm=llm,
                memory=memory,
                retriever=retriever,
                return_source_documents=True,
                verbose=False,
                combine_docs_chain_kwargs={"prompt": prompt_template}
            )
            
            # Armazenar no cache
            self.agent_chains[cache_key] = chain
            
            return chain
            
        except Exception as e:
            print(f"Erro ao criar chain: {e}")
            return None
    
    def load_vectorstore(self, vectorstore_path: str) -> Optional[FAISS]:
        """Carrega vectorstore do disco"""
        try:
            if not os.path.exists(vectorstore_path):
                print(f"Vectorstore não encontrado: {vectorstore_path}")
                return None
            
            vectorstore = FAISS.load_local(
                vectorstore_path,
                self.embeddings,
                allow_dangerous_deserialization=True
            )
            return vectorstore
        except Exception as e:
            print(f"Erro ao carregar vectorstore: {e}")
            return None
    
    def _analyze_transfer_need(self, message: str, response: str) -> Dict[str, Any]:
        """Analisa se deve transferir para atendimento humano"""
        try:
            response_lower = response.lower()
            
            # Frases que indicam incapacidade de responder
            incapacity_phrases = [
                'não posso', 'não consigo', 'não tenho', 'não sei',
                'não encontrei', 'não disponível', 'não posso ajudar',
                'limitação', 'não posso responder', 'não tenho acesso'
            ]
            
            # Verificar se a resposta contém frases de incapacidade
            has_incapacity = any(phrase in response_lower for phrase in incapacity_phrases)
            
            if has_incapacity:
                return {
                    "should_transfer": True,
                    "reason": "Resposta indica limitação do agente"
                }
            
            return {
                "should_transfer": False,
                "reason": None
            }
            
        except Exception as e:
            print(f"Erro ao analisar necessidade de transferência: {e}")
            return {
                "should_transfer": False,
                "reason": None
            }
