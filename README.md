# QProcure

QProcure is a post quantum procurement integrity layer for governments. It seals the tender notice and its award criteria before publication, a sealed commitment to each bid before the deadline, the opening of each bid, the score of each evaluator, the award and every later amendment of the contract, so bidders, audit bodies and review courts can later prove that no bid was added or replaced after the deadline, that no score was altered and that the award followed the signed evaluation. Every record is signed with the Module Lattice Digital Signature Algorithm, parameter set 65, as standardised in FIPS 204, and can carry a Qstamp time proof recorded on the Quantova network under the QProcure record kind.

QProcure is part of QGov, the government branch of the Qstamp family.

## What QProcure is

Procurement fraud depends on changing records once information that should have been secret is known. A bid admitted after the deadline, a bid replaced once competing prices are known, criteria adjusted to suit a chosen bidder, scores changed after the panel signed them, or a contract varied after award without approval. Each relies on a record held by the contracting authority that it can quietly change.

QProcure removes that possibility. The contracting authority seals the notice with the fingerprint of the award criteria, the largest score an evaluator may give and the deadline. Each registered bidder seals a salted commitment to its bid document and its price on its own systems before the deadline, so neither can be learned from it or changed later. After the deadline the opening committee reveals each bid, its price and its salt, and the commitment is recomputed. Each evaluator signs a score for every opened bid, the award authority signs the award, which must follow the highest total of the signed scores, and an approver signs each amendment in sequence.

QProcure is standalone. It runs on the systems of its users, holds keys locally and uses the Quantova network only as a neutral public ledger for time proofs.

## What it detects

1. A record altered, replaced, inserted or backdated after it was sealed.
2. A bid sealed after the deadline, or a bid whose anchor is later than the deadline.
3. An opened bid or price that differs from the commitment its bidder sealed, a seal reused by another bidder, a bid opened more than once, or a bid opened before the deadline had passed.
4. A bid proven to be sealed before the deadline that was neither opened nor excluded by a signed decision of the committee, once the bids held for the tender are supplied. A validly signed bid dated before the deadline that was neither opened nor excluded, and whose timeliness is not proven by a supplied anchor, leaves the award indeterminate and is never treated as late.
5. Award criteria changed after the notice was sealed, when the criteria document is supplied.
6. A score above the largest score of the notice, an evaluator who did not score every opened bid or signed two scores for one bid, or a score signed or anchored after the award.
7. An award that does not follow the highest total of the signed scores, a second award for the same tender, an award whose value differs from the opened price of the winning bid, or a tender in which one registered bidder sealed more than one bid.
8. An amendment without a sealed approval, an amendment removed from the series, or two different amendments in the same position.
9. A record signed by a key that is not trusted for its role, or two linked records signed by the same key.

## Who uses it

1. Contracting authorities and central purchasing bodies that want every procedure to be provable to bidders and review bodies.
2. Bidders that want independent proof that their bid was complete before the deadline and was opened unchanged.
3. Review bodies, audit institutions, competition authorities and courts that examine procurement procedures.

## How a contracting authority integrates QProcure

1. Issue keys by role. The contracting authority, registered bidders, the opening committee, evaluators, the award authority and the approvers of amendments each hold separate ML-DSA-65 keys. The verifier is given one list of trusted keys for each role, contracting authority key, registered bidder key, opening committee key, evaluator key, award authority key and amendment approver key. A key may appear in only one list, and QProcure refuses to sign a record with the key that signed a record it relies on.

2. Seal the notice. The authority calls notice with the title, the fingerprint of the criteria document, the currency, the estimate, the largest score and the deadline before the notice is published.

3. Seal and anchor bids. Each bidder runs seal-bid, or calls sealBid, on its own systems with the bid document, its price, the notice and its own key, keeps the bid, the price and the salt secret until the opening, calls bid with the seal against the notice and anchors the bid itself with its own funded account before the deadline, keeping the receipt. A bid anchored by the bidder before the deadline cannot be suppressed by the authority. Once the bid and that receipt are among the records supplied, an award that neither opened nor excluded the bid is invalid, whatever later anchors of the same bid are supplied with it and in whatever order, and a supplied bid dated before the deadline that was neither opened nor excluded keeps the award from being valid even when no timely receipt is supplied.

4. Open, exclude and evaluate. After the deadline the committee calls opening for each bid with the bid fingerprint, the salt and the price. A bid that cannot be opened, because its bidder withdrew or did not reveal it, or that does not meet the requirements of the notice, is excluded with exclusion, stating the reason. Each evaluator calls score for every opened bid.

