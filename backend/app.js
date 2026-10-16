'use strict';
const express = require('express');

function createApp({ createClient, url, key }) {
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, apikey, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.get('/', (req, res) => res.send('SubletCampus backend is running!'));
  app.get('/api', (req, res) => res.json({ message: 'Welcome to the SubletCampus API', status: 'success' }));
  app.get('/api/listings', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.vary('Authorization');
    const header = req.get('Authorization') || '';
    const match = /^Bearer ([^\s]+)$/i.exec(header);
    if (!match || match[1].length > 8192) {
      return res.status(401).json({ status: 'error', message: 'Sign in to view housing.' });
    }
    try {
      const token = match[1];
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      const { data: userData, error: userError } = await client.auth.getUser(token);
      if (userError || !userData?.user || userData.user.is_anonymous || !userData.user.email_confirmed_at) {
        return res.status(401).json({ status: 'error', message: 'Sign in with a verified university email.' });
      }
      const { data: accounts, error: accessError } = await client.rpc('my_student_account');
      if (accessError) return res.status(503).json({ status: 'error', message: 'Account access could not be checked. Try again shortly.' });
      if (!accounts?.[0]?.has_access || accounts[0].user_id !== userData.user.id) {
        return res.status(403).json({ status: 'error', message: 'An active university account is required.' });
      }
      const { data, error } = await client.from('listing')
        .select('id,created_at,title,address,price,housing_type,status')
        .eq('status', 'approved');
      if (error) return res.status(503).json({ status: 'error', message: 'Housing could not be loaded. Try again shortly.' });
      res.json({ status: 'success', data });
    } catch (_) {
      res.status(503).json({ status: 'error', message: 'Housing is temporarily unavailable. Try again shortly.' });
    }
  });
  return app;
}
module.exports = { createApp };
