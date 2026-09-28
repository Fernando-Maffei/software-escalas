# Imagem do App de Escalas (servidor Node/Express).
# O banco NAO fica aqui — roda no seu proprio container (ver docker-compose.yml).

FROM node:20-slim

WORKDIR /app

# Copia so os manifestos primeiro para aproveitar o cache do Docker: enquanto
# package.json/package-lock.json nao mudarem, a camada de "npm ci" e reusada.
COPY package*.json ./
RUN npm ci --omit=dev

# Agora o resto do codigo. Fica com dono root: o app le, mas nao consegue
# alterar o proprio codigo.
COPY . .

# O app roda sem privilegio de root, como o usuario "node" da imagem oficial
# (uid 1000). So escreve na pasta de dados (/data: configuracoes do banco e do
# backup) e na pasta de backup configurada, que deve ficar dentro de /data ou
# num volume montado. Volumes criados por versoes que rodavam como root sao
# corrigidos pelo servico app-permissoes do docker-compose.yml.
RUN mkdir -p /data && chown node:node /data
USER node

# Porta padrao do servidor (ver backend/server.js). Pode ser trocada por PORT.
ENV PORT=4450
EXPOSE 4450

CMD ["node", "backend/server.js"]
