---
title: "Hospital Quality Ratings API — CMS Data, One Endpoint"
published: false
tags: api, health, hospitals, data
canonical_url: https://api.openprimitive.com
---

# Hospital Quality Ratings API — CMS Data, One Endpoint

CMS rates every Medicare-certified hospital in the country. Star ratings, readmission rates, mortality data, patient experience scores. The data lives in CSV files on data.cms.gov. Updated quarterly. The schema shifts between releases.

Open Primitive serves that data as structured JSON. Search by hospital name, city, state, or ZIP code.

## The endpoint

```
GET https://api.openprimitive.com/hospitals
```

## Search by name

```bash
curl "https://api.openprimitive.com/hospitals?name=mayo+clinic"
```

## Search by ZIP

```bash
curl "https://api.openprimitive.com/hospitals?zip=10001&radius=10"
```

## Response

```json
{
  "results": [
    {
      "name": "Mayo Clinic - Rochester",
      "city": "Rochester",
      "state": "MN",
      "zip": "55905",
      "overall_rating": 5,
      "mortality_rating": "Above the national average",
      "readmission_rating": "Below the national average",
      "patient_experience_rating": "Above the national average",
      "emergency_services": true,
      "type": "Acute Care",
      "ownership": "Voluntary non-profit - Private"
    }
  ],
  "total": 2
}
```

## What the ratings mean

CMS assigns 1 to 5 stars based on 47 quality measures across 5 categories: mortality, safety, readmission, patient experience, and timely care. A 5-star hospital performs above the national average on most measures. A 1-star hospital falls below on most. About 430 hospitals earn 5 stars. About 4,500 hospitals receive a rating at all.

## ZIP radius search

The ZIP code query accepts an optional radius parameter in miles. Default is 25. This returns every rated hospital within that radius, sorted by overall rating descending. Useful for patient-facing apps that need "best hospitals near me" without geocoding overhead.

## Filter by state

```bash
curl "https://api.openprimitive.com/hospitals?state=CA&rating=5"
```

Returns every 5-star hospital in California. Combine with type filters for acute care, critical access, or psychiatric facilities.

## Rate limits

Free tier: 500 calls/day. [RapidAPI](https://rapidapi.com/writesdavid/api/open-primitive-api). Docs: [api.openprimitive.com](https://api.openprimitive.com)
