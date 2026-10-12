// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

'use strict';

const crypto = require('crypto');

const SEAL_DOMAIN = Buffer.from('quantova/qprocure/seal/1', 'ascii');

function seal(salt, bidDigest, price, noticeRef, bidderKeyId) {
  const h = crypto.createHash('sha3-256').update(SEAL_DOMAIN).update(Buffer.from([0]));
  for (const part of [Buffer.from(salt, 'hex'), Buffer.from(bidDigest, 'hex'), Buffer.from(noticeRef, 'hex'), Buffer.from(bidderKeyId, 'hex'), Buffer.from(String(price), 'ascii')]) {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(part.length);
    h.update(len).update(part);
  }
  return h.digest('hex');
}

function tender(noticeRef, pool, roles) {
  const has = (role, r) => roles[role] && roles[role].has(r.signerId);
  const openings = [...pool.values()].filter((r) => r.type === 'opening' && r.statement.noticeRef === noticeRef && has('committee', r));
    const refsOf = new Map();
  for (const [ref, r] of pool) refsOf.set(r, ref);
  const openingSet = new Set(openings.map((r) => refsOf.get(r)));
  const scores = [...pool.values()].filter((r) => r.type === 'score' && openingSet.has(r.statement.openingRef) && has('evaluator', r));
  const bids = [...pool.values()].filter((r) => r.type === 'bid' && r.statement.noticeRef === noticeRef && has('bidder', r));
  const awards = [...pool.values()].filter((r) => r.type === 'award' && r.statement.noticeRef === noticeRef && has('awarder', r));
  const exclusions = [...pool.values()].filter((r) => r.type === 'exclusion' && r.statement.noticeRef === noticeRef && has('committee', r));
  return { openings, scores, bids, awards, exclusions, refsOf };
}

