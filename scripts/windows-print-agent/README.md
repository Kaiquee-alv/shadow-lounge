# Ponte de impressão Windows — KP-IM602

O agente mantém o vínculo entre o sistema e uma impressora instalada no Windows. O celular envia a comanda ao servidor; o servidor guarda um job; o agente consulta a fila por HTTPS e envia ESC/POS RAW ao spooler do Windows. A janela de impressão do navegador não é usada e não aparece no PC para cada pedido.

## Requisitos

- Windows 10/11 com a KP-IM602 instalada e funcionando no Windows. Faça um teste de impressão no próprio Windows antes de parear.
- Uma implantação do sistema acessível pelo PC por uma URL **HTTPS válida**. O agente rejeita HTTP e não ignora certificados inválidos.
- PowerShell e o módulo de tarefas agendadas do Windows. O instalador normalmente roda sem privilégios de administrador.
- Um driver/fila Windows que aceite dados ESC/POS em modo RAW. Uma fila configurada apenas para renderização GDI pode não interpretar comandos RAW corretamente.

A página da Knup identifica a IM602/KP-IM602, e informa USB, compatibilidade com Windows e cortador automático. A página oficial consultada não documenta o protocolo ESC/POS; uma ficha de revendedor consultada descreve ESC/POS e CP850. Portanto, confirme no manual/driver da sua revisão que a fila aceita ESC/POS RAW. O agente imprime pelo spooler/fila configurada no Windows, tanto se essa fila vier de USB quanto de uma impressora de rede já instalada no Windows.

## Parear e instalar

1. No sistema, entre como administrador e gere um código temporário de pareamento. Ele expira em 10 minutos e só pode ser usado uma vez.
2. Copie a pasta `scripts/windows-print-agent` para o computador Windows.
3. Abra o PowerShell na pasta e execute:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\install-printer-agent.ps1
   ```

4. Informe a URL HTTPS do sistema, escolha a KP-IM602 na lista de impressoras e digite o código temporário.
5. O instalador grava a URL e o nome da impressora em `%LOCALAPPDATA%\ShadowLounge\PrinterAgent`, cifra o token do agente com DPAPI para a conta Windows atual, aplica ACL à pasta e registra a tarefa `ShadowLoungePrinterAgent` para iniciar no logon dessa conta.
6. Atualize o status da ponte no sistema. Quando o PC aparece online, comandas enviadas pelo celular entram na fila e o agente as imprime sem caixa de diálogo.

Parear novamente (inclusive após revogar o agente) exige gerar outro código e executar novamente o instalador. Isso substitui o token anterior. A tarefa agendada roda sob a mesma conta Windows que fez a instalação; não troque a conta sem refazer o pareamento.

## Segurança e semântica de impressão

- Só o hash SHA-256 do token duradouro é salvo no banco. O token em claro é devolvido uma vez no pareamento e protegido localmente por DPAPI `CurrentUser`.
- O código de pareamento aleatório expira em 10 minutos, é invalidado no primeiro uso e não é armazenado em claro.
- A API do agente exige HTTPS e autenticação Bearer; a geração/revogação e o status são protegidos pelo login e papel administrativo no tRPC.
- O polling reivindica um job com bloqueio transacional. Se a impressão terminar sem confirmação, o servidor não repete automaticamente o job: após cinco minutos em estado de processamento ele vira `uncertain`, para evitar duplicatas. Confira a impressora antes de solicitar nova impressão.
- O estado `printed` significa que o Windows aceitou o trabalho no spooler; não é confirmação física de que o papel saiu.
- O ticket do barista destaca os campos em fonte ampliada; a observação usa fonte ESC/POS tripla, em negrito, e quebra linhas a cada 14 caracteres de referência, podendo consumir mais papel quando a observação for longa. Os demais recibos mantêm a formatação anterior. O agente não pede confirmação de impressão, mas alertas de papel/tampa/energia continuam dependendo do hardware e do driver Windows.

## Diagnóstico

- Verifique se a URL começa com `https://`, se o computador consegue abri-la e se o certificado é válido.
- Confirme que a impressora está online em **Configurações > Bluetooth e dispositivos > Impressoras e scanners** e imprima uma página de teste do Windows.
- Confira o arquivo `%LOCALAPPDATA%\ShadowLounge\PrinterAgent\agent.log`.
- Consulte a tarefa com `Get-ScheduledTask -TaskName ShadowLoungePrinterAgent` e `Get-ScheduledTaskInfo -TaskName ShadowLoungePrinterAgent`.
- Se os caracteres acentuados ou comandos saírem incorretos, verifique a configuração ESC/POS RAW e PC850 da fila/driver; não troque o driver sem antes testar uma página de teste do Windows.
- Se o status de job ficar `uncertain`, inspecione a impressora e o spooler antes de reimprimir.

## Referências do hardware

- [Knup — Impressora Térmica IM602 (página do fabricante)](https://knup.com.br/produto/impressora-termica-im602/): SKU KP-IM602, USB, compatibilidade Windows e cortador automático.
- [LDQ — ficha de KP-IM602 (revendedor)](https://www.ldq.com.br/Produto/696e5615bb370d00f607a037): descreve ESC/POS, CP850 e especificações complementares. Use como referência secundária; prevalece o manual da revisão física instalada.