5. Award and amend. The award authority calls award against the notice and the winning opening, with the fingerprint of the contract. Each later change is sealed by an approver with amendment, naming the previous amendment of the award or declaring it the first.


Signing alone is not a gate. Two officials who each hold the same previous record can both sign the next record of a series, so amendment and award take a ledger, one folder or one store with an atomic compare and swap shared by every signer, which serialises the amendments of an award, and a ledger also holds one award per tender, so a second award for the same notice is refused. With it a record is signed only when it follows the latest record of its series that the ledger holds, and a second first record or a record after a stale previous one is refused with the code QPROCURE_LEDGER. Without the ledger the integrating system must serialise each series itself.

6. Anchor promptly. A single service with a funded Quantova account anchors new records in batches under the QProcure record kind, and each record receives its own receipt.

7. Verify on demand. Auditors and courts verify any record against the lists of trusted keys and the records held, with the verify command, the library or the independent procedure below.

## What is published and what stays private

Bids and prices remain confidential until opening and are never published by QProcure. A bid seal is a salted SHA3 commitment that reveals nothing about the bid or its price. Criteria, bids, contracts and approvals stay with the authority and the bidders, and only their fingerprints enter records.

When a record is anchored, only a 32 byte Qstamp commitment reaches the chain. It is derived from a salted fingerprint of the signed record and cannot be reversed into any field of the record.

## Cryptographic construction

1. Keys. Keys are 32 byte seeds from which ML-DSA-65 key pairs are derived by the key generation procedure of FIPS 204. A key identifier is the SHA3 hash with a 256 bit output of the ASCII label quantova/qprocure/key/1, the byte 0x00 and the 1952 byte public key.

2. Party commitments. Each party identifier is first made canonical. It is brought to Unicode normal form KC, every decimal digit of any script is replaced by the ASCII digit of the same value, combining marks of the Inherited script are removed, spaces, punctuation and invisible characters are removed, case is folded, and every character is replaced by its prototype in the confusable skeleton of Unicode Technical Standard 39, version 18.0.0, first in upper case and then in lower case, until the result no longer changes. An identifier that holds an unassigned character, or no letter or digit, is refused. A party is then named by the SHA3-256 hash of the ASCII label quantova/qprocure/party/3, the byte 0x00, a 32 byte salt and the canonical identifier in UTF-8, so the same identifier written with other case, spacing, separators or lookalike letters gives the same commitment. The salt is random or reused from an earlier commitment, or, when the authority supplies its own 32 byte secret and the reference of the record that defines the series, it is the SHA3-256 hash of the ASCII label quantova/qprocure/party-salt/3, the byte 0x00, the secret, the 32 byte reference and the canonical identifier, so the same party always receives the same commitment in that series. A commitment made under an earlier scheme is refused.

3. Statements. Each statement is a canonical binary encoding that begins with the ASCII bytes QPRC and the version byte 1, followed by the statement type and its fields in a fixed order. Every field is an unsigned 16 bit big endian length followed by its bytes. Identifiers, key identifiers, references and digests are encoded as raw bytes, an absent reference is an empty field, sequence numbers and sizes are unsigned 64 bit big endian integers, and text is UTF-8 in Unicode normal form C, so every statement has exactly one encoding. Amounts are whole numbers of minor units with no leading zeros, and a currency is three capital letters, which QProcure checks for form only, so the integrating system should use ISO 4217 codes.

4. Signatures. Statements are signed with ML-DSA-65 in its hedged form under the FIPS 204 context string quantova/qprocure/1, which separates QProcure signatures from every other SDK of the family and from every other use of the algorithm.

5. References. A record is referenced by the SHA3 hash of the label quantova/qprocure/ref/1, the byte 0x00, the encoded statement and its signature. Each record names the records it relies on by these references, so it relies on one exact signed record that existed before it was signed.

6. Series. The amendments of one award form a series. Every record of a series carries its position from one and the reference of the previous record of the series, which is empty only for the first.

7. Bid seals. A bid seal is the SHA3-256 hash of the ASCII label quantova/qprocure/seal/1 and the byte 0x00, followed by five length prefixed parts, a random 32 byte salt, the SHA3-256 fingerprint of the bid document, the reference of the notice, the key identifier of the bidder and the price in ASCII. Binding the notice and the bidder means a seal cannot be reused by another bidder or in another tender. The opening record reveals the fingerprint, the salt and the price, so any verifier can recompute the seal.

