// Minimal dependency-free OSM PBF reader (zlib blobs only, which is what Geofabrik uses).
// Spec: https://wiki.openstreetmap.org/wiki/PBF_Format
import fs from 'node:fs';
import zlib from 'node:zlib';

class PB {
  constructor(buf, pos = 0, end = buf.length) { this.b = buf; this.p = pos; this.e = end; }
  eof() { return this.p >= this.e; }
  varint() {
    const b = this.b; let x = 0, s = 1, c;
    do { c = b[this.p++]; x += (c & 0x7f) * s; s *= 128; } while (c & 0x80);
    return x;
  }
  svarint() { const n = this.varint(); return n % 2 ? -(n + 1) / 2 : n / 2; }
  tag() { const t = this.varint(); return [Math.floor(t / 8), t & 7]; }
  bytes() { const l = this.varint(); const s = this.p; this.p += l; return [s, this.p]; }
  skip(wt) {
    if (wt === 0) this.varint(); else if (wt === 1) this.p += 8; else if (wt === 2) { const l = this.varint(); this.p += l; } else if (wt === 5) this.p += 4;
    else throw new Error('bad wire type ' + wt);
  }
  sub([s, e]) { return new PB(this.b, s, e); }
  packed([s, e], signed = false) {
    const r = new PB(this.b, s, e), out = [];
    while (!r.eof()) out.push(signed ? r.svarint() : r.varint());
    return out;
  }
}
const td = new TextDecoder();

/** Iterate over the file's blobs: yields { type, fileOffset, raw: Buffer(decompressed) } */
export function* blobs(file, { offsets = null } = {}) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const head = Buffer.alloc(4);
  const list = offsets ? [...offsets] : null;
  let pos = 0, idx = 0;
  try {
    while (list ? idx < list.length : pos < size) {
      if (list) pos = list[idx++];
      fs.readSync(fd, head, 0, 4, pos);
      const hl = head.readUInt32BE(0);
      const hb = Buffer.alloc(hl); fs.readSync(fd, hb, 0, hl, pos + 4);
      const h = new PB(hb); let type = '', dsize = 0;
      while (!h.eof()) { const [f, wt] = h.tag(); if (f === 1) { const r = h.bytes(); type = td.decode(hb.subarray(...r)); } else if (f === 3) dsize = h.varint(); else h.skip(wt); }
      const bb = Buffer.alloc(dsize); fs.readSync(fd, bb, 0, dsize, pos + 4 + hl);
      const off = pos; pos += 4 + hl + dsize;
      const b = new PB(bb); let raw = null;
      while (!b.eof()) {
        const [f, wt] = b.tag();
        if (f === 1) { const r = b.bytes(); raw = bb.subarray(...r); }
        else if (f === 3) { const r = b.bytes(); raw = zlib.inflateSync(bb.subarray(...r)); }
        else if (f === 4 || f === 7) throw new Error('lzma/zstd blobs not supported');
        else b.skip(wt);
      }
      yield { type, fileOffset: off, raw };
    }
  } finally { fs.closeSync(fd); }
}

/**
 * Decode a PrimitiveBlock. `want` = { node, way, relation } booleans (skip decoding others).
 * Calls cb.node(id, lat, lon, tags|null), cb.way(id, tags, refs), cb.relation(id, tags, members).
 * Returns a Set of group kinds present ('node' | 'way' | 'relation').
 */
