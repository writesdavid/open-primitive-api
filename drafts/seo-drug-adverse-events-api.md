---
title: "FDA Drug Adverse Events API — FAERS Data, Structured JSON"
published: false
tags: api, pharma, health, data
canonical_url: https://api.openprimitive.com
---

# FDA Drug Adverse Events API — FAERS Data, Structured JSON

FAERS holds every adverse event report submitted to the FDA since 2004. Millions of records. The FDA's own API returns nested, inconsistent JSON with opaque field names. Parsing it takes longer than the analysis.

Open Primitive restructures FAERS data into flat, queryable JSON. Search by drug name. Get back reaction counts, severity breakdowns, and demographic patterns.

## The endpoint

```
GET https://api.openprimitive.com/drugs/adverse-events
```

## Try it

```bash
curl "https://api.openprimitive.com/drugs/adverse-events?drug=aspirin"
```

## Response

```json
{
  "drug": "aspirin",
  "total_reports": 601284,
  "top_reactions": [
    { "reaction": "Drug ineffective", "count": 18420 },
    { "reaction": "Nausea", "count": 15803 },
    { "reaction": "Headache", "count": 12547 },
    { "reaction": "Gastrointestinal haemorrhage", "count": 11239 },
    { "reaction": "Dizziness", "count": 9876 }
  ],
  "serious_percentage": 68.4,
  "outcome_breakdown": {
    "hospitalization": 42.1,
    "death": 12.8,
    "disability": 4.3,
    "other": 40.8
  }
}
```

## 601K reports for aspirin alone

That number surprises people. Aspirin has been on the market for over a century. Every GI bleed, every allergic reaction, every drug interaction gets filed. The volume tells you about reporting patterns as much as danger.

## Pharmacovigilance use case

Drug safety teams monitor FAERS for signal detection — unexpected spikes in specific adverse events for a given drug. Doing that against the raw FDA API means writing a custom parser for every query. This endpoint handles the normalization.

Search any drug by generic or brand name. Compare reaction profiles across drugs in the same class. Track report volume over time.

## Filter by seriousness

```bash
curl "https://api.openprimitive.com/drugs/adverse-events?drug=metformin&serious=true"
```

Returns only reports classified as serious by the FDA — hospitalization, death, disability, or life-threatening events.

## Rate limits

Free. No API key. No limits. Docs: [api.openprimitive.com](https://api.openprimitive.com)
