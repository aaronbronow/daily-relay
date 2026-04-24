/**
 * Ollama Item-Level Prompt Refinement Tester
 * 
 * Usage: OLLAMA_URL=http://... OLLAMA_MODEL=... node tests/promptTester.js
 */

async function testPrompt() {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://100.106.38.68:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2:3b';

  const mockItems = [
    {
      site: "Hacker News",
      title: "Why I Write (1946)",
      description: "An essay by a famous author explaining their motivations for writing technical documentation and political commentary."
    },
    {
      site: "Hacker News",
      title: "DeepSeek v4",
      description: "The latest release of an open-source model that outperforms previous versions in coding and reasoning tasks."
    },
    {
      site: "Ubuntu Security Notices",
      title: "USN-8206-1: OpenMPT vulnerability",
      description: "Multiple security issues were discovered in OpenMPT. If a user or automated system were tricked into opening a specially crafted module file, a remote attacker could possibly use this issue to cause a denial of service, or execute arbitrary code."
    }
  ];

  console.log(`--- Starting Item-Level Prompt Test ---`);
  console.log(`Model: ${ollamaModel}`);
  console.log(`URL: ${ollamaUrl}\n`);

  for (const item of mockItems) {
    const prompt = `You are a professional briefing assistant. Summarize the following news item into exactly ONE concise sentence.

<instructions>
1. Output ONLY the raw text of the summary.
2. DO NOT use markdown lists, bullets, bolding, or headings.
3. DO NOT include any conversational preamble or introductory text.
4. VERBATIM MODE: Use the provided title verbatim if it is clear. DO NOT add names of authors, creators, or additional historical context.
5. NOISE REDUCTION: For security notices, DO NOT include tracking numbers (e.g., USN-XXXX, CVE-XXXX). Focus on the software and the vulnerability.
6. If the item is not interesting or relevant, output "No significant update."
</instructions>

<content>
Title: ${item.title}
Description: ${item.description || 'N/A'}
</content>

Summary:`;

    try {
      process.stdout.write(`Testing [${item.title}]... `);
      const response = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: prompt,
          stream: false
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log("DONE");
        console.log(`- ${result.response.trim()}\n`);
      } else {
        console.log(`FAILED (${response.status})\n`);
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}\n`);
    }
  }
}

testPrompt();
