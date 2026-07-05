// The seeded infinite sea (docs/09): determinism, growth-superset slicing,
// hotspot statistics, band weights, damping math, terrain continuity.
import { hash01, chunkRng, kelpStrands, kelpAnchors, strandsInChunk,
  terrain01, xWeight, bandW, dampC } from '../js/worldgen.js';
import { SPECIES, SEA, TIERS } from '../js/tuning.js';

let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };

// hashing: deterministic, decorrelated across index and salt, in [0, 1)
check('hash01 deterministic', hash01(5, 3) === hash01(5, 3));
check('hash01 varies by index and salt',
  hash01(5, 3) !== hash01(6, 3) && hash01(5, 3) !== hash01(5, 4));
let inRange = true, mean = 0;
for (let i = -500; i < 500; i++) {
  const v = hash01(i, 9);
  if (v < 0 || v >= 1) inRange = false;
  mean += v / 1000;
}
check('hash01 in [0,1) with a sane mean', inRange && mean > 0.45 && mean < 0.55);

// chunk streams: same chunk+salt = same sequence; different chunk differs
const r1 = chunkRng(-7, 3), r2 = chunkRng(-7, 3), r3 = chunkRng(-6, 3);
check('chunkRng deterministic', r1() === r2() && r1() === r2() && r1() === r2());
check('chunkRng varies by chunk', chunkRng(-7, 3)() !== r3());

// kelp: deterministic; LIFE growth adds strands WITHOUT reshuffling the base
const base = kelpStrands(-3, 1);
check('kelpStrands deterministic',
  JSON.stringify(base) === JSON.stringify(kelpStrands(-3, 1)) && base.length > 5);
const grown = kelpStrands(-3, 1.6);
check('growth is a strict superset (no reshuffle)',
  grown.length > base.length
  && JSON.stringify(grown.slice(0, base.length)) === JSON.stringify(base));
check('strand x stays inside its chunk',
  base.every(s => s.x >= -3 * SEA.CHUNK_W && s.x < -2 * SEA.CHUNK_W));

// anchors: window query matches the underlying chunk streams
const an = kelpAnchors(-2000, 2000, 1);
check('kelpAnchors deterministic and windowed',
  an.length > 20 && an.every(s => s.x >= -2000 && s.x <= 2000)
  && JSON.stringify(an) === JSON.stringify(kelpAnchors(-2000, 2000, 1)));

// generic strand spec stream
const spec = { salt: 77, perChunk: 4, hMin: 0.2, hVar: 0.3, wMin: 2, wVar: 3 };
const st = strandsInChunk(12, spec);
check('strandsInChunk honors the spec', st.length === 4
  && st.every(s => s.h >= 0.2 && s.h < 0.5 && s.hw >= 2 && s.hw < 5));

// hotspot field: hot-cell frequency ≈ CELL_W / hotEvery; off-hotspot = baseW
const gsp = SPECIES.giantOcto;
let hot = 0;
const N = 300000;
for (let c = 0; c < N; c++) {
  const w = xWeight(c * SEA.CELL_W, gsp);
  if (w === 1) hot++;
  else if (w !== gsp.baseW) { hot = -1e9; break; }
}
const expect = N * SEA.CELL_W / gsp.hotEvery;
check(`giant hotspot frequency ≈ spec (${hot} vs ~${Math.round(expect)})`,
  hot > expect * 0.7 && hot < expect * 1.4);
check('uniform species have f_x ≡ 1',
  [0, 12345, -99999].every(x => xWeight(x, SPECIES.minnow) === 1));
check('hotspots are stable in place',
  xWeight(777 * SEA.CELL_W, gsp) === xWeight(777 * SEA.CELL_W, gsp));

// band weights: tiers inside, zero in the gaps
check('bandW tiers and gaps', bandW(SPECIES.minnow.bands, 0.1) === TIERS.common
  && bandW(SPECIES.minnow.bands, 0.5) === TIERS.uncommon
  && bandW(SPECIES.minnow.bands, 0.9) === 0
  && bandW(SPECIES.angler.bands, 0.9) === TIERS.uncommon
  && bandW(SPECIES.angler.bands, 0.5) === 0);

// damping: c rises with the arrival ramp (log-lerp of 1 − c), hits both ends
for (const [name, sp] of Object.entries(SPECIES)) {
  const c0 = dampC(sp, 0), c1 = dampC(sp, 1);
  check(`${name} damping ends match (${c0.toFixed(3)} → ${c1.toFixed(3)})`,
    Math.abs(c0 - sp.damp[0]) < 1e-9 && Math.abs(c1 - sp.damp[1]) < 1e-9
    && dampC(sp, 0.5) > c0 && dampC(sp, 0.5) < c1);
}

// terrain: continuous, bounded, deterministic
let cont = true, bounded = true;
for (let x = -5000; x < 5000; x += 7) {
  const a = terrain01(x, 24), b = terrain01(x + 7, 24);
  if (Math.abs(a - b) > 0.06) cont = false;
  if (a < 0 || a > 1) bounded = false;
}
check('terrain01 continuous and bounded', cont && bounded);
check('terrain01 deterministic', terrain01(1234.5, 24) === terrain01(1234.5, 24));

process.exit(fail ? 1 : 0);
