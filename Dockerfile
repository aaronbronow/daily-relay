FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install

# Copy source code and entrypoint
COPY src ./src
COPY public ./public
COPY entrypoint.sh ./

# Ensure public and data directories exist
RUN mkdir -p data public

# Setup Crontab
# Run aggregator every minute for testing/demo purposes
RUN echo "* * * * * cd /app && /usr/local/bin/npm run aggregate >> /var/log/cron.log 2>&1" > /etc/crontabs/root

# Create log file for cron
RUN touch /var/log/cron.log

# Expose the server port
EXPOSE 3000

# Use the entrypoint script to start crond and the app
ENTRYPOINT ["/app/entrypoint.sh"]
