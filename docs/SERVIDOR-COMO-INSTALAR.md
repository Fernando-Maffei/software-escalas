# Como instalar no servidor central

Este guia é para **quem vai montar a máquina que roda o sistema** (o "servidor").
O time **não precisa** fazer nada disso — eles só abrem o navegador. Veja `README-TIME.md`.

A ideia: **uma máquina** roda o sistema o tempo todo, e todo o time acessa pela rede.

---

## O que a máquina do servidor precisa ter

1. **Node.js 20.19 ou superior** — https://nodejs.org/ (baixe a versão "LTS").
2. **SQL Server** instalado na própria máquina (o **SQL Server Express**, gratuito,
   serve). Na instalação, guarde o **nome da instância**.
3. A **pasta do projeto** copiada para a máquina (ex.: `C:App de escalas`) — fora
   de pastas sincronizadas (OneDrive, Google Drive). Dentro dela, rode uma vez:

   ```bash
   npm ci --omit=dev
   ```

O Docker **não** é necessário neste modelo.

---

## Passo 1 — Preparar o SQL Server e conectar o app

### 1.1 Preparar o SQL Server (uma vez)

O app só conversa com o SQL Server por **TCP/IP**, e o SQL Server Express vem com
o TCP/IP **desabilitado**. Enquanto isso não for ligado, a tela de configuração
responde *"A instância do SQL Server não respondeu por TCP/IP"*.

Abra o **PowerShell como Administrador**, entre na pasta do projeto e rode:

```powershell
powershell -ExecutionPolicy Bypass -File scriptspreparar-sql-server.ps1
```

O script pode ser repetido sem estragar nada e faz, nesta ordem:

1. habilita o TCP/IP da instância na porta fixa **1433** (troque com `-PortaSql`);
2. liga a autenticação mista (Windows + SQL Server);
3. reinicia o serviço do SQL Server, se mudou algo;
4. cria o banco `SoftwareEscalas` e o login `escalas_app`, dono **só desse
   banco** — ele pede para você criar a senha (o app não usa o `sa`);
5. libera a porta **4450** do app no firewall do Windows.

Havendo mais de uma instância, informe qual: `-Instancia NOME`. Outros nomes:
`-Banco`, `-Login`, `-PortaApp`.

> A porta do SQL Server **não** é liberada no firewall, de propósito: app e banco
> ficam na mesma máquina, e o time só precisa alcançar o app (porta 4450).

<details>
<summary>Fazer na mão, sem o script</summary>

1. **SQL Server Configuration Manager** → *Configuração de Rede do SQL Server* →
   *Protocolos de &lt;instância&gt;* → **TCP/IP** → *Habilitar*. Na aba *Endereços IP*,
   em **IPAll**, apague *Portas TCP Dinâmicas* e ponha `1433` em *Porta TCP*.
2. Reinicie o serviço *SQL Server (&lt;instância&gt;)*.
3. No SSMS (ou `sqlcmd`), crie o banco e o login do app:

   ```sql
   CREATE DATABASE SoftwareEscalas;
   CREATE LOGIN escalas_app WITH PASSWORD = 'troque-esta-senha', CHECK_POLICY = ON;
   USE SoftwareEscalas;
   CREATE USER escalas_app FOR LOGIN escalas_app;
   ALTER ROLE db_owner ADD MEMBER escalas_app;
   ```

</details>

### 1.2 Subir o app e informar a conexão

Na pasta do projeto:

```bash
npm start
```

Abra `http://localhost:4450`. Numa máquina ainda sem banco configurado aparece a
tela **Configuração inicial**. Preencha com o que o script mostrou no final:

| Campo | Valor |
|---|---|
| Servidor / host | `localhost` |
| Porta | `1433` |
| Instância | *(vazio — com porta fixa não precisa)* |
| Nome do banco | `SoftwareEscalas` |
| Usuário SQL | `escalas_app` |
| Senha | a que você criou no passo 1.1 |

**Testar** e depois **Salvar**. O app cria as tabelas e o administrador na hora. A
conexão fica gravada em `backend/config/database.local.json` (só nessa máquina,
fora do Git).

### 1.3 Opcional — arquivo `.env`

Para fixar a senha do primeiro administrador (em vez da aleatória) ou trocar a
porta do app, copie `.env.example` para `.env` na raiz do projeto **antes** de
subir pela primeira vez:

```
PORT=4450
ADMIN_PASSWORD=umaSenhaForte
```

