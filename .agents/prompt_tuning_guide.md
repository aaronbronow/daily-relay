# System Prompt Tuning Playbook & QA Guide

This guide describes how to run, modify, and extend the automated Ollama system prompt optimization framework in `daily-relay`. Prompt optimization is a crucial, recurring chore to ensure high-signal summaries, optimal token efficiency, and fast response times.

---

## 🚀 Overview of the Optimizer Tool

The prompt tuning system is located in [tests/promptOptimizer.js](file:///home/aaron/dev/daily-relay/tests/promptOptimizer.js).
It evaluates multiple system prompt variants against a target source (mocked or live) and scores them based on a hybrid grading index:
1. **Deterministic Quality Checks (50% weight)**: Fast JavaScript-level checks that enforce strict rules (no build numbers, no raw URLs, no boilerplate introduction, correct markdown format, sentence count bounds).
2. **LLM-as-a-judge Evaluation (50% weight)**: Semantic scoring using Ollama to grade summaries on conciseness, absence of noise, and style guidelines compliance.

### 💰 Token & Latency Saving Pre-Filter
To minimize local LLM token consumption and generation latency, the tool employs a **Deterministic Pre-Filter**. If a prompt variant fails any deterministic quality check (resulting in a score `< 10.0`), the tool **skips the expensive LLM-as-a-judge call entirely**, logs an optimization notice, and defaults the judge score to a failing grade.

---

## 🛠️ How to Run the Benchmark

Ensure your local Ollama server is running (defaulting to Tailnet IP or `http://100.106.38.68:11434`), then run:

```bash
# Run using the rich, local mock Insider build post (Recommended for speed & reproducible test)
node tests/promptOptimizer.js

# Run fetching the live Windows Insider RSS feed
node tests/promptOptimizer.js --live

# Run against a different local model
node tests/promptOptimizer.js --model llama3:8b
```

---

## ✍️ How to Add or Modify Prompt Variants

Open [tests/promptOptimizer.js](file:///home/aaron/dev/daily-relay/tests/promptOptimizer.js) and locate the `VARIANTS` array around line 55:

```javascript
const VARIANTS = [
  {
    id: "variant-id",
    name: "Descriptive Variant Name",
    systemPrompt: `You are an AI briefing assistant...`
  },
  // Add your new variant here!
];
```

Run the benchmark again to see how your new variant compares against the winning standard in terms of latency, scoring, and output length.

---

## 🔬 Scoring Logic

### Deterministic Checks (Code-Level)
- **`hasBuildNumber`**: Strips 2.5 points if standard build numbers (e.g. `22635`) or KB IDs are found.
- **`hasBoilerplate`**: Strips 2.0 points if introduction preambles ("Here is...", "This build...") are found.
- **`hasRawUrl`**: Strips 2.0 points if raw link addresses are printed instead of clean Markdown links.
- **Sentence Bounds**: Strips 1.0 point if summary sentence count falls outside variant instructions.
- **Formatting**: Strips 2.0 points if a structured variant lacks standard bold category indicators (**[Feature]**, etc.).

### LLM Judge Checks (Ollama-Level)
If deterministic checks pass, the runner queries the LLM judge to evaluate:
- **Conciseness** (1-10)
- **Lack of Boilerplate** (1-10)
- **Formatting & Readability** (1-10)

The **Composite Score** is:
$$\text{Composite Score} = \frac{\text{Deterministic Score} + \text{Judge Average}}{2}$$

---

## 📝 Future Optimization Opportunities
- **Context Compression**: When testing very long articles, compress the `originalText` passed to the judge by extracting only headings/lists via code-level regexes.
- **Multi-Collector Testing**: Copy or parameterize `tests/promptOptimizer.js` to run optimization suites for rss feed newsletters or sensitive IMAP email notifications.
