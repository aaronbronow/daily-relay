#!/bin/sh

# Start the cron daemon in the background
crond -b -L /var/log/cron.log

echo "[Entrypoint] PWD: $(pwd)"
echo "[Entrypoint] Content of /app:"
ls -F /app

# Run the aggregator once on startup to ensure initial content exists
echo "[Entrypoint] Running initial aggregation..."
npm run aggregate

# Start the Express server
echo "[Entrypoint] Starting Express server..."
npm start
