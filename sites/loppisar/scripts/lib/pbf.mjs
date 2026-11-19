// Minimal, dependency-free OSM PBF reader (https://wiki.openstreetmap.org/wiki/PBF_Format).
// Supports raw and zlib blobs, DenseNodes, Nodes, Ways and Relations. Streams the file blob by blob.
import fs from 'node:fs';
import zlib from 'node:zlib';

// ---------------------------------------------------------------- protobuf primitives

class Reader {
  constructor(buf, pos = 0, end = buf.length) { this.buf = buf; this.pos = pos; this.end = end; }
  varint() {
    const b = this.buf;
    let c = b[this.pos++];
    if (c < 0x80) return c;
    let x = c & 0x7f, mul = 128;
    for (;;) { // arithmetic (not bitwise) so values up to 2^53 stay exact
      c = b[this.pos++];
      x += (c & 0x7f) * mul;
      if (c < 0x80) return x;
      mul *= 128;
    }
  }
  svarint() { const n = this.varint(); return n % 2 === 1 ? -(n + 1) / 2 : n / 2; }
  bytesRange() { const len = this.varint(); const s = this.pos; this.pos += len; return [s, this.pos]; }
  skip(wire) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) { const l = this.varint(); this.pos += l; }
    else if (wire === 5) this.pos += 4;
    else throw new Error('bad wire type ' + wire);
  }
}

function* fields(buf, start = 0, end = buf.length) {
  const r = new Reader(buf, start, end);
  while (r.pos < end) {
    const key = r.varint();
    yield [key >>> 3, key & 7, r];
  }
}

