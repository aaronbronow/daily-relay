FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy source code and entrypoint
COPY src ./src
COPY public ./public
COPY entrypoint.sh ./

# Ensure public and data directories exist
RUN mkdir -p data public

# Setup Crontab
# Run aggregator every hour at the top of the hour
RUN echo "0 * * * * cd /app && /usr/local/bin/npm run aggregate >> /var/log/cron.log 2>&1" > /etc/crontabs/root

# Install tzdata for correct timezone handling
RUN apk add --no-cache tzdata

# Create log file for cron
RUN touch /var/log/cron.log

# Expose the server port
EXPOSE 3000

# Use the entrypoint script to start crond and the app
ENTRYPOINT ["/app/entrypoint.sh"]
