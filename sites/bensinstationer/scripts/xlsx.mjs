// Minimal xlsx-läsare utan beroenden: packar upp zip-filen och läser ett blad till rader med cellvärden.
import zlib from "node:zlib";

/** Packar upp en zip-buffer till Map(namn → Buffer). Stöder lagrade (0) och deflate (8) poster. */
export function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Ingen zip-katalog hittades");
  const antal = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const ut = new Map();
  for (let n = 0; n < antal; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Trasig zip-katalog");
    const metod = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), klen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const namn = buf.subarray(p + 46, p + 46 + nlen).toString("utf8");
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const data = buf.subarray(start, start + csize);
    if (metod === 0) ut.set(namn, Buffer.from(data));
    else if (metod === 8) ut.set(namn, zlib.inflateRawSync(data));
    p += 46 + nlen + elen + klen;
  }
  return ut;
}

const avkoda = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const kolumnIndex = (ref) => { let n = 0; for (const c of ref) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };

/** Läser alla blad: { bladnamn: [[cell, cell, ...], ...] }. Tal blir number, text blir string, tomt blir null. */
export function lasXlsx(buf) {
  const filer = unzip(buf);
  const txt = (n) => filer.get(n)?.toString("utf8") ?? "";
  const delade = [...txt("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => avkoda([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const rels = new Map([...txt("xl/_rels/workbook.xml.rels").matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const blad = {};
  for (const m of txt("xl/workbook.xml").matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const mal = rels.get(m[2]);
    const fil = mal.startsWith("/") ? mal.slice(1) : `xl/${mal}`;
    const rader = [];
    for (const r of txt(fil).matchAll(/<row [^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const rad = [];
      for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const v = /<v>([\s\S]*?)<\/v>/.exec(c[3] ?? "")?.[1];
        const inl = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(c[3] ?? "")?.[1];
        let varde = null;
        if (/t="s"/.test(c[2]) && v != null) varde = delade[Number(v)];
        else if (/t="inlineStr"/.test(c[2])) varde = inl != null ? avkoda(inl) : null;
        else if (/t="str"/.test(c[2])) varde = v != null ? avkoda(v) : null;
        else if (v != null) varde = Number(v);
        rad[kolumnIndex(c[1])] = varde;
      }
      rader[Number(r[1]) - 1] = rad;
    }
    blad[avkoda(m[1])] = rader;
  }
  return blad;
}

/** Excel-serienummer (1900-systemet) → ISO-datum. */
export const excelDatum = (n) => new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
