'use strict';

const q = require('..');
const { network, stamper, iso } = require('./chain');

async function honest() {
  const now = Math.floor(Date.now() / 1000);
  const net = network(now - 4 * 3600);
  const at = stamper(q, net);
  const K = {};
  for (const r of q.ROLES) K[r] = q.generateKey();
  const bidders = [K.bidder, q.generateKey(), q.generateKey()];
  const published = now - 3 * 3600;
  const deadline = now - 2 * 3600;
  const notice = await at(q.notice({ key: K.authority, title: 'Road works', criteria: Buffer.from('criteria'), currency: 'USD', estimate: '100000', maxScore: '100', deadline: iso(deadline), publishedAt: iso(published) }), published + 60);
  const seals = bidders.map((k, i) => q.sealBid(Buffer.from('bid ' + i), String(50000 + i * 1000), notice, q.describeKey(k)));
  const bids = [];
  for (let i = 0; i < bidders.length; i += 1) bids.push(await at(q.bid({ key: bidders[i], notice, seal: seals[i].seal, sealedAt: iso(deadline - 1800 + i * 10) }), deadline - 1500 + i * 10));
  const openings = [];
  for (let i = 0; i < 2; i += 1) openings.push(await at(q.opening({ key: K.committee, notice, bid: bids[i], bidDigest: seals[i].bidDigest, bidSalt: seals[i].salt, currency: 'USD', price: seals[i].price, openedAt: iso(deadline + 3600 + i) }), deadline + 3700));
  const exclusion = await at(q.exclusion({ key: K.committee, notice, bid: bids[2], reason: 'missing tax certificate', excludedAt: iso(deadline + 3650) }), deadline + 3700);
  const scores = [];
  for (let i = 0; i < 2; i += 1) scores.push(await at(q.score({ key: K.evaluator, notice, opening: openings[i], score: String(80 - i * 20), scoredAt: iso(deadline + 4000 + i) }), deadline + 4100));
  const award = await at(q.award({ key: K.awarder, notice, opening: openings[0], contractDocument: Buffer.from('contract'), currency: 'USD', awardedAt: iso(deadline + 4500) }), deadline + 4600);
  const amendment = await at(q.amendment({ key: K.approver, award, approval: Buffer.from('approval'), value: '51000', first: true, amendedAt: iso(deadline + 5000) }), deadline + 5100);
  net.chain.block(now);
  const roles = Object.fromEntries(Object.entries(K).map(([r, k]) => [r + 'Keys', [q.keyId(k)]]));
  roles.bidderKeys = bidders.map((k) => q.keyId(k));
  const all = { notice, bid: bids[0], opening: openings[0], exclusion, score: scores[0], award, amendment };
  const extra = [bids[1], bids[2], openings[1], scores[1]];
  return { q, net, now, K, roles, at, all, extra, bidders, seals, deadline };
}

module.exports = { honest };
