# WebMCP Implementation Research for Open Primitive

Research date: 2026-03-21

## 1. What WebMCP is

WebMCP (Web Model Context Protocol) is a W3C Draft Community Group Report, released February 10, 2026. Google and Microsoft co-authored it. The W3C Web Machine Learning Community Group governs it. The spec lives at https://webmachinelearning.github.io/webmcp/.

WebMCP lets a website register structured, callable tools with the browser. AI agents discover and invoke those tools through `navigator.modelContext` instead of scraping the DOM or taking screenshots.

## 2. How navigator.modelContext works

The API sits on the Navigator interface in secure contexts (HTTPS only). A website calls `navigator.modelContext.registerTool()` with a name, description, JSON Schema for inputs, and an execute callback. The browser holds these registrations. An AI agent operating in the browser queries available tools, reads their schemas, and calls them directly.

Two complementary APIs:

**Declarative API** -- HTML forms already have action, method, and typed inputs. WebMCP adds attributes that make forms explicitly visible to agents without JavaScript.

**Imperative API** -- `navigator.modelContext.registerTool()` for dynamic, complex interactions. This is the primary path for Open Primitive.

## 3. What metadata a page needs to expose

Each tool registration requires:
- `name`: string identifier (e.g., `search_car_complaints`)
- `description`: natural language explanation of what the tool does
- `inputSchema`: JSON Schema object defining parameters (types, enums, required fields)
- `execute`: async callback that performs the action and returns structured content

Optional `ToolAnnotations`:
- `readOnlyHint` (boolean, default false) -- signals the tool only reads data, never mutates state. Every Open Primitive tool should set this to `true`.

## 4. It is a JS API, not a meta tag

WebMCP is a JavaScript API (`navigator.modelContext`), not a meta tag or link tag. The declarative path uses HTML form attributes, but the primary mechanism is imperative JS registration.

## 5. Code example: adding WebMCP to an Open Primitive page

```javascript
// Guard for browser support
if ('modelContext' in navigator) {

  // Example: Cars tool (car-truth)
  navigator.modelContext.registerTool({
    name: 'search_car_complaints',
    description: 'Search NHTSA vehicle complaint data by make, model, and year. Returns complaint counts, common issues, and investigation status from federal records.',
    inputSchema: {
      type: 'object',
      properties: {
        make: {
          type: 'string',
          description: 'Vehicle manufacturer (e.g., Toyota, Ford, Tesla)'
        },
        model: {
          type: 'string',
          description: 'Vehicle model name (e.g., Camry, F-150, Model 3)'
        },
        year: {
          type: 'number',
          description: 'Model year (e.g., 2023)'
        }
      },
      required: ['make']
    },
    annotations: {
      readOnlyHint: true
    },
    async execute({ make, model, year }) {
      const params = new URLSearchParams({ make });
      if (model) params.set('model', model);
      if (year) params.set('year', year);

      const response = await fetch(`/api/complaints?${params}`);
      const data = await response.json();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data)
        }]
      };
    }
  });
}
```

## 6. Open Primitive tool registrations

Each tool page should register one or more tools. Here is the mapping:

| Tool | Registration name | Description | Key parameters |
|------|------------------|-------------|----------------|
| Cars | `search_car_complaints` | NHTSA complaint data by vehicle | make, model, year |
| Water | `search_water_violations` | EPA water system violations | zip, state, system_name |
| Drugs | `search_drug_effects` | FDA adverse event reports | drug_name, reaction |
| Food | `search_food_recalls` | FDA food recall alerts | query, status, date_range |
| Health | `search_health_supplements` | Supplement efficacy data | supplement_name, condition |
| Hospitals | `search_hospital_quality` | CMS hospital quality ratings | hospital_name, state, measure |
| Dice Flights | `check_flight_risk` | Flight delay/cancel probability | airline, origin, destination, date |

Every tool sets `readOnlyHint: true`. Open Primitive only reads federal data.

