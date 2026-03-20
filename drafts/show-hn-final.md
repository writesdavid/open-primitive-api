# Title (paste in HN title field)

Show HN: Open Primitive — 17 federal data APIs with signed responses for AI agents

# URL

https://api.openprimitive.com

# Comment (paste as first comment immediately after submission)

17 US federal data domains behind one REST API. EPA, FDA, CMS, NHTSA, BTS, OSHA, HHS, CFPB, FCC, USDA. The Open Primitive project wraps each agency's data in a standard envelope: source authority, observation timestamp, confidence score, and citation chain. Every response is Ed25519 signed. Downstream agents verify they got what the server sent.

The problem: agents need structured federal data with provenance. Current options are scraping agency sites or hitting raw APIs that each return different schemas, different auth patterns, different error formats. None of them tell the agent how fresh the data is or where it came from.

The response envelope (OPP) ships four fields no federal API provides: `source` (originating database and query), `freshness` (observation time and cache age), `confidence` (0-1 score based on data quality signals), and `citations` (direct links to authoritative records).

Stack: Express on Vercel serverless. No framework. No build step.

Try it:

```
curl "https://api.openprimitive.com/v1/ask?q=is+the+water+safe+in+10001"
```

MCP server with 17 tools, listed on the official MCP Registry:

```
npx open-primitive-mcp
```

Also on RapidAPI (free tier).

Looking for feedback: which data domains matter most for agent workflows? Is the response envelope structure useful, or does your stack need something different?
