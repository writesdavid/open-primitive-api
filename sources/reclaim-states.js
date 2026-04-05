/**
 * reclaim-states.js — State unclaimed property search module
 *
 * Searches state unclaimed property databases by scraping their web portals.
 * Most states use SPAs with reCAPTCHA or Cloudflare protection, so scrapers
 * are built defensively: each state is wrapped in try/catch with a 15-second
 * timeout, returning empty arrays on failure.
 *
 * Cloudflare Workers compatible (fetch only, regex HTML parsing).
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fetchWithTimeout(url, opts = {}, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, {
    ...opts,
    signal: controller.signal,
    redirect: 'follow',
  })
    .then(res => { clearTimeout(id); return res; })
    .catch(err => { clearTimeout(id); throw err; });
}

function baseHeaders(extra = {}) {
  return {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    ...extra,
  };
}

function jsonHeaders(extra = {}) {
  return {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    ...extra,
  };
}

/** Extract cookies from Set-Cookie headers as a semicolon-joined string. */
function extractCookies(response) {
  const raw = response.headers.getSetCookie?.() || [];
  if (raw.length === 0) {
    const single = response.headers.get('set-cookie');
    if (single) return single.split(',').map(c => c.split(';')[0].trim()).join('; ');
    return '';
  }
  return raw.map(c => c.split(';')[0].trim()).join('; ');
}

