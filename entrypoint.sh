#!/bin/sh

# Start the cron daemon in the background
crond -b -L /var/log/cron.log

echo "[Entrypoint] PWD: $(pwd)"
echo "[Entrypoint] Content of /app:"
ls -F /app

# Start the Express server in the background
echo "[Entrypoint] Starting Express server..."
npm start &

# Run the aggregator once on startup to ensure initial content exists
echo "[Entrypoint] Running initial aggregation..."
npm run aggregate

# Keep the entrypoint script alive so the container doesn't exit, 
# and also wait on background jobs
wait