export function decodeBlock(raw, want, cb) {
  const r = new PB(raw);
  let strings = [], groups = [], gran = 100, latOff = 0, lonOff = 0;
  while (!r.eof()) {
    const [f, wt] = r.tag();
    if (f === 1) { const st = r.sub(r.bytes()); while (!st.eof()) { const [g, w] = st.tag(); if (g === 1) { const x = st.bytes(); strings.push(td.decode(raw.subarray(...x))); } else st.skip(w); } }
    else if (f === 2) groups.push(r.bytes());
    else if (f === 17) gran = r.varint();
    else if (f === 19) latOff = r.varint();
    else if (f === 20) lonOff = r.varint();
    else r.skip(wt);
  }
  const kinds = new Set();
  const tagsOf = (keys, vals) => { if (!keys.length) return null; const t = {}; for (let i = 0; i < keys.length; i++) t[strings[keys[i]]] = strings[vals[i]]; return t; };
  for (const gr of groups) {
    const g = r.sub(gr);
    while (!g.eof()) {
      const [f, wt] = g.tag();
      if (f === 2) { // DenseNodes
        kinds.add('node');
        if (!want.node) { g.skip(wt); continue; }
        const d = g.sub(g.bytes());
        let ids, lats, lons, kv = null;
        while (!d.eof()) {
          const [h, w] = d.tag();
          if (h === 1) ids = d.packed(d.bytes(), true);
          else if (h === 8) lats = d.packed(d.bytes(), true);
          else if (h === 9) lons = d.packed(d.bytes(), true);
          else if (h === 10) kv = d.bytes();
          else d.skip(w);
        }
        const kvr = kv ? new PB(raw, kv[0], kv[1]) : null;
        let id = 0, la = 0, lo = 0;
        for (let i = 0; i < ids.length; i++) {
          id += ids[i]; la += lats[i]; lo += lons[i];
          let tags = null;
          if (kvr && !kvr.eof()) {
            let k = kvr.varint();
            while (k !== 0) { const v = kvr.varint(); (tags ||= {})[strings[k]] = strings[v]; k = kvr.varint(); }
          }
          cb.node(id, 1e-9 * (latOff + gran * la), 1e-9 * (lonOff + gran * lo), tags);
        }
      } else if (f === 1) { // plain Node
        kinds.add('node');
        if (!want.node) { g.skip(wt); continue; }
        const n = g.sub(g.bytes()); let id = 0, keys = [], vals = [], la = 0, lo = 0;
        while (!n.eof()) { const [h, w] = n.tag(); if (h === 1) id = n.svarint(); else if (h === 2) keys = n.packed(n.bytes()); else if (h === 3) vals = n.packed(n.bytes()); else if (h === 8) la = n.svarint(); else if (h === 9) lo = n.svarint(); else n.skip(w); }
        cb.node(id, 1e-9 * (latOff + gran * la), 1e-9 * (lonOff + gran * lo), tagsOf(keys, vals));
      } else if (f === 3) {
        kinds.add('way');
        if (!want.way) { g.skip(wt); continue; }
        const w = g.sub(g.bytes()); let id = 0, keys = [], vals = [], refs = [];
        while (!w.eof()) { const [h, x] = w.tag(); if (h === 1) id = w.varint(); else if (h === 2) keys = w.packed(w.bytes()); else if (h === 3) vals = w.packed(w.bytes()); else if (h === 8) refs = w.packed(w.bytes(), true); else w.skip(x); }
        for (let i = 1; i < refs.length; i++) refs[i] += refs[i - 1];
        cb.way(id, tagsOf(keys, vals), refs);
      } else if (f === 4) {
        kinds.add('relation');
        if (!want.relation) { g.skip(wt); continue; }
        const rl = g.sub(g.bytes()); let id = 0, keys = [], vals = [], roles = [], mem = [], types = [];
        while (!rl.eof()) { const [h, x] = rl.tag(); if (h === 1) id = rl.varint(); else if (h === 2) keys = rl.packed(rl.bytes()); else if (h === 3) vals = rl.packed(rl.bytes()); else if (h === 8) roles = rl.packed(rl.bytes()); else if (h === 9) mem = rl.packed(rl.bytes(), true); else if (h === 10) types = rl.packed(rl.bytes()); else rl.skip(x); }
        let ref = 0; const members = mem.map((m, i) => { ref += m; return { type: ['node', 'way', 'relation'][types[i]], ref, role: strings[roles[i]] || '' }; });
        cb.relation(id, tagsOf(keys, vals), members);
      } else g.skip(wt);
    }
  }
  return kinds;
}
