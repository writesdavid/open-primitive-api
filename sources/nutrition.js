const fetch = require('node-fetch');

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';
const API_KEY = process.env.USDA_API_KEY || 'DEMO_KEY';

const KEY_NUTRIENTS = [
  { id: 1008, name: 'Calories', unit: 'kcal' },
  { id: 1003, name: 'Protein', unit: 'g' },
  { id: 1004, name: 'Total Fat', unit: 'g' },
  { id: 1005, name: 'Carbohydrates', unit: 'g' },
  { id: 1079, name: 'Fiber', unit: 'g' },
  { id: 2000, name: 'Sugar', unit: 'g' },
  { id: 1093, name: 'Sodium', unit: 'mg' },
];

async function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(id);
    return null;
  }
}

function extractNutrients(foodNutrients) {
  if (!foodNutrients) return [];
  return KEY_NUTRIENTS.map(kn => {
    const match = foodNutrients.find(fn =>
      (fn.nutrientId === kn.id) || (fn.nutrient && fn.nutrient.id === kn.id)
    );
    return {
      name: kn.name,
      amount: match ? (match.value != null ? match.value : match.amount) || 0 : 0,
      unit: kn.unit,
    };
  });
}

async function searchFood(query) {
  if (!query) return { error: 'query is required' };
  const encoded = encodeURIComponent(query);
  const url = `${USDA_BASE}/foods/search?query=${encoded}&pageSize=10&api_key=${API_KEY}`;
  const data = await fetchWithTimeout(url);
  if (!data) return { error: 'USDA FoodData Central API unavailable' };
  return {
    domain: 'nutrition',
    source: 'USDA FoodData Central',
    source_url: 'https://fdc.nal.usda.gov',
    freshness: new Date().toISOString(),
    query,
    total: data.totalHits || 0,
    results: (data.foods || []).map(f => ({
      fdcId: f.fdcId,
      description: f.description,
      brandName: f.brandName || null,
      dataType: f.dataType,
      nutrients: extractNutrients(f.foodNutrients),
    })),
  };
}

async function getFood(fdcId) {
  if (!fdcId) return { error: 'fdcId is required' };
  const url = `${USDA_BASE}/food/${fdcId}?api_key=${API_KEY}`;
  const data = await fetchWithTimeout(url);
  if (!data) return { error: 'USDA FoodData Central API unavailable' };
  return {
    domain: 'nutrition',
    source: 'USDA FoodData Central',
    source_url: 'https://fdc.nal.usda.gov',
    freshness: new Date().toISOString(),
    fdcId: data.fdcId,
    description: data.description,
    brandName: data.brandName || null,
    dataType: data.dataType,
    servingSize: data.servingSize || null,
    servingSizeUnit: data.servingSizeUnit || null,
    nutrients: (data.foodNutrients || []).map(fn => ({
      name: fn.nutrient ? fn.nutrient.name : fn.name,
      amount: fn.amount != null ? fn.amount : 0,
      unit: fn.nutrient ? fn.nutrient.unitName : fn.unitName,
    })),
  };
}

module.exports = { searchFood, getFood };