O servidor lê o `.env` ao iniciar. Ele **não** vai para o Git.

### 1.4 Trazer os dados de outra instalação (ex.: do Docker)

Em **Configurações → Banco de dados → Importar Dados**, escolha o arquivo de
backup mais recente (`backup-escalas-....json`). Atenção: o backup **não leva
contas de usuário** — os logins (e os setores permitidos de cada um) precisam ser
recriados em **Configurações → Usuários**.

Depois de importar, confira em **Configurações → Banco de dados** a **pasta de
backup** e o backup automático: eles são configurados por máquina.

---

## Passo 2 — Descobrir e fixar o IP da máquina

O time vai acessar por esse IP, então ele **não pode mudar**.

1. Abra o **Prompt de Comando** e rode:

   ```bash
   ipconfig
   ```

   Anote o **"Endereço IPv4"** (algo como `192.168.0.50`).

2. Para o IP não mudar sozinho, peça ao responsável pela rede para **reservar esse IP**
   no roteador (reserva por DHCP) ou configure um **IP fixo** nas propriedades da rede
   do Windows. Se não fizer isso, um dia o endereço muda e o time perde o acesso.

A partir daí, o endereço do sistema para o time será:

```
http://SEU-IP:4450
```

Ex.: `http://192.168.0.50:4450`

---

## Passo 3 — Liberar a porta no firewall do Windows

O script do passo 1.1 já faz isso. Se você preparou o SQL Server na mão, abra o
**PowerShell como Administrador** e rode (uma única vez):

```powershell
New-NetFirewallRule -DisplayName "App de Escalas 4450" -Direction Inbound -Protocol TCP -LocalPort 4450 -Action Allow
```

Sem isso, o servidor sobe mas ninguém da rede consegue abrir.

---

## Passo 4 — Deixar o servidor ligado sozinho (Serviço do Windows)

Assim o sistema **sobe junto com o Windows**, sem ninguém precisar abrir nada, e
**reinicia sozinho** se cair. Usamos uma ferramentinha gratuita chamada **NSSM**.

1. Baixe o NSSM em https://nssm.cc/download e extraia. Use a pasta `win64\nssm.exe`.

2. Abra o **PowerShell como Administrador** e rode (ajuste os caminhos entre aspas):

   ```powershell
   # caminho do node.exe (confirme com: where.exe node)
   # caminho da pasta do projeto

   C:\caminho\para\nssm.exe install CentralEscalas "C:\Program Files\nodejs\node.exe" "backend\server.js"
   C:\caminho\para\nssm.exe set CentralEscalas AppDirectory "C:\App de escalas"
   C:\caminho\para\nssm.exe set CentralEscalas Start SERVICE_AUTO_START
   C:\caminho\para\nssm.exe start CentralEscalas
   ```

3. Pronto. O serviço "CentralEscalas" agora sobe sozinho a cada reinício.

   - **Ver se está rodando:** abra `services.msc` e procure "CentralEscalas".
   - **Parar:** `C:\caminho\para\nssm.exe stop CentralEscalas`
   - **Remover:** `C:\caminho\para\nssm.exe remove CentralEscalas confirm`

> **Alternativa sem baixar nada:** dá para usar o **Agendador de Tarefas** do Windows
> com um gatilho "Ao iniciar o computador" rodando `node backend\server.js` na pasta do
> projeto, marcando "Executar estando o usuário conectado ou não". O NSSM é melhor porque
> reinicia sozinho em caso de queda.

---

## Passo 5 — Testar

Na própria máquina do servidor, abra o navegador em `http://localhost:4450`.
Em outro computador da rede, abra `http://SEU-IP:4450`. Se a tela de login aparecer nos
dois, está tudo certo — é só repassar o endereço para o time.

---

## Primeiro acesso (senha do admin)

Na primeira vez que o banco estiver vazio, o sistema cria o usuário **admin** e gera uma
senha aleatória, mostrada **uma única vez** na tela de configuração inicial (ou no log do
servidor). Para escolher a senha, defina `ADMIN_PASSWORD` no `.env` antes de subir (passo
1.3) — rodando como serviço não há console para ler a senha gerada. Anote e troque no
primeiro login.

---

## Quando for para a nuvem (HTTPS)

Quando o sistema for hospedado na nuvem com endereço `https://...`, o navegador passa a
mostrar o botão **"Instalar"** automático (PWA completo). Nada precisa mudar no código —
o `manifest.json` já está pronto para isso.
