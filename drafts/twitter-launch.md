# Open Primitive API — Launch Thread

**1/**

I built the first website where AI agents are the primary audience.

Not a chatbot wrapper. Not an AI startup. A federal data API designed for machines to read, so they stop making things up.

api.openprimitive.com


**2/**

Ask Claude "is my water safe?" and it will confidently give you an answer. That answer is fabricated. The EPA publishes real violation data for every water system in the country. But no agent can reach it. The data exists. The pipes don't.


**3/**

So I built the pipes. Open Primitive API pulls from 10 federal agencies across 13 data domains. Real numbers. Real enforcement records. Real inspection dates. One unified REST API.


**4/**

The 13 domains:

- Water safety — EPA SDWIS
- Hospital quality — CMS Hospital Compare
- Nursing homes — CMS Nursing Home Compare
- Drug side effects — FDA FAERS
- Food recalls — FDA Enforcement
- Car defects — NHTSA Complaints
- Airline delays — BTS On-Time
- Clinical trials — ClinicalTrials.gov
- Health supplements — NIH DSLD
- Medical devices — FDA MAUDE
- Air quality — EPA AQS
- Workplace safety — OSHA Inspections
- School safety — ED Civil Rights


**5/**

The thing no federal agency does: cross-domain queries.

GET /v1/safety?zip=90210 returns EPA water violations and CMS hospital ratings in one response. A single call combines data that lives in 2 different agencies, 2 different formats, 2 different update cycles. One score.


**6/**

Built for agents from the ground up. MCP server with 13 tools. A2A agent card at /.well-known/agent.json. Full llms.txt at the root. robots.txt that says: this data is meant for you.

Every protocol an AI agent might speak, answered.


**7/**

The stats page shows what percentage of traffic comes from machines vs. humans. Right now it is almost entirely machines. That was the point.

api.openprimitive.com/stats.html


**8/**

I built this in one day with Claude Code. 13 source modules. 50+ AI agents deployed in parallel, each wiring up a different federal data source. One person, one terminal, one model.


**9/**

What ships next: 20+ domains by end of quarter. Historical data archives going back a decade. Webhook alerts when your zip code gets a new violation. Enterprise tier for production agent fleets.


**10/**

api.openprimitive.com — free tier, no credit card, no waitlist. The API docs are the landing page because the landing page is for machines.

Code is on GitHub: github.com/writesdavid/open-primitive-api
