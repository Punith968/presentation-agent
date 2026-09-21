FROM node:20-bullseye

# Install libreoffice for PPTX to PDF conversion
RUN apt-get update && apt-get install -y \
    libreoffice \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy frontend package files
COPY frontend/package*.json ./frontend/

# Install root dependencies
RUN npm install

# Install frontend dependencies
RUN cd frontend && npm install

# Copy all source code
COPY . .

# Build frontend
RUN npm run build:frontend

# Ensure upload directories exist
RUN mkdir -p uploads slides audio

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
