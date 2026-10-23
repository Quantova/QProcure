// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const q = require('..');
const { network, stamper, forged, iso, failing } = require('./chain');

async function tender() {
  const now = Math.floor(Date.now() / 1000);
  const net = network(now - 4 * 3600);
  const at = stamper(q, net);
  const K = {};
  for (const r of ['authority', 'bidder1', 'bidder2', 'committee', 'evaluator', 'awarder']) K[r] = q.generateKey();
  const published = now - 3 * 3600;
  const deadline = now - 2 * 3600;
  const notice = await at(q.notice({ key: K.authority, title: 'Road works', criteria: Buffer.from('criteria'), currency: 'USD', estimate: '100000', maxScore: '100', deadline: iso(deadline), publishedAt: iso(published) }), published + 60);
  const s1 = q.sealBid(Buffer.from('bid one'), '50000', notice, q.describeKey(K.bidder1));
  const s2 = q.sealBid(Buffer.from('bid two'), '90000', notice, q.describeKey(K.bidder2));
  const bid1 = q.bid({ key: K.bidder1, notice, seal: s1.seal, sealedAt: iso(deadline - 1800) });
  const bid2 = q.bid({ key: K.bidder2, notice, seal: s2.seal, sealedAt: iso(deadline - 1700) });
  const bid1Timely = await at(bid1, deadline - 1500);
  const bid2A = await at(bid2, deadline - 1400);
  const bid1Late = await at(bid1, deadline + 1800);
  const open2 = await at(q.opening({ key: K.committee, notice, bid: bid2A, bidDigest: s2.bidDigest, bidSalt: s2.salt, currency: 'USD', price: '90000', openedAt: iso(deadline + 3600) }), deadline + 3700);
  const score2 = await at(q.score({ key: K.evaluator, notice, opening: open2, score: '80', scoredAt: iso(deadline + 4000) }), deadline + 4100);
  const award = await at(q.award({ ledger: false, key: K.awarder, notice, opening: open2, contractDocument: Buffer.from('contract'), currency: 'USD', awardedAt: iso(deadline + 4500) }), deadline + 4600);
  const open1 = await at(q.opening({ key: K.committee, notice, bid: bid1Timely, bidDigest: s1.bidDigest, bidSalt: s1.salt, currency: 'USD', price: '50000', openedAt: iso(deadline + 3650) }), deadline + 3700);
  const score1 = await at(q.score({ key: K.evaluator, notice, opening: open1, score: '60', scoredAt: iso(deadline + 4050) }), deadline + 4100);
  net.chain.block(now);
  const roles = {
    authorityKeys: [q.keyId(K.authority)], bidderKeys: [q.keyId(K.bidder1), q.keyId(K.bidder2)], committeeKeys: [q.keyId(K.committee)],
    evaluatorKeys: [q.keyId(K.evaluator)], awarderKeys: [q.keyId(K.awarder)],
  };
  const verifyAward = (extra, more) => q.verify(award, Object.assign({ type: 'award', allSupplied: true, records: [notice, bid2A, open2, score2].concat(extra) }, roles, net.opts, more || {}));
  return { net, notice, bid1, bid1Timely, bid1Late, open1, score1, award, roles, verifyAward, deadline };
}

test('a suppressed timely bid makes the award invalid whatever the order of its anchors', async () => {
  const t = await tender();
  for (const extra of [[t.bid1Timely], [t.bid1Late, t.bid1Timely], [t.bid1Timely, t.bid1Late]]) {
    const r = await t.verifyAward(extra);
    assert.strictEqual(r.status, 'invalid', failing(r).join('\n'));
    assert.ok(r.checks.some((c) => c.name === 'openings' && !c.ok));
  }
});

test('a suppressed bid with only a late anchor is never left out', async () => {
  const t = await tender();
  const r = await t.verifyAward([t.bid1Late]);
  assert.strictEqual(r.status, 'indeterminate', failing(r).join('\n'));
  assert.ok(r.checks.some((c) => c.name === 'unproven bids' && c.indeterminate));
});

test('a suppressed bid supplied without any anchor keeps the award open', async () => {
  const t = await tender();
  const r = await t.verifyAward([t.bid1]);
  assert.strictEqual(r.status, 'indeterminate', failing(r).join('\n'));
});

test('junk receipts listed before the timely receipt do not hide it', async () => {
  const t = await tender();
  const junk = [];
  for (let i = 0; i < 12; i += 1) junk.push(Object.assign({}, t.bid1Timely, { anchor: { junk: i } }));
  const r = await t.verifyAward(junk.concat([t.bid1Timely]));
  assert.strictEqual(r.status, 'invalid', failing(r).join('\n'));
});

test('forged receipts that claim earlier positions cannot displace the timely receipt', async () => {
  const t = await tender();
  const few = [];
  for (let i = 0; i < 7; i += 1) few.push(Object.assign({}, t.bid1, { anchor: forged(t.bid1Timely.anchor, 60 + i, i) }));
  const r1 = await t.verifyAward(few.concat([t.bid1Late, t.bid1Timely]));
  assert.strictEqual(r1.status, 'invalid', failing(r1).join('\n'));
  const many = [];
  for (let i = 0; i < 24; i += 1) many.push(Object.assign({}, t.bid1, { anchor: forged(t.bid1Timely.anchor, 60 + i, i) }));
  const r2 = await t.verifyAward(many.concat([t.bid1Late, t.bid1Timely]));
  assert.strictEqual(r2.status, 'invalid', failing(r2).join('\n'));
  assert.ok(r2.checks.some((c) => c.name === 'openings' && !c.ok));
  const own = await q.verify(t.bid1, Object.assign({ type: 'bid', records: [t.notice].concat(many, [t.bid1Late, t.bid1Timely]) }, t.roles, t.net.opts));
  assert.ok(own.status === 'valid' || (own.status === 'indeterminate' && own.checks.filter((c) => !c.ok).every((c) => / earlier copies$/.test(c.name))), failing(own).join('\n'));
});

test('the award stays valid when every bid was opened and scored', async () => {
  const t = await tender();
  const r = await t.verifyAward([t.bid1Late, t.bid1Timely, t.open1, t.score1]);
  assert.strictEqual(r.status, 'valid', failing(r).join('\n'));
});

test('the primary record keeps the receipts of its supplied copies', async () => {
  const t = await tender();
  const r = await q.verify(t.bid1Late, Object.assign({ type: 'bid', records: [t.notice, t.bid1Timely] }, t.roles, t.net.opts));
  assert.strictEqual(r.status, 'valid', failing(r).join('\n'));
  assert.strictEqual(Date.parse(r.anchoredAt), t.bid1Timely.anchor.anchor.time * 1000);
});

test('verification refuses to fall back to the local clock', async () => {
  const t = await tender();
  const stale = t.net.clients.map((c) => Object.assign({}, c, { nodeInfo: async () => ({ chain_id: t.net.chain.chainId, genesis_hash: t.net.chain.genesis, head_height: 1001 }) }));
  await assert.rejects(t.verifyAward([t.bid1Timely], { clients: stale }), (e) => e.code === 'QPROCURE_NO_CHAIN_TIME');
});
