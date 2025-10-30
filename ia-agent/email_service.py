import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formatdate
from datetime import datetime
from typing import Optional, Dict, Any
import re

class EmailService:
    """Serviço de envio de emails via SMTP"""
    
    def __init__(self):
        """Inicializa o serviço de email com configurações do ambiente"""
        self.smtp_enabled = os.getenv('SMTP_ENABLED', 'False').lower() == 'true'
        self.smtp_host = os.getenv('SMTP_HOST', '')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.smtp_username = os.getenv('SMTP_USERNAME', '')
        self.smtp_password = os.getenv('SMTP_PASSWORD', '')
        self.smtp_from_name = os.getenv('SMTP_FROM_NAME', 'InovAI Analytics')
        self.smtp_from_email = os.getenv('SMTP_FROM_EMAIL', '')
        self.smtp_use_tls = os.getenv('SMTP_USE_TLS', 'True').lower() == 'true'
        self.smtp_use_ssl = os.getenv('SMTP_USE_SSL', 'True').lower() == 'true'
        self.smtp_timeout = int(os.getenv('SMTP_TIMEOUT', '20'))
        self.smtp_debug = os.getenv('SMTP_DEBUG', 'False').lower() == 'true'
        
        # Respeitar flags do .env: não forçar SSL. Apenas sugerir se ambas estiverem desligadas
        if not self.smtp_use_ssl and not self.smtp_use_tls:
            if self.smtp_port == 465:
                print("⚠️ Porta 465 detectada e SSL/TLS desativados. Sugerindo SSL, mas mantendo configurações do .env")
            elif self.smtp_port == 587:
                print("⚠️ Porta 587 detectada e SSL/TLS desativados. Sugerindo STARTTLS, mas mantendo configurações do .env")
        
        if self.smtp_enabled and not all([self.smtp_host, self.smtp_username, self.smtp_password]):
            print("⚠️ SMTP habilitado mas configurações incompletas")
            self.smtp_enabled = False
    
    def is_available(self) -> bool:
        """Verifica se o serviço de email está disponível"""
        return self.smtp_enabled
    
    def send_appointment_invite(self, 
                                to_email: str,
                                subject: str,
                                start_datetime: datetime,
                                end_datetime: datetime,
                                description: str = "",
                                location: str = "",
                                participant_name: str = "Cliente",
                                ics_content: Optional[str] = None) -> Dict[str, Any]:
        """
        Envia convite de reunião por email
        
        Args:
            to_email: Email do destinatário
            subject: Assunto da reunião
            start_datetime: Data/hora de início
            end_datetime: Data/hora de fim
            description: Descrição da reunião
            location: Local da reunião
            participant_name: Nome do participante
            ics_content: Conteúdo do arquivo .ics (opcional)
            
        Returns:
            Dict com resultado do envio
        """
        if not self.is_available():
            return {
                "success": False,
                "error": "Serviço de email não está disponível"
            }
        
        try:
            # Validar email
            if not self._validate_email(to_email):
                return {
                    "success": False,
                    "error": f"Email inválido: {to_email}"
                }
            
            # Criar mensagem
            msg = MIMEMultipart('alternative')
            msg['From'] = f"{self.smtp_from_name} <{self.smtp_from_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject
            msg['Date'] = formatdate(localtime=True)
            
            # Formatar data/hora
            formatted_start = start_datetime.strftime('%d/%m/%Y às %H:%M')
            formatted_end = end_datetime.strftime('%d/%m/%Y às %H:%M')
            duration_minutes = int((end_datetime - start_datetime).total_seconds() / 60)
            
            # Criar corpo do email em HTML e texto
            html_body = self._create_html_email_body(
                subject, formatted_start, formatted_end, duration_minutes,
                description, location, participant_name
            )
            text_body = self._create_text_email_body(
                subject, formatted_start, formatted_end, duration_minutes,
                description, location, participant_name
            )
            
            # Adicionar partes da mensagem
            msg.attach(MIMEText(text_body, 'plain', 'utf-8'))
            msg.attach(MIMEText(html_body, 'html', 'utf-8'))
            
            # Adicionar arquivo .ics como anexo se fornecido
            if ics_content:
                from email.mime.base import MIMEBase
                from email import encoders
                
                ics_part = MIMEBase('text', 'calendar', method='REQUEST')
                ics_part.set_payload(ics_content.encode('utf-8'))
                encoders.encode_base64(ics_part)
                ics_part.add_header(
                    'Content-Disposition',
                    f'attachment; filename="reuniao.ics"'
                )
                ics_part.add_header(
                    'Content-Type',
                    'text/calendar; charset=UTF-8; method=REQUEST'
                )
                msg.attach(ics_part)
                print(f"✅ Arquivo ICS anexado ao email")
            
            # Enviar email
            server = None
            try:
                if self.smtp_use_ssl:
                    server = smtplib.SMTP_SSL(self.smtp_host, self.smtp_port, timeout=self.smtp_timeout)
                else:
                    server = smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=self.smtp_timeout)
                
                if self.smtp_debug:
                    server.set_debuglevel(1)
                
                # Saudar servidor
                try:
                    server.ehlo()
                except Exception:
                    pass
                
                # STARTTLS se configurado
                if self.smtp_use_tls:
                    server.starttls()
                    try:
                        server.ehlo()
                    except Exception:
                        pass
                
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(msg)
            finally:
                if server is not None:
                    try:
                        server.quit()
                    except Exception:
                        pass
            
            print(f"✅ Email enviado com sucesso para {to_email}")
            
            return {
                "success": True,
                "message": f"Email enviado com sucesso para {to_email}",
                "to_email": to_email
            }
            
        except Exception as e:
            print(f"❌ Erro ao enviar email: {e}")
            return {
                "success": False,
                "error": f"Erro ao enviar email: {str(e)}"
            }
    
    def _validate_email(self, email: str) -> bool:
        """Valida formato de email"""
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))
    
    def _create_html_email_body(self, subject: str, start_time: str, end_time: str,
                                duration_minutes: int, description: str, location: str,
                                participant_name: str) -> str:
        """Cria corpo do email em HTML"""
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }}
                .content {{ background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }}
                .info-item {{ margin: 10px 0; }}
                .info-label {{ font-weight: bold; color: #555; }}
                .footer {{ text-align: center; margin-top: 20px; color: #888; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✅ Agendamento Confirmado!</h1>
                </div>
                <div class="content">
                    <p>Olá <strong>{participant_name}</strong>,</p>
                    <p>Seu agendamento foi confirmado com sucesso!</p>
                    
                    <div class="info-item">
                        <span class="info-label">📅 Assunto:</span> {subject}
                    </div>
                    <div class="info-item">
                        <span class="info-label">📅 Data/Hora de Início:</span> {start_time}
                    </div>
                    <div class="info-item">
                        <span class="info-label">⏰ Data/Hora de Fim:</span> {end_time}
                    </div>
                    <div class="info-item">
                        <span class="info-label">⏱️ Duração:</span> {duration_minutes} minutos
                    </div>
        """
        
        if location:
            html += f"""
                    <div class="info-item">
                        <span class="info-label">📍 Local:</span> {location}
                    </div>
            """
        
        if description:
            html += f"""
                    <div class="info-item">
                        <span class="info-label">📝 Descrição:</span><br>
                        {description.replace(chr(10), '<br>')}
                    </div>
            """
        
        html += """
                    <p>Este email inclui um arquivo .ics que você pode adicionar ao seu calendário.</p>
                    <p>Nos vemos em breve!</p>
                </div>
                <div class="footer">
                    <p>Este é um email automático enviado por InovAI Analytics</p>
                </div>
            </div>
        </body>
        </html>
        """
        return html
    
    def _create_text_email_body(self, subject: str, start_time: str, end_time: str,
                               duration_minutes: int, description: str, location: str,
                               participant_name: str) -> str:
        """Cria corpo do email em texto simples"""
        text = f"""✅ Agendamento Confirmado!

Olá {participant_name},

Seu agendamento foi confirmado com sucesso!

📅 Assunto: {subject}
📅 Data/Hora de Início: {start_time}
⏰ Data/Hora de Fim: {end_time}
⏱️ Duração: {duration_minutes} minutos
"""
        
        if location:
            text += f"📍 Local: {location}\n"
        
        if description:
            text += f"\n📝 Descrição:\n{description}\n"
        
        text += """
Este email inclui um arquivo .ics que você pode adicionar ao seu calendário.

Nos vemos em breve!

---
Este é um email automático enviado por InovAI Analytics
"""
        return text

