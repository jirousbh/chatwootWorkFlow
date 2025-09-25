#!/usr/bin/env python3
"""
Script para testar a conectividade com o Google Calendar
"""

import json
import sys
from google_calendar_service import GoogleCalendarService

def test_calendar_connection():
    """Testa a conexão com o Google Calendar"""
    try:
        # ID do novo calendário
        calendar_id = "fce07af74fb8cc4bf402572e2ac723851f4eb18c3d2e636c4e521dc1b454f4ce@group.calendar.google.com"
        
        # Carregar credenciais do banco de dados
        import psycopg2
        
        conn = psycopg2.connect(
            host="postgres-dev",
            database="workflows_iaagent",
            user="postgres",
            password="invoAI@76925"
        )
        
        cursor = conn.cursor()
        cursor.execute("SELECT calendar_credentials FROM agent WHERE id = '24dbd1e1-e50c-49ec-bc4e-3dbcbc1aef11'")
        result = cursor.fetchone()
        
        if not result or not result[0]:
            print("❌ Credenciais não encontradas no banco de dados")
            return
        
        credentials_json = result[0]
        conn.close()
        
        print(f"🔍 Testando conexão com calendário: {calendar_id}")
        
        # Criar serviço de calendário
        calendar_service = GoogleCalendarService(credentials_json, calendar_id)
        
        if not calendar_service.is_available():
            print("❌ Serviço de calendário não disponível")
            return
        
        print("✅ Serviço de calendário inicializado com sucesso")
        
        # Testar listagem de calendários
        print("🔍 Testando listagem de calendários...")
        
        # Testar criação de evento de teste
        from datetime import datetime, timedelta
        
        start_time = datetime.now() + timedelta(hours=1)
        end_time = start_time + timedelta(minutes=30)
        
        print(f"📅 Criando evento de teste...")
        print(f"   Início: {start_time}")
        print(f"   Fim: {end_time}")
        
        event_result = calendar_service.create_event(
            summary="Teste de Conectividade - InovAI Analytics",
            start_datetime=start_time,
            end_datetime=end_time,
            description="Evento de teste para verificar conectividade com Google Calendar",
            attendees=[],
            location=""
        )
        
        if event_result["success"]:
            print("✅ Evento criado com sucesso!")
            print(f"   ID do evento: {event_result['event_id']}")
            print(f"   Link: {event_result['event_link']}")
            
            # Tentar deletar o evento de teste
            print("🗑️ Deletando evento de teste...")
            delete_result = calendar_service.delete_event(event_result['event_id'])
            
            if delete_result["success"]:
                print("✅ Evento de teste deletado com sucesso")
            else:
                print(f"⚠️ Não foi possível deletar evento: {delete_result['error']}")
                
        else:
            print(f"❌ Erro ao criar evento: {event_result['error']}")
            
    except Exception as e:
        print(f"❌ Erro durante teste: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_calendar_connection()
