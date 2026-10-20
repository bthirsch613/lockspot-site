// Dependency-free Latin subset + WOFF2 writer for TrueType (glyf) fonts. Made the files in assets/fonts/.
// Keeps glyph ids (so GSUB/GPOS/hmtx stay valid), empties outlines for glyphs outside the closure,
// rebuilds cmap (format 4) for the kept code points, drops glyph names (post v3), then packs WOFF2
// with null transforms and Node's built-in Brotli.
//   node tools/subset-fonts.mjs in.ttf out.woff2 [--caps]
// Sources: the OFL TTFs in the app repo, store-assets/src/fonts/ (PlusJakartaSans_500Medium.ttf -> PlusJakartaSans-500.woff2, ...).
// Anton is only ever drawn upper case (text-transform: uppercase), so it is made with --caps:
//   node tools/subset-fonts.mjs Anton_400Regular.ttf assets/fonts/Anton-400.woff2 --caps
// If you change RANGES or CAPS, update unicode-range in assets/site.css to match.
import fs from 'node:fs';
import zlib from 'node:zlib';

const RANGES = [
  [0x20, 0x7e], [0xa0, 0xff], [0x131, 0x131], [0x152, 0x153], [0x2c6, 0x2c6], [0x2da, 0x2da], [0x2dc, 0x2dc],
  [0x2013, 0x2014], [0x2018, 0x201a], [0x201c, 0x201e], [0x2020, 0x2022], [0x2026, 0x2026], [0x2032, 0x2033],
  [0x2039, 0x203a], [0x2044, 0x2044], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x2190, 0x2193], [0x2212, 0x2212],
];
export const UNICODE_RANGE = 'U+0020-007E, U+00A0-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2013-2014, U+2018-201A, U+201C-201E, U+2020-2022, U+2026, U+2032-2033, U+2039-203A, U+2044, U+20AC, U+2122, U+2190-2193, U+2212';
// Upper case only: space to Z (digits and basic punctuation included), dashes, curly quotes, ellipsis.
const CAPS = [[0x20, 0x5a], [0x2013, 0x2014], [0x2018, 0x2019], [0x201c, 0x201d], [0x2026, 0x2026]];
export const CAPS_UNICODE_RANGE = 'U+0020-005A, U+2013-2014, U+2018-2019, U+201C-201D, U+2026';

function readTables(b) {
  const n = b.readUInt16BE(4);
  const t = new Map();
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    const tag = b.toString('latin1', o, o + 4);
    const off = b.readUInt32BE(o + 8), len = b.readUInt32BE(o + 12);
    t.set(tag, Buffer.from(b.subarray(off, off + len)));
  }
  return t;
}

function parseCmap(c) {
  const n = c.readUInt16BE(2);
  const map = new Map();
  let best = null;
  for (let i = 0; i < n; i++) {
    const pid = c.readUInt16BE(4 + i * 8), eid = c.readUInt16BE(6 + i * 8), off = c.readUInt32BE(8 + i * 8);
    const fmt = c.readUInt16BE(off);
    if (pid === 3 && eid === 10 && fmt === 12) best = { off, fmt };
    else if (!best && ((pid === 3 && eid === 1) || pid === 0) && fmt === 4) best = { off, fmt };
  }
  if (!best) throw new Error('no usable cmap');
  const o = best.off;
  if (best.fmt === 4) {
    const segX2 = c.readUInt16BE(o + 6), seg = segX2 / 2;
    const ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ros = deltas + segX2;
    for (let s = 0; s < seg; s++) {
      const end = c.readUInt16BE(ends + s * 2), start = c.readUInt16BE(starts + s * 2);
      const delta = c.readInt16BE(deltas + s * 2), ro = c.readUInt16BE(ros + s * 2);
      for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
        let g;
        if (ro === 0) g = (cp + delta) & 0xffff;
        else {
          const gi = ros + s * 2 + ro + (cp - start) * 2;
          g = c.readUInt16BE(gi);
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) map.set(cp, g);
      }
    }
  } else {
    const ng = c.readUInt32BE(o + 12);
    for (let i = 0; i < ng; i++) {
      const s = c.readUInt32BE(o + 16 + i * 12), e = c.readUInt32BE(o + 20 + i * 12), g = c.readUInt32BE(o + 24 + i * 12);
      for (let cp = s; cp <= e; cp++) map.set(cp, g + cp - s);
    }
  }
  return map;
}