function packedVarints(buf, [s, e], signed = false, delta = false) {
  const r = new Reader(buf, s, e);
  const out = [];
  let acc = 0;
  while (r.pos < e) {
    let v = signed ? r.svarint() : r.varint();
    if (delta) { acc += v; v = acc; }
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------- blob iteration

/** Iterate blobs: yields { type, data(Buffer, decompressed), offset } */
export function* blobs(file, { startOffset = 0 } = {}) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  let off = startOffset;
  const lenBuf = Buffer.alloc(4);
  try {
    while (off < size) {
      const blobOffset = off;
      fs.readSync(fd, lenBuf, 0, 4, off); off += 4;
      const hlen = lenBuf.readUInt32BE(0);
      const hbuf = Buffer.alloc(hlen); fs.readSync(fd, hbuf, 0, hlen, off); off += hlen;
      let type = '', datasize = 0;
      for (const [f, w, r] of fields(hbuf)) {
        if (f === 1) { const [s, e] = r.bytesRange(); type = hbuf.toString('utf8', s, e); }
        else if (f === 3) datasize = r.varint();
        else r.skip(w);
      }
      const bbuf = Buffer.alloc(datasize); fs.readSync(fd, bbuf, 0, datasize, off); off += datasize;
      let data = null;
      for (const [f, w, r] of fields(bbuf)) {
        if (f === 1) { const [s, e] = r.bytesRange(); data = bbuf.subarray(s, e); }
        else if (f === 3) { const [s, e] = r.bytesRange(); data = zlib.inflateSync(bbuf.subarray(s, e)); }
        else if (f === 4 || f === 6 || f === 7) throw new Error('unsupported blob compression (field ' + f + ')');
        else r.skip(w);
      }
      yield { type, data, offset: blobOffset, size };
    }
  } finally { fs.closeSync(fd); }
}

// ---------------------------------------------------------------- primitive blocks

/**
 * Decode a PrimitiveBlock and call handlers:
 *   node(id, lat, lon, tags|null)  - tags decoded only if wantNodeTags
 *   way(id, tags, refs)
 *   relation(id, tags, members[{type,ref,role}])
 * Returns the set of group kinds seen ('n','w','r').
 * Options: { nodes:bool, ways:bool, relations:bool, nodeTags:bool }
 */
export function decodeBlock(buf, h, opt = {}) {
  let strings = [];
  let gran = 100, latOff = 0, lonOff = 0;
  const groups = [];
  for (const [f, w, r] of fields(buf)) {
    if (f === 1) {
      const [s, e] = r.bytesRange();
      for (const [ff, ww, rr] of fields(buf, s, e)) {
        if (ff === 1) { const [a, b] = rr.bytesRange(); strings.push([a, b]); } else rr.skip(ww);
      }
    } else if (f === 2) groups.push(r.bytesRange());
    else if (f === 17) gran = r.varint();
    else if (f === 19) latOff = r.varint();
    else if (f === 20) lonOff = r.varint();
    else r.skip(w);
  }
  const cache = new Array(strings.length);
  const str = (i) => cache[i] ?? (cache[i] = buf.toString('utf8', strings[i][0], strings[i][1]));
  const kinds = new Set();
  const latOf = (v) => 1e-9 * (latOff + gran * v), lonOf = (v) => 1e-9 * (lonOff + gran * v);

  for (const [gs, ge] of groups) {
    for (const [f, w, r] of fields(buf, gs, ge)) {
      if (f === 2) { // DenseNodes
        kinds.add('n');
        const rng = r.bytesRange();
        if (!opt.nodes) continue;
        let ids, lats, lons, kv = null;
        for (const [ff, ww, rr] of fields(buf, rng[0], rng[1])) {
          if (ff === 1) ids = packedVarints(buf, rr.bytesRange(), true, true);
          else if (ff === 8) lats = packedVarints(buf, rr.bytesRange(), true, true);
          else if (ff === 9) lons = packedVarints(buf, rr.bytesRange(), true, true);
          else if (ff === 10 && opt.nodeTags) kv = packedVarints(buf, rr.bytesRange());
          else rr.skip(ww);
        }
        let k = 0;
        for (let i = 0; i < ids.length; i++) {
          let tags = null;
          if (kv) {
            if (kv[k] !== 0) {
              tags = {};
              while (kv[k] !== 0 && k < kv.length) { tags[str(kv[k])] = str(kv[k + 1]); k += 2; }
            }
            k++;
          }
          h.node(ids[i], latOf(lats[i]), lonOf(lons[i]), tags);
        }
      } else if (f === 1) { // plain Node
        kinds.add('n');
        const rng = r.bytesRange();
        if (!opt.nodes) continue;
        let id = 0, lat = 0, lon = 0, keys = [], vals = [];
        for (const [ff, ww, rr] of fields(buf, rng[0], rng[1])) {
          if (ff === 1) id = rr.svarint();
          else if (ff === 2) keys = packedVarints(buf, rr.bytesRange());
          else if (ff === 3) vals = packedVarints(buf, rr.bytesRange());
          else if (ff === 8) lat = rr.svarint();
          else if (ff === 9) lon = rr.svarint();
          else rr.skip(ww);
        }
        let tags = null;
        if (opt.nodeTags && keys.length) { tags = {}; keys.forEach((kk, i) => { tags[str(kk)] = str(vals[i]); }); }
        h.node(id, latOf(lat), lonOf(lon), tags);
      } else if (f === 3) { // Way
        kinds.add('w');
        const rng = r.bytesRange();
        if (!opt.ways) continue;
        let id = 0, keys = [], vals = [], refsR = null;
        for (const [ff, ww, rr] of fields(buf, rng[0], rng[1])) {
          if (ff === 1) id = rr.varint();
          else if (ff === 2) keys = packedVarints(buf, rr.bytesRange());
          else if (ff === 3) vals = packedVarints(buf, rr.bytesRange());
          else if (ff === 8) refsR = rr.bytesRange();
          else rr.skip(ww);
        }
        const tags = {}; keys.forEach((kk, i) => { tags[str(kk)] = str(vals[i]); });
        h.way(id, tags, () => (refsR ? packedVarints(buf, refsR, true, true) : []));
      } else if (f === 4) { // Relation
        kinds.add('r');
        const rng = r.bytesRange();
        if (!opt.relations) continue;
        let id = 0, keys = [], vals = [], roles = [], memids = [], types = [];
        for (const [ff, ww, rr] of fields(buf, rng[0], rng[1])) {
          if (ff === 1) id = rr.varint();
          else if (ff === 2) keys = packedVarints(buf, rr.bytesRange());
          else if (ff === 3) vals = packedVarints(buf, rr.bytesRange());
          else if (ff === 8) roles = packedVarints(buf, rr.bytesRange());
          else if (ff === 9) memids = packedVarints(buf, rr.bytesRange(), true, true);
          else if (ff === 10) types = packedVarints(buf, rr.bytesRange());
          else rr.skip(ww);
        }
        const tags = {}; keys.forEach((kk, i) => { tags[str(kk)] = str(vals[i]); });
        h.relation(id, tags, () => memids.map((ref, i) => ({ type: ['node', 'way', 'relation'][types[i]], ref, role: str(roles[i]) })));
      } else r.skip(w);
    }
  }
  return kinds;
}
