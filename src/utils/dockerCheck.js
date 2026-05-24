const fs = require('fs').promises;

/**
 * Checks if key configuration/dependency files in the container are out of sync with the host.
 * Returns an array of warning messages if discrepancies are found.
 * @returns {Promise<string[]>}
 */
async function checkDockerSync() {
  const warnings = [];
  const filesToCompare = [
    { container: '/app/package.json', host: '/app/package.json.host', label: 'package.json' },
    { container: '/app/package-lock.json', host: '/app/package-lock.json.host', label: 'package-lock.json' },
    { container: '/app/Dockerfile', host: '/app/Dockerfile.host', label: 'Dockerfile' },
    { container: '/app/entrypoint.sh', host: '/app/entrypoint.sh.host', label: 'entrypoint.sh' }
  ];

  for (const pair of filesToCompare) {
    try {
      let containerContent;
      try {
        containerContent = await fs.readFile(pair.container, 'utf8');
      } catch (err) {
        // Container file not readable (might be running in local non-Docker development)
        continue;
      }

      let hostContent;
      try {
        hostContent = await fs.readFile(pair.host, 'utf8');
      } catch (err) {
        // Host file not readable/mounted (might be running in local non-Docker development)
        continue;
      }

      if (containerContent !== hostContent) {
        warnings.push(`Container ${pair.label} is out of sync with host. Please rebuild the Docker container.`);
      }
    } catch (globalErr) {
      // Gracefully catch any other unexpected read/permission errors
    }
  }

  return warnings;
}

module.exports = { checkDockerSync };
