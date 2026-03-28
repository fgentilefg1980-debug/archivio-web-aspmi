# Usa l'immagine base di Node.js
FROM node:14

# Imposta la cartella di lavoro all'interno del container
WORKDIR /app

# Copia il file package.json e package-lock.json per l'installazione delle dipendenze
COPY package*.json ./

# Installa le dipendenze
RUN npm install

# Copia tutti i file del progetto nella cartella di lavoro
COPY . .

# Espone la porta su cui l'applicazione sarà in esecuzione
EXPOSE 8080

# Comando per avviare l'app
CMD ["npm", "start"]