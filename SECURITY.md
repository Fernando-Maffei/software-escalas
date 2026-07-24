# Politica de Seguranca

## Versao suportada

Recebe correcoes de seguranca a versao mais recente publicada na branch `main`
(atualmente a serie 1.6.x).

## Como reportar uma vulnerabilidade

Se voce encontrar uma falha de seguranca, **nao abra uma issue publica**. Reporte
de forma privada para:

- **E-mail:** fernandmaffei@gmail.com

Inclua, se possivel:

- descricao da falha e do impacto potencial;
- passos para reproduzir;
- versao afetada.

Voce recebera um retorno assim que possivel. Pedimos que a falha nao seja
divulgada publicamente ate que uma correcao esteja disponivel.

## Boas praticas ja adotadas

- Autenticacao obrigatoria, com troca de senha no primeiro acesso.
- Rate limiting no login contra ataques de forca bruta.
- Segredos (senha do banco, credenciais de administrador) ficam em `.env` e em
  `backend/config/`, fora do controle de versao.
- Backup de seguranca automatico antes de restaurar dados.
