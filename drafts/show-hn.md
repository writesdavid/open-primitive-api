# Show HN: Open Primitive – Federal data APIs built for AI agents

**URL:** https://api.openprimitive.com

---

**Comment to post immediately after submission:**

I built Open Primitive because federal data is public but not usable. Not by people. Not by software. Definitely not by AI agents.

The US government publishes data on food recalls, drug side effects, hospital quality, drinking water violations, vehicle safety, and more. Thirteen domains total. The raw sources are scattered across dozens of agencies, each with its own format, its own quirks, its own way of making your life harder.

Open Primitive normalizes all of it into clean REST endpoints. One API. Consistent structure. Real-time where the source allows it, cached where it doesn't.

What makes this different from other government data wrappers:

- **Cross-domain safety scores.** Ask about a ZIP code and get a composite view across water, food, hospitals, and environmental data. No single federal agency does this.
- **MCP server.** Claude, GPT, and other LLMs can call these endpoints directly through the Model Context Protocol.
- **A2A agent card.** Google's Agent-to-Agent protocol is supported. Agents can discover and call Open Primitive without human configuration.
- **Built for machines first.** Every response is structured for downstream consumption. No scraping. No HTML parsing. No guessing.

Solo build. I work in content engineering at Block during the day. This started because I wanted to see if federal data gets better when AI translates it, or if you should just read the source yourself. That question turned into infrastructure.

The whole thing runs on Node.js and Vercel serverless. No framework. No build step.

GitHub: https://github.com/writesdavid/open-primitive-api

Feedback welcome. Especially on which domains matter most and what agents actually need from an API like this.
