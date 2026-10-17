# Como instalar no servidor central

Este guia é para **quem vai montar a máquina que roda o sistema** (o "servidor").
O time **não instala nada**: só abre o endereço no navegador (veja `README-TIME.md`).

A ideia: **uma máquina** fica ligada com o sistema, e todo o time acessa pela rede.

---

## Antes de começar (uma vez)

**A máquina:**

- [ ] Windows 10/11 Pro (64 bits) ou Windows Server, com 8 GB de RAM ou mais.
- [ ] **Nunca dorme:** *Configurações → Sistema → Energia* → suspender e
      hibernar em **Nunca**. Máquina dormindo = time sem acesso. (Reinício por
      atualização do Windows não tem problema: o sistema volta sozinho.)
- [ ] Na rede **por cabo**, se der, e com **IP reservado no roteador**.
- [ ] Uma conta de **Administrador** e **internet** durante a instalação.

**O que instalar e copiar:**

1. **SQL Server Express** instalado na máquina (gratuito):
   https://www.microsoft.com/pt-br/sql-server/sql-server-downloads → *Express* →
   instalação **Básica**. Não precisa configurar nada nele: o instalador do app faz.
2. **A pasta do app** copiada para **`C:\CentralEscalas`**, fora de OneDrive,
   Google Drive e Dropbox (a sincronização corrompe a instalação).
   - Veio de um `.zip`? Antes de extrair: botão direito no zip → *Propriedades* →
     marque **Desbloquear** → OK. Senão o Windows bloqueia os scripts.
   - Ou, com Git: `git clone https://github.com/Fernando-Maffei/software-escalas.git C:\CentralEscalas`

O **Node.js** não precisa ser instalado antes: o instalador oferece instalar se faltar.

---

## Instalar (um passo)

Na pasta `C:\CentralEscalas`, dê **dois cliques em `INSTALAR-SERVIDOR.cmd`** e
aceite o aviso do Windows (ele pede permissão de Administrador).

Ele vai pedir duas senhas:

| Pergunta | O que é |
|---|---|
| Senha do login `escalas_app` | A senha com que o **app** entra no SQL Server. Ninguém digita ela no dia a dia; fica guardada no `.env` (só administradores leem). Se o login já existe, digite a senha atual dele. |
| Senha do admin | A senha do usuário **admin** do sistema, para o primeiro login. |

E faz o resto sozinho, mostrando cada etapa:

1. confere o Node.js (instala pelo `winget` se faltar ou estiver velho);
2. instala as dependências do app;
3. prepara o SQL Server: TCP/IP na porta 1433, autenticação mista, banco
   `SoftwareEscalas` e o login `escalas_app`, dono só desse banco;
4. grava a configuração (`.env`) — a tela de "Configuração inicial" nem aparece;
5. liga o **backup automático**: a cada 3 horas e ao desligar, em
   `C:\Backups-Escalas`, guardando os 240 mais recentes;
6. registra a tarefa **CentralDeEscalasServidor**, que sobe o sistema **junto
   com o Windows, sem ninguém logar**, e o religa em 10 s se ele cair;
7. libera a porta **4450** no firewall, sobe o sistema e confere se respondeu.

No final aparece o **endereço para o time**, algo como `http://192.168.0.50:4450`.

Pode rodar de novo quando quiser: o que já existe é mantido.

> Opções (para quem roda pelo PowerShell): `-Porta 4450`, `-Instancia NOME`
> (se houver mais de um SQL Server na máquina), `-PastaBackup D:\Backups`.

---

## Depois de instalar

1. **Fixe o IP da máquina.** O time acessa por ele; se mudar, ninguém entra.
   Peça uma **reserva de DHCP** no roteador (ou configure IP fixo no Windows).
2. **Entre como `admin`** com a senha que você escolheu e crie os usuários do
   time em **Configurações → Usuários**.
3. **Trazendo dados de outra instalação?** Em **Configurações → Banco de dados →
   Importar Dados**, escolha o backup mais recente (`backup-escalas-....json`).
   O backup **não leva contas de usuário**: recrie-as no passo 2.
