const TIMEOUT_MS = 10000;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; OpenPrimitive/1.0)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

async function fetchWithTimeout(url, opts = {}, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(id);
    return res;
  } catch {
    clearTimeout(id);
    return null;
  }
}

function extractBetween(html, startTag, endTag) {
  const results = [];
  let idx = 0;
  while (true) {
    const s = html.indexOf(startTag, idx);
    if (s === -1) break;
    // Skip past the closing > of the opening tag
    const tagClose = html.indexOf('>', s + startTag.length);
    const contentStart = tagClose !== -1 ? tagClose + 1 : s + startTag.length;
    const e = html.indexOf(endTag, contentStart);
    if (e === -1) break;
    results.push(html.slice(contentStart, e).replace(/<[^>]*>/g, '').replace(/&nbsp;?/gi, ' ').trim());
    idx = e + endTag.length;
  }
  return results;
}

function extractTableRows(html) {
  const rows = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const cells = extractBetween(trMatch[1], '<td', '</td>');
    // Also handle <td> without attributes
    if (cells.length === 0) {
      const simpleCells = [];
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch;
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        simpleCells.push(tdMatch[1].replace(/<[^>]*>/g, '').trim());
      }
      if (simpleCells.length > 0) rows.push(simpleCells);
    } else {
      rows.push(cells);
    }
  }
  return rows;
}

