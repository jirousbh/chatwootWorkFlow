#!/usr/bin/env python3

import json
import sys
from google_calendar_service import GoogleCalendarService

def test_calendar_service():
    """Testa o serviço de calendário"""
    
    # Credenciais de teste (você pode substituir pelas suas)
    credentials_json = """
    {
        "type": "service_account",
        "project_id": "py-ga-3ba3b",
        "private_key_id": "test",
        "private_key": "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\\n-----END PRIVATE KEY-----\\n",
        "client_email": "inovai-analytics@py-ga-3ba3b.iam.gserviceaccount.com",
        "client_id": "test",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/inovai-analytics%40py-ga-3ba3b.iam.gserviceaccount.com"
    }
    """
    
    calendar_id = "jirous@gmail.com"
    
    print(f"🔍 Testando serviço de calendário...")
    print(f"   Calendar ID: {calendar_id}")
    print(f"   Credenciais: {'Sim' if credentials_json else 'Não'}")
    
    try:
        # Criar serviço
        service = GoogleCalendarService(credentials_json, calendar_id)
        
        print(f"✅ Serviço criado com sucesso")
        print(f"   Disponível: {service.is_available()}")
        
        if service.is_available():
            print(f"✅ Serviço está disponível")
            
            # Testar listagem de calendários
            print(f"🔍 Testando listagem de calendários...")
            # Aqui você poderia adicionar um método para listar calendários
            
        else:
            print(f"❌ Serviço não está disponível")
            
    except Exception as e:
        print(f"❌ Erro ao criar serviço: {e}")
        return False
    
    return True

if __name__ == "__main__":
    test_calendar_service()