8. Anchor. To anchor a record, QProcure stamps the SHA3 hash of the label quantova/qprocure/anchor/1, the byte 0x00, the encoded statement and its signature as a Qstamp record of kind 1103.

## Record types

| Type | Signed by | Relies on | Series |
|---|---|---|---|
| notice | contracting authority key | none | none |
| bid | registered bidder key | notice | none |
| opening | opening committee key | notice, bid | none |
| exclusion | opening committee key | notice, bid | none |
| score | evaluator key | notice, opening | none |
| award | award authority key | notice, opening | none |
| amendment | amendment approver key | award | per award |

## Rules applied by verification

1. The expected record type is required, so a record of one type can never be presented as another, and options that do not apply to that type are refused.
2. The record is well formed and signed by the key it names, and that key is trusted for the role of its type. The lists of trusted keys must not share a key.
3. Every record the record relies on, and every earlier record of each series involved, is taken from the records supplied and verified in turn by the same rules.
4. Each linked record is exactly the one referenced, of the expected type, signed by a different key, and dated no later than the record that relies on it.
5. Copied and matched fields agree with the records they come from, and limits taken from linked records are respected.
6. Each record of a series continues the previous record in position and currency, and any limit on the series is respected.
7. Any two different supplied records in the same position of a series involved make the result invalid.
8. A record that depends on a series is valid only when the verifier declares that every record it holds for the series involved was supplied. Without that declaration the result is indeterminate, and with it a missing record makes the result invalid. The verifier gives in records every record it holds for each series involved, because a second record at the same position is found only among the records given, and allSupplied is a declaration that it did so.
9. A bid is sealed no later than the deadline of its notice, and its anchor, when present, is no later than the deadline. When anchors are required an unanchored bid is not proven timely.
10. An opening is dated after the deadline and its bid fingerprint, salt and price reproduce the seal of the bid.
11. A score does not exceed the largest score of its notice.
12. An award relies on an opening of the same notice and its value is the opened price. Every opening, exclusion, score and award of the tender supplied and signed by trusted keys is verified in turn. Among them, no bid was opened twice or both opened and excluded, every exclusion is dated after the deadline, every evaluator scored every opened bid, every score counted was signed and anchored before the award, no other award exists for the tender, and the opening awarded holds the highest total score. Every bid that was neither opened nor excluded is checked separately, using the earliest of its supplied anchors that verifies. Such a bid that is validly signed, dated before the deadline and anchored before the deadline makes the award invalid. Such a bid that is validly signed and dated before the deadline but has no supplied anchor before the deadline makes the result indeterminate, because a later anchor, which anyone can add, does not show that the bid was late. Only a bid its own bidder dated after the deadline is reported as left out. An award is valid only when the verifier declares that every bid, opening, exclusion and score held for the tender was supplied. A payment of public money under the award is sealed with QSpend, whose commitment should cite the award by its reference in awardRef, because nothing else links the two, and QSpend checks it when the verifier gives the award reference.
13. When documents are supplied, their fingerprints match the signed fingerprints, and when a party identity and salt are supplied, they match the commitment.
14. Each anchor is verified under the QProcure record kind with a SHA3 digest, and the stated time is not later than the anchor time, allowing five minutes. An anchor more than twenty four hours after the stated time, unless another limit is given, or later than a given verification time, does not prove the stated time and makes the result indeterminate. When different anchors of one record are supplied, anchors that do not commit to the record are set aside, the others are taken in order of anchor time, chain, height, transaction and position in the batch, and the earliest that verifies is used, so a later anchor added by anyone cannot displace an earlier one. An anchor that cannot be checked keeps the result indeterminate only when it could be earlier than the anchor that verifies. One that claims an earlier time at a height on the same chain no lower than the verified anchor is set aside, because an honest chain cannot hold it, and an unchecked anchor never removes the time proven by a verified one. Anchors are read at most four at a time. Each anchoring transaction is read once per verification, at most eight for each record supplied plus 32 unless maxAnchorLookups gives another bound, and a record whose anchor was not read within that bound is indeterminate. A verification that has not finished within deadlineMs, two minutes unless given, stops with the result indeterminate and a time limit check that says so. When keyStatus is given it is asked for the registry status of each signing key and must answer, within keyStatusTimeoutMs or ten seconds, with an object whose revoked is true or false and, when revoked is true, whose revokedAt is the time of the revocation in whole seconds since 1970, not before the genesis of the network. Any other answer, an error or no answer in time makes the result indeterminate. The time of verification is read from the chain unless it is given with at, and when it cannot be read verification stops with an error rather than use the local clock.

