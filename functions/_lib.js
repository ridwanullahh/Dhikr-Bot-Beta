/**
 * Dhikr Bot - Lightbase Database Client
 */

const LIGHTBASE_URL = 'https://lightbase.pages.dev';
const API_KEY = 'lb_live_tcrasvnscbm548jxf9qmr8z5swzf5wkwagz78h88dm3gpgy8qkv0';
const PROJECT = 'dhikr-bot-beta';

const headers = {
  'apikey': API_KEY,
  'x-lightbase-project': PROJECT,
  'Content-Type': 'application/json',
};

export async function query(collection, params = '') {
  const resp = await fetch(`${LIGHTBASE_URL}/rest/v1/${collection}${params}`, { headers });
  return resp.json();
}

export async function insert(collection, doc) {
  const resp = await fetch(`${LIGHTBASE_URL}/rest/v1/${collection}`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(doc),
  });
  return resp.json();
}

export async function update(collection, filter, updates) {
  const resp = await fetch(`${LIGHTBASE_URL}/rest/v1/${collection}?${filter}`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(updates),
  });
  return resp.json();
}

export async function upsert(collection, doc, dedupField) {
  const existing = await query(collection, `?${dedupField}=eq.${doc[dedupField]}&limit=1`);
  if (Array.isArray(existing) && existing.length > 0) {
    return update(collection, `${dedupField}=eq.${doc[dedupField]}`, doc);
  }
  return insert(collection, doc);
}

export async function getDhikrByCategory(category) {
  return query('dhikr_content', `?category=eq.${category}&order=order.asc`);
}

export async function getAllDhikr() {
  return query('dhikr_content', '?order=category.asc,order.asc');
}

export async function getSubscriber(phone) {
  const result = await query('subscribers', `?phone=eq.${encodeURIComponent(phone)}&limit=1`);
  return Array.isArray(result) && result.length > 0 ? result[0] : null;
}

export async function createSubscriber(data) {
  const now = new Date().toISOString();
  return insert('subscribers', { ...data, active: true, createdAt: now, updatedAt: now });
}

export async function updateSubscriber(phone, updates) {
  return update('subscribers', `phone=eq.${encodeURIComponent(phone)}`, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function getActiveSubscribers() {
  return query('subscribers', '?active=eq.true');
}

export async function getAdminConfig(key) {
  const result = await query('admin_config', `?key=eq.${key}&limit=1`);
  return Array.isArray(result) && result.length > 0 ? result[0].value : null;
}

export async function setAdminConfig(key, value) {
  const now = new Date().toISOString();
  return upsert('admin_config', { key, value, updatedAt: now }, 'key');
}

export async function getSchedules() {
  return query('schedules', '?order=name.asc');
}

export async function logMessage(data) {
  return insert('message_log', { ...data, timestamp: new Date().toISOString() });
}

export function verifyAdmin(email, password) {
  const ADMIN_CREDENTIALS = 'alhanheefhq@gmail.com:Laailaaha-illa-ALLAH';
  const [adminEmail, adminPass] = ADMIN_CREDENTIALS.split(':');
  return email === adminEmail && password === adminPass;
}

export function createSession(email) {
  // Simple session token (in production, use JWT or secure session store)
  const token = btoa(`${email}:${Date.now()}:${Math.random().toString(36).slice(2)}`);
  return token;
}
