---
title: "NHTSA Car Safety API — Crash Ratings and Recalls"
published: false
tags: api, cars, safety, data
canonical_url: https://api.openprimitive.com
---

# NHTSA Car Safety API — Crash Ratings and Recalls

NHTSA publishes crash test ratings and recall data for every vehicle sold in the US. Two separate systems, two different APIs, two response formats. Neither returns clean JSON without parsing work.

Open Primitive combines both into a single endpoint. Search by make, model, and year. Get back star ratings and active recalls in one response.

## The endpoint

```
GET https://api.openprimitive.com/cars
```

## Try it

```bash
curl "https://api.openprimitive.com/cars?make=toyota&model=camry&year=2024"
```

## Response

```json
{
  "vehicle": {
    "make": "Toyota",
    "model": "Camry",
    "year": 2024,
    "overall_rating": 5,
    "frontal_crash": 4,
    "side_crash": 5,
    "rollover": 5
  },
  "recalls": [
    {
      "date": "2024-08-12",
      "component": "Fuel System",
      "summary": "Fuel pump impeller may deform, causing engine stall",
      "consequence": "Engine stall increases crash risk",
      "remedy": "Dealers replace fuel pump assembly",
      "affected_units": 44826
    }
  ],
  "total_recalls": 1
}
```

## Star ratings explained

NHTSA rates vehicles from 1 to 5 stars across three categories: frontal crash, side crash, and rollover resistance. The overall rating combines all three. A 5-star overall means the vehicle had a less than 10% chance of serious injury in frontal and side crash tests. The 2024 Camry earned 5 stars overall — 4 for frontal, 5 for side, 5 for rollover.

## Search recalls only

```bash
curl "https://api.openprimitive.com/cars/recalls?make=toyota&year=2024"
```

Returns every 2024 Toyota recall across all models. Skip the model parameter to see the full picture for a manufacturer in a given year.

## Filter by component

```bash
curl "https://api.openprimitive.com/cars/recalls?make=ford&component=airbag"
```

The Takata airbag recalls affected 67 million vehicles. This query surfaces every Ford-specific airbag recall with affected unit counts and remedy status.

## Used car checks

Pass any make/model/year combination to see the full recall history. Useful for used car platforms, insurance underwriting, and fleet management tools that need safety data without scraping NHTSA directly.

## Rate limits

Free tier: 500 calls/day. [RapidAPI](https://rapidapi.com/writesdavid/api/open-primitive-api). Docs: [api.openprimitive.com](https://api.openprimitive.com)
