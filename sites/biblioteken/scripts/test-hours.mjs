// Tests for the opening-hours parsers. Run: node --test scripts/test-hours.mjs   (built-in node:test, no deps)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOsmHours, parseSwedishHours, osmSeasons } from './hours.mjs';

const W = (mon, tue, wed, thu, fri, sat, sun) => ({ mon, tue, wed, thu, fri, sat, sun });
const C = 'stängt';
const NOV = new Date(2026, 10, 19), JUL1 = new Date(2026, 6, 1), JUL15 = new Date(2026, 6, 15);

// Real values from data/raw/osm-libraries.json
const VASBY = 'Jan 01-Jun 17, Aug 13-Dec 31 Mo-Th 10:00-19:00; Fr 10:00-18:00; Sa 11:00-16:00; Su 12:00-18:00; Jun 18-Aug 12 Mo-Th 12:00-18:00; Fr 10:00-16:00; Sa,Su closed';
const SEP_MAY = 'Sep-May: Mo-Th 08:00-20:00; Sep-May: Fr 08:00-17:00; Sep-May: Sa 11:00-15:00; Jun-Aug: Mo-Fr 12:00-16:00; Sep-May: Su off';
const ORKANEN = 'Mo-Th 08:00-20:00; Sa 11:00-16:00; Fr 08:00-17:00; Jun 06-Jul 10, Aug 03-Aug 07: Mo-Fr 10:00-14:00; Jun 19, Jul 11-Aug 02: off; Aug 10-Aug 23: Mo-Fr 10:00-17:00';
const COMMA = 'Sep-Apr: Mo-Th 09:00-20:00, Sep-Apr: Fr 09:00-19:00, Sep-Apr: Sa 10:00-16:00, Sep-Apr: Su 13:00-17:00, May-Aug: Mo-Th 09:00-19:00, May-Aug: Fr 09:00-18:00, May-Aug: Sa 11:00-15:00';

test('season block: date range carries over to following undated rules (Upplands Väsby)', () => {
  assert.deepEqual(parseOsmHours(VASBY, NOV).week, W('10:00-19:00', '10:00-19:00', '10:00-19:00', '10:00-19:00', '10:00-18:00', '11:00-16:00', '12:00-18:00'));
  assert.deepEqual(parseOsmHours(VASBY, JUL1).week, W('12:00-18:00', '12:00-18:00', '12:00-18:00', '12:00-18:00', '10:00-16:00', C, C));
  const s = osmSeasons(VASBY, 2026);
  assert.equal(s.sommar.fran, '06-18');
  assert.equal(s.sommar.till, '08-12');
  assert.equal(s.vinter.fran, '08-13');
  assert.equal(s.vinter.till, '06-17');
});

test('explicit month prefix on every rule (Sep-May / Jun-Aug)', () => {
  assert.deepEqual(parseOsmHours(SEP_MAY, NOV).week, W('08:00-20:00', '08:00-20:00', '08:00-20:00', '08:00-20:00', '08:00-17:00', '11:00-15:00', C));
  assert.deepEqual(parseOsmHours(SEP_MAY, JUL1).week, W('12:00-16:00', '12:00-16:00', '12:00-16:00', '12:00-16:00', '12:00-16:00', C, C));
  assert.deepEqual(osmSeasons(SEP_MAY, 2026).sommar.fran, '06-01');
});

test('undated base week + dated exceptions keeps strict semantics (Orkanen)', () => {
  assert.deepEqual(parseOsmHours(ORKANEN, NOV).week, W('08:00-20:00', '08:00-20:00', '08:00-20:00', '08:00-20:00', '08:00-17:00', '11:00-16:00', C));
  assert.deepEqual(parseOsmHours(ORKANEN, JUL1).week, W('10:00-14:00', '10:00-14:00', '10:00-14:00', '10:00-14:00', '10:00-14:00', '11:00-16:00', C));
  assert.deepEqual(parseOsmHours(ORKANEN, JUL15).week, W(C, C, C, C, C, C, C));
});

test('comma-separated seasonal rules', () => {
  assert.deepEqual(parseOsmHours(COMMA, NOV).week, W('09:00-20:00', '09:00-20:00', '09:00-20:00', '09:00-20:00', '09:00-19:00', '10:00-16:00', '13:00-17:00'));
  assert.deepEqual(parseOsmHours(COMMA, JUL1).week, W('09:00-19:00', '09:00-19:00', '09:00-19:00', '09:00-19:00', '09:00-18:00', '11:00-15:00', C));
});

