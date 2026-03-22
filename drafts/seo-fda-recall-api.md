---
title: "FDA Food Recall API — Free, Structured, Real-Time"
published: false
tags: api, food, safety, data
canonical_url: https://api.openprimitive.com
---

# FDA Food Recall API — Free, Structured, Real-Time

The FDA publishes food recall data. Good. But the format changes, the pagination breaks, and the field names shift between endpoints. You spend more time parsing than building.

Open Primitive pulls from the FDA recall enforcement database, normalizes every field, and returns clean JSON. One endpoint. Free. No API key. No limits.

## The endpoint

```
GET https://api.openprimitive.com/food/recalls
```

## Try it

```bash
curl "https://api.openprimitive.com/food/recalls?limit=3"
```

## Response

```json
{
  "results": [
    {
      "brand": "Fresh Express",
      "product": "Bagged Caesar Salad Kit",
      "reason": "Potential E. coli O157:H7 contamination",
      "classification": "Class I",
      "status": "Ongoing",
      "recall_date": "2024-12-14",
      "distribution": "Nationwide"
    }
  ],
  "total": 312,
  "limit": 3,
  "offset": 0
}
```

## What you get

Every recall includes the brand, product description, reason, FDA classification (Class I/II/III), status, date, and distribution pattern. Class I means a reasonable probability of serious health consequences. Class III means the product probably won't hurt anyone but violated FDA rules anyway.

## Search by keyword

```bash
curl "https://api.openprimitive.com/food/recalls?q=listeria&limit=5"
```

Returns all recalls mentioning listeria. You can also filter by classification, date range, or status.

## Who uses this

Food safety apps that need recall alerts without maintaining their own FDA scraper. Grocery delivery platforms checking products against active recalls. Researchers tracking contamination patterns across brands and categories.

The raw FDA data works. This is faster.

## Rate limits

Free. No API key. No limits. Docs: [api.openprimitive.com](https://api.openprimitive.com)
