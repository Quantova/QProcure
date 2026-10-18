// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const q = require('..');
const { network } = require('./chain');

function tender() {
  const net = network(Math.floor(Date.now() / 1000));
  const k = () => q.generateKey();
  const [auth, bidder, rival, committee, evaluator, awarder] = [k(), k(), k(), k(), k(), k()];
  const id = q.keyId;
  const t = (m) => new Date(Date.now() - m * 60000).toISOString();
  const notice = q.notice({ key: auth, title: 'Bridge works', criteriaDigest: 'a'.repeat(64), currency: 'EUR', estimate: '1000', maxScore: '100', deadline: t(300), publishedAt: t(600) });
  const doc = Buffer.from('bid');
  const sealed = (who, price, m) => {
    const s = q.sealBid(doc, price, notice, id(who));
    return { s, bid: q.bid({ key: who, notice, seal: s.seal, sealedAt: t(m) }) };
  };
  const open = (x, m) => q.opening({ key: committee, notice, bid: x.bid, bidDigest: x.s.bidDigest, bidSalt: x.s.salt, currency: 'EUR', price: x.s.price, openedAt: t(m) });
  const score = (o, value, m) => q.score({ key: evaluator, notice, opening: o, score: value, scoredAt: t(m) });
  const award = (o) => q.award({ key: awarder, notice, opening: o, contractDigest: 'c'.repeat(64), currency: 'EUR', awardedAt: t(100) });
  const roles = { authorityKeys: [id(auth)], bidderKeys: [id(bidder), id(rival)], committeeKeys: [id(committee)], evaluatorKeys: [id(evaluator)], awarderKeys: [id(awarder)] };
  const verify = (env, records, extra) => q.verify(env, Object.assign({ type: 'award', requireAnchor: false, allSupplied: true, at: new Date().toISOString(), records: [notice].concat(records) }, roles, net.opts, extra || {}));
  return { committee, notice, bidder, rival, sealed, open, score, award, verify, t };
}

test('a bidder who sealed two prices and revealed one after a rival opening never gets a valid award', async () => {
  const w = tender();
  const high = w.sealed(w.bidder, '990', 400);
  const low = w.sealed(w.bidder, '940', 395);
  const rival = w.sealed(w.rival, '950', 390);
  const openRival = w.open(rival, 200);
  const openLow = w.open(low, 190);
  const excluded = q.exclusion({ key: w.committee, notice: w.notice, bid: high.bid, reason: 'not revealed', excludedAt: w.t(180) });
  const records = [high.bid, low.bid, rival.bid, openRival, openLow, w.score(openRival, '60', 170), w.score(openLow, '70', 165)];
  const award = w.award(openLow);
  for (const [extra, set] of [[{}, records.concat([excluded])], [{}, records], [{ allSupplied: false }, records.concat([excluded])]]) {
    const r = await w.verify(award, set, extra);
    assert.strictEqual(r.valid, false);
    assert.ok(r.checks.some((c) => c.name === 'one bid per bidder' && !c.ok), JSON.stringify(r.checks.filter((c) => !c.ok)));
  }
});

test('an award stays valid when each bidder sealed one bid and every bid was opened and scored', async () => {
  const w = tender();
  const mine = w.sealed(w.bidder, '940', 395);
  const rival = w.sealed(w.rival, '950', 390);
  const openRival = w.open(rival, 200);
  const openMine = w.open(mine, 190);
  const r = await w.verify(w.award(openMine), [mine.bid, rival.bid, openRival, openMine, w.score(openRival, '60', 170), w.score(openMine, '70', 165)]);
  assert.strictEqual(r.status, 'valid', JSON.stringify(r.checks.filter((c) => !c.ok)));
});
