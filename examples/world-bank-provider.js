const express = require("express");
const fetch = require("node-fetch");

const app = express();

const manifest = {
  name: "World Bank Open Data (OPP Provider)",
  protocolVersion: "0.1.0",
  providerLevel: 2,
  domains: [
    {
      id: "indicators",
      name: "Economic Indicators",
      source: "World Bank",
      entityTypes: ["country", "indicator"],
    },
  ],
  endpoints: [{ path: "/v1/indicators", method: "GET" }],
};

app.get("/.well-known/opp.json", (req, res) => {
  res.json(manifest);
});

app.get("/v1/indicators", async (req, res) => {
  const { country, indicator } = req.query;

  if (!country || !indicator) {
    return res.status(400).json({
      error: "Both 'country' and 'indicator' query params are required.",
    });
  }

  const indicatorMap = {
    GDP: "NY.GDP.MKTP.CD",
    GNI: "NY.GNP.MKTP.CD",
    POPULATION: "SP.POP.TOTL",
    LIFE_EXPECTANCY: "SP.DYN.LE00.IN",
    CO2: "EN.ATM.CO2E.PC",
  };

  const wbIndicator = indicatorMap[indicator.toUpperCase()] || indicator;
  const sourceUrl = `https://api.worldbank.org/v2/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(wbIndicator)}?format=json&per_page=5`;

  try {
    const resp = await fetch(sourceUrl);
    const raw = await resp.json();

    if (!Array.isArray(raw) || !raw[1]) {
      return res.json(envelope(country, indicator, sourceUrl, [], "No data found for this query."));
    }

    const records = raw[1].map((r) => ({
      year: r.date,
      value: r.value,
      unit: r.unit || null,
    }));

    res.json(envelope(country, indicator, sourceUrl, records, null));
  } catch (err) {
    res.status(502).json(envelope(country, indicator, sourceUrl, [], "World Bank API request failed: " + err.message));
  }
});

function envelope(country, indicator, sourceUrl, data, error) {
  return {
    domain: "indicators",
    source: "World Bank Open Data",
    source_url: sourceUrl,
    freshness: new Date().toISOString(),
    confidence: data.length > 0 ? 0.95 : 0,
    citations: [
      {
        title: "World Bank Open Data",
        url: "https://data.worldbank.org",
      },
    ],
    query: { country, indicator },
    data,
    ...(error ? { error } : {}),
  };
}

if (require.main === module) {
  const port = process.env.PORT || 4001;
  app.listen(port, () => {
    console.log("World Bank OPP provider running on port " + port);
  });
}

module.exports = app;