function coverage(b, off) {
  const fmt = b.readUInt16BE(off);
  const out = [];
  if (fmt === 1) {
    const n = b.readUInt16BE(off + 2);
    for (let i = 0; i < n; i++) out.push(b.readUInt16BE(off + 4 + i * 2));
  } else if (fmt === 2) {
    const n = b.readUInt16BE(off + 2);
    for (let i = 0; i < n; i++) {
      const s = b.readUInt16BE(off + 4 + i * 6), e = b.readUInt16BE(off + 6 + i * 6);
      for (let g = s; g <= e; g++) out.push(g);
    }
  } else throw new Error('coverage format ' + fmt);
  return out;
}

// One pass of GSUB closure over every single/multiple/alternate/ligature subtable. Returns true if keep grew.
function gsubPass(b, keep) {
  let grew = false;
  const add = (g) => { if (!keep.has(g)) { keep.add(g); grew = true; } };
  const ll = b.readUInt16BE(8);
  const nLookups = b.readUInt16BE(ll);
  for (let li = 0; li < nLookups; li++) {
    const lo = ll + b.readUInt16BE(ll + 2 + li * 2);
    let type = b.readUInt16BE(lo);
    const nSub = b.readUInt16BE(lo + 4);
    for (let si = 0; si < nSub; si++) {
      let so = lo + b.readUInt16BE(lo + 6 + si * 2);
      let t = type;
      if (t === 7) { t = b.readUInt16BE(so + 2); so = so + b.readUInt32BE(so + 4); }
      if (t < 1 || t > 4) continue;
      const fmt = b.readUInt16BE(so);
      const cov = coverage(b, so + b.readUInt16BE(so + 2));
      if (t === 1) {
        if (fmt === 1) {
          const d = b.readInt16BE(so + 4);
          for (const g of cov) if (keep.has(g)) add((g + d) & 0xffff);
        } else {
          cov.forEach((g, i) => { if (keep.has(g)) add(b.readUInt16BE(so + 6 + i * 2)); });
        }
      } else if (t === 2 || t === 3) {
        cov.forEach((g, i) => {
          if (!keep.has(g)) return;
          const so2 = so + b.readUInt16BE(so + 6 + i * 2);
          const n = b.readUInt16BE(so2);
          for (let k = 0; k < n; k++) add(b.readUInt16BE(so2 + 2 + k * 2));
        });
      } else if (t === 4) {
        cov.forEach((g, i) => {
          if (!keep.has(g)) return;
          const ls = so + b.readUInt16BE(so + 6 + i * 2);
          const n = b.readUInt16BE(ls);
          for (let k = 0; k < n; k++) {
            const lg = ls + b.readUInt16BE(ls + 2 + k * 2);
            const lig = b.readUInt16BE(lg), cc = b.readUInt16BE(lg + 2);
            let ok = true;
            for (let c = 0; c < cc - 1; c++) if (!keep.has(b.readUInt16BE(lg + 4 + c * 2))) ok = false;
            if (ok) add(lig);
          }
        });
      }
    }
  }
  return grew;
}

function locaOffsets(t) {
  const head = t.get('head'), loca = t.get('loca');
  const n = t.get('maxp').readUInt16BE(4);
  const long = head.readInt16BE(50) === 1;
  const offs = [];
  for (let i = 0; i <= n; i++) offs.push(long ? loca.readUInt32BE(i * 4) : loca.readUInt16BE(i * 2) * 2);
  return offs;
}

