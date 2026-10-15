'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkEmail, category, matches, databaseRecord } = require('./campus.js');

test('personal email providers are rejected', () => {
  for (const email of ['abdul@gmail.com', 'student@yahoo.com', 'student@outlook.com']) {
    assert.equal(checkEmail(email).ok, false, email);
  }
});
test('supported domains are matched exactly', () => {
  for (const domain of ['almau.edu.kz', 'kimep.kz', 'kaznu.kz', 'kaznu.edu.kz', 'satbayev.university', 'narxoz.kz', 'iitu.edu.kz']) {
    assert.equal(checkEmail(`student@${domain}`).ok, true, domain);
  }
});
test('lookalike and suffix attacks are rejected', () => {
  for (const email of ['student@almau.edu.kz.evil.com', 'student@fakealmau.edu.kz', 'student@evil.edu.kz', 'student@almau.edu.kz@evil.com', 'student@gmail.com.almau.edu.kz', 'student@almau.edu.kz.']) {
    assert.equal(checkEmail(email).ok, false, email);
  }
});
test('malformed addresses are rejected', () => {
  for (const email of ['', 'student', '@almau.edu.kz', '.student@almau.edu.kz', 'student.@almau.edu.kz', 'a..b@almau.edu.kz', 'a b@almau.edu.kz', 'a\nb@almau.edu.kz', 'a'.repeat(65) + '@almau.edu.kz']) {
    assert.equal(checkEmail(email).ok, false, email);
  }
});
test('case and surrounding whitespace are normalized', () => {
  assert.deepEqual(checkEmail('  Student+housing@ALMAU.EDU.KZ  '), { ok: true, email: 'student+housing@almau.edu.kz' });
});
test('housing categories include unknown values', () => {
  assert.equal(category('Apartment'), 'Flat');
  assert.equal(category('Shared apartment'), 'Shared');
  assert.equal(category('Dormitory bed'), 'Dormitory');
  assert.equal(category('Private Studio'), 'Studio');
  assert.equal(category(null), 'Other');
});
test('all active filters apply to the same record', () => {
  const item = { title: 'Room near campus', university: 'AlmaU', category: 'Studio', details: 'Metro nearby' };
  assert.equal(matches(item, 'AlmaU', 'Studio', ' METRO '), true);
  assert.equal(matches(item, 'KIMEP', 'Studio', ''), false);
  assert.equal(matches(item, 'AlmaU', 'Dormitory', ''), false);
  assert.equal(matches(item, 'All', 'All', 'missing'), false);
  assert.equal(matches(item, 'All', 'All', ''), true);
});
test('approved API records receive a stable id and numeric price', () => {
  const record = databaseRecord({ id: 1, title: 'DEMO - Student Apartment', price: '150000', housing_type: 'Apartment', status: 'approved' });
  assert.equal(record.id, 'api:1');
  assert.equal(record.price, 150000);
  assert.equal(record.category, 'Flat');
  assert.equal(record.university, 'Other');
});
test('invalid and unapproved API rows are discarded', () => {
  for (const row of [null, {}, { id: 1, price: 10, status: 'pending' }, { id: 1, price: null, status: 'approved' }, { id: 1, price: '', status: 'approved' }, { id: 1, price: 'NaN', status: 'approved' }, { id: 1, price: -1, status: 'approved' }]) {
    assert.equal(databaseRecord(row), null);
  }
});
