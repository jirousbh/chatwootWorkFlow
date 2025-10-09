import os
import json
from datetime import datetime, timedelta, timezone, time
from typing import Optional, List, Dict, Any
from google.auth.transport.requests import Request
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from zoneinfo import ZoneInfo

class GoogleCalendarService:
    """Serviço para integração com Google Calendar"""
    
    def __init__(self, credentials_json: str = None, calendar_id: str = None):
        """
        Inicializa o serviço do Google Calendar
        
        Args:
            credentials_json: JSON das credenciais da Service Account
            calendar_id: ID do calendário (email do calendário ou 'primary')
        """
        self.credentials_json = credentials_json
        self.calendar_id = calendar_id or 'primary'
        self.service = None
        self.tz = ZoneInfo('America/Sao_Paulo')
        
        if self.credentials_json:
            self._initialize_service()
    
    def _initialize_service(self):
        """Inicializa o serviço do Google Calendar"""
        try:
            # Carregar credenciais da Service Account a partir do JSON
            credentials_info = json.loads(self.credentials_json)
            credentials = service_account.Credentials.from_service_account_info(
                credentials_info,
                scopes=['https://www.googleapis.com/auth/calendar']
            )
            
            # Construir o serviço
            self.service = build('calendar', 'v3', credentials=credentials)
            print(f"✅ Google Calendar Service inicializado para calendário: {self.calendar_id}")
            
        except Exception as e:
            print(f"❌ Erro ao inicializar Google Calendar Service: {e}")
            self.service = None
    
    def is_available(self) -> bool:
        """Verifica se o serviço está disponível"""
        return self.service is not None
    
    def create_event(self, 
                    summary: str,
                    start_datetime: datetime,
                    end_datetime: datetime = None,
                    description: str = "",
                    attendees: List[str] = None,
                    location: str = "",
                    reminders: List[Dict[str, Any]] = None,
                    use_google_meeting: bool = False) -> Dict[str, Any]:
        """
        Cria um novo evento no calendário
        
        Args:
            summary: Título do evento
            start_datetime: Data/hora de início
            end_datetime: Data/hora de fim (padrão: 1 hora após início)
            description: Descrição do evento
            attendees: Lista de emails dos participantes
            location: Local do evento
            reminders: Lista de lembretes [{"method": "email", "minutes": 60}]
            use_google_meeting: Se True, adiciona link do Google Meet ao evento
            
        Returns:
            Dict com informações do evento criado ou erro
        """
        if not self.is_available():
            return {
                "success": False,
                "error": "Google Calendar Service não está disponível"
            }
        
        try:
            # Normalizar timezone (America/Sao_Paulo)
            if start_datetime.tzinfo is None:
                start_datetime = start_datetime.replace(tzinfo=self.tz)
            if end_datetime and end_datetime.tzinfo is None:
                end_datetime = end_datetime.replace(tzinfo=self.tz)
            # Definir fim do evento se não especificado
            if end_datetime is None:
                end_datetime = start_datetime + timedelta(hours=1)
            
            # Preparar dados do evento
            event_data = {
                'summary': summary,
                'description': description,
                'location': location,
                'start': {
                    'dateTime': start_datetime.isoformat(),
                    'timeZone': 'America/Sao_Paulo'
                },
                'end': {
                    'dateTime': end_datetime.isoformat(),
                    'timeZone': 'America/Sao_Paulo'
                },
                # Configurações de visibilidade - evento acessível via link
                'visibility': 'public',  # Evento público - acessível via link
                'guestsCanInviteOthers': False,  # Participantes não podem convidar outros
                'guestsCanModify': False,  # Participantes não podem modificar o evento
                'guestsCanSeeOtherGuests': False  # Participantes não podem ver outros participantes
            }
            
            # Adicionar participantes se especificados
            if attendees:
                event_data['attendees'] = [{'email': email} for email in attendees]
            
            # Nota: Google Meet será gerado como link genérico se solicitado
            
            # Adicionar lembretes se especificados
            if reminders:
                event_data['reminders'] = {
                    'useDefault': False,
                    'overrides': reminders
                }
            
            # Criar evento (sem tentar criar Google Meet automaticamente)
            event = self.service.events().insert(
                calendarId=self.calendar_id,
                body=event_data,
                sendUpdates='all' if attendees else 'none'
            ).execute()
            
            # Google Meet não é suportado com Service Accounts (apenas Google Workspace)
            meet_link = None
            if use_google_meeting:
                print("⚠️ LOG SERVIDOR: Google Meet solicitado, mas não é suportado com Service Accounts (requer Google Workspace)")
                print("⚠️ LOG SERVIDOR: Google Meet será ignorado - evento criado sem conferência")
            
            return {
                "success": True,
                "event_id": event.get('id'),
                "event_link": event.get('htmlLink'),
                "meet_link": meet_link,
                "start_time": event['start']['dateTime'],
                "end_time": event['end']['dateTime'],
                "summary": event.get('summary')
            }
            
        except HttpError as e:
            return {
                "success": False,
                "error": f"Erro HTTP do Google Calendar: {e}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Erro ao criar evento: {e}"
            }

    def add_attendees(self, event_id: str, attendees: List[str]) -> Dict[str, Any]:
        """
        Adiciona participantes a um evento existente e envia convites por email
        """
        if not self.is_available():
            return {
                "success": False,
                "error": "Google Calendar Service não está disponível"
            }
        try:
            # Buscar evento atual
            event = self.service.events().get(
                calendarId=self.calendar_id,
                eventId=event_id
            ).execute()

            current_attendees = event.get('attendees', [])
            current_emails = {a.get('email') for a in current_attendees if 'email' in a}
            for email in attendees or []:
                if email not in current_emails:
                    current_attendees.append({'email': email})

            event['attendees'] = current_attendees

            updated = self.service.events().patch(
                calendarId=self.calendar_id,
                eventId=event_id,
                body={'attendees': current_attendees},
                sendUpdates='all'
            ).execute()

            return {
                "success": True,
                "event_id": updated.get('id'),
                "event_link": updated.get('htmlLink'),
                "attendees": [a.get('email') for a in updated.get('attendees', [])]
            }
        except HttpError as e:
            return {
                "success": False,
                "error": f"Erro HTTP ao adicionar participantes: {e}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Erro ao adicionar participantes: {e}"
            }
    
    def check_availability(self, 
                          start_datetime: datetime,
                          end_datetime: datetime = None) -> Dict[str, Any]:
        """
        Verifica disponibilidade em um horário específico
        
        Args:
            start_datetime: Data/hora de início
            end_datetime: Data/hora de fim (padrão: 1 hora após início)
            
        Returns:
            Dict com informações de disponibilidade
        """
        if not self.is_available():
            return {
                "success": False,
                "error": "Google Calendar Service não está disponível"
            }
        
        try:
            # Normalizar timezone (America/Sao_Paulo)
            if start_datetime.tzinfo is None:
                start_datetime = start_datetime.replace(tzinfo=self.tz)
            if end_datetime is None:
                end_datetime = start_datetime + timedelta(hours=1)
            if end_datetime.tzinfo is None:
                end_datetime = end_datetime.replace(tzinfo=self.tz)

            # Converter para UTC para consulta (RFC3339)
            start_utc = start_datetime.astimezone(timezone.utc)
            end_utc = end_datetime.astimezone(timezone.utc)

            # Buscar eventos no período
            events_result = self.service.events().list(
                calendarId=self.calendar_id,
                timeMin=start_utc.isoformat(),
                timeMax=end_utc.isoformat(),
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            events = events_result.get('items', [])
            
            # Verificar se há conflitos
            conflicts = []
            for event in events:
                event_start_raw = event['start'].get('dateTime', event['start'].get('date'))
                event_end_raw = event['end'].get('dateTime', event['end'].get('date'))
                # Normalizar 'Z' para '+00:00' e parsear
                if isinstance(event_start_raw, str):
                    event_start_dt = datetime.fromisoformat(event_start_raw.replace('Z', '+00:00'))
                else:
                    event_start_dt = start_utc
                if isinstance(event_end_raw, str):
                    event_end_dt = datetime.fromisoformat(event_end_raw.replace('Z', '+00:00'))
                else:
                    event_end_dt = end_utc
                
                conflicts.append({
                    'summary': event.get('summary', 'Evento sem título'),
                    'start': event_start_dt.astimezone(self.tz).isoformat(),
                    'end': event_end_dt.astimezone(self.tz).isoformat()
                })
            
            is_available = len(conflicts) == 0
            
            return {
                "success": True,
                "available": is_available,
                "conflicts": conflicts,
                "start_time": start_datetime.isoformat(),
                "end_time": end_datetime.isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Erro ao verificar disponibilidade: {e}"
            }
    
    def get_available_slots(self, 
                           date: datetime,
                           start_hour: int = 9,
                           end_hour: int = 18,
                           duration_minutes: int = 60) -> List[Dict[str, Any]]:
        """
        Busca horários disponíveis em uma data específica
        
        Args:
            date: Data para buscar disponibilidade
            start_hour: Hora de início (padrão: 9h)
            end_hour: Hora de fim (padrão: 18h)
            duration_minutes: Duração em minutos (padrão: 60min)
            
        Returns:
            Lista de horários disponíveis
        """
        if not self.is_available():
            return []
        
        try:
            available_slots = []
            
            # Normalizar dia no fuso America/Sao_Paulo
            local_day_start = datetime.combine(date.date(), time(hour=start_hour, minute=0, second=0, tzinfo=self.tz))
            local_day_end = datetime.combine(date.date(), time(hour=end_hour, minute=0, second=0, tzinfo=self.tz))

            # Converter janelas para UTC
            day_start_utc = local_day_start.astimezone(timezone.utc)
            day_end_utc = local_day_end.astimezone(timezone.utc)
            
            # Buscar eventos do dia
            events_result = self.service.events().list(
                calendarId=self.calendar_id,
                timeMin=day_start_utc.isoformat(),
                timeMax=day_end_utc.isoformat(),
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            events = events_result.get('items', [])
            
            # Converter eventos para slots ocupados
            busy_slots = []
            for event in events:
                start_raw = event['start'].get('dateTime', event['start'].get('date'))
                end_raw = event['end'].get('dateTime', event['end'].get('date'))
                start_dt = datetime.fromisoformat(start_raw.replace('Z', '+00:00'))
                end_dt = datetime.fromisoformat(end_raw.replace('Z', '+00:00'))
                # Converter para fuso local para comparação
                busy_slots.append((start_dt.astimezone(self.tz), end_dt.astimezone(self.tz)))
            
            # Encontrar slots disponíveis
            current_time = local_day_start
            while current_time + timedelta(minutes=duration_minutes) <= local_day_end:
                slot_end = current_time + timedelta(minutes=duration_minutes)
                
                # Verificar se há conflito
                has_conflict = False
                for busy_start, busy_end in busy_slots:
                    if (current_time < busy_end and slot_end > busy_start):
                        has_conflict = True
                        break
                
                if not has_conflict:
                    available_slots.append({
                        'start': current_time.strftime('%H:%M'),
                        'end': slot_end.strftime('%H:%M'),
                        'start_datetime': current_time.isoformat(),
                        'end_datetime': slot_end.isoformat()
                    })
                
                # Próximo slot (intervalos de 30 minutos)
                current_time += timedelta(minutes=30)
            
            return available_slots
            
        except Exception as e:
            print(f"❌ Erro ao buscar horários disponíveis: {e}")
            return []
    
    def delete_event(self, event_id: str) -> Dict[str, Any]:
        """
        Deleta um evento
        
        Args:
            event_id: ID do evento a ser deletado
            
        Returns:
            Dict com resultado da operação
        """
        if not self.is_available():
            return {
                "success": False,
                "error": "Google Calendar Service não está disponível"
            }
        
        try:
            self.service.events().delete(
                calendarId=self.calendar_id,
                eventId=event_id
            ).execute()
            
            return {
                "success": True,
                "message": "Evento deletado com sucesso"
            }
            
        except HttpError as e:
            if e.resp.status == 410:  # Event not found
                return {
                    "success": True,
                    "message": "Evento já foi deletado"
                }
            return {
                "success": False,
                "error": f"Erro ao deletar evento: {e}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Erro ao deletar evento: {e}"
            }

    def generate_ics_file(self, event_data: dict, meet_link: str = None) -> str:
        """Gera arquivo .ics (iCalendar) com os dados do evento"""
        try:
            from datetime import datetime
            import uuid
            
            # Extrair dados do evento
            summary = event_data.get('summary', 'Reunião Criada pela IA')
            description = event_data.get('description', '')
            location = event_data.get('location', '')
            start_datetime = datetime.fromisoformat(event_data['start']['dateTime'].replace('Z', '+00:00'))
            end_datetime = datetime.fromisoformat(event_data['end']['dateTime'].replace('Z', '+00:00'))
            
            # Gerar UID único para o evento
            event_uid = str(uuid.uuid4())
            
            # Formatar datas para iCalendar (UTC)
            start_utc = start_datetime.astimezone().strftime('%Y%m%dT%H%M%SZ')
            end_utc = end_datetime.astimezone().strftime('%Y%m%dT%H%M%SZ')
            now_utc = datetime.now().astimezone().strftime('%Y%m%dT%H%M%SZ')
            
            # Limpar descrição para formato .ics e remover metadados
            import re
            
            # Remover bloco de metadados (incluindo WhatsApp)
            clean_description = re.sub(
                r'\n<!-- METADATA_START -->.*?<!-- METADATA_END -->',
                '',
                description,
                flags=re.DOTALL
            )
            
            # Remover linha "Agendado via InovAI Analytics" se existir
            clean_description = re.sub(
                r'\n*Agendado via InovAI Analytics\n*',
                '',
                clean_description,
                flags=re.IGNORECASE
            )
            
            # Adicionar link do Google Meet à descrição se disponível
            if meet_link:
                clean_description += f"\n\n🎥 Link da Reunião Google Meet:\n{meet_link}"
            
            # Limpar quebras de linha extras e formatar para .ics
            clean_description = re.sub(r'\n+', '\n', clean_description.strip())
            clean_description = clean_description.replace('\n', '\\n').replace('\r', '')
            
            # Criar conteúdo do arquivo .ics
            ics_content = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//InovAI Analytics//Agendamento IA//PT
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:{event_uid}
DTSTART:{start_utc}
DTEND:{end_utc}
DTSTAMP:{now_utc}
SUMMARY:{summary}
DESCRIPTION:{clean_description}
LOCATION:{location}
STATUS:CONFIRMED
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR"""
            
            print(f"✅ Arquivo .ics gerado para evento: {summary}")
            return ics_content
            
        except Exception as e:
            print(f"❌ Erro ao gerar arquivo .ics: {e}")
            return None

    def search_meetings_by_whatsapp(self, whatsapp_number: str, from_date: datetime = None) -> list:
        """Busca reuniões por número do WhatsApp em datas futuras"""
        try:
            if not self.service:
                print("❌ Google Calendar Service não inicializado")
                return []
            
            # Se não especificou data, usar data atual
            if not from_date:
                from_date = datetime.now()
            
            # Formatar data para API do Google
            time_min = from_date.isoformat() + 'Z'
            
            # Buscar eventos futuros
            events_result = self.service.events().list(
                calendarId=self.calendar_id,
                timeMin=time_min,
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            events = events_result.get('items', [])
            whatsapp_meetings = []
            
            for event in events:
                # Verificar se o evento contém o WhatsApp na descrição
                description = event.get('description', '')
                
                if whatsapp_number in description:
                    # Extrair dados do evento
                    start = event['start'].get('dateTime', event['start'].get('date'))
                    end = event['end'].get('dateTime', event['end'].get('date'))
                    
                    meeting_data = {
                        'id': event['id'],
                        'summary': event.get('summary', 'Reunião'),
                        'start': start,
                        'end': end,
                        'description': description,
                        'whatsapp': whatsapp_number,
                        'created': event.get('created'),
                        'updated': event.get('updated')
                    }
                    
                    whatsapp_meetings.append(meeting_data)
            
            print(f"🔍 Encontradas {len(whatsapp_meetings)} reuniões para WhatsApp {whatsapp_number}")
            return whatsapp_meetings
            
        except Exception as e:
            print(f"❌ Erro ao buscar reuniões por WhatsApp: {e}")
            return []

    def update_meeting(self, event_id: str, new_start: datetime, new_end: datetime, 
                      new_summary: str = None, new_description: str = None) -> bool:
        """Atualiza uma reunião existente"""
        try:
            if not self.service:
                print("❌ Google Calendar Service não inicializado")
                return False
            
            # Buscar evento existente
            event = self.service.events().get(calendarId=self.calendar_id, eventId=event_id).execute()
            
            # Atualizar dados
            event['start'] = {'dateTime': new_start.isoformat(), 'timeZone': 'America/Sao_Paulo'}
            event['end'] = {'dateTime': new_end.isoformat(), 'timeZone': 'America/Sao_Paulo'}
            
            if new_summary:
                event['summary'] = new_summary
            
            if new_description:
                event['description'] = new_description
            
            # Salvar alterações
            updated_event = self.service.events().update(
                calendarId=self.calendar_id, 
                eventId=event_id, 
                body=event
            ).execute()
            
            print(f"✅ Reunião atualizada: {updated_event.get('summary')}")
            return True
            
        except Exception as e:
            print(f"❌ Erro ao atualizar reunião: {e}")
            return False

    def cancel_meeting(self, event_id: str) -> bool:
        """Cancela uma reunião (remove do calendário)"""
        try:
            if not self.service:
                print("❌ Google Calendar Service não inicializado")
                return False
            
            # Deletar evento
            self.service.events().delete(calendarId=self.calendar_id, eventId=event_id).execute()
            
            print(f"✅ Reunião cancelada (ID: {event_id})")
            return True
            
        except Exception as e:
            print(f"❌ Erro ao cancelar reunião: {e}")
            return False

    def extract_whatsapp_from_description(self, description: str) -> str:
        """Extrai número do WhatsApp da descrição do evento"""
        try:
            import re
            # Procurar padrão de WhatsApp na descrição
            whatsapp_pattern = r'whatsapp[:\s]*(\d{10,15})'
            match = re.search(whatsapp_pattern, description.lower())
            return match.group(1) if match else None
        except Exception:
            return None