function compositePass(glyf, offs, keep) {
  let grew = false;
  for (const g of [...keep]) {
    const s = offs[g], e = offs[g + 1];
    if (e - s < 10) continue;
    if (glyf.readInt16BE(s) >= 0) continue;
    let p = s + 10, flags;
    do {
      flags = glyf.readUInt16BE(p);
      const comp = glyf.readUInt16BE(p + 2);
      if (!keep.has(comp)) { keep.add(comp); grew = true; }
      p += 4 + (flags & 1 ? 4 : 2);
      if (flags & 0x8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
    } while (flags & 0x20);
  }
  return grew;
}

function buildCmap(pairs) {
  // pairs: sorted [cp, gid], all cp <= 0xFFFF. Format 4 with idDelta-only segments.
  const segs = [];
  for (const [cp, g] of pairs) {
    const last = segs[segs.length - 1];
    if (last && cp === last.end + 1 && g - cp === last.delta) last.end = cp;
    else segs.push({ start: cp, end: cp, delta: g - cp });
  }
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const n = segs.length;
  const sub = Buffer.alloc(16 + n * 8);
  let es = 1; while (es * 2 <= n) es *= 2;
  sub.writeUInt16BE(4, 0); sub.writeUInt16BE(sub.length, 2); sub.writeUInt16BE(0, 4);
  sub.writeUInt16BE(n * 2, 6); sub.writeUInt16BE(es * 2, 8); sub.writeUInt16BE(Math.log2(es), 10); sub.writeUInt16BE(n * 2 - es * 2, 12);
  segs.forEach((s, i) => {
    sub.writeUInt16BE(s.end, 14 + i * 2);
    sub.writeUInt16BE(s.start, 16 + n * 2 + i * 2);
    sub.writeInt16BE(((s.delta + 0x8000) & 0xffff) - 0x8000, 16 + n * 4 + i * 2);
    sub.writeUInt16BE(0, 16 + n * 6 + i * 2);
  });
  const head = Buffer.alloc(4 + 2 * 8);
  head.writeUInt16BE(0, 0); head.writeUInt16BE(2, 2);
  head.writeUInt16BE(0, 4); head.writeUInt16BE(3, 6); head.writeUInt32BE(head.length, 8);
  head.writeUInt16BE(3, 12); head.writeUInt16BE(1, 14); head.writeUInt32BE(head.length, 16);
  return Buffer.concat([head, sub]);
}

const pad4 = (n) => (n + 3) & ~3;
function checksum(buf) {
  const b = Buffer.concat([buf, Buffer.alloc(pad4(buf.length) - buf.length)]);
  let s = 0;
  for (let i = 0; i < b.length; i += 4) s = (s + b.readUInt32BE(i)) >>> 0;
  return s;
}

function subset(src, ranges = RANGES) {
  const t = readTables(src);
  const cmap = parseCmap(t.get('cmap'));
  const keep = new Set([0]);
  const pairs = [];
  for (const [a, z] of ranges) for (let cp = a; cp <= z; cp++) if (cmap.has(cp)) { keep.add(cmap.get(cp)); pairs.push([cp, cmap.get(cp)]); }
  const offs = locaOffsets(t);
  const glyf = t.get('glyf');
  for (let guard = 0; guard < 20; guard++) {
    const a = t.has('GSUB') ? gsubPass(t.get('GSUB'), keep) : false;
    const b = compositePass(glyf, offs, keep);
    if (!a && !b) break;
  }
  const n = offs.length - 1;
  const parts = [];
  const newOffs = [0];
  let pos = 0;
  for (let g = 0; g < n; g++) {
    if (keep.has(g) && offs[g + 1] > offs[g]) {
      let piece = glyf.subarray(offs[g], offs[g + 1]);
      if (piece.length % 2) piece = Buffer.concat([piece, Buffer.alloc(1)]);
      parts.push(piece);
      pos += piece.length;
    }
    newOffs.push(pos);
  }
  const newGlyf = Buffer.concat(parts);
  const short = pos <= 0x1fffe;
  const loca = Buffer.alloc((n + 1) * (short ? 2 : 4));
  newOffs.forEach((o, i) => (short ? loca.writeUInt16BE(o / 2, i * 2) : loca.writeUInt32BE(o, i * 4)));
  const head = Buffer.from(t.get('head'));
  head.writeInt16BE(short ? 0 : 1, 50);
  head.writeUInt32BE(0, 8);
  const post = Buffer.from(t.get('post').subarray(0, 32));
  post.writeUInt32BE(0x00030000, 0);
  pairs.sort((x, y) => x[0] - y[0]);
  t.set('glyf', newGlyf); t.set('loca', loca); t.set('head', head); t.set('post', post); t.set('cmap', buildCmap(pairs));
  t.delete('STAT');
  // sfnt checksum adjustment, so the reconstructed font is self-consistent
  const tags = [...t.keys()].sort();
  const numTables = tags.length;
  let es = 1; while (es * 2 <= numTables) es *= 2;
  const dir = Buffer.alloc(12 + 16 * numTables);
  dir.writeUInt32BE(0x00010000, 0); dir.writeUInt16BE(numTables, 4); dir.writeUInt16BE(es * 16, 6);
  dir.writeUInt16BE(Math.log2(es), 8); dir.writeUInt16BE(numTables * 16 - es * 16, 10);
  let off = dir.length;
  tags.forEach((tag, i) => {
    const d = t.get(tag);
    dir.write(tag, 12 + i * 16, 'latin1');
    dir.writeUInt32BE(checksum(d), 16 + i * 16);
    dir.writeUInt32BE(off, 20 + i * 16);
    dir.writeUInt32BE(d.length, 24 + i * 16);
    off += pad4(d.length);
  });
  let total = checksum(dir);
  for (const tag of tags) total = (total + checksum(t.get(tag))) >>> 0;
  head.writeUInt32BE((0xb1b0afba - total) >>> 0, 8);
  return { tables: t, keptGlyphs: keep.size, totalGlyphs: n, sfntSize: off };
}

const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function base128(n) {
  const bytes = [];
  do { bytes.unshift(n & 0x7f); n >>>= 7; } while (n);
  return bytes.map((b, i) => (i < bytes.length - 1 ? b | 0x80 : b));
}

function woff2({ tables, sfntSize }) {
  const tags = [...tables.keys()].sort().filter((x) => x !== 'loca');
  if (tables.has('loca')) tags.splice(tags.indexOf('glyf') + 1, 0, 'loca');
  const dir = [];
  for (const tag of tags) {
    const idx = KNOWN.indexOf(tag);
    const xform = tag === 'glyf' || tag === 'loca' ? 3 : 0;
    if (idx >= 0) dir.push((xform << 6) | idx);
    else { dir.push((xform << 6) | 63, ...Buffer.from(tag, 'latin1')); }
    dir.push(...base128(tables.get(tag).length));
  }
  const data = Buffer.concat(tags.map((tag) => tables.get(tag)));
  const comp = zlib.brotliCompressSync(data, {
    params: {
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_FONT,
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length,
    },
  });
  const headerLen = 48;
  const total = pad4(headerLen + dir.length + comp.length);
  const out = Buffer.alloc(total);
  out.writeUInt32BE(0x774f4632, 0);
  out.writeUInt32BE(0x00010000, 4);
  out.writeUInt32BE(total, 8);
  out.writeUInt16BE(tags.length, 12);
  out.writeUInt16BE(0, 14);
  out.writeUInt32BE(sfntSize, 16);
  out.writeUInt32BE(comp.length, 20);
  out.writeUInt16BE(1, 24); out.writeUInt16BE(0, 26);
  Buffer.from(dir).copy(out, headerLen);
  comp.copy(out, headerLen + dir.length);
  return out;
}

if (process.argv[2]) {
  const [, , inp, outp, flag] = process.argv;
  const r = subset(fs.readFileSync(inp), flag === '--caps' ? CAPS : RANGES);
  const w = woff2(r);
  fs.writeFileSync(outp, w);
  console.log(`${outp}: ${w.length} bytes, kept ${r.keptGlyphs}/${r.totalGlyphs} glyphs`);
}