A result is valid only when the trusted keys are given, every record relied on is supplied, the records held for each series are declared complete where a series is involved, and every record carries a proven anchor. When any of these is missing the result is indeterminate rather than valid, except that a record which moves value is invalid when a record it relies on is not supplied. A record verified with anchoring not required proves only which key signed it and what was signed, and its stated time is the claim of its signer.

## Trust model of this release

This release anchors on the live Quantova network Q-test-net-01. The signing module is compiled from the Quantova Q-Crypto library, which follows FIPS 204 and FIPS 202 and has been tested against the NIST vectors. It has not been validated under FIPS 140-3. An anchor time is accepted only when Qstamp proves the anchor, either by a finality certificate checked against a pinned validator roster or by official endpoints of the network run by two different operators. An anchor confirmed by endpoints of one operator, or by endpoints chosen by the verifier, is unproven. An unproven anchor is treated as not anchored and makes the result indeterminate, never valid, whatever options are set. While the network has one official endpoint and no pinned roster every anchor is unproven, which is the honest result. Verification names the endpoints it consulted and says whether they are the official endpoints of the network.

A sealed record proves which key signed it, what was signed and when it was anchored. Each check is made from the records a verifier is given, so two records in the same position of a series are detected only when both are supplied, and auditors should obtain every record held for the series they examine. A party commitment is the same in every record that uses the same salt, so records about one party can be linked by anyone who sees them, and anyone who obtains the salt can test guesses of the identifier, so salts must be protected like the identifiers themselves. Verifiers must keep the keys of retired officials in the trusted lists for as long as records they signed are verified. A sealed record does not detect collusion agreed between bidders outside the procedure, and it does not judge whether criteria or scores were reasonable, which remain matters for review bodies and competition authorities. Amendments are not limited in value by QProcure, so each must be justified by its sealed approval. No anchor proves that a record was not made before the time it states, so a rule that a record comes after a moment, such as an opening or an exclusion after the deadline, rests on the stated time of a trusted signer.

## Threat model

QProcure protects every record of a tender, the bids and prices kept secret until opening, the keys of each role, the series ledger shared by the signers, and the receipts of anchors.

It trusts the role key lists that the verifier gives, the key registry it consults through keyStatus, the network values pinned in the Qstamp release it depends on, and the storage that holds keys, bid salts and the ledger. It does not trust the gateway or any endpoint, the holders of records, or any record not signed by a trusted key for its role.

A forged or altered record fails its signature or the reference that a later record names, and two linked records signed by one key are refused. A bid seal binds its notice and bidder, and an opening that does not reproduce the seal is refused. Signatures use the context string quantova/qprocure/1 and anchors use record kind 1103, so a record signed or anchored for another SDK never verifies here, and every anchor is checked against the genesis and contract pinned in the Qstamp release. A hostile gateway cannot make an unproven anchor count, the local clock is never used as the time of verification, and an anchor more than 24 hours after the stated time does not prove that time. A bid sealed or anchored after the deadline is refused, and a bid anchored in time that was neither opened nor excluded makes the award invalid. The ledger holds one award per tender and refuses a second amendment at a position it holds, two different records at one position are invalid once both are supplied, and a ledger folder that every user can write, or that lies under a folder another user can change, is refused. A record anchored after the revocation time that keyStatus reports for its key is invalid. Input is parsed strictly within fixed size and time limits.

Left to the integrator are the protection of keys and bid salts, keeping the ledger folder writable only by the signers and backed up whole, since a folder rolled back or missing a file lets a position be signed again, and supplying every record held for a tender. QProcure does not detect collusion outside the procedure or judge criteria, scores and amendments, and that an opening came after the deadline rests on the stated time of a trusted signer.

## Installation

```
npm install @quantovainc/qprocure
```

QProcure requires Node 20 or later.

## Command line use

