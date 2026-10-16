'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { coordinates, inAlmaty, bounds, readDrafts } = require('./housing-map.js');
const { databaseRecord } = require('./campus.js');

test('coordinates use longitude then latitude', () => {
  assert.deepEqual(coordinates('76.889709', '43.238949'), [76.889709, 43.238949]);
  assert.equal(inAlmaty(coordinates(76.889709, 43.238949)), true);
  assert.equal(inAlmaty(coordinates(43.238949, 76.889709)), false);
});
test('missing, malformed and out-of-range coordinates are rejected', () => {
  for (const pair of [[null,43], ['',43], [' ',43], [76,undefined], [true,43], [[],43], ['abc',43], [181,43], [76,91], [Infinity,43]]) {
    assert.equal(coordinates(...pair), null);
  }
});
test('only the configured Almaty coverage is mapped', () => {
  assert.equal(inAlmaty(coordinates(71.43,51.16)), false);
  assert.equal(inAlmaty(coordinates(0,0)), false);
  assert.equal(inAlmaty(null), false);
});
test('map bounds handle empty, single and multiple points', () => {
  assert.equal(bounds([]), null);
  assert.deepEqual(bounds([[76.9,43.2]]), { southWest:[76.9,43.2], northEast:[76.9,43.2] });
  assert.deepEqual(bounds([[76.9,43.2],[76.8,43.3]]), { southWest:[76.8,43.2], northEast:[76.9,43.3] });
});
test('valid drafts reload without inventing locations', () => {
  assert.equal(readDrafts(null).size, 0);
  const drafts = readDrafts(JSON.stringify([{id:'api:1',longitude:'76.89',latitude:'43.23'}]));
  assert.deepEqual(drafts.get('api:1'), { id:'api:1', longitude:76.89, latitude:43.23 });
});
test('corrupted or oversized drafts raise an error instead of being replaced', () => {
  for (const raw of ['{', '{}', '[null]', '[{"id":"x","longitude":null,"latitude":43}]', JSON.stringify(Array.from({length:201}, () => ({id:'x',longitude:76.9,latitude:43.2})))]) {
    assert.throws(() => readDrafts(raw));
  }
});
test('repeated drafts resolve to one stable listing id', () => {
  const drafts = readDrafts(JSON.stringify([{id:'api:1',longitude:76.8,latitude:43.2},{id:'api:1',longitude:76.9,latitude:43.3}]));
  assert.equal(drafts.size, 1);
  assert.equal(drafts.get('api:1').longitude, 76.9);
});
test('database coordinates survive the listing adapter', () => {
  const record = databaseRecord({id:1,status:'approved',price:150000,longitude:76.89,latitude:43.23});
  assert.deepEqual(coordinates(record.longitude, record.latitude), [76.89,43.23]);
  const unlocated = databaseRecord({id:2,status:'approved',price:100000});
  assert.equal(coordinates(unlocated.longitude, unlocated.latitude), null);
});