module.exports = Object.freeze({
  name: 'qprocure',
  title: 'QProcure',
  kind: 1103,
  magic: 'QPRC',
  summary: 'post quantum procurement integrity for governments',
  roles: {
    authority: 'contracting authority key',
    bidder: 'registered bidder key',
    committee: 'opening committee key',
    evaluator: 'evaluator key',
    awarder: 'award authority key',
    approver: 'amendment approver key',
  },
  types: {
    notice: {
      role: 'authority', id: 'noticeId', signer: 'authorityKeyId', time: 'publishedAt',
      fields: { title: ['text', 128, true], criteriaDigest: ['digest', 0, false, 'criteria'], currency: ['currency'], estimate: ['amount'], maxScore: ['posamount'], deadline: ['time'] },
      shape: (st) => (Date.parse(st.deadline) <= Date.parse(st.publishedAt) ? 'the deadline must be later than the publication of the notice' : null),
    },
    bid: {
      role: 'bidder', id: 'bidId', signer: 'bidderKeyId', time: 'sealedAt',
      links: { notice: { field: 'noticeRef', type: 'notice' } },
      fields: { seal: ['digest'] },
      signCheck: (st, links) => (Date.parse(st.sealedAt) > Date.parse(links.notice.statement.deadline) ? 'a bid cannot be sealed after the deadline' : null),
      verifyCheck: (p, links, h) => {
        const out = [];
        const n = links.notice;
        if (!n) return out;
        const deadline = Date.parse(n.statement.deadline);
        out.push(['deadline', h.claimedMs(p) <= deadline, h.claimedMs(p) <= deadline ? 'sealed before the deadline' : 'sealed after the deadline']);
        if (h.info.anchor) {
          const ok = h.info.anchor.ms <= deadline;
          out.push(['deadline anchor', ok, ok ? 'anchored before the deadline' : 'anchored after the deadline, so the bid is not proven to have existed in time']);
        } else if (h.ctx.req) {
          out.push(['deadline anchor', false, 'not anchored, so the bid is not proven to have existed before the deadline', true]);
        } else {
          out.push(['deadline anchor', true, 'not anchored, the timeliness of the bid is the claim of its bidder and was not proven']);
        }
        return out;
      },
    },
    opening: {
      role: 'committee', id: 'openingId', signer: 'committeeKeyId', time: 'openedAt',
      links: {
        notice: { field: 'noticeRef', type: 'notice', copy: [['currency', 'currency']] },
        bid: { field: 'bidRef', type: 'bid', match: [['noticeRef', 'noticeRef']] },
      },
      fields: { bidDigest: ['digest', 0, false, 'bidDocument'], bidSalt: ['digest'], currency: ['currency'], price: ['posamount'] },
      signCheck: (st, links) => {
        if (Date.parse(st.openedAt) <= Date.parse(links.notice.statement.deadline)) return 'a bid cannot be opened before the deadline has passed';
        if (seal(st.bidSalt, st.bidDigest, st.price, links.bid.statement.noticeRef, links.bid.statement.bidderKeyId) !== links.bid.statement.seal) return 'the bid and price opened do not match the seal its bidder committed to';
        return null;
      },
      verifyCheck: (p, links) => {
        const out = [];
        if (links.notice) {
          const after = Date.parse(p.statement.openedAt) > Date.parse(links.notice.statement.deadline);
          out.push(['opening time', after, after ? 'opened after the deadline' : 'opened before the deadline had passed']);
        }
        if (links.bid) {
          const same = seal(p.statement.bidSalt, p.statement.bidDigest, p.statement.price, links.bid.statement.noticeRef, links.bid.statement.bidderKeyId) === links.bid.statement.seal;
          out.push(['seal', same, same ? 'the opened bid and price match the seal its bidder committed to' : 'the opened bid or price differs from the seal its bidder committed to']);
        }
        return out;
      },
    },
    exclusion: {
      role: 'committee', id: 'exclusionId', signer: 'committeeKeyId', time: 'excludedAt',
      links: {
        notice: { field: 'noticeRef', type: 'notice' },
        bid: { field: 'bidRef', type: 'bid', match: [['noticeRef', 'noticeRef']] },
      },
      fields: { reason: ['text', 256, true] },
      signCheck: (st, links) => (Date.parse(st.excludedAt) <= Date.parse(links.notice.statement.deadline) ? 'a bid can be excluded only after the deadline has passed' : null),
      verifyCheck: (p, links) => {
        if (!links.notice) return [];
        const after = Date.parse(p.statement.excludedAt) > Date.parse(links.notice.statement.deadline);
        return [['exclusion time', after, after ? 'excluded after the deadline' : 'excluded before the deadline had passed']];
      },
    },
    score: {
      role: 'evaluator', id: 'scoreId', signer: 'evaluatorKeyId', time: 'scoredAt',
      links: {
        notice: { field: 'noticeRef', type: 'notice', max: [['score', 'maxScore']] },
        opening: { field: 'openingRef', type: 'opening', match: [['noticeRef', 'noticeRef']] },
      },
      fields: { score: ['amount'] },
    },
    award: {
      role: 'awarder', id: 'awardId', signer: 'awarderKeyId', time: 'awardedAt',
      links: {
        notice: { field: 'noticeRef', type: 'notice', copy: [['currency', 'currency']] },
        opening: { field: 'openingRef', type: 'opening', copy: [['value', 'price']], match: [['noticeRef', 'noticeRef']] },
      },
      fields: { contractDigest: ['digest', 0, false, 'contractDocument'], currency: ['currency'], value: ['posamount'] },
      gather: (p, pool, h) => {
        const t = tender(p.statement.noticeRef, pool, h.ctx.roles);
        return t.openings.map((r) => ['opening of ' + r.statement.price, r]).concat(t.scores.map((r) => ['score', r]), t.exclusions.map((r) => ['exclusion', r]));
      },
      probe: (p, pool, h) => {
        const t = tender(p.statement.noticeRef, pool, h.ctx.roles);
        const opened = new Set(t.openings.map((r) => r.statement.bidRef));
        return t.bids.filter((b) => !opened.has(t.refsOf.get(b)));
      },
      verifyCheck: (p, links, h) => {
        const out = [];
        const t = tender(p.statement.noticeRef, h.pool, h.ctx.roles);
        const strict = h.ctx.opts.allSupplied === true;
        if (t.openings.length === 0) {
          out.push(['scores', false, 'the openings and scores of this tender were not supplied', true]);
          return out;
        }
        const awardMs = h.claimedMs(p);
        const awardAnchor = h.info.anchor;
        const timely = t.scores.filter((r) => {
          if (h.claimedMs(r) > awardMs) return false;
          const a = h.anchorOf(r);
          return !(a && awardAnchor && a.ms > awardAnchor.ms);
        });
        if (timely.length !== t.scores.length) out.push(['score timing', false, 'a score was signed or anchored after the award, so it cannot have justified it']);
        const totals = new Map(t.openings.map((r) => [t.refsOf.get(r), 0n]));
        const byEvaluator = new Map();
        let doubled = false;
        for (const r of timely) {
          const key = r.statement.openingRef + ' ' + r.signerId;
          if (byEvaluator.has(key)) doubled = true;
          byEvaluator.set(key, true);
          totals.set(r.statement.openingRef, totals.get(r.statement.openingRef) + BigInt(r.statement.score));
        }
        if (doubled) out.push(['scores', false, 'an evaluator signed two different scores for the same bid']);
        const evaluators = new Set(timely.map((r) => r.signerId));
        let full = true;
        for (const e of evaluators) for (const o of totals.keys()) if (!byEvaluator.has(o + ' ' + e)) full = false;
        out.push(['evaluation', full, full ? 'every evaluator scored every opened bid' : 'an evaluator did not score every opened bid, so the totals are not comparable', !full && !strict]);
        const opened = new Set(t.openings.map((r) => r.statement.bidRef));
        const perBid = new Map();
        for (const o of t.openings) perBid.set(o.statement.bidRef, (perBid.get(o.statement.bidRef) || 0) + 1);
        if ([...perBid.values()].some((n) => n > 1)) out.push(['single opening', false, 'a bid was opened more than once']);
        const deadline = links.notice ? Date.parse(links.notice.statement.deadline) : null;
        const excludedRefs = new Set(t.exclusions.map((r) => r.statement.bidRef));
        if ([...excludedRefs].some((r) => opened.has(r))) out.push(['exclusion', false, 'a bid was both opened and excluded']);
        let missed = 0;
        let unproven = 0;
        let late = 0;
        let declared = 0;
        for (const b of t.bids) {
          const ref = t.refsOf.get(b);
          if (opened.has(ref)) continue;
          if (excludedRefs.has(ref)) {
            declared += 1;
            continue;
          }
          const pr = h.probeOf(b);
          const stated = deadline !== null && Date.parse(b.statement.sealedAt) <= deadline;
          if (pr && pr.status === 'valid' && stated && (pr.anchor ? pr.anchor.ms <= deadline : !h.ctx.req)) missed += 1;
          else if (pr && pr.status === 'indeterminate' && stated && !pr.anchor) unproven += 1;
          else late += 1;
        }
        const note = (declared ? ', ' + declared + ' unopened bid excluded by a signed decision of the committee' : '') + (late ? ', ' + late + ' bid not proven timely or valid left out' : '');
        out.push(['openings', missed === 0, missed === 0 ? 'every bid proven to be sealed before the deadline was opened or excluded by a signed decision' + note : missed + ' bid proven to be sealed before the deadline was neither opened nor excluded by a signed decision', missed !== 0 && !strict]);
        if (unproven) out.push(['unanchored bids', false, unproven + ' valid bid stated before the deadline is not anchored, so it cannot be shown whether it was suppressed', true]);
        const self = [...h.pool].find(([, r]) => r === p);
        const others = t.awards.filter((r) => !self || t.refsOf.get(r) !== self[0]);
        if (others.length) out.push(['single award', false, 'another award was signed for the same tender']);
        const win = totals.get(p.statement.openingRef);
        let best = 0n;
        for (const v of totals.values()) if (v > best) best = v;
        if (win === undefined) {
          out.push(['scores', false, 'the opening awarded was not supplied among the openings of this tender', !strict]);
        } else {
          const ok = win === best && best > 0n;
          out.push(['scores', ok, ok ? 'the award follows the highest total of the signed scores among ' + totals.size + ' opened bids' : 'the award does not follow the highest total of the signed scores']);
        }
        if (!strict) out.push(['completeness', false, 'the verifier did not declare that every bid, opening and score held for this tender was supplied', true]);
        else out.push(['completeness', true, 'the verifier declared that every bid, opening and score held for this tender was supplied']);
        return out;
      },
    },
    amendment: {
      role: 'approver', id: 'amendmentId', signer: 'approverKeyId', time: 'amendedAt',
      links: { award: { field: 'awardRef', type: 'award', copy: [['currency', 'currency']] } },
      fields: { approvalDigest: ['digest', 0, false, 'approval'], currency: ['currency'], value: ['posamount'] },
      chain: { scope: 'awardRef', prev: 'prevAmendmentRef' },
    },
  },
  dts: 'export function sealBid(bid: Uint8Array, price: string, notice: Envelope, bidder: KeyRef): { salt: string; bidDigest: string; price: string; seal: string };',
  commands: {
    'seal-bid': {
      usage: '--bid FILE --price N --notice FILE --bidder KEY --out FILE [--force]',
      flags: ['force'],
      values: ['bid', 'price', 'notice', 'bidder', 'out'],
      async run(positional, flags, h) {
        if (positional.length) throw h.usageError('seal-bid takes options only');
        const out = h.need(flags, 'out');
        h.checkPaths([['--out', out, !!flags.force]], [['--bid', flags.bid], ['--notice', flags.notice]]);
        const notice = h.readJson(h.need(flags, 'notice'), 'notice', true);
        const bidderFlag = h.need(flags, 'bidder');
        const bidder = /^[0-9a-f]{64}$/.test(bidderFlag) ? bidderFlag : h.readJson(bidderFlag, 'bidder key', false, 65536);
        const d = await h.hashFile(h.need(flags, 'bid'), 'bid document');
        const price = h.need(flags, 'price');
        if (!/^[1-9][0-9]{0,29}$/.test(price)) throw h.usageError('--price is a whole number of minor units greater than zero');
        const n = h.qx.refOf(notice);
        let bidderKeyId = bidder;
        if (typeof bidder !== 'string') {
          if (!bidder || bidder.format !== h.F.KEY_FORMAT || typeof bidder.publicKey !== 'string') throw h.usageError('--bidder is a key id or a ' + h.F.KEY_FORMAT + ' file');
          bidderKeyId = h.F.keyIdOf(Buffer.from(bidder.publicKey, 'base64'));
          if (bidder.id !== undefined && bidder.id !== bidderKeyId) throw h.usageError('--bidder names an id that does not match its public key');
        }
        const salt = crypto.randomBytes(32).toString('hex');
        const record = { format: 'qprocure-bid-seal/1', bidDigest: d.digest, salt, price, seal: seal(salt, d.digest, price, n, bidderKeyId) };
        h.atomicWrite(out, h.asciiJson(record) + '\n', !!flags.force);
        console.log('bid seal ' + record.seal + ', keep ' + h.safe(out) + ' and the bid secret until the opening');
        return 0;
      },
    },
  },
  extras: ({ F, C }) => ({
    sealBid(bid, price, notice, bidder) {
      if (!(bid instanceof Uint8Array)) F.reject('the bid is a Uint8Array');
      if (typeof price !== 'string' || !/^[1-9][0-9]{0,29}$/.test(price)) F.reject('the price is a whole number of minor units greater than zero');
      const n = C.signedEnvelope(notice, 'notice', 'the notice');
      const bidderKeyId = C.keyIdFrom(bidder, 'bidder');
      const salt = crypto.randomBytes(32).toString('hex');
      const bidDigest = F.sha3(bid).toString('hex');
      return { salt, bidDigest, price, seal: seal(salt, bidDigest, price, F.refOf(n), bidderKeyId) };
    },
  }),
});