```
qprocure keygen authority.key
qprocure keygen bidder.key
qprocure keygen committee.key
qprocure keygen evaluator.key
qprocure keygen awarder.key
qprocure key authority.key > authority.pub.json
qprocure key bidder.key > bidder.pub.json
qprocure key committee.key > committee.pub.json
qprocure key evaluator.key > evaluator.pub.json
qprocure key awarder.key > awarder.pub.json
qprocure keygen approver.key
qprocure key approver.key > approver.pub.json

qprocure notice --key authority.key --title "Bridge repair" --criteria criteria.pdf --currency EUR --estimate 5000000 --max-score 100 --deadline <deadline> --out notice.json
qprocure seal-bid --bid bid.pdf --price 4000000 --notice notice.json --bidder bidder.pub.json --out bid.seal.json
qprocure bid --key bidder.key --notice notice.json --seal <seal> --out bid.json

qprocure opening --key committee.key --notice notice.json --bid bid.json --bid-digest <bidDigest> --bid-salt <salt> --price 4000000 --out opening.json
qprocure score --key evaluator.key --notice notice.json --opening opening.json --score 80 --out score.json
mkdir ledger
qprocure award --key awarder.key --notice notice.json --opening opening.json --contract-document contract.pdf --ledger ledger --out award.json
qprocure anchor notice.json bid.json --seed-file account.key --trust-single-endpoint

qprocure anchor opening.json score.json award.json --seed-file account.key --trust-single-endpoint

qprocure verify award.json --type award --authority authority.pub.json --bidder bidder.pub.json --committee committee.pub.json --evaluator evaluator.pub.json --awarder awarder.pub.json --approver approver.pub.json --record notice.json --record bid.json --record opening.json --record score.json --all-supplied --trust-single-endpoint
```

The file account.key holds the 32 byte seed of a funded Quantova account, as 64 hexadecimal characters, which pays for anchoring. It is separate from the signing keys of officials.

The network has one official endpoint today, so the anchor and verify commands above are given --trust-single-endpoint to rely on it. Without that flag they stop, because chain data is accepted only when endpoints of two different operators agree. With it a verification reports INDETERMINATE and exits with status 2, because an anchor confirmed by one operator is unproven. Once the Qstamp release lists official endpoints of two different operators the flag is no longer needed.

The opening, score and award commands are run after the deadline of the notice has passed.

Every command that signs a record of a series takes --ledger with the folder shared by every signer of the series, as in the example above. The ledger folder records every position already signed, so keep it on storage that only the signing service can write to, never edit or delete a file in it, and back it up as a whole, because a folder that is rolled back or loses a file lets a position be signed a second time. Without --ledger it signs nothing and exits with status 64, unless --no-ledger declares that the integrating system serialises the series itself.

If anchoring is interrupted after its transaction may have been sent, a pending stamp is kept beside each envelope and the envelopes are not anchored again. Finish with qprocure complete, giving the same envelopes in the same order and the pending stamp.

The command exits with status 0 when the result is valid, 1 when it is invalid, refused or the evidence is malformed, 2 when it cannot be decided, and 64 for usage errors. Key and salt files must be readable only by their owner and are never followed through symbolic links.

## Independent verification procedure

1. Decode each public key and signature from base64 and confirm their lengths are 1952 and 3309 bytes.
2. Compute each key identifier from the label quantova/qprocure/key/1, the byte 0x00 and the public key, and compare it with the signer identifier and the signing party named in the statement.
3. Encode each statement as described above and verify its signature with ML-DSA-65 under the context string quantova/qprocure/1, following FIPS 204.
4. Compute the reference of each linked record and of each earlier record of each series, confirm each is the one named, and apply the rules of verification listed above.
5. Compute the anchor value of each record and verify its receipt by the procedure published with Qstamp under record kind 1103.

## Network

The live Quantova network is named Q-test-net-01. Its genesis hash and the official Qstamp contract that records anchors are pinned in the Qstamp release this SDK depends on. The public endpoint is https://q-test-net-01.quantova.org. By default verification consults the official endpoints of the network. Endpoints chosen by the verifier are given with the rpc or clients option, or with --rpc once for each on the command line, and verification consults them only with trustCustomEndpoints, or --trust-custom-endpoints. An endpoint on a loopback address is refused unless allowLoopback, or --allow-loopback, is set, and an endpoint on a private network address unless it is named in endpointAllowList, or with --allow-endpoint. The option expectedSender, or --expect-sender, names the Quantova accounts entitled to anchor records, and an anchor signed by any other account is invalid. Anchoring accepts chain data only when at least two endpoints run by different operators agree, and the option trustSingleEndpoint, or --trust-single-endpoint, relies on one endpoint for anchoring and for the time of the chain.

## Licence

QProcure is created and owned by Quantova Inc. It is licensed under the Apache License 2.0 or the MIT licence, at your option. The full texts are in the files LICENSE-APACHE and LICENSE-MIT, and the notice is in NOTICE.
