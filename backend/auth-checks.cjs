'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./app');

async function request(config, token) {
  let constructed = 0, listed = 0;
  const createClient = (url, key, options) => {
    constructed++;
    assert.equal(options.auth.persistSession, false);
    assert.equal(options.global.headers.Authorization, `Bearer ${token}`);
    return {
      auth: { getUser: async value => {
        assert.equal(value, token);
        if (config.throw) throw new Error('private details');
        return config.userResult || { data: { user: { id: 'student-id', email_confirmed_at: '2026-10-16' } }, error: null };
      } },
      rpc: async name => { assert.equal(name, 'my_student_account'); return config.accountResult || { data: [{ user_id: 'student-id', has_access: true }], error: null }; },
      from: table => {
        listed++; assert.equal(table, 'listing');
        return { select: columns => {
          assert.equal(columns, 'id,created_at,title,address,price,housing_type,status');
          return { eq: async (field, value) => {
            assert.equal(field, 'status'); assert.equal(value, 'approved');
            return config.listingResult || { data: [{ id: 1, title: 'Approved listing' }], error: null };
          } };
        } };
      }
    };
  };
  const app = createApp({ createClient, url: 'https://example.supabase.co', key: 'sb_publishable_test' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/listings`, {
      headers: token === undefined ? {} : { Authorization: `Bearer ${token}` }
    });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control'), constructed, listed };
  } finally { await new Promise(resolve => server.close(resolve)); }
}
test('a missing bearer token is rejected before creating a client', async () => {
  const result = await request({}); assert.equal(result.status, 401); assert.equal(result.constructed, 0);
});
test('an invalid token cannot read listings', async () => {
  const result = await request({ userResult: { data: { user: null }, error: { message: 'invalid token' } } }, 'invalid');
  assert.equal(result.status, 401); assert.equal(result.listed, 0);
});
test('unverified and anonymous users are rejected', async () => {
  for (const user of [{ id: 'student-id' }, { id: 'student-id', email_confirmed_at: 'today', is_anonymous: true }]) {
    const result = await request({ userResult: { data: { user } } }, 'token');
    assert.equal(result.status, 401); assert.equal(result.listed, 0);
  }
});
test('inactive, missing and mismatched student accounts are rejected', async () => {
  for (const data of [[], [{ user_id: 'student-id', has_access: false }], [{ user_id: 'someone-else', has_access: true }]]) {
    const result = await request({ accountResult: { data } }, 'token');
    assert.equal(result.status, 403); assert.equal(result.listed, 0);
  }
});
test('an active verified student receives approved housing without shared caching', async () => {
  const result = await request({}, 'valid-token');
  assert.equal(result.status, 200); assert.equal(result.body.data[0].id, 1);
  assert.equal(result.cache, 'private, no-store');
});
test('upstream failures do not expose private errors', async () => {
  for (const config of [{ throw: true }, { accountResult: { error: { message: 'private details' } } }, { listingResult: { error: { message: 'private details' } } }]) {
    const result = await request(config, 'token');
    assert.equal(result.status, 503); assert.doesNotMatch(JSON.stringify(result.body), /private details/);
  }
});
