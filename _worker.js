/**
 * Dhikr Bot - Cloudflare Pages Worker
 *
 * Handles all API routing and serves the Dhikr Bot frontend.
 */

import { query, insert, update, getDhikrByCategory, getAllDhikr,
         getSubscriber, createSubscriber, updateSubscriber,
         getActiveSubscribers, getAdminConfig, setAdminConfig,
         getSchedules, logMessage, verifyAdmin, createSession } from './functions/_lib.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function error(msg, status = 400) {
  return json({ error: msg, status }, status);
}

function cors() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function getBody(request) {
  return request.headers.get('Content-Type')?.includes('application/json')
    ? request.json().catch(() => ({}))
    : Promise.resolve({});
}

function checkAdmin(request) {
  const token = request.headers.get('x-admin-token') || '';
  if (!token) return false;
  try {
    const decoded = atob(token);
    const [email] = decoded.split(':');
    return email === 'alhanheefhq@gmail.com';
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return cors();

    // API routes
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, url);
    }

    // Serve static files
    return env.ASSETS.fetch(request);
  },
};

async function handleAPI(request, url) {
  const path = url.pathname.replace('/api/', '');

  // --- Admin Auth ---
  if (path === 'admin/login' && request.method === 'POST') {
    const body = await getBody(request);
    if (!body.email || !body.password) return error('Email and password required', 400);
    if (!verifyAdmin(body.email, body.password)) return error('Invalid credentials', 401);
    const token = createSession(body.email);
    return json({ success: true, token, email: body.email });
  }

  // --- Public: Subscribe ---
  if (path === 'subscribe' && request.method === 'POST') {
    const body = await getBody(request);
    if (!body.phone) return error('Phone number is required', 400);
    if (!body.pin) return error('PIN is required', 400);
    if (body.pin.length < 4) return error('PIN must be at least 4 digits', 400);

    const phone = body.phone.replace(/[^\d+]/g, '');
    const existing = await getSubscriber(phone);

    if (existing) {
      // Update subscription
      const updated = await updateSubscriber(phone, {
        subscriptions: body.subscriptions || existing.subscriptions || ['morning', 'evening'],
        preferredTime: body.preferredTime || existing.preferredTime || 'both',
        name: body.name || existing.name,
        pin: body.pin,
        active: true,
      });
      return json({ success: true, message: 'Subscription updated', subscriber: updated });
    }

    const subscriber = await createSubscriber({
      phone,
      pin: body.pin,
      name: body.name || '',
      subscriptions: body.subscriptions || ['morning', 'evening'],
      preferredTime: body.preferredTime || 'both',
      timezone: body.timezone || 'Africa/Lagos',
    });
    return json({ success: true, message: 'Subscribed successfully', subscriber });
  }

  // --- Public: Check Subscription ---
  if (path === 'subscription/check' && request.method === 'POST') {
    const body = await getBody(request);
    if (!body.phone || !body.pin) return error('Phone and PIN required', 400);
    const subscriber = await getSubscriber(body.phone.replace(/[^\d+]/g, ''));
    if (!subscriber) return error('Subscriber not found', 404);
    if (subscriber.pin !== body.pin) return error('Invalid PIN', 401);
    return json({ success: true, subscriber });
  }

  // --- Public: Get Dhikr Content ---
  if (path === 'dhikr' && request.method === 'GET') {
    const category = url.searchParams.get('category');
    if (category) {
      const dhikr = await getDhikrByCategory(category);
      return json({ dhikr });
    }
    const all = await getAllDhikr();
    return json({ dhikr: all });
  }

  if (path === 'dhikr/categories' && request.method === 'GET') {
    return json({
      categories: [
        { id: 'morning', name: 'Morning Adhkar', description: 'Adhkar to recite after Fajr' },
        { id: 'evening', name: 'Evening Adhkar', description: 'Adhkar to recite after Asr' },
        { id: 'general', name: 'General Dhikr', description: 'Daily remembrances' },
        { id: 'quranic', name: 'Quranic Verses', description: 'Selected verses for protection' },
        { id: 'salawat', name: 'Salawat', description: 'Blessings upon the Prophet' },
      ],
    });
  }

  // --- Admin: Dashboard ---
  if (path === 'admin/status' && request.method === 'GET') {
    if (!checkAdmin(request)) return error('Unauthorized', 401);
    const botConfig = await getAdminConfig('botConnected');
    const targets = await getAdminConfig('targetGroups');
    const subs = await getActiveSubscribers();
    return json({
      botConnected: botConfig?.connected || false,
      session: botConfig?.session || 'dhikr-bot',
      targets: targets || { groups: [], channels: [] },
      subscriberCount: Array.isArray(subs) ? subs.length : 0,
    });
  }

  if (path === 'admin/subscribers' && request.method === 'GET') {
    if (!checkAdmin(request)) return error('Unauthorized', 401);
    const subs = await getActiveSubscribers();
    return json({ subscribers: subs });
  }

  if (path === 'admin/schedules' && request.method === 'GET') {
    if (!checkAdmin(request)) return error('Unauthorized', 401);
    const schedules = await getSchedules();
    return json({ schedules });
  }

  if (path === 'admin/connect' && request.method === 'POST') {
    if (!checkAdmin(request)) return error('Unauthorized', 401);
    const body = await getBody(request);
    await setAdminConfig('botConnected', {
      connected: true,
      session: body.session || 'dhikr-bot',
      mode: body.mode || 'qr',
    });
    return json({ success: true, message: 'Bot connection configured' });
  }

  if (path === 'admin/disconnect' && request.method === 'POST') {
    if (!checkAdmin(request)) return error('Unauthorized', 401);
    await setAdminConfig('botConnected', { connected: false, session: 'dhikr-bot' });
    return json({ success: true, message: 'Bot disconnected' });
  }

  if (path === 'admin/targets' && request.method === 'POST') {
    if (!checkAdmin(request)) return error('Unauthorized', 401);
    const body = await getBody(request);
    await setAdminConfig('targetGroups', { groups: body.groups || [], channels: body.channels || [] });
    return json({ success: true, message: 'Targets updated' });
  }

  if (path === 'admin/send-dhikr' && request.method === 'POST') {
    if (!checkAdmin(request)) return error('Unauthorized', 401);
    const body = await getBody(request);
    // This would trigger the Wabot library to send dhikr
    // For now, log it
    await logMessage({
      chatId: body.targetId || 'manual',
      content: body.content || '',
      category: body.category || 'general',
      recipientType: body.recipientType || 'group',
      status: 'pending',
    });
    return json({ success: true, message: 'Dhikr send queued' });
  }

  // --- Webhook: WhatsApp message trigger ---
  if (path === 'webhook/message' && request.method === 'POST') {
    const body = await getBody(request);
    // Handle "Dhikr Sub" trigger from WhatsApp
    if (body.body && body.body.toLowerCase().trim().includes('dhikr sub')) {
      const senderPhone = body.sender?.split('@')[0] || body.from?.split('@')[0];
      if (senderPhone) {
        const existing = await getSubscriber(senderPhone);
        if (!existing) {
          await createSubscriber({
            phone: senderPhone,
            pin: Math.floor(1000 + Math.random() * 9000).toString(),
            name: body.senderName || '',
            subscriptions: ['morning', 'evening'],
            preferredTime: 'both',
          });
        }
      }
    }
    return json({ success: true });
  }

  // --- Health ---
  if (path === 'health') {
    return json({
      status: 'healthy',
      service: 'dhikr-bot',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  }

  return error('Endpoint not found', 404);
}
