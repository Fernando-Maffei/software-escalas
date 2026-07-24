# Como instalar no servidor central

Este guia é para **quem vai montar a máquina que roda o sistema** (o "servidor").
O time **não precisa** fazer nada disso — eles só abrem o navegador. Veja `README-TIME.md`.

A ideia: **uma máquina** roda o sistema o tempo todo, e todo o time acessa pela rede.

---

## O que a máquina do servidor precisa ter

1. **Node.js 20 ou superior** — https://nodejs.org/ (baixe a versão "LTS").
2. **SQL Server** acessível (o banco `SoftwareEscalas`). Pode ser o SQL Server Express
   na própria máquina, ou outro servidor SQL da rede.
3. A **pasta do projeto** copiada para a máquina (ex.: `C:\App de escalas`).

---

## Passo 1 — Configurar o acesso ao banco (.env)

Na pasta do projeto, faça uma cópia de `.env.example` chamada `.env` e preencha os dados
do banco. Exemplo:

```
PORT=4450
DB_USER=admin
DB_PASSWORD=suaSenhaAqui
DB_SERVER=localhost\SQLEXPRESS
DB_DATABASE=SoftwareEscalas
DB_ENCRYPT=true
DB_TRUST_CERT=true
```

> O `.env` **não** vai para o Git (fica só nessa máquina). Guarde a senha em local seguro.

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

Abra o **PowerShell como Administrador** e rode (uma única vez):

```powershell
New-NetFirewallRule -DisplayName "Central de Escalas 4450" -Direction Inbound -Protocol TCP -LocalPort 4450 -Action Allow
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
senha aleatória, impressa **uma única vez** no log do servidor (ou defina `ADMIN_PASSWORD`
no `.env` antes de subir). Anote e troque no primeiro login.

---

## Quando for para a nuvem (HTTPS)

Quando o sistema for hospedado na nuvem com endereço `https://...`, o navegador passa a
mostrar o botão **"Instalar"** automático (PWA completo). Nada precisa mudar no código —
o `manifest.json` já está pronto para isso.
