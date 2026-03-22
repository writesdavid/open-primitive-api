/**
 * Open Primitive — WebMCP Tool Registration
 * https://api.openprimitive.com/webmcp.js
 *
 * Registers all Open Primitive federal data tools via navigator.modelContext.
 * First government data site with WebMCP support.
 *
 * Include on any page:
 * <script src="https://api.openprimitive.com/webmcp.js"></script>
 */

(async function () {
  const API = 'https://api.openprimitive.com/v1';

  // Polyfill if navigator.modelContext not available
  if (!('modelContext' in navigator)) {
    try {
      await import('https://unpkg.com/@mcp-b/global');
    } catch (e) {
      // No polyfill available — exit silently
      return;
    }
  }

  if (!navigator.modelContext || !navigator.modelContext.registerTool) return;

  const reg = navigator.modelContext.registerTool.bind(navigator.modelContext);

  // --- Drugs ---
  reg({
    name: 'check-drug-safety',
    description: 'Look up FDA adverse events for any drug by name. Returns reported side effects, severity counts, and demographic breakdowns from federal records.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Drug name (brand or generic, e.g. Ozempic, metformin)' },
        reaction: { type: 'string', description: 'Filter by specific adverse reaction' }
      },
      required: ['name']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ name, reaction }) => {
      const p = new URLSearchParams({ name });
      if (reaction) p.set('reaction', reaction);
      const res = await fetch(`${API}/drugs?${p}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Food ---
  reg({
    name: 'search-food-recalls',
    description: 'Search FDA food recall alerts. Returns recall classification, reason, distribution, and status.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (product name, brand, or contaminant)' },
        status: { type: 'string', description: 'Recall status filter (ongoing, completed, terminated)' }
      },
      required: ['query']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ query, status }) => {
      const p = new URLSearchParams({ query });
      if (status) p.set('status', status);
      const res = await fetch(`${API}/food?${p}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Water ---
  reg({
    name: 'search-water-violations',
    description: 'Search EPA Safe Drinking Water Act violations by location. Returns violation type, contaminant, and enforcement actions.',
    inputSchema: {
      type: 'object',
      properties: {
        zip: { type: 'string', description: 'ZIP code' },
        state: { type: 'string', description: 'Two-letter state code (e.g. CA, TX)' },
        system_name: { type: 'string', description: 'Water system name' }
      }
    },
    annotations: { readOnlyHint: true },
    execute: async ({ zip, state, system_name }) => {
      const p = new URLSearchParams();
      if (zip) p.set('zip', zip);
      if (state) p.set('state', state);
      if (system_name) p.set('system_name', system_name);
      const res = await fetch(`${API}/water?${p}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Hospitals ---
  reg({
    name: 'search-hospital-quality',
    description: 'Search CMS hospital quality ratings. Returns overall star rating, mortality, readmission, and patient experience scores.',
    inputSchema: {
      type: 'object',
      properties: {
        hospital_name: { type: 'string', description: 'Hospital name' },
        state: { type: 'string', description: 'Two-letter state code' },
        measure: { type: 'string', description: 'Quality measure to filter by' }
      }
    },
    annotations: { readOnlyHint: true },
    execute: async ({ hospital_name, state, measure }) => {
      const p = new URLSearchParams();
      if (hospital_name) p.set('hospital_name', hospital_name);
      if (state) p.set('state', state);
      if (measure) p.set('measure', measure);
      const res = await fetch(`${API}/hospitals?${p}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Health (Supplements) ---
  reg({
    name: 'check-supplement-evidence',
    description: 'Look up clinical evidence for health supplements and natural products. Returns efficacy ratings, study quality, and safety signals.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Supplement name (e.g. ashwagandha, vitamin D, creatine)' },
        condition: { type: 'string', description: 'Health condition to check against' }
      },
      required: ['name']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ name, condition }) => {
      const p = new URLSearchParams({ name });
      if (condition) p.set('condition', condition);
      const res = await fetch(`${API}/health?${p}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Cars ---
  reg({
    name: 'search-car-complaints',
    description: 'Search NHTSA vehicle complaint data by make, model, and year. Returns complaint counts, common issues, and investigation status.',
    inputSchema: {
      type: 'object',
      properties: {
        make: { type: 'string', description: 'Vehicle manufacturer (e.g. Toyota, Ford, Tesla)' },
        model: { type: 'string', description: 'Vehicle model (e.g. Camry, F-150, Model 3)' },
        year: { type: 'number', description: 'Model year' }
      },
      required: ['make']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ make, model, year }) => {
      const p = new URLSearchParams({ make });
      if (model) p.set('model', model);
      if (year) p.set('year', String(year));
      const res = await fetch(`${API}/cars?${p}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Nutrition ---
  reg({
    name: 'lookup-nutrition',
    description: 'Look up USDA nutrition data for any food. Returns calories, macronutrients, vitamins, and minerals per serving.',
    inputSchema: {
      type: 'object',
      properties: {
        food: { type: 'string', description: 'Food name (e.g. chicken breast, brown rice, avocado)' }
      },
      required: ['food']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ food }) => {
      const res = await fetch(`${API}/nutrition?food=${encodeURIComponent(food)}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Jobs ---
  reg({
    name: 'search-jobs-data',
    description: 'Search Bureau of Labor Statistics employment and wage data by occupation, industry, or location.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Occupation, industry, or job title' },
        state: { type: 'string', description: 'Two-letter state code' }
      },
      required: ['query']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ query, state }) => {
      const p = new URLSearchParams({ query });
      if (state) p.set('state', state);
      const res = await fetch(`${API}/jobs?${p}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Demographics ---
  reg({
    name: 'lookup-demographics',
    description: 'Look up Census Bureau demographic data for any US location. Returns population, income, education, and housing statistics.',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City, county, state, or ZIP code' }
      },
      required: ['location']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ location }) => {
      const res = await fetch(`${API}/demographics?location=${encodeURIComponent(location)}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Products ---
  reg({
    name: 'search-product-recalls',
    description: 'Search CPSC consumer product recall data. Returns hazard description, remedy, and units affected.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product name, brand, or hazard type' }
      },
      required: ['query']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ query }) => {
      const res = await fetch(`${API}/products?query=${encodeURIComponent(query)}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- SEC ---
  reg({
    name: 'search-sec-filings',
    description: 'Search SEC EDGAR company filings. Returns 10-K, 10-Q, 8-K filings with key financial data.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name or ticker symbol' },
        filing_type: { type: 'string', description: 'Filing type (10-K, 10-Q, 8-K)' }
      },
      required: ['company']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ company, filing_type }) => {
      const p = new URLSearchParams({ company });
      if (filing_type) p.set('filing_type', filing_type);
      const res = await fetch(`${API}/sec?${p}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Weather ---
  reg({
    name: 'check-weather',
    description: 'Get National Weather Service forecast and alerts for any US location.',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City and state, ZIP code, or coordinates' }
      },
      required: ['location']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ location }) => {
      const res = await fetch(`${API}/weather?location=${encodeURIComponent(location)}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Eligible ---
  reg({
    name: 'check-benefits-eligibility',
    description: 'Check eligibility for federal benefit programs (SNAP, Medicaid, CHIP, housing assistance) based on household data.',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', description: 'Two-letter state code' },
        household_size: { type: 'number', description: 'Number of people in household' },
        income: { type: 'number', description: 'Annual household income in dollars' }
      },
      required: ['state']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ state, household_size, income }) => {
      const p = new URLSearchParams({ state });
      if (household_size) p.set('household_size', String(household_size));
      if (income) p.set('income', String(income));
      const res = await fetch(`${API}/eligible?${p}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Risk ---
  reg({
    name: 'assess-location-risk',
    description: 'Assess natural disaster and environmental risk for any US location. Returns flood, wildfire, earthquake, and pollution risk scores from FEMA and EPA data.',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City, ZIP code, or address' }
      },
      required: ['location']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ location }) => {
      const res = await fetch(`${API}/risk?location=${encodeURIComponent(location)}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Location ---
  reg({
    name: 'lookup-location',
    description: 'Look up comprehensive federal data for any US location. Aggregates Census, EPA, FEMA, and BLS data into a single profile.',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City, county, state, or ZIP code' }
      },
      required: ['location']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ location }) => {
      const res = await fetch(`${API}/location?location=${encodeURIComponent(location)}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Compare ---
  reg({
    name: 'compare-locations',
    description: 'Compare two US locations across federal data dimensions: demographics, cost of living, safety, environment, jobs.',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'string', description: 'First location' },
        b: { type: 'string', description: 'Second location' }
      },
      required: ['a', 'b']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ a, b }) => {
      const p = new URLSearchParams({ a, b });
      const res = await fetch(`${API}/compare?${p}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Ask ---
  reg({
    name: 'ask-open-primitive',
    description: 'Ask a natural language question about any federal data domain. Routes to the right dataset and returns a structured answer.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Natural language question about federal data' }
      },
      required: ['question']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ question }) => {
      const res = await fetch(`${API}/ask?question=${encodeURIComponent(question)}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Air ---
  reg({
    name: 'check-air-quality',
    description: 'Check EPA air quality index (AQI) and pollutant levels for any US location.',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City, ZIP code, or state' }
      },
      required: ['location']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ location }) => {
      const res = await fetch(`${API}/air?location=${encodeURIComponent(location)}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  // --- Flights ---
  reg({
    name: 'check-flight-risk',
    description: 'Check delay and cancellation probability for a flight route. Uses BTS historical data, FAA live status, and weather forecasts.',
    inputSchema: {
      type: 'object',
      properties: {
        airline: { type: 'string', description: 'Airline code (e.g. DL, UA, AA, WN)' },
        origin: { type: 'string', description: 'Origin airport code (e.g. ATL, LAX, ORD)' },
        destination: { type: 'string', description: 'Destination airport code' },
        date: { type: 'string', description: 'Flight date (YYYY-MM-DD)' }
      },
      required: ['origin', 'destination']
    },
    annotations: { readOnlyHint: true },
    execute: async ({ airline, origin, destination, date }) => {
      const p = new URLSearchParams({ origin, destination });
      if (airline) p.set('airline', airline);
      if (date) p.set('date', date);
      const res = await fetch(`${API}/flights?${p}`);
      return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] };
    }
  });

  console.log('[Open Primitive] WebMCP: 19 federal data tools registered');
})();
