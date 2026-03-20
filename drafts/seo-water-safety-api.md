---
title: "EPA Water Safety API — Violations by ZIP Code"
published: false
tags: api, water, epa, data
canonical_url: https://api.openprimitive.com
---

# EPA Water Safety API — Violations by ZIP Code

The EPA tracks every Safe Drinking Water Act violation in the country through SDWIS — the Safe Drinking Water Information System. The data covers 150,000 water systems serving 300 million people. Getting a straight answer from SDWIS takes SQL knowledge and patience.

Open Primitive turns that into a ZIP code lookup. One query. Clean JSON.

## The endpoint

```
GET https://api.openprimitive.com/water/violations
```

## Try it

```bash
curl "https://api.openprimitive.com/water/violations?zip=07302"
```

## Response

```json
{
  "zip": "07302",
  "city": "Jersey City",
  "state": "NJ",
  "water_system": "Jersey City Municipal Utilities Authority",
  "population_served": 264152,
  "violations": [
    {
      "contaminant": "Total Trihalomethanes (TTHM)",
      "type": "MCL Violation",
      "begin_date": "2024-07-01",
      "status": "Resolved",
      "severity": "Formal Enforcement"
    },
    {
      "contaminant": "Lead and Copper Rule",
      "type": "Monitoring Violation",
      "begin_date": "2024-03-15",
      "status": "Active",
      "severity": "Informal Enforcement"
    }
  ],
  "total_violations": 2,
  "system_rating": "Moderate concern"
}
```

## What counts as a violation

MCL violations mean contaminant levels exceeded the Maximum Contaminant Level — the legal limit. Monitoring violations mean the water system failed to test when required. Treatment technique violations mean the system didn't apply required filtration or disinfection. Each type carries different enforcement consequences. All three show up in this endpoint.

## Filter by contaminant

```bash
curl "https://api.openprimitive.com/water/violations?zip=48201&contaminant=lead"
```

ZIP 48201 is Detroit. The lead query returns every lead-related violation for the serving water system. You can filter by any EPA-regulated contaminant: lead, copper, arsenic, nitrate, PFAS, coliform, and 90 others.

## Active violations only

```bash
curl "https://api.openprimitive.com/water/violations?zip=19101&status=active"
```

Returns only unresolved violations. Useful for real-time safety dashboards and tenant notification apps.

## Rate limits

Free tier: 500 calls/day. [RapidAPI](https://rapidapi.com/writesdavid/api/open-primitive-api). Docs: [api.openprimitive.com](https://api.openprimitive.com)
