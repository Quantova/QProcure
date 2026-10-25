'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert');
const q = require('..');
const qstamp = require('@quantovainc/qstamp');
const { network, stamper, forged, iso, failing, bech32m } = require('./chain');
const { mulberry32, mutator, iterations } = require('./fuzz');

function bogus(env, time, rng) {
  const digest = q.anchorDigest(env);
  const salt = crypto.createHash('sha256').update('salt ' + rng()).digest();
  const leaf = qstamp.leafHash('sha3-256', Buffer.from(digest, 'hex'), salt);
  const tag = (s) => crypto.createHash('sha256').update(s + rng()).digest();
  return {
    format: qstamp.RECEIPT_FORMAT,
    chain: { id: qstamp.NETWORKS.testnet.chainId, genesis: qstamp.NETWORKS.testnet.genesis },
    contract: qstamp.NETWORKS.testnet.contract,
    kind: String(q.KIND),
    record: { alg: 'sha3-256', digest, salt: salt.toString('hex') },
    proof: { index: 0, size: 1, path: [] },
    root: leaf.toString('hex'),
    anchor: { tx: bech32m('QTX', tag('tx')), height: 1000 + Math.floor(rng() * 1e6), block: bech32m('QBK', tag('block')), time, sender: bech32m('Q', tag('sender')) },
  };
}

async function tender(rng) {
  const int = (n) => Math.floor(rng() * n);
  const now = Math.floor(Date.now() / 1000);
  const net = network(now - 4 * 3600);
  const at = stamper(q, net);
  const K = { authority: q.generateKey(), committee: q.generateKey(), evaluator: q.generateKey(), awarder: q.generateKey() };
  const n = 2 + int(3);
  const bidders = Array.from({ length: n }, () => q.generateKey());
  const published = now - 3 * 3600;
  const deadline = now - 2 * 3600;
  const notice = await at(q.notice({ key: K.authority, title: 'Tender ' + int(1e6), criteria: Buffer.from('criteria'), currency: 'EUR', estimate: '100000', maxScore: '100', deadline: iso(deadline), publishedAt: iso(published) }), published + 60);
  const seals = bidders.map((k, i) => q.sealBid(Buffer.from('bid ' + i + ' ' + int(1e9)), String(1000 + int(90000)), notice, q.describeKey(k)));
  const unanchored = bidders.map((k, i) => q.bid({ key: k, notice, seal: seals[i].seal, sealedAt: iso(deadline - 1800 + i * 10) }));
  const bids = [];
  for (let i = 0; i < n; i += 1) bids.push(await at(unanchored[i], deadline - 1500 + i * 10));
  const suppressed = 1 + int(n - 1);
  const records = [notice];
  const openings = [];
  let excluded = 0;
  for (let i = 0; i < n; i += 1) {
    records.push(bids[i]);
    if (i === suppressed) continue;
    if (i !== 0 && rng() < 0.3) {
      records.push(await at(q.exclusion({ key: K.committee, notice, bid: bids[i], reason: 'incomplete', excludedAt: iso(deadline + 3500 + i) }), deadline + 3600));
      excluded += 1;
      continue;
    }
    const o = await at(q.opening({ key: K.committee, notice, bid: bids[i], bidDigest: seals[i].bidDigest, bidSalt: seals[i].salt, currency: 'EUR', price: seals[i].price, openedAt: iso(deadline + 3600 + i) }), deadline + 3700);
    openings.push(o);
    records.push(o);
  }
  for (let i = 0; i < openings.length; i += 1) records.push(await at(q.score({ key: K.evaluator, notice, opening: openings[i], score: String(i === 0 ? 90 : 10 + int(70)), scoredAt: iso(deadline + 4000 + i) }), deadline + 4100));
  const award = await at(q.award({ ledger: false, key: K.awarder, notice, opening: openings[0], contractDocument: Buffer.from('contract'), currency: 'EUR', awardedAt: iso(deadline + 4500) }), deadline + 4600);
  const late = await at(unanchored[suppressed], deadline + 600 + int(3000));
  net.chain.block(now);
  const roles = {
    authorityKeys: [q.keyId(K.authority)], bidderKeys: bidders.map((k) => q.keyId(k)), committeeKeys: [q.keyId(K.committee)],
    evaluatorKeys: [q.keyId(K.evaluator)], awarderKeys: [q.keyId(K.awarder)],
  };
  const verify = (pool) => q.verify(award, Object.assign({ type: 'award', at: iso(now), allSupplied: true, records: pool }, roles, net.opts));
  const without = records.filter((r) => r !== bids[suppressed]);
  return { int, verify, records, without, timely: bids[suppressed], bare: unanchored[suppressed], late, others: bids.filter((b, i) => i !== suppressed), deadline, excluded, n, K, notice, at };
}

const ROUNDS = iterations(40);

