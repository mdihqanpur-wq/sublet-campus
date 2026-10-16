'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkEmail, returnPage, validCode, publicError } = require('./auth');
const { checkEmail: existingCheck } = require('./campus');

test('the gateway and housing helpers use the same university rules', () => {
  for (const value of ['student@almau.edu.kz', ' STUDENT@KIMEP.KZ ', 'a+b@kaznu.kz', 'a@iitu.edu.kz',
    'a@narxoz.kz', 'a@satbayev.university', 'a@kaznu.edu.kz', 'a@gmail.com',
    'a@fakealmau.edu.kz', 'a@almau.edu.kz.evil.com', 'a@almau.edu.kz@evil.com', '.a@almau.edu.kz',
    'a..b@almau.edu.kz', 'a\nb@almau.edu.kz', 'a'.repeat(65) + '@almau.edu.kz']) {
    assert.deepEqual(checkEmail(value), existingCheck(value), value);
  }
});
test('return destinations cannot redirect students to another site', () => {
  for (const value of [null, 'https://evil.example', '//evil.example', '/account.html', 'javascript:alert(1)', 'discovery.html?next=evil']) {
    assert.equal(returnPage(value), 'discovery.html');
  }
  assert.equal(returnPage('account.html'), 'account.html');
  assert.equal(returnPage('match.html'), 'match.html');
});
test('verification codes must contain exactly six digits', () => {
  assert.equal(validCode('012345'), true);
  assert.equal(validCode(' 123456 '), true);
  for (const value of ['', '12345', '1234567', '1e2345', '12 345', '<code>']) assert.equal(validCode(value), false);
});
test('raw server errors are not shown to students', () => {
  assert.equal(publicError({ message: 'private database details' }, 'Try again.'), 'Try again.');
  assert.match(publicError({ code: 'otp_expired' }), /expired/);
  assert.match(publicError({ status: 429 }), /Too many/);
});