test('week-number selectors, strict (base week first)', () => {
  const v = 'Mo-Fr 10:00-18:00; Sa 10:00-14:00; week 26-32 Mo-Fr 10:00-15:00; week 26-32 Sa off';
  assert.deepEqual(parseOsmHours(v, NOV).week, W('10:00-18:00', '10:00-18:00', '10:00-18:00', '10:00-18:00', '10:00-18:00', '10:00-14:00', C));
  assert.deepEqual(parseOsmHours(v, JUL15).week, W('10:00-15:00', '10:00-15:00', '10:00-15:00', '10:00-15:00', '10:00-15:00', C, C)); // week 29
  const s = osmSeasons(v, 2026);
  assert.equal(s.sommar.fran, '06-22'); // Monday of ISO week 26, 2026
  assert.equal(s.sommar.till, '08-09');
});

test('week-number selectors, season-block style', () => {
  const v = 'week 01-25,33-53 Mo-Fr 09:00-19:00; Sa 10:00-14:00; week 26-32 Mo-Fr 10:00-16:00; Sa off';
  assert.deepEqual(parseOsmHours(v, NOV).week, W('09:00-19:00', '09:00-19:00', '09:00-19:00', '09:00-19:00', '09:00-19:00', '10:00-14:00', C));
  assert.deepEqual(parseOsmHours(v, JUL15).week, W('10:00-16:00', '10:00-16:00', '10:00-16:00', '10:00-16:00', '10:00-16:00', C, C));
});

test('later undated rule overrides only the days it lists', () => {
  const v = 'Mo-Th 10:00-19:00; Fr-Sa 10:00-18:00; Sa 10:00-14:00';
  assert.deepEqual(parseOsmHours(v, NOV).week, W('10:00-19:00', '10:00-19:00', '10:00-19:00', '10:00-19:00', '10:00-18:00', '10:00-14:00', C));
});

test('no summer/winter split for plain weekly hours', () => {
  assert.equal(osmSeasons('Mo-Fr 10:00-18:00; Sa 10:00-14:00', 2026), null);
});

test('meröppet comment goes to meroppetWeek', () => {
  const r = parseOsmHours('Tu 14:00-16:00 open "Bemannat"; Mo-Fr 17:00-22:00 open "Meröppet"', NOV);
  assert.equal(r.week.tue, '14:00-16:00');
  assert.equal(r.meroppetWeek.mon, '17:00-22:00');
});

test('Swedish text with a week-based summer section (bibdb style)', () => {
  const r = parseSwedishHours('Mån-Fre 10-18\r\nLö 10-14\r\nSommartider V26-V32:\r\nMån-Fre 10.00-18.00\r\nLö stängt');
  assert.deepEqual(r.week, W('10:00-18:00', '10:00-18:00', '10:00-18:00', '10:00-18:00', '10:00-18:00', '10:00-14:00', C));
  assert.equal(r.sommar.fran, 'v26');
  assert.equal(r.sommar.till, 'v32');
  assert.equal(r.sommar.tider.sat, C);
});

test('Swedish summer section with a month list; "Sommaröppet" must not read as "mars" (Trelleborg)', () => {
  const r = parseSwedishHours('Måndag-torsdag: 10.00 - 19.00\r\nFredag: 10.00 - 18.00\r\nLördag: 11.00 - 14.00\r\n\r\nSommaröppet - juni, juli, augusti\r\nMåndag - fredag: 10.00 - 18.00\r\nLördag: stängt');
  assert.deepEqual([r.sommar.fran, r.sommar.till], ['06-01', '08-31']);
  assert.equal(r.week.sat, '11:00-14:00');
});

test('vague summer period gives unknown dates', () => {
  const r = parseSwedishHours('Måndag-fredag 10-19\r\nLördag 10-14\r\n\r\nSommartid (mitten av juni - mitten av augusti)\r\nMåndag-fredag 10-18.');
  assert.deepEqual([r.sommar.fran, r.sommar.till], [null, null]);
});

test('Swedish text with a dated summer section', () => {
  const r = parseSwedishHours('Måndag-torsdag 9-19\r\nFredag 9-18\r\nSommartider 18 juni-14 aug:\r\nmåndag-fredag 10-16');
  assert.equal(r.week.mon, '09:00-19:00');
  assert.deepEqual([r.sommar.fran, r.sommar.till], ['06-18', '08-14']);
});