function extractCookies(res) {
  if (!res || !res.headers) return '';
  const raw = res.headers.get('set-cookie') || '';
  return raw.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

function extractToken(html, name) {
  // __RequestVerificationToken or similar hidden inputs
  const regex = new RegExp(`name=["']${name}["'][^>]*value=["']([^"']+)["']`, 'i');
  const match = html.match(regex);
  if (match) return match[1];
  // Try reversed order (value before name)
  const regex2 = new RegExp(`value=["']([^"']+)["'][^>]*name=["']${name}["']`, 'i');
  const match2 = html.match(regex2);
  return match2 ? match2[1] : null;
}

function cleanAmount(str) {
  if (!str) return null;
  const m = str.replace(/[^0-9.,]/g, '');
  const num = parseFloat(m.replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// ---------------------------------------------------------------------------
// 1. PBGC — Pension Benefit Guaranty Corporation
// ---------------------------------------------------------------------------
async function searchPBGC({ firstName, lastName, state }) {
  try {
    const formUrl = 'https://search.pbgc.gov/mp/';
    const formRes = await fetchWithTimeout(formUrl, { headers: HEADERS });
    if (!formRes) return [];
    const formHtml = await formRes.text();
    const cookies = extractCookies(formRes);
    const token = extractToken(formHtml, '__RequestVerificationToken');

    const body = new URLSearchParams();
    if (token) body.append('__RequestVerificationToken', token);
    body.append('lastName', lastName || '');
    body.append('firstName', firstName || '');
    if (state) body.append('state', state);

    const res = await fetchWithTimeout('https://search.pbgc.gov/mp/SearchResults', {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': formUrl,
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body: body.toString(),
    });
    if (!res) return [];
    const html = decodeEntities(await res.text());
    const rows = extractTableRows(html);

    return rows
      .filter(r => r.length >= 2)
      .map(r => ({
        source: 'pbgc',
        sourceName: 'PBGC Pensions',
        ownerName: r[0] || '',
        amount: r.length > 2 ? cleanAmount(r[2]) : null,
        propertyType: 'Pension benefit',
        description: r.length > 1 ? r[1] : '',
        jurisdiction: r.length > 3 ? r[3] : (state || ''),
        holder: r.length > 1 ? r[1] : null,
        sourceUrl: 'https://search.pbgc.gov/mp/',
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 2. FDIC Unclaimed Deposits
// ---------------------------------------------------------------------------
async function searchFDIC({ firstName, lastName, state }) {
  try {
    const formUrl = 'https://closedbanks.fdic.gov/funds/';
    const formRes = await fetchWithTimeout(formUrl, { headers: HEADERS });
    if (!formRes) return [];
    const formHtml = await formRes.text();
    const cookies = extractCookies(formRes);
    const csrfToken = extractToken(formHtml, '_csrf');

    const fullName = [lastName, firstName].filter(Boolean).join(', ');
    const body = new URLSearchParams();
    if (csrfToken) body.append('_csrf', csrfToken);
    body.append('owner_name', fullName);
    body.append('check_num', '');
    body.append('bank_name', '');
    body.append('city_name', '');
    if (state) body.append('state_code', state);

    const res = await fetchWithTimeout('https://closedbanks.fdic.gov/funds/index.html', {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': formUrl,
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body: body.toString(),
    });
    if (!res) return [];
    const html = decodeEntities(await res.text());
    const rows = extractTableRows(html);

    return rows
      .filter(r => r.length >= 2)
      .map(r => ({
        source: 'fdic',
        sourceName: 'FDIC Unclaimed Deposits',
        ownerName: r[0] || '',
        amount: r.length > 3 ? cleanAmount(r[3]) : null,
        propertyType: 'Unclaimed bank deposit',
        description: r.length > 1 ? `Bank: ${r[1]}` : '',
        jurisdiction: r.length > 2 ? r[2] : (state || ''),
        holder: r.length > 1 ? r[1] : null,
        sourceUrl: 'https://closedbanks.fdic.gov/funds/',
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 3. HUD/FHA Mortgage Insurance Refunds
// ---------------------------------------------------------------------------
async function searchHUD({ firstName, lastName, state }) {
  try {
    const formUrl = 'https://entp.hud.gov/dsrs/refunds/';
    const formRes = await fetchWithTimeout(formUrl, { headers: HEADERS });
    if (!formRes) return [];
    const formHtml = await formRes.text();
    const cookies = extractCookies(formRes);
    const token = extractToken(formHtml, '__RequestVerificationToken')
      || extractToken(formHtml, 'csrf_token')
      || extractToken(formHtml, 'csrfmiddlewaretoken');

    const fullName = [lastName, firstName].filter(Boolean).join(', ');
    const body = new URLSearchParams();
    body.append('f_name', fullName);
    body.append('case_num', '');
    body.append('city', '');
    body.append('state', state || '');
    body.append('tracer', '');
    body.append('range_start', '1');
    body.append('range_max', '50');

    const res = await fetchWithTimeout('https://entp.hud.gov/dsrs/refunds/fharefund1.cfm', {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': formUrl,
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body: body.toString(),
    });
    if (!res) return [];
    const html = decodeEntities(await res.text());
    const rows = extractTableRows(html);

    return rows
      .filter(r => r.length >= 2)
      // Skip header rows and rows containing form labels
      .filter(r => !r[0].match(/^(Borrower|Name:|Case|City:|State:|3rd Party|Warning)/i))
      .filter(r => !r[0].match(/<input|<select|<option/i))
      .map(r => ({
        source: 'hud',
        sourceName: 'HUD/FHA Refunds',
        ownerName: r[0] || '',
        amount: null, // HUD does not disclose refund amounts in search results
        propertyType: 'FHA mortgage insurance refund',
        description: r.length > 1 && r[1] ? `Co-borrower: ${r[1]}` : '',
        jurisdiction: state || '',
        holder: null,
        caseNumber: r.length > 2 ? r[2] : null,
        sourceUrl: 'https://entp.hud.gov/dsrs/refunds/',
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 4. DOL Abandoned Retirement Plans
// ---------------------------------------------------------------------------
async function searchDOL({ firstName, lastName }) {
  try {
    const searchTerm = [firstName, lastName].filter(Boolean).join(' ');
    const formUrl = 'https://www.askebsa.dol.gov/AbandonedPlanSearch/';
    const formRes = await fetchWithTimeout(formUrl, { headers: HEADERS });
    if (!formRes) return [];
    const formHtml = await formRes.text();
    const cookies = extractCookies(formRes);
    const token = extractToken(formHtml, '__RequestVerificationToken');

    const body = new URLSearchParams();
    if (token) body.append('__RequestVerificationToken', token);
    body.append('planName', searchTerm);
    body.append('ein', '');

    const res = await fetchWithTimeout('https://www.askebsa.dol.gov/AbandonedPlanSearch/', {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': formUrl,
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body: body.toString(),
    });
    if (!res) return [];
    const html = decodeEntities(await res.text());
    const rows = extractTableRows(html);

    return rows
      .filter(r => r.length >= 2)
      .map(r => ({
        source: 'dol',
        sourceName: 'DOL Retirement Plans',
        ownerName: r[0] || '',
        amount: null,
        propertyType: 'Abandoned retirement plan',
        description: r.length > 1 ? `Plan: ${r[0]}, EIN: ${r.length > 1 ? r[1] : ''}` : '',
        jurisdiction: r.length > 2 ? r[2] : '',
        holder: r.length > 3 ? r[3] : null,
        sourceUrl: 'https://www.askebsa.dol.gov/AbandonedPlanSearch/',
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main aggregated search
// ---------------------------------------------------------------------------
async function search({ firstName, lastName, state }) {
  if (!lastName && !firstName) {
    return { error: 'At least firstName or lastName is required' };
  }

  const [pbgc, fdic, hud, dol] = await Promise.all([
    searchPBGC({ firstName, lastName, state }),
    searchFDIC({ firstName, lastName, state }),
    searchHUD({ firstName, lastName, state }),
    searchDOL({ firstName, lastName }),
  ]);

  const results = [...pbgc, ...fdic, ...hud, ...dol];

  return {
    domain: 'reclaim',
    source: 'Federal unclaimed property (PBGC, FDIC, HUD/FHA, DOL)',
    source_url: 'https://openprimitive.com/reclaim',
    freshness: new Date().toISOString(),
    query: { firstName, lastName, state },
    totalResults: results.length,
    sourceCounts: {
      pbgc: pbgc.length,
      fdic: fdic.length,
      hud: hud.length,
      dol: dol.length,
    },
    results,
  };
}

module.exports = {
  search,
  searchPBGC,
  searchFDIC,
  searchHUD,
  searchDOL,
};
