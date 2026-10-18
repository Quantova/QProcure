// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const { honest } = require('./honest');
const { iso } = require('./chain');

const dirs = [];
test.after(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

function folder() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'qprocure-series-'));
  dirs.push(d);
  return d;
}

const refused = (e) => e.code === 'QPROCURE_LEDGER';

test('with a ledger a tender receives one award, whichever opening a second awarder names', async () => {
  const w = await honest();
  const { q, K, all } = w;
  const dir = folder();
  const award = (key, opening) => q.award({ key, notice: all.notice, opening, contractDocument: Buffer.from('contract'), currency: 'USD', awardedAt: iso(w.deadline + 4500), ledger: dir });
  const results = await Promise.allSettled([award(K.awarder, all.opening), award(q.generateKey(), w.extra[2])]);
  assert.strictEqual(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(refused(results.find((r) => r.status === 'rejected').reason));
  await assert.rejects(award(K.awarder, all.opening), refused);
  assert.deepStrictEqual(await q.ledgerLatest(dir, 'award', q.refOf(all.notice)), results.find((r) => r.status === 'fulfilled').value);
});

test('with a ledger an amendment follows only the latest amendment of its award', async () => {
  const w = await honest();
  const { q, K, all } = w;
  const dir = folder();
  const amend = (value, more) => q.amendment(Object.assign({ key: K.approver, award: all.award, approval: Buffer.from('approval ' + value), value, amendedAt: iso(w.deadline + 5000), ledger: dir }, more));
  const a1 = await amend('51000', { first: true });
  await assert.rejects(amend('52000', { first: true }), refused);
  await amend('53000', { previous: a1 });
  await assert.rejects(amend('54000', { previous: a1 }), refused);
});