4. **Teste de outro computador**: abra `http://IP-DO-SERVIDOR:4450`. Apareceu a
   tela de login? Pronto, é só passar o endereço para o time.
5. **Teste o reinício**: reinicie a máquina **sem fazer login** e abra o
   endereço de outro computador. Tem que funcionar.
6. **Ícone nas máquinas do time**: passe o arquivo **`CRIAR-ATALHO.cmd`** (está
   na pasta do app) para cada computador — pendrive, pasta da rede ou e-mail. Dois
   cliques, digita o endereço do servidor, e aparece o ícone *Central de
   Escalas*, que abre o sistema em janela própria. Nada é instalado.

Dica: copie a pasta `C:\Backups-Escalas` para fora da máquina de vez em quando
(pendrive, rede, nuvem). Se o disco morrer, o backup morre junto.

---

## Dia da virada (trazer o sistema de outra máquina)

Enquanto o servidor novo não entra, a instalação antiga continua valendo.
No dia:

1. **Antes:** anote os usuários e os setores permitidos de cada um
   (*Configurações → Usuários*) — o backup não leva contas.
2. Combine um horário em que ninguém esteja lançando nada.
3. Na máquina **antiga**: *Configurações → Banco de dados → Gerar backup*, copie
   o arquivo e **pare o sistema antigo** (para ninguém gravar no lugar errado).
4. Na máquina **nova**: `INSTALAR-SERVIDOR.cmd`, entre como admin,
   *Importar Dados* com esse backup e recrie os usuários.
5. Confira: colaboradores, plantões e banco de horas com os mesmos números de
   antes; um relatório do mês batendo.
6. Reinicie o servidor **sem fazer login** e abra de outro computador.
7. Passe o endereço novo para o time.

Deu errado em algum passo? Religue o sistema antigo — ele está intacto — e
corrija com calma.

---

## Atualizar para uma versão nova

Dois cliques em **`ATUALIZAR-SERVIDOR.cmd`**. Ele:

1. faz um **backup na hora** (se falhar, para e não mexe em nada);
2. busca o código novo (`git pull`, se a pasta veio do Git). Se veio de `.zip`,
   **antes** extraia o zip novo **por cima** de `C:\CentralEscalas` — o `.env`
   e a pasta `backend\config` não estão no zip e ficam como estão;
3. para o sistema, atualiza as dependências, sobe de novo e confere.

O sistema fica fora do ar por alguns segundos. As mudanças de banco
(migrations) rodam sozinhas quando ele sobe.

---

## No dia a dia

| Quero... | Como |
|---|---|
| Ver se está rodando | Abrir `http://localhost:4450` no servidor |
| Ver erros | `C:\CentralEscalas\logs\servidor.log` |
| Parar | PowerShell como Administrador: `Stop-ScheduledTask CentralDeEscalasServidor` e depois `Get-Process node \| Stop-Process` |
| Iniciar | `Start-ScheduledTask CentralDeEscalasServidor` (ou reiniciar a máquina) |
| Backup na hora | Configurações → Banco de dados → Gerar backup |

---

## Problemas comuns

- **"Nenhum SQL Server encontrado"** — instale o SQL Server Express (passo
  "Antes de começar") e rode de novo.
- **"A porta 4450 já está em uso"** — já tem outra cópia do app rodando nesta
  máquina. Feche-a (ou pare o Docker, se usava) e rode de novo.
- **Outros computadores não abrem, mas no servidor abre** — confira se estão na
  mesma rede e se o IP é o certo. O firewall já foi liberado pelo instalador.
- **Instalou, mas não abre nem no servidor** — veja o final do
  `logs\servidor.log`.

---

## Quando for para a nuvem (HTTPS)

Com o sistema num endereço `https://...`, o navegador passa a mostrar o botão
**"Instalar"** automático (PWA completo). Nada muda no código: o
`manifest.json` já está pronto.
