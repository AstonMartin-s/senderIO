# Imagen única para API y worker. El comando de arranque se define por servicio
# en Railway (start:api:prod / start:worker).
FROM node:20-slim

WORKDIR /app

# Instala dependencias del backend (incluye devDeps: tsx/tsc se usan en runtime/build).
COPY package.json package-lock.json* ./
RUN npm install

# Copia el resto del código.
COPY . .

# Compila el dashboard (Vite) para que la API lo sirva como estático.
RUN cd dashboard && npm install && npm run build

ENV NODE_ENV=production

# Por defecto arranca la API; el servicio worker sobreescribe el CMD.
CMD ["npm", "run", "start:api:prod"]
