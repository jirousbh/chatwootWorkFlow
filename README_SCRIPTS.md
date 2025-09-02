# 🤖 Scripts de Automação - Chatwoot

Este diretório contém scripts de automação para manutenção e monitoramento do servidor Chatwoot.

## 📋 Scripts Disponíveis

### 1. 🎨 `copy_logos_to_container.sh`
**Descrição:** Copia logos e configurações para o container Chatwoot.

**Funcionalidades:**
- Copia logos PNG para o container
- Atualiza favicon e arquivos relacionados
- Faz backup dos arquivos originais
- Atualiza configurações no banco de dados
- Aplica personalização da marca

**Agendamento:** Diariamente às 9h da manhã
**Log:** `/root/chatwoot/cron.log`

### 2. 🧹 `cleanup_logs.sh`
**Descrição:** Limpa logs e arquivos temporários antigos do sistema.

**Funcionalidades:**
- Remove logs do sistema com mais de 7 dias
- Remove logs do cron com mais de 7 dias
- Remove logs do Docker com mais de 7 dias
- Remove arquivos temporários com mais de 3 dias
- Remove logs do projeto com mais de 7 dias
- Remove cache do apt com mais de 30 dias
- Limpa logs do journalctl
- Remove diretórios vazios
- Limpa recursos Docker não utilizados (containers, imagens, redes, volumes)

**Agendamento:** Domingos às 2h da manhã
**Log:** `/root/chatwoot/cleanup.log`

### 3. 💿 `disk_monitor.sh`
**Descrição:** Monitora uso de disco e alerta sobre problemas.

**Funcionalidades:**
- Verifica uso de disco em todas as partições
- Monitora uso de inodes
- Lista os 10 diretórios que mais consomem espaço
- Identifica arquivos grandes (mais de 100MB)
- Alerta quando uso está acima de 80%

**Agendamento:** Diariamente às 6h da manhã
**Log:** `/root/chatwoot/disk_monitor.log`

### 4. 📊 `status_scripts.sh`
**Descrição:** Mostra status de todos os scripts automatizados.

**Funcionalidades:**
- Exibe status de todos os scripts
- Mostra última execução e tamanho dos logs
- Verifica se scripts existem e são executáveis
- Exibe crontab atual
- Mostra espaço em disco atual
- Verifica status do serviço cron

**Uso:** Executar manualmente quando necessário

## ⏰ Crontab Configurado

```bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 9 * * * cd /root/chatwoot/ && ./copy_logos_to_container.sh >> /root/chatwoot/cron.log 2>&1
0 2 * * 0 cd /root/chatwoot/ && ./cleanup_logs.sh >> /root/chatwoot/cleanup.log 2>&1
0 6 * * * cd /root/chatwoot/ && ./disk_monitor.sh >> /root/chatwoot/disk_monitor.log 2>&1
```

## 📁 Estrutura de Logs

- `/root/chatwoot/cron.log` - Log do script de cópia de logos
- `/root/chatwoot/cleanup.log` - Log do script de limpeza
- `/root/chatwoot/disk_monitor.log` - Log do script de monitoramento
- `/var/log/cleanup.log` - Log resumido de limpeza
- `/var/log/disk_monitor.log` - Log resumido de monitoramento

## 🚀 Como Usar

### Execução Manual
```bash
# Executar cópia de logos manual
./copy_logos_to_container.sh

# Executar limpeza manual
./cleanup_logs.sh

# Executar monitoramento manual
./disk_monitor.sh

# Verificar status dos scripts
./status_scripts.sh
```

### Verificar Logs
```bash
# Ver log de cópia de logos
cat /root/chatwoot/cron.log

# Ver log de limpeza
cat /root/chatwoot/cleanup.log

# Ver log de monitoramento
cat /root/chatwoot/disk_monitor.log

# Ver últimas linhas
tail -f /root/chatwoot/cron.log
```

### Gerenciar Crontab
```bash
# Ver crontab atual
crontab -l

# Editar crontab
crontab -e

# Remover crontab
crontab -r
```

## 🔧 Configurações

### Cópia de Logos
- **Frequência:** Diária (9h da manhã)
- **Arquivos:** Logos PNG, favicon, configurações

### Limpeza Automática
- **Frequência:** Semanal (domingos às 2h)
- **Logs removidos:** Mais de 7 dias
- **Arquivos temporários:** Mais de 3 dias
- **Cache apt:** Mais de 30 dias

### Monitoramento
- **Frequência:** Diário (6h da manhã)
- **Alerta de disco:** Acima de 80%
- **Alerta de inodes:** Acima de 80%

## 📊 Benefícios

1. **Manutenção Automática:** Sistema se mantém limpo automaticamente
2. **Monitoramento Proativo:** Detecta problemas antes que afetem o sistema
3. **Economia de Espaço:** Libera espaço automaticamente
4. **Logs Organizados:** Mantém histórico de execuções
5. **Fácil Monitoramento:** Script de status para verificar tudo

## ⚠️ Observações

- Todos os scripts são executados como root
- Logs são mantidos para auditoria
- Scripts são seguros e não removem arquivos críticos
- Backup automático é feito antes de remover arquivos importantes

## 🆘 Troubleshooting

### Script não executa
```bash
# Verificar permissões
ls -la *.sh

# Verificar se cron está ativo
systemctl status cron

# Verificar logs do cron
grep CRON /var/log/syslog | tail -10
```

### Logs não são gerados
```bash
# Verificar se diretório existe
ls -la /root/chatwoot/

# Verificar permissões de escrita
touch /root/chatwoot/test.log
```

### Espaço em disco crítico
```bash
# Executar limpeza manual
./cleanup_logs.sh

# Verificar uso de disco
./disk_monitor.sh
```

---

**Criado em:** $(date +%Y-%m-%d)
**Última atualização:** $(date +%Y-%m-%d)