## 7. Polyfill status

The `@mcp-b/webmcp-polyfill` npm package polyfills `navigator.modelContext` for browsers without native support. It adds a validation layer for JSON Schema. This means Open Primitive can ship WebMCP now and it works in non-Chrome browsers via the polyfill.

```html
<script src="https://unpkg.com/@mcp-b/global"></script>
```

Or via npm:
```
npm install @mcp-b/global
```

Then `import '@mcp-b/global'` before registering tools.

## 8. Would agents prefer Open Primitive over raw federal APIs?

Yes, for three reasons:

1. **Schema clarity.** Raw federal APIs (NHTSA, EPA, FDA) have inconsistent schemas, undocumented parameters, and XML responses. WebMCP-registered tools on Open Primitive expose clean JSON Schemas with natural language descriptions.

2. **Token efficiency.** Agents consuming Open Primitive via WebMCP skip DOM parsing entirely. The search results cite 67% reduction in computational overhead vs. traditional browser interaction, with 98% task accuracy.

3. **Discoverability.** An agent visiting openprimitive.com gets a manifest of 7 government data tools instantly. No API key signup, no documentation hunting, no authentication.

The "89% token efficiency over screenshot methods" claim from the Director of Research aligns with published benchmarks (67-89% range depending on page complexity).

## 9. Who else has implemented WebMCP?

As of March 2026, adoption is early:
- E-commerce demos (add-to-cart, product search) from the Chrome team
- WordPress plugin (`webmcp-abilities`) bridges WordPress to the API
- Example repos at https://github.com/WebMCP-org/examples
- No government data sites have implemented WebMCP yet

Open Primitive would be first in the government data space.

## 10. Timeline

| Date | Milestone |
|------|-----------|
| Feb 10, 2026 | W3C Draft Community Group Report published |
| Feb 2026 | Chrome 146 Canary ships with flag `chrome://flags > WebMCP for testing` |
| ~Mar 2026 | Chrome 146 hits stable (WebMCP still behind flag) |
| TBD | Origin Trial expected (allows production use without flag) |
| TBD | Edge support expected (shared Chromium base) |
| TBD | Firefox/Safari -- no announced plans |

The API surface will change. Do not build mission-critical flows on it yet. But registering read-only data tools is low-risk -- if the API changes, the tools degrade gracefully (agents fall back to DOM scraping).

## Implementation recommendation

**Do it now.** The risk is near zero for read-only tools. The upside is being the first government data site with WebMCP metadata.

Steps:
1. Add `@mcp-b/global` polyfill to each tool page (one script tag)
2. Add a `webmcp-tools.js` script to each tool that registers the tool with `navigator.modelContext.registerTool()`
3. Set `readOnlyHint: true` on every registration
4. Guard all registrations with `if ('modelContext' in navigator)`
5. Each tool's execute callback calls the existing `/api/` endpoint and returns structured JSON
6. Test in Chrome 146 Canary with the flag enabled
7. Use the Model Context Tool Inspector Chrome extension (https://github.com/beaufortfrancois/model-context-tool-inspector) to verify registrations

## Sources

- W3C Spec: https://webmachinelearning.github.io/webmcp/
- Chrome blog: https://developer.chrome.com/blog/webmcp-epp
- DataCamp tutorial: https://www.datacamp.com/tutorial/webmcp-tutorial
- VentureBeat coverage: https://venturebeat.com/infrastructure/google-chrome-ships-webmcp-in-early-preview-turning-every-website-into-a
- Polyfill/SDK: https://www.npmjs.com/package/@mcp-b/webmcp-ts-sdk
- Examples repo: https://github.com/WebMCP-org/examples
- Tool Inspector extension: https://github.com/beaufortfrancois/model-context-tool-inspector
- Patrick Brosset updates: https://patrickbrosset.com/articles/2026-02-23-webmcp-updates-clarifications-and-next-steps/
