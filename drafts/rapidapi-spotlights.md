# RapidAPI Spotlights

Copy each spotlight into RapidAPI's spotlight editor. Title, description, curl, and key response fields are ready to paste.

---

## Spotlight 1: "Is my water safe?"

**Title:** Is my water safe?

**Description:** Ask any question in plain English. The /v1/ask endpoint detects the domain, routes to the right federal source, and returns a direct answer. One call, no routing logic on your side.

**Curl:**

```bash
curl -G "https://open-primitive-api.vercel.app/v1/ask" \
  --data-urlencode "q=Is the tap water safe in 60614?" \
  -H "X-API-Key: YOUR_KEY"
```

**Key response fields:**

```json
{
  "domain": "ask",
  "question": "Is the tap water safe in 60614?",
  "routed_to": ["water"],
  "answer": "3 water system(s) found with no violations on record.",
  "results": [
    {
      "domain": "water",
      "data": {
        "domain": "water",
        "source": "EPA SDWIS",
        "systems": [
          {
            "name": "CITY OF CHICAGO",
            "violations": 0
          }
        ]
      }
    }
  ]
}
```

---

## Spotlight 2: "Compare drug side effects"

**Title:** Compare drug side effects

**Description:** Put two drugs head-to-head with a single call. The API pulls FDA adverse event reports for both and returns total events, serious events, top reactions, and a plain-language verdict.

**Curl:**

```bash
curl "https://open-primitive-api.vercel.app/v1/compare?type=drugs&a=ibuprofen&b=aspirin" \
  -H "X-API-Key: YOUR_KEY"
```

**Key response fields:**

```json
{
  "domain": "compare",
  "type": "drugs",
  "a": {
    "name": "ibuprofen",
    "totalEvents": 168435,
    "seriousEvents": 87221,
    "topReaction": "DRUG INEFFECTIVE"
  },
  "b": {
    "name": "aspirin",
    "totalEvents": 102847,
    "seriousEvents": 61503,
    "topReaction": "DRUG INTERACTION"
  },
  "verdict": "aspirin has fewer adverse events (102,847 vs 168,435)"
}
```

---

## Spotlight 3: "Complete ZIP code profile"

**Title:** Complete ZIP code profile

**Description:** One call returns demographics, income, and safety data for any US ZIP code. The API merges Census, EPA, and CMS data so you skip the three separate requests.

**Curl:**

```bash
curl "https://open-primitive-api.vercel.app/v1/location?zip=90210" \
  -H "X-API-Key: YOUR_KEY"
```

**Key response fields:**

```json
{
  "domain": "location",
  "source": "Census + EPA + CMS",
  "zip": "90210",
  "demographics": {
    "population": 21741,
    "medianIncome": 153146,
    "povertyRate": 8.2,
    "collegeRate": 74.1,
    "medianHomeValue": 2000001,
    "medianRent": 2501
  },
  "safety": {
    "score": 82,
    "water": { "systemCount": 1, "healthViolations": 0 },
    "hospitals": { "count": 4, "avgRating": 3.5 }
  },
  "summary": "ZIP 90210, population 21,741, median income $153,146, safety score 82/100"
}
```

---

## Spotlight 4: "FDA food recall alerts"

**Title:** FDA food recall alerts

**Description:** Get active FDA food recalls from the last 90 days. Each recall includes the classification level (Class I is the most serious), the product, and the reason. No parameters needed for the default feed.

**Curl:**

```bash
curl "https://open-primitive-api.vercel.app/v1/food" \
  -H "X-API-Key: YOUR_KEY"
```

**Key response fields:**

```json
{
  "domain": "food",
  "source": "FDA Enforcement",
  "total": 147,
  "recalls": [
    {
      "product": "Freeze Dried Strawberries, 1.2 oz bags",
      "firm": "Nature's Touch Frozen Foods",
      "classification": "Class I",
      "status": "Ongoing",
      "reason": "Potential contamination with Hepatitis A virus",
      "distribution": "Nationwide",
      "date": "20260215",
      "recallNumber": "F-0842-2026"
    }
  ]
}
```
