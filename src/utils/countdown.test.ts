import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventCountdown, padTwoDigits, resolveDecemberEventWindow } from './countdown';

test('resolves December 12 22:30 to December 13 05:00 in current year before event ends', () => {
  const now = new Date(2026, 10, 23, 12, 0, 0, 0); // Nov 23, 2026
  const window = resolveDecemberEventWindow(now);
  assert.equal(window.targetYear, 2026);
  assert.equal(window.start.getMonth(), 11);
  assert.equal(window.start.getDate(), 12);
  assert.equal(window.start.getHours(), 22);
  assert.equal(window.start.getMinutes(), 30);
  assert.equal(window.end.getDate(), 13);
  assert.equal(window.end.getHours(), 5);
});

test('rolls forward to next year after Dec 13 05:00', () => {
  const afterClose = new Date(2026, 11, 13, 5, 1, 0, 0);
  const window = resolveDecemberEventWindow(afterClose);
  assert.equal(window.targetYear, 2027);
});

test('computes exact remaining days, hours, minutes, and seconds', () => {
  const exactlyOneDayBefore = new Date(2026, 11, 11, 22, 30, 0, 0);
  const snap = getEventCountdown(exactlyOneDayBefore);
  assert.equal(snap.status, 'upcoming');
  assert.equal(snap.days, 1);
  assert.equal(snap.hours, 0);
  assert.equal(snap.minutes, 0);
  assert.equal(snap.seconds, 0);
  assert.equal(snap.eventDateLabel, '12 de Dezembro');
  assert.equal(snap.eventTimeLabel, '22:30 às 05:00');
});

test('marks event live between 22:30 on Dec 12 and 05:00 on Dec 13', () => {
  const duringParty = new Date(2026, 11, 13, 2, 15, 0, 0);
  const snap = getEventCountdown(duringParty);
  assert.equal(snap.status, 'live');
  assert.equal(snap.days, 0);
  assert.equal(snap.hours, 0);
});

test('padTwoDigits formats single digits cleanly', () => {
  assert.equal(padTwoDigits(4), '04');
  assert.equal(padTwoDigits(19), '19');
  assert.equal(padTwoDigits(-2), '00');
});