test('a validly signed timely bid that is neither opened nor excluded makes the award invalid however many junk or forged receipts are added', async (t) => {
  const rng = mulberry32(0xb1d5);
  const m = mutator(0xb1d6);
  const kinds = {};
  let maxCopies = 0;
  for (let round = 0; round < ROUNDS; round += 1) {
    const tn = await tender(rng);
    const honestWithout = await tn.verify(tn.without);
    assert.strictEqual(honestWithout.status, 'valid', failing(honestWithout).join('\n'));
    const copies = [];
    const count = tn.int(40);
    for (let i = 0; i < count; i += 1) {
      const kind = ['junk', 'forged', 'bogus', 'mutated', 'bare', 'late', 'borrowed'][tn.int(7)];
      kinds[kind] = (kinds[kind] || 0) + 1;
      if (kind === 'junk') copies.push(Object.assign({}, tn.bare, { anchor: [null, 'x', [], {}, { junk: i }, 0, true][tn.int(7)] }));
      else if (kind === 'forged') copies.push(Object.assign({}, tn.bare, { anchor: forged(tn.timely.anchor, 1 + tn.int(5000), i) }));
      else if (kind === 'bogus') copies.push(Object.assign({}, tn.bare, { anchor: bogus(tn.bare, tn.deadline - 1 - tn.int(5000), rng) }));
      else if (kind === 'mutated') copies.push(Object.assign({}, tn.bare, { anchor: m.mutate(tn.timely.anchor).value }));
      else if (kind === 'bare') copies.push(tn.bare);
      else if (kind === 'late') copies.push(tn.late);
      else copies.push(Object.assign({}, tn.bare, { anchor: tn.others[tn.int(tn.others.length)].anchor }));
    }
    copies.splice(tn.int(copies.length + 1), 0, tn.timely);
    maxCopies = Math.max(maxCopies, copies.length);
    const pool = tn.without.slice();
    for (const c of copies) pool.splice(tn.int(pool.length + 1), 0, c);
    const r = await tn.verify(pool);
    assert.strictEqual(r.status, 'invalid', 'round ' + round + ' with ' + copies.length + ' copies\n' + failing(r).join('\n'));
    assert.ok(r.checks.some((c) => c.name === 'openings' && !c.ok), failing(r).join('\n'));
  }
  t.diagnostic(JSON.stringify({ rounds: ROUNDS, maxCopies, kinds }));
});

test('a flood of receipts that claim earlier positions for a suppressed bid never turns the invalid award open or valid', async (t) => {
  const rng = mulberry32(0xf100d);
  const seen = [];
  for (const count of [7, 8, 9, 16, 64, 256]) {
    const tn = await tender(rng);
    const copies = [];
    for (let i = 0; i < count; i += 1) {
      copies.push(Object.assign({}, tn.bare, { anchor: i % 2 ? forged(tn.timely.anchor, 1 + i, i) : bogus(tn.bare, tn.deadline - 1 - i, rng) }));
    }
    const pool = tn.without.concat(copies, [tn.late, tn.timely]);
    const r = await tn.verify(pool);
    assert.strictEqual(r.status, 'invalid', count + ' copies\n' + failing(r).join('\n'));
    assert.ok(r.checks.some((c) => c.name === 'openings' && !c.ok), failing(r).join('\n'));
    seen.push(count);
  }
  t.diagnostic('flood sizes ' + seen.join(', '));
});

test('an exclusion signed or anchored after the award never turns an award that left a bid unopened valid', async () => {
  const rng = mulberry32(0xe7c1);
  for (let round = 0; round < 6; round += 1) {
    const tn = await tender(rng);
    const pool = tn.without.concat([tn.timely]);
    const unopened = await tn.verify(pool);
    assert.strictEqual(unopened.status, 'invalid', failing(unopened).join('\n'));
    const exclude = (when, anchoredAt) => tn.at(q.exclusion({ key: tn.K.committee, notice: tn.notice, bid: tn.timely, reason: 'incomplete', excludedAt: iso(when) }), anchoredAt);
    const after = await exclude(tn.deadline + 6000, tn.deadline + 6100);
    const r = await tn.verify(pool.concat([after]));
    assert.strictEqual(r.status, 'invalid', 'an exclusion after the award verified ' + r.status + '\n' + failing(r).join('\n'));
    assert.ok(r.checks.some((c) => c.name === 'exclusion timing' && !c.ok), failing(r).join('\n'));
    const backdated = await exclude(tn.deadline + 3550, tn.deadline + 6100);
    const rb = await tn.verify(pool.concat([backdated]));
    assert.strictEqual(rb.status, 'invalid', 'an exclusion dated before the award but anchored after it verified ' + rb.status);
    const before = await exclude(tn.deadline + 3550, tn.deadline + 3600);
    const ok = await tn.verify(pool.concat([before]));
    assert.strictEqual(ok.status, 'valid', failing(ok).join('\n'));
  }
});
