// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert');
const qstamp = require('@quantovainc/qstamp');
const q = require('..');
const { network, stamper, iso, bech32m } = require('./chain');

function receiptFor(env, time, height) {
  const digest = q.anchorDigest(env);
  const salt = crypto.randomBytes(32);
  const leaf = qstamp.leafHash('sha3-256', Buffer.from(digest, 'hex'), salt);
  const tn = qstamp.NETWORKS.testnet;
  return {
    format: qstamp.RECEIPT_FORMAT, chain: { id: tn.chainId, genesis: tn.genesis }, contract: tn.contract, kind: String(q.KIND),
    record: { alg: 'sha3-256', digest, salt: salt.toString('hex') }, proof: { index: 0, size: 1, path: [] }, root: leaf.toString('hex'),
    anchor: { tx: bech32m('QTX', crypto.randomBytes(32)), height, block: bech32m('QBK', crypto.randomBytes(32)), time, sender: bech32m('Q', crypto.randomBytes(32)) },
  };
}

test('anchors of a suppressed bid that the chain cannot answer never hide that it was proven timely', async () => {
  const now = Math.floor(Date.now() / 1000);
  const net = network(now - 8000);
  const at = stamper(q, net);
  const K = { authority: q.generateKey(), bidderA: q.generateKey(), bidderB: q.generateKey(), committee: q.generateKey(), evaluator: q.generateKey(), awarder: q.generateKey() };
  const notice = await at(q.notice({ key: K.authority, title: 'Bridge', criteria: Buffer.from('c'), currency: 'EUR', estimate: '1000', maxScore: '100', deadline: iso(now - 3000), publishedAt: iso(now - 6000) }), now - 5990);
  const sealA = q.sealBid(Buffer.from('bid A'), '900', notice, q.keyId(K.bidderA));
  const sealB = q.sealBid(Buffer.from('bid B'), '950', notice, q.keyId(K.bidderB));
  const bidA = await at(q.bid({ key: K.bidderA, notice, seal: sealA.seal, sealedAt: iso(now - 4000) }), now - 3990);
  const bidB = await at(q.bid({ key: K.bidderB, notice, seal: sealB.seal, sealedAt: iso(now - 3900) }), now - 3890);
  const openB = await at(q.opening({ key: K.committee, notice, bid: bidB, bidSalt: sealB.salt, bidDigest: sealB.bidDigest, price: '950', openedAt: iso(now - 2000) }), now - 1990);
  const scoreB = await at(q.score({ key: K.evaluator, notice, opening: openB, score: '80', scoredAt: iso(now - 1500) }), now - 1490);
  const award = await at(q.award({ key: K.awarder, notice, opening: openB, contractDocument: Buffer.from('k'), awardedAt: iso(now - 1000) }), now - 990);
  net.chain.block(now);
  const roles = { authorityKeys: [q.keyId(K.authority)], bidderKeys: [q.keyId(K.bidderA), q.keyId(K.bidderB)], committeeKeys: [q.keyId(K.committee)], evaluatorKeys: [q.keyId(K.evaluator)], awarderKeys: [q.keyId(K.awarder)] };
  const run = (records) => q.verify(award, Object.assign({ type: 'award', at: iso(now), allSupplied: true, records }, roles, net.opts));
  const base = [notice, bidA, bidB, openB, scoreB];
  const suppressed = (r) => r.checks.some((c) => c.name === 'openings' && !c.ok && !c.indeterminate);
  const plain = await run(base);
  assert.strictEqual(plain.status, 'invalid');
  assert.ok(suppressed(plain));
  const bare = Object.assign({}, bidA);
  delete bare.anchor;
  const tA = bidA.anchor.anchor.time;
  const forged = Array.from({ length: 8 }, (_, i) => Object.assign({}, bare, { anchor: receiptFor(bare, tA - 1 - i, net.chain.height + 500 + i) }));
  const txs = new Set(forged.map((f) => f.anchor.anchor.tx));
  const real = qstamp.verify;
  qstamp.verify = async (receipt, options) => (txs.has(receipt.anchor.tx)
    ? { valid: false, status: 'indeterminate', endpoints: [], checks: [{ name: 'transport', ok: false, detail: 'the endpoints did not answer', transport: true }] }
    : real(receipt, options));
  try {
    const hidden = await run(base.concat(forged));
    assert.strictEqual(hidden.status, 'invalid');
    assert.ok(suppressed(hidden), JSON.stringify(hidden.checks.filter((c) => !c.ok)));
    assert.ok(!hidden.checks.some((c) => c.name === 'unproven bids'));
  } finally {
    qstamp.verify = real;
  }
  const live = await run(base.concat(forged));
  assert.strictEqual(live.status, 'invalid');
  assert.ok(suppressed(live));
});
