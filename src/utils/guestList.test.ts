import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterGuestListByQuery,
  sortGuestListAlphabetically,
} from './guestList';

const sample = [
  { id: '1', protocol: 'HZPL-000003', fullName: 'Zeca Andrade' },
  { id: '2', protocol: 'HZPL-000001', fullName: 'Ágata Martins' },
  { id: '3', protocol: 'HZPL-000002', fullName: 'bruno Costa' },
  { id: '4', protocol: 'HZPL-000004', fullName: 'Ana Clara' },
];

test('sorts guest list alphabetically ignoring case and Portuguese accents', () => {
  const sorted = sortGuestListAlphabetically(sample);
  assert.deepEqual(
    sorted.map((item) => item.fullName),
    ['Ágata Martins', 'Ana Clara', 'bruno Costa', 'Zeca Andrade']
  );
});

test('filters guest list by name ignoring accents or by protocol while preserving alphabetical order', () => {
  const byName = filterGuestListByQuery(sample, 'agata');
  assert.equal(byName.length, 1);
  assert.equal(byName[0].fullName, 'Ágata Martins');

  const byPartial = filterGuestListByQuery(sample, 'a');
  assert.deepEqual(
    byPartial.map((item) => item.fullName),
    ['Ágata Martins', 'Ana Clara', 'bruno Costa', 'Zeca Andrade']
  );

  const byProtocol = filterGuestListByQuery(sample, 'hzpl-000002');
  assert.equal(byProtocol.length, 1);
  assert.equal(byProtocol[0].fullName, 'bruno Costa');
});
