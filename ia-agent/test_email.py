#!/usr/bin/env python3
"""
Script de teste para envio de email via SMTP
Testa as configurações do EmailService
"""

import os
import sys
from datetime import datetime, timedelta

# Adicionar o diretório atual ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Carregar variáveis de ambiente do arquivo .env
try:
    from dotenv import load_dotenv
    
    # Tentar carregar diferentes arquivos .env
    env_files = [
        '.env-ia-agent-dev',
        '.env',
        '../.env-ia-agent-dev',
        '../.env'
    ]
    
    loaded = False
    for env_file in env_files:
        if os.path.exists(env_file):
            load_dotenv(env_file)
            print(f"✅ Arquivo .env carregado: {env_file}")
            loaded = True
            break
    
    if not loaded:
        print("⚠️ Nenhum arquivo .env encontrado. Usando variáveis de ambiente do sistema.")
except ImportError:
    print("⚠️ python-dotenv não instalado. Tentando carregar .env manualmente...")
    
    # Tentar carregar .env manualmente
    env_files = [
        '.env-ia-agent-dev',
        '.env',
        '../.env-ia-agent-dev',
        '../.env'
    ]
    
    loaded = False
    for env_file in env_files:
        if os.path.exists(env_file):
            print(f"📄 Carregando arquivo .env manualmente: {env_file}")
            with open(env_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        key = key.strip()
                        value = value.strip().strip('"').strip("'")
                        os.environ[key] = value
            print(f"✅ Arquivo .env carregado manualmente: {env_file}")
            loaded = True
            break
    
    if not loaded:
        print("⚠️ Nenhum arquivo .env encontrado. Usando variáveis de ambiente do sistema.")

# Importar EmailService após carregar o .env
from email_service import EmailService

def test_email_configuration():
    """Testa se as configurações de email estão corretas"""
    print("\n" + "="*60)
    print("🔍 TESTE DE CONFIGURAÇÃO DE EMAIL")
    print("="*60 + "\n")
    
    # Mostrar configurações carregadas
    print("📋 Configurações carregadas:")
    print(f"   SMTP_ENABLED: {os.getenv('SMTP_ENABLED', 'Não definido')}")
    print(f"   SMTP_HOST: {os.getenv('SMTP_HOST', 'Não definido')}")
    print(f"   SMTP_PORT: {os.getenv('SMTP_PORT', 'Não definido')}")
    print(f"   SMTP_USERNAME: {os.getenv('SMTP_USERNAME', 'Não definido')}")
    smtp_password = os.getenv('SMTP_PASSWORD', '')
    print(f"   SMTP_PASSWORD: {'*' * len(smtp_password) if smtp_password else 'Não definido'}")
    print(f"   SMTP_FROM_NAME: {os.getenv('SMTP_FROM_NAME', 'Não definido')}")
    print(f"   SMTP_FROM_EMAIL: {os.getenv('SMTP_FROM_EMAIL', 'Não definido')}")
    print(f"   SMTP_USE_TLS: {os.getenv('SMTP_USE_TLS', 'Não definido')}")
    print(f"   SMTP_USE_SSL: {os.getenv('SMTP_USE_SSL', 'Não definido')}")
    print()
    
    # Verificações de consistência
    print("🔍 Verificações de consistência:")
    issues = []
    
    smtp_port = os.getenv('SMTP_PORT', '587')
    smtp_use_ssl = os.getenv('SMTP_USE_SSL', 'False').lower() == 'true'
    smtp_use_tls = os.getenv('SMTP_USE_TLS', 'True').lower() == 'true'
    
    if smtp_port == '465' and not smtp_use_ssl and smtp_use_tls:
        issues.append("ℹ️ Porta 465 normalmente usa SSL. Você configurou TLS (STARTTLS). Verifique se o servidor suporta STARTTLS nesta porta; caso contrário, use porta 587 ou ative SSL.")
    
    if smtp_port == '587' and smtp_use_ssl:
        issues.append("⚠️ Porta 587 normalmente usa STARTTLS, não SSL. Considere usar SMTP_USE_TLS=True e SMTP_USE_SSL=False")
    
    if smtp_use_ssl and smtp_use_tls:
        issues.append("⚠️ SMTP_USE_SSL e SMTP_USE_TLS não devem ser True ao mesmo tempo")
    
    if not smtp_password:
        issues.append("❌ SMTP_PASSWORD não está definido!")
    
    if '@' in smtp_password and not smtp_password.startswith('"') and not smtp_password.startswith("'"):
        issues.append("⚠️ A senha contém '@' - certifique-se de que está entre aspas no .env se necessário")
    
    if issues:
        for issue in issues:
            print(f"   {issue}")
    else:
        print("   ✅ Configurações parecem consistentes!")
    print()
    
    # Criar instância do EmailService
    email_service = EmailService()
    
    # Verificar se o serviço está disponível
    if not email_service.is_available():
        print("❌ ERRO: Serviço de email não está disponível!")
        print("\nPossíveis problemas:")
        print("   - SMTP_ENABLED não está definido como 'True'")
        print("   - SMTP_HOST, SMTP_USERNAME ou SMTP_PASSWORD estão faltando")
        return False
    
    print("✅ Serviço de email está disponível!")
    print(f"   Host configurado: {email_service.smtp_host}")
    print(f"   Porta configurada: {email_service.smtp_port}")
    print(f"   Usa SSL: {email_service.smtp_use_ssl}")
    print(f"   Usa TLS: {email_service.smtp_use_tls}")
    return True

def test_email_send():
    """Testa o envio de email"""
    print("\n" + "="*60)
    print("📧 TESTE DE ENVIO DE EMAIL")
    print("="*60 + "\n")
    
    # Solicitar email de destino
    print("Digite o email de destino para o teste:")
    to_email = input("Email: ").strip()
    
    if not to_email or '@' not in to_email:
        print("❌ Email inválido!")
        return False
    
    # Criar instância do EmailService
    email_service = EmailService()
    
    if not email_service.is_available():
        print("❌ Serviço de email não está disponível!")
        return False
    
    # Criar dados de teste para um agendamento
    start_datetime = datetime.now() + timedelta(days=1)
    end_datetime = start_datetime + timedelta(hours=1)
    
    print(f"\n📨 Enviando email de teste...")
    print(f"   De: {email_service.smtp_from_email}")
    print(f"   Para: {to_email}")
    print(f"   Assunto: Teste de Agendamento")
    
    try:
        result = email_service.send_appointment_invite(
            to_email=to_email,
            subject="Teste de Agendamento - Email Service",
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            description="Este é um email de teste para verificar se as configurações SMTP estão corretas.",
            location="Local de Teste",
            participant_name="Cliente de Teste",
            ics_content=None
        )
        
        if result.get('success', False):
            print("\n✅ SUCESSO! Email enviado com sucesso!")
            print(f"   Mensagem: {result.get('message', 'N/A')}")
            return True
        else:
            print("\n❌ ERRO ao enviar email!")
            print(f"   Erro: {result.get('error', 'Erro desconhecido')}")
            return False
            
    except Exception as e:
        print(f"\n❌ EXCEÇÃO ao enviar email: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_smtp_connection():
    """Testa a conexão SMTP diretamente"""
    print("\n" + "="*60)
    print("🔌 TESTE DE CONEXÃO SMTP")
    print("="*60 + "\n")
    
    import smtplib
    
    smtp_host = os.getenv('SMTP_HOST', '')
    smtp_port = int(os.getenv('SMTP_PORT', '587'))
    smtp_username = os.getenv('SMTP_USERNAME', '')
    smtp_password = os.getenv('SMTP_PASSWORD', '')
    smtp_use_ssl = os.getenv('SMTP_USE_SSL', 'False').lower() == 'true'
    smtp_use_tls = os.getenv('SMTP_USE_TLS', 'True').lower() == 'true'
    
    if not all([smtp_host, smtp_username, smtp_password]):
        print("❌ Configurações SMTP incompletas!")
        return False
    
    print(f"Tentando conectar em {smtp_host}:{smtp_port}...")
    
    try:
        if smtp_use_ssl:
            print("   Usando SSL...")
            server = smtplib.SMTP_SSL(smtp_host, smtp_port)
        else:
            print("   Usando STARTTLS...")
            server = smtplib.SMTP(smtp_host, smtp_port)
            if smtp_use_tls:
                server.starttls()
        
        print(f"   Conectado! Tentando fazer login com {smtp_username}...")
        server.login(smtp_username, smtp_password)
        print("✅ Login realizado com sucesso!")
        
        server.quit()
        return True
        
    except smtplib.SMTPAuthenticationError as e:
        print(f"❌ ERRO de autenticação: {e}")
        print("\nPossíveis problemas:")
        print("   - Username ou senha incorretos")
        print("   - Conta pode estar bloqueada ou precisa de autenticação de dois fatores")
        return False
    except smtplib.SMTPConnectError as e:
        print(f"❌ ERRO de conexão: {e}")
        print("\nPossíveis problemas:")
        print("   - Host ou porta incorretos")
        print("   - Servidor SMTP pode estar bloqueando a conexão")
        return False
    except Exception as e:
        print(f"❌ ERRO: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Função principal"""
    print("\n" + "="*60)
    print("🧪 TESTE DE EMAIL SERVICE")
    print("="*60)
    
    # Teste 1: Verificar configuração
    if not test_email_configuration():
        print("\n⚠️ Configure corretamente o arquivo .env antes de continuar.")
        return
    
    # Teste 2: Testar conexão SMTP
    print("\n" + "-"*60)
    print("Deseja testar a conexão SMTP primeiro? (s/n)")
    response = input("Resposta: ").strip().lower()
    
    if response == 's':
        if not test_smtp_connection():
            print("\n⚠️ Não foi possível conectar ao servidor SMTP.")
            print("Verifique as configurações antes de tentar enviar emails.")
            return
    
    # Teste 3: Enviar email de teste
    print("\n" + "-"*60)
    print("Deseja enviar um email de teste? (s/n)")
    response = input("Resposta: ").strip().lower()
    
    if response == 's':
        test_email_send()
    else:
        print("\n⚠️ Teste de envio cancelado.")
    
    print("\n" + "="*60)
    print("✅ Teste concluído!")
    print("="*60 + "\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️ Teste interrompido pelo usuário.")
    except Exception as e:
        print(f"\n❌ Erro inesperado: {e}")
        import traceback
        traceback.print_exc()

