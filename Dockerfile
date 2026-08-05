# Imagem do App de Escalas (servidor Node/Express).
# O banco NAO fica aqui — roda no seu proprio container (ver docker-compose.yml).

FROM node:20-slim

WORKDIR /app

# Copia so os manifestos primeiro para aproveitar o cache do Docker: enquanto
# package.json/package-lock.json nao mudarem, a camada de "npm ci" e reusada.
COPY package*.json ./
RUN npm ci --omit=dev

# Agora o resto do codigo.
COPY . .

# Porta padrao do servidor (ver backend/server.js). Pode ser trocada por PORT.
ENV PORT=4450
EXPOSE 4450

CMD ["node", "backend/server.js"]