/** Pull a value from an HTML hidden input by name using regex. */
function extractHiddenField(html, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`name=["']${escaped}["'][^>]*value=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  if (m) return m[1];
  // Try value-first ordering
  const re2 = new RegExp(`value=["']([^"']*)["'][^>]*name=["']${escaped}["']`, 'i');
  const m2 = html.match(re2);
  return m2 ? m2[1] : null;
}

/** Parse a dollar string like "$1,234.56" to a number. */
function parseDollar(str) {
  if (!str) return null;
  const cleaned = str.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Extract table rows from HTML. Returns array of arrays of cell text. */
function parseHtmlTable(html, tablePattern) {
  // Find the table block
  const tableMatch = html.match(tablePattern || /<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return [];

  const tableHtml = tableMatch[0];
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
    const cells = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      // Strip HTML tags from cell content
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function makeResult(overrides) {
  return {
    source: 'state',
    sourceName: '',
    ownerName: '',
    amount: null,
    propertyType: '',
    description: '',
    jurisdiction: '',
    holder: null,
    sourceUrl: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Individual state scrapers
// ---------------------------------------------------------------------------

/**
 * Michigan — unclaimedproperty.michigan.gov
 * Kelmar Envision platform. SPA that calls a backend search API.
 */
async function searchMichigan(firstName, lastName) {
  const searchUrl = 'https://unclaimedproperty.michigan.gov/Property/SearchIndex';
  const apiUrl = 'https://unclaimedproperty.michigan.gov/api/Property/Search';

  // Attempt 1: Try the JSON API endpoint directly
  const payload = {
    LastName: lastName,
    FirstName: firstName,
    MiddleName: '',
    Address: '',
    City: '',
    State: '',
    ZipCode: '',
    PropertyId: '',
    Page: 1,
    PageSize: 25,
    SortColumn: 'OwnerName',
    SortOrder: 'asc',
  };

  // Get session cookie first
  const pageRes = await fetchWithTimeout(searchUrl, { headers: baseHeaders() });
  const cookies = extractCookies(pageRes);
  const pageHtml = await pageRes.text();

  // Look for anti-forgery token
  const token = extractHiddenField(pageHtml, '__RequestVerificationToken');

  const apiHeaders = {
    ...jsonHeaders(),
    'Referer': searchUrl,
    'Origin': 'https://unclaimedproperty.michigan.gov',
  };
  if (cookies) apiHeaders['Cookie'] = cookies;
  if (token) apiHeaders['__RequestVerificationToken'] = token;

  const res = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    // Fallback: try form POST to the search page
    const formData = new URLSearchParams();
    formData.append('LastName', lastName);
    formData.append('FirstName', firstName);
    if (token) formData.append('__RequestVerificationToken', token);

    const formRes = await fetchWithTimeout(searchUrl, {
      method: 'POST',
      headers: {
        ...baseHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': searchUrl,
      },
      body: formData.toString(),
    });
    const html = await formRes.text();
    return parseMichiganHtml(html);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    const data = await res.json();
    const items = data.Properties || data.Results || data.properties || data.results || [];
    return items.map(item => makeResult({
      sourceName: 'Michigan Unclaimed Property',
      ownerName: item.OwnerName || item.ownerName || `${firstName} ${lastName}`,
      amount: parseDollar(String(item.Amount || item.amount || item.ReportedValue || '')),
      propertyType: item.PropertyType || item.propertyType || item.Category || '',
      description: item.Description || item.description || item.PropertyType || '',
      jurisdiction: 'MI',
      holder: item.HolderName || item.holderName || item.Holder || null,
      sourceUrl: 'https://unclaimedproperty.michigan.gov/Property/SearchIndex',
    }));
  }

  const html = await res.text();
  return parseMichiganHtml(html);
}

function parseMichiganHtml(html) {
  const rows = parseHtmlTable(html, /<table[^>]*class="[^"]*search-results[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  if (rows.length === 0) {
    // Try any table
    const allRows = parseHtmlTable(html);
    return allRows.slice(1).map(cells => makeResult({
      sourceName: 'Michigan Unclaimed Property',
      ownerName: cells[0] || '',
      amount: parseDollar(cells[2] || cells[1] || ''),
      propertyType: cells[3] || cells[1] || '',
      description: cells.join(' | '),
      jurisdiction: 'MI',
      holder: cells[4] || cells[3] || null,
      sourceUrl: 'https://unclaimedproperty.michigan.gov/Property/SearchIndex',
    })).filter(r => r.ownerName);
  }
  return rows.slice(1).map(cells => makeResult({
    sourceName: 'Michigan Unclaimed Property',
    ownerName: cells[0] || '',
    amount: parseDollar(cells[2] || ''),
    propertyType: cells[3] || '',
    description: cells.join(' | '),
    jurisdiction: 'MI',
    holder: cells[4] || null,
    sourceUrl: 'https://unclaimedproperty.michigan.gov/Property/SearchIndex',
  })).filter(r => r.ownerName);
}

/**
 * New York — osc.ny.gov/unclaimed-funds
 * The NY OSC uses a search at ouf.osc.ny.gov
 */
async function searchNewYork(firstName, lastName) {
  const searchPageUrl = 'https://ouf.osc.ny.gov/ouf/search.xhtml';

  const pageRes = await fetchWithTimeout(searchPageUrl, { headers: baseHeaders() });
  const cookies = extractCookies(pageRes);
  const pageHtml = await pageRes.text();

  // Extract JSF ViewState
  const viewState = extractHiddenField(pageHtml, 'javax.faces.ViewState')
    || extractHiddenField(pageHtml, 'j_id1:javax.faces.ViewState:0');

  // Extract form ID
  const formIdMatch = pageHtml.match(/id="([^"]*searchForm[^"]*)"/i)
    || pageHtml.match(/id="(mainForm)"/i)
    || pageHtml.match(/<form[^>]*id="([^"]+)"/i);
  const formId = formIdMatch ? formIdMatch[1] : 'searchForm';

  const formData = new URLSearchParams();
  formData.append(`${formId}:lastName`, lastName);
  formData.append(`${formId}:firstName`, firstName);
  formData.append(`${formId}:searchButton`, '');
  formData.append(`${formId}_SUBMIT`, '1');
  if (viewState) formData.append('javax.faces.ViewState', viewState);

  const searchRes = await fetchWithTimeout(searchPageUrl, {
    method: 'POST',
    headers: {
      ...baseHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
      'Referer': searchPageUrl,
    },
    body: formData.toString(),
  });

  const html = await searchRes.text();
  const rows = parseHtmlTable(html);
  return rows.slice(1).map(cells => makeResult({
    sourceName: 'New York Unclaimed Funds',
    ownerName: cells[0] || '',
    amount: parseDollar(cells[1] || cells[2] || ''),
    propertyType: cells[2] || cells[3] || '',
    description: cells.join(' | '),
    jurisdiction: 'NY',
    holder: cells[3] || cells[4] || null,
    sourceUrl: 'https://ouf.osc.ny.gov/ouf/search.xhtml',
  })).filter(r => r.ownerName);
}

/**
 * California — claimit.ca.gov (formerly ucpi.sco.ca.gov)
 * React SPA. Try the known API pattern.
 */
async function searchCalifornia(firstName, lastName) {
  // Try the known API endpoints
  const apiUrls = [
    'https://claimit.ca.gov/api/search',
    'https://claimit.ca.gov/api/property/search',
    'https://ucpi.sco.ca.gov/UCP/api/search',
  ];

  for (const apiUrl of apiUrls) {
    try {
      const payload = {
        firstName,
        lastName,
        searchType: 'Individual',
        pageNumber: 1,
        pageSize: 25,
      };

      const res = await fetchWithTimeout(apiUrl, {
        method: 'POST',
        headers: jsonHeaders({
          'Origin': 'https://claimit.ca.gov',
          'Referer': 'https://claimit.ca.gov/',
        }),
        body: JSON.stringify(payload),
      }, 10000);

      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json')) continue;

      const data = await res.json();
      const items = data.results || data.properties || data.Records || [];
      return items.map(item => makeResult({
        sourceName: 'California Unclaimed Property',
        ownerName: item.ownerName || item.OwnerName || `${firstName} ${lastName}`,
        amount: parseDollar(String(item.amount || item.Amount || item.cashReported || '')),
        propertyType: item.propertyType || item.PropertyType || '',
        description: item.description || item.Description || '',
        jurisdiction: 'CA',
        holder: item.holderName || item.HolderName || null,
        sourceUrl: 'https://claimit.ca.gov',
      }));
    } catch {
      continue;
    }
  }

  // Fallback: try form-based approach on legacy site
  const legacyUrl = 'https://ucpi.sco.ca.gov/UCP/Default.aspx';
  try {
    const pageRes = await fetchWithTimeout(legacyUrl, { headers: baseHeaders() }, 10000);
    const cookies = extractCookies(pageRes);
    const html = await pageRes.text();

    const viewState = extractHiddenField(html, '__VIEWSTATE');
    const eventValidation = extractHiddenField(html, '__EVENTVALIDATION');
    const viewStateGen = extractHiddenField(html, '__VIEWSTATEGENERATOR');

    if (!viewState) return [];

    const form = new URLSearchParams();
    form.append('__VIEWSTATE', viewState);
    if (eventValidation) form.append('__EVENTVALIDATION', eventValidation);
    if (viewStateGen) form.append('__VIEWSTATEGENERATOR', viewStateGen);
    form.append('ctl00$MainContent$txtLastName', lastName);
    form.append('ctl00$MainContent$txtFirstName', firstName);
    form.append('ctl00$MainContent$btnSearch', 'Search');

    const searchRes = await fetchWithTimeout(legacyUrl, {
      method: 'POST',
      headers: {
        ...baseHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'Referer': legacyUrl,
      },
      body: form.toString(),
    }, 10000);

    const resultHtml = await searchRes.text();
    const rows = parseHtmlTable(resultHtml);
    return rows.slice(1).map(cells => makeResult({
      sourceName: 'California Unclaimed Property',
      ownerName: cells[0] || '',
      amount: parseDollar(cells[1] || cells[2] || ''),
      propertyType: cells[2] || cells[3] || '',
      description: cells.join(' | '),
      jurisdiction: 'CA',
      holder: cells[3] || cells[4] || null,
      sourceUrl: 'https://claimit.ca.gov',
    })).filter(r => r.ownerName);
  } catch {
    return [];
  }
}

/**
 * Texas — claimittexas.gov
 * Comptroller Angular SPA. Try backend API patterns.
 */
async function searchTexas(firstName, lastName) {
  const apiUrls = [
    'https://www.claimittexas.gov/api/claim-search',
    'https://www.claimittexas.gov/app/controllers/api/claim-search',
    'https://comptroller.texas.gov/programs/unclaimed-property/search/',
  ];

  for (const apiUrl of apiUrls) {
    try {
      const payload = {
        firstName,
        lastName,
        searchType: 'name',
        page: 1,
        pageSize: 25,
      };

      const res = await fetchWithTimeout(apiUrl, {
        method: 'POST',
        headers: jsonHeaders({
          'Origin': 'https://www.claimittexas.gov',
          'Referer': 'https://www.claimittexas.gov/app/claim-search',
        }),
        body: JSON.stringify(payload),
      }, 10000);

      if (!res.ok) continue;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;

      const data = await res.json();
      const items = data.results || data.claims || data.Records || data.data || [];
      return items.map(item => makeResult({
        sourceName: 'Texas Unclaimed Property',
        ownerName: item.ownerName || item.OwnerName || item.name || `${firstName} ${lastName}`,
        amount: parseDollar(String(item.amount || item.Amount || item.reportedValue || '')),
        propertyType: item.propertyType || item.PropertyType || item.type || '',
        description: item.description || item.Description || '',
        jurisdiction: 'TX',
        holder: item.holderName || item.HolderName || item.holder || null,
        sourceUrl: 'https://www.claimittexas.gov/app/claim-search',
      }));
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Florida — fltreasurehunt.gov
 * React SPA with backend API.
 */
async function searchFlorida(firstName, lastName) {
  const apiUrls = [
    'https://fltreasurehunt.gov/api/search',
    'https://fltreasurehunt.gov/api/Property/Search',
    'https://fltreasurehunt.gov/ClaimSearch/api/search',
  ];

  for (const apiUrl of apiUrls) {
    try {
      const payload = {
        LastName: lastName,
        FirstName: firstName,
        Page: 1,
        PageSize: 25,
      };

      const res = await fetchWithTimeout(apiUrl, {
        method: 'POST',
        headers: jsonHeaders({
          'Origin': 'https://fltreasurehunt.gov',
          'Referer': 'https://fltreasurehunt.gov/ClaimSearch',
        }),
        body: JSON.stringify(payload),
      }, 10000);

      if (!res.ok) continue;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;

      const data = await res.json();
      const items = data.Properties || data.results || data.Records || data.data || [];
      return items.map(item => makeResult({
        sourceName: 'Florida Unclaimed Property',
        ownerName: item.OwnerName || item.ownerName || `${firstName} ${lastName}`,
        amount: parseDollar(String(item.Amount || item.amount || item.CashReported || '')),
        propertyType: item.PropertyType || item.propertyType || '',
        description: item.Description || item.description || '',
        jurisdiction: 'FL',
        holder: item.HolderName || item.holderName || null,
        sourceUrl: 'https://fltreasurehunt.gov/ClaimSearch',
      }));
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Pennsylvania — unclaimedproperty.patreasury.gov
 * Kelmar platform with reCAPTCHA. Try API and form POST.
 */
async function searchPennsylvania(firstName, lastName) {
  const searchUrl = 'https://unclaimedproperty.patreasury.gov/en/Property/SearchIndex';

  // Get session and tokens
  const pageRes = await fetchWithTimeout(searchUrl, { headers: baseHeaders() });
  const cookies = extractCookies(pageRes);
  const html = await pageRes.text();
  const token = extractHiddenField(html, '__RequestVerificationToken');

  // Try JSON API first
  const apiUrl = 'https://unclaimedproperty.patreasury.gov/api/Property/Search';
  try {
    const payload = {
      LastName: lastName,
      FirstName: firstName,
      Page: 1,
      PageSize: 25,
    };
    const apiHeaders = {
      ...jsonHeaders(),
      'Referer': searchUrl,
      'Origin': 'https://unclaimedproperty.patreasury.gov',
    };
    if (cookies) apiHeaders['Cookie'] = cookies;
    if (token) apiHeaders['__RequestVerificationToken'] = token;

    const res = await fetchWithTimeout(apiUrl, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify(payload),
    }, 10000);

    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('json')) {
        const data = await res.json();
        const items = data.Properties || data.Results || data.results || [];
        if (items.length > 0) {
          return items.map(item => makeResult({
            sourceName: 'Pennsylvania Unclaimed Property',
            ownerName: item.OwnerName || item.ownerName || `${firstName} ${lastName}`,
            amount: parseDollar(String(item.Amount || item.amount || '')),
            propertyType: item.PropertyType || item.propertyType || '',
            description: item.Description || item.description || '',
            jurisdiction: 'PA',
            holder: item.HolderName || item.holderName || null,
            sourceUrl: searchUrl,
          }));
        }
      }
    }
  } catch {
    // Fall through to form POST
  }

  // Form POST fallback (will likely fail due to reCAPTCHA)
  const form = new URLSearchParams();
  form.append('AddressSearchModel_LastName', lastName);
  form.append('AddressSearchModel_FirstName', firstName);
  if (token) form.append('__RequestVerificationToken', token);

  const searchRes = await fetchWithTimeout(searchUrl, {
    method: 'POST',
    headers: {
      ...baseHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
      'Referer': searchUrl,
    },
    body: form.toString(),
  });

  const resultHtml = await searchRes.text();
  const rows = parseHtmlTable(resultHtml);
  return rows.slice(1).map(cells => makeResult({
    sourceName: 'Pennsylvania Unclaimed Property',
    ownerName: cells[0] || '',
    amount: parseDollar(cells[1] || cells[2] || ''),
    propertyType: cells[2] || cells[3] || '',
    description: cells.join(' | '),
    jurisdiction: 'PA',
    holder: cells[3] || cells[4] || null,
    sourceUrl: searchUrl,
  })).filter(r => r.ownerName);
}

/**
 * Illinois — icash.illinoistreasurer.gov
 * Redirected from icash.illinois.gov. Try API patterns.
 */
async function searchIllinois(firstName, lastName) {
  const apiUrls = [
    'https://icash.illinoistreasurer.gov/api/search',
    'https://icash.illinoistreasurer.gov/api/Property/Search',
    'https://icash.illinoistreasurer.gov/claimant/searchForProperty',
  ];

  for (const apiUrl of apiUrls) {
    try {
      const isFormUrl = apiUrl.includes('searchForProperty');

      if (isFormUrl) {
        // Try as form POST
        const pageRes = await fetchWithTimeout(apiUrl, { headers: baseHeaders() }, 10000);
        const cookies = extractCookies(pageRes);
        const html = await pageRes.text();

        const csrfToken = extractHiddenField(html, '_csrf')
          || extractHiddenField(html, 'csrf_token')
          || extractHiddenField(html, '__RequestVerificationToken');

        const form = new URLSearchParams();
        form.append('lastName', lastName);
        form.append('firstName', firstName);
        form.append('searchType', 'name');
        if (csrfToken) form.append('_csrf', csrfToken);

        const res = await fetchWithTimeout(apiUrl, {
          method: 'POST',
          headers: {
            ...baseHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookies,
            'Referer': apiUrl,
          },
          body: form.toString(),
        }, 10000);

        const resultHtml = await res.text();
        const rows = parseHtmlTable(resultHtml);
        if (rows.length > 1) {
          return rows.slice(1).map(cells => makeResult({
            sourceName: 'Illinois Unclaimed Property',
            ownerName: cells[0] || '',
            amount: parseDollar(cells[1] || cells[2] || ''),
            propertyType: cells[2] || cells[3] || '',
            description: cells.join(' | '),
            jurisdiction: 'IL',
            holder: cells[3] || cells[4] || null,
            sourceUrl: 'https://icash.illinoistreasurer.gov',
          })).filter(r => r.ownerName);
        }
        continue;
      }

      // JSON API attempt
      const res = await fetchWithTimeout(apiUrl, {
        method: 'POST',
        headers: jsonHeaders({
          'Origin': 'https://icash.illinoistreasurer.gov',
          'Referer': 'https://icash.illinoistreasurer.gov/',
        }),
        body: JSON.stringify({
          lastName,
          firstName,
          page: 1,
          pageSize: 25,
        }),
      }, 10000);

      if (!res.ok) continue;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;

      const data = await res.json();
      const items = data.results || data.Properties || data.records || [];
      return items.map(item => makeResult({
        sourceName: 'Illinois Unclaimed Property',
        ownerName: item.ownerName || item.OwnerName || `${firstName} ${lastName}`,
        amount: parseDollar(String(item.amount || item.Amount || '')),
        propertyType: item.propertyType || item.PropertyType || '',
        description: item.description || item.Description || '',
        jurisdiction: 'IL',
        holder: item.holderName || item.HolderName || null,
        sourceUrl: 'https://icash.illinoistreasurer.gov',
      }));
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Ohio — com.ohio.gov/unclaimed
 * Try known search API patterns.
 */
async function searchOhio(firstName, lastName) {
  const searchUrl = 'https://com.ohio.gov/unclaimed-funds/search';
  const apiUrls = [
    'https://com.ohio.gov/api/unclaimed/search',
    'https://unclaimedproperty.ohio.gov/api/search',
    'https://com.ohio.gov/unclaimed-funds/api/search',
  ];

  for (const apiUrl of apiUrls) {
    try {
      const res = await fetchWithTimeout(apiUrl, {
        method: 'POST',
        headers: jsonHeaders({
          'Origin': 'https://com.ohio.gov',
          'Referer': searchUrl,
        }),
        body: JSON.stringify({
          lastName,
          firstName,
          page: 1,
          pageSize: 25,
        }),
      }, 10000);

      if (!res.ok) continue;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;

      const data = await res.json();
      const items = data.results || data.Properties || data.records || data.data || [];
      return items.map(item => makeResult({
        sourceName: 'Ohio Unclaimed Property',
        ownerName: item.ownerName || item.OwnerName || `${firstName} ${lastName}`,
        amount: parseDollar(String(item.amount || item.Amount || '')),
        propertyType: item.propertyType || item.PropertyType || '',
        description: item.description || item.Description || '',
        jurisdiction: 'OH',
        holder: item.holderName || item.HolderName || null,
        sourceUrl: searchUrl,
      }));
    } catch {
      continue;
    }
  }

  // Fallback: try form-based search
  try {
    const pageRes = await fetchWithTimeout(searchUrl, { headers: baseHeaders() }, 10000);
    const cookies = extractCookies(pageRes);
    const html = await pageRes.text();
    const token = extractHiddenField(html, '__RequestVerificationToken')
      || extractHiddenField(html, '_csrf');

    const form = new URLSearchParams();
    form.append('LastName', lastName);
    form.append('FirstName', firstName);
    if (token) form.append('__RequestVerificationToken', token);

    const res = await fetchWithTimeout(searchUrl, {
      method: 'POST',
      headers: {
        ...baseHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'Referer': searchUrl,
      },
      body: form.toString(),
    }, 10000);

    const resultHtml = await res.text();
    const rows = parseHtmlTable(resultHtml);
    return rows.slice(1).map(cells => makeResult({
      sourceName: 'Ohio Unclaimed Property',
      ownerName: cells[0] || '',
      amount: parseDollar(cells[1] || cells[2] || ''),
      propertyType: cells[2] || cells[3] || '',
      description: cells.join(' | '),
      jurisdiction: 'OH',
      holder: cells[3] || cells[4] || null,
      sourceUrl: searchUrl,
    })).filter(r => r.ownerName);
  } catch {
    return [];
  }
}

/**
 * New Jersey — nj.gov/treasury/unclaimed-property
 * Redirected from unclaimedproperty.nj.gov. Angular SPA.
 */
async function searchNewJersey(firstName, lastName) {
  const apiUrls = [
    'https://www.nj.gov/treasury/unclaimed-property/api/claim-search',
    'https://www.nj.gov/treasury/unclaimed-property/app/controllers/api/claim-search',
    'https://njucp.nj.gov/api/search',
  ];

  for (const apiUrl of apiUrls) {
    try {
      const res = await fetchWithTimeout(apiUrl, {
        method: 'POST',
        headers: jsonHeaders({
          'Origin': 'https://www.nj.gov',
          'Referer': 'https://www.nj.gov/treasury/unclaimed-property/app/claim-search',
        }),
        body: JSON.stringify({
          firstName,
          lastName,
          searchType: 'name',
          page: 1,
          pageSize: 25,
        }),
      }, 10000);

      if (!res.ok) continue;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;

      const data = await res.json();
      const items = data.results || data.claims || data.Records || data.data || [];
      return items.map(item => makeResult({
        sourceName: 'New Jersey Unclaimed Property',
        ownerName: item.ownerName || item.OwnerName || `${firstName} ${lastName}`,
        amount: parseDollar(String(item.amount || item.Amount || '')),
        propertyType: item.propertyType || item.PropertyType || '',
        description: item.description || item.Description || '',
        jurisdiction: 'NJ',
        holder: item.holderName || item.HolderName || null,
        sourceUrl: 'https://www.nj.gov/treasury/unclaimed-property/app/claim-search',
      }));
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Georgia — dor.georgia.gov/unclaimed-property
 * GA DOR uses a separate portal at gamoney.com or etax.dor.ga.gov
 */
async function searchGeorgia(firstName, lastName) {
  const apiUrls = [
    'https://gadreams.georgia.gov/api/search',
    'https://dor.georgia.gov/unclaimed-property/api/search',
    'https://etax.dor.ga.gov/unclaimedproperty/api/search',
  ];

  for (const apiUrl of apiUrls) {
    try {
      const res = await fetchWithTimeout(apiUrl, {
        method: 'POST',
        headers: jsonHeaders({
          'Origin': 'https://dor.georgia.gov',
          'Referer': 'https://dor.georgia.gov/unclaimed-property',
        }),
        body: JSON.stringify({
          firstName,
          lastName,
          page: 1,
          pageSize: 25,
        }),
      }, 10000);

      if (!res.ok) continue;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;

      const data = await res.json();
      const items = data.results || data.Properties || data.records || [];
      return items.map(item => makeResult({
        sourceName: 'Georgia Unclaimed Property',
        ownerName: item.ownerName || item.OwnerName || `${firstName} ${lastName}`,
        amount: parseDollar(String(item.amount || item.Amount || '')),
        propertyType: item.propertyType || item.PropertyType || '',
        description: item.description || item.Description || '',
        jurisdiction: 'GA',
        holder: item.holderName || item.HolderName || null,
        sourceUrl: 'https://dor.georgia.gov/unclaimed-property',
      }));
    } catch {
      continue;
    }
  }

  // Try the Georgia DREAMS portal with form POST
  try {
    const searchUrl = 'https://gadreams.georgia.gov/GADreams/';
    const pageRes = await fetchWithTimeout(searchUrl, { headers: baseHeaders() }, 10000);
    const cookies = extractCookies(pageRes);
    const html = await pageRes.text();

    const viewState = extractHiddenField(html, '__VIEWSTATE');
    const eventValidation = extractHiddenField(html, '__EVENTVALIDATION');

    if (viewState) {
      const form = new URLSearchParams();
      form.append('__VIEWSTATE', viewState);
      if (eventValidation) form.append('__EVENTVALIDATION', eventValidation);
      form.append('txtLastName', lastName);
      form.append('txtFirstName', firstName);
      form.append('btnSearch', 'Search');

      const res = await fetchWithTimeout(searchUrl, {
        method: 'POST',
        headers: {
          ...baseHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookies,
          'Referer': searchUrl,
        },
        body: form.toString(),
      }, 10000);

      const resultHtml = await res.text();
      const rows = parseHtmlTable(resultHtml);
      return rows.slice(1).map(cells => makeResult({
        sourceName: 'Georgia Unclaimed Property',
        ownerName: cells[0] || '',
        amount: parseDollar(cells[1] || cells[2] || ''),
        propertyType: cells[2] || cells[3] || '',
        description: cells.join(' | '),
        jurisdiction: 'GA',
        holder: cells[3] || cells[4] || null,
        sourceUrl: 'https://dor.georgia.gov/unclaimed-property',
      })).filter(r => r.ownerName);
    }
  } catch {
    // Fall through
  }
  return [];
}

// ---------------------------------------------------------------------------
// State registry and orchestrator
// ---------------------------------------------------------------------------

const STATE_SCRAPERS = {
  MI: { fn: searchMichigan, name: 'Michigan' },
  NY: { fn: searchNewYork, name: 'New York' },
  CA: { fn: searchCalifornia, name: 'California' },
  TX: { fn: searchTexas, name: 'Texas' },
  FL: { fn: searchFlorida, name: 'Florida' },
  PA: { fn: searchPennsylvania, name: 'Pennsylvania' },
  IL: { fn: searchIllinois, name: 'Illinois' },
  OH: { fn: searchOhio, name: 'Ohio' },
  NJ: { fn: searchNewJersey, name: 'New Jersey' },
  GA: { fn: searchGeorgia, name: 'Georgia' },
};

/**
 * Search state unclaimed property databases.
 *
 * @param {Object} params
 * @param {string} params.firstName - Owner first name
 * @param {string} params.lastName  - Owner last name
 * @param {string} [params.state]   - Two-letter state code (optional; searches all 10 if omitted)
 * @returns {Promise<{ results: Array, meta: Object }>}
 */
async function searchStates({ firstName, lastName, state }) {
  if (!firstName || !lastName) {
    return { results: [], meta: { error: 'firstName and lastName are required' } };
  }

  const fn = firstName.trim();
  const ln = lastName.trim();

  // Determine which states to search
  let statesToSearch;
  if (state) {
    const code = state.toUpperCase().trim();
    if (!STATE_SCRAPERS[code]) {
      return {
        results: [],
        meta: {
          error: `Unsupported state: ${code}. Supported: ${Object.keys(STATE_SCRAPERS).join(', ')}`,
        },
      };
    }
    statesToSearch = { [code]: STATE_SCRAPERS[code] };
  } else {
    statesToSearch = STATE_SCRAPERS;
  }

  const succeeded = [];
  const failed = [];

  // Run all state scrapers in parallel
  const entries = Object.entries(statesToSearch);
  const promises = entries.map(async ([code, { fn: scraperFn, name }]) => {
    try {
      const results = await scraperFn(fn, ln);
      succeeded.push(code);
      return results;
    } catch (err) {
      failed.push({ state: code, name, error: err.message || String(err) });
      return [];
    }
  });

  const resultArrays = await Promise.all(promises);
  const allResults = resultArrays.flat();

  return {
    results: allResults,
    meta: {
      query: { firstName: fn, lastName: ln, state: state || 'all' },
      statesSearched: entries.length,
      statesSucceeded: succeeded,
      statesFailed: failed,
      totalResults: allResults.length,
    },
  };
}

module.exports = { searchStates };
