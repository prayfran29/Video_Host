FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy source code
COPY *.js *.html *.css *.md ./
COPY .dockerignore ./

# Create directories
RUN mkdir -p /app/videos /app/data

EXPOSE 3000

CMD ["npm", "start"]