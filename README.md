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
4. A bid proven to be sealed before the deadline that was neither opened nor excluded by a signed decision of the committee, once the bids held for the tender are supplied.
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

3. Seal and anchor bids. Each bidder runs seal-bid, or calls sealBid, on its own systems with the bid document, its price, the notice and its own key, keeps the bid, the price and the salt secret until the opening, calls bid with the seal against the notice and anchors the bid itself with its own funded account before the deadline, keeping the receipt. A bid anchored by the bidder cannot be suppressed by the authority.

4. Open, exclude and evaluate. After the deadline the committee calls opening for each bid with the bid fingerprint, the salt and the price. A bid that cannot be opened, because its bidder withdrew or did not reveal it, or that is not compliant, is excluded with exclusion, stating the reason. Each evaluator calls score for every opened bid.

5. Award and amend. The award authority calls award against the notice and the winning opening, with the fingerprint of the contract. Each later change is sealed by an approver with amendment, naming the previous amendment of the award or declaring it the first.

6. Anchor promptly. A single service with a funded Quantova account anchors new records in batches under the QProcure record kind, and each record receives its own receipt.

7. Verify on demand. Auditors and courts verify any record against the lists of trusted keys and the records held, with the verify command, the library or the independent procedure below.

## What is published and what stays private

Bids and prices remain confidential until opening and are never published by QProcure. A bid seal is a salted SHA3 commitment that reveals nothing about the bid or its price. Criteria, bids, contracts and approvals stay with the authority and the bidders, and only their fingerprints enter records.

When a record is anchored, only a 32 byte Qstamp commitment reaches the chain. It is derived from a salted fingerprint of the signed record and cannot be reversed into any field of the record.

## Cryptographic construction

1. Keys. Keys are 32 byte seeds from which ML-DSA-65 key pairs are derived by the key generation procedure of FIPS 204. A key identifier is the SHA3 hash with a 256 bit output of the ASCII label quantova/qprocure/key/1, the byte 0x00 and the 1952 byte public key.

2. Party commitments. A party is named by the SHA3-256 hash of the ASCII label quantova/qprocure/party/1, the byte 0x00, a random 32 byte salt and the identifier in Unicode normal form C. When the authority supplies its own 32 byte secret and the reference of the record that defines the series, the salt is instead the SHA3-256 hash of the ASCII label quantova/qprocure/party-salt/1, the byte 0x00, the secret, the 32 byte reference and the identifier in Unicode normal form C, so the same party always receives the same commitment in that series.

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
8. A record that depends on a series is valid only when the verifier declares that every record it holds for the series involved was supplied. Without that declaration the result is indeterminate, and with it a missing record makes the result invalid.
9. A bid is sealed no later than the deadline of its notice, and its anchor, when present, is no later than the deadline. When anchors are required an unanchored bid is not proven timely.
10. An opening is dated after the deadline and its bid fingerprint, salt and price reproduce the seal of the bid.
11. A score does not exceed the largest score of its notice.
12. An award relies on an opening of the same notice and its value is the opened price. Every opening, exclusion, score and award of the tender supplied and signed by trusted keys is verified in turn. Among them, no bid was opened twice or both opened and excluded, every exclusion is dated after the deadline, every evaluator scored every opened bid, every score counted was signed and anchored before the award, no other award exists for the tender, and the opening awarded holds the highest total score. Every bid that was neither opened nor excluded is checked separately. Such a bid that is valid and proven to be sealed and anchored before the deadline makes the award invalid, such a bid that is valid and stated before the deadline but not anchored makes the result indeterminate, and a late or invalid bid is reported as left out. An award is valid only when the verifier declares that every bid, opening, exclusion and score held for the tender was supplied.
13. When documents are supplied, their fingerprints match the signed fingerprints, and when a party identity and salt are supplied, they match the commitment.
14. Each anchor is verified under the QProcure record kind with a SHA3 digest, and the stated time is not later than the anchor time, allowing five minutes. An anchor more than twenty four hours after the stated time, unless another limit is given, or later than a given verification time, does not prove the stated time and makes the result indeterminate.

A result is valid only when the trusted keys are given, every record relied on is supplied, the records held for each series are declared complete where a series is involved, and every record is anchored. When any of these is missing the result is indeterminate rather than valid. A record verified with anchoring not required proves only who signed it and what was signed, and its stated time is the claim of its signer.

## Trust model of this release

This release anchors on the live Quantova network Q-test-net-1. The signing module is compiled from the Quantova Q-Crypto library, which follows FIPS 204 and FIPS 202 and has been tested against the NIST vectors. It has not been validated under FIPS 140-3. Anchor times are confirmed by the endpoints a verifier queries, so a time is only as reliable as those endpoints. Verification names the endpoints it consulted and says whether they are the official endpoints of the network, and a verifier who needs independence from any single operator should query several independent endpoints.

A sealed record proves who signed it, what was signed and when it was anchored. Each check is made from the records a verifier is given, so two records in the same position of a series are detected only when both are supplied, and auditors should obtain every record held for the series they examine. A party commitment is the same in every record that uses the same salt, so records about one party can be linked by anyone who sees them, and anyone who obtains the salt can test guesses of the identifier, so salts must be protected like the identifiers themselves. Verifiers must keep the keys of retired officials in the trusted lists for as long as records they signed are verified. A sealed record does not detect collusion agreed between bidders outside the procedure, and it does not judge whether criteria or scores were reasonable, which remain matters for review bodies and competition authorities. Amendments are not limited in value by QProcure, so each must be justified by its sealed approval.

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

# after the deadline has passed
qprocure opening --key committee.key --notice notice.json --bid bid.json --bid-digest <bidDigest> --bid-salt <salt> --price 4000000 --out opening.json
qprocure score --key evaluator.key --notice notice.json --opening opening.json --score 80 --out score.json
qprocure award --key awarder.key --notice notice.json --opening opening.json --contract-document contract.pdf --out award.json
qprocure anchor notice.json bid.json --seed-file account.key

qprocure anchor opening.json score.json award.json --seed-file account.key

qprocure verify award.json --type award --authority authority.pub.json --bidder bidder.pub.json --committee committee.pub.json --evaluator evaluator.pub.json --awarder awarder.pub.json --approver approver.pub.json --record notice.json --record bid.json --record opening.json --record score.json --all-supplied
```

The file account.key holds the 32 byte seed of a funded Quantova account, as 64 hexadecimal characters, which pays for anchoring. It is separate from the signing keys of officials.

If anchoring is interrupted after its transaction may have been sent, a pending stamp is kept beside each envelope and the envelopes are not anchored again. Finish with qprocure complete, giving the same envelopes in the same order and the pending stamp.

The command exits with status 0 when the result is valid, 1 when it is invalid, refused or the evidence is malformed, 2 when it cannot be decided, and 64 for usage errors. Key and salt files must be readable only by their owner and are never followed through symbolic links.

## Independent verification procedure

1. Decode each public key and signature from base64 and confirm their lengths are 1952 and 3309 bytes.
2. Compute each key identifier from the label quantova/qprocure/key/1, the byte 0x00 and the public key, and compare it with the signer identifier and the signing party named in the statement.
3. Encode each statement as described above and verify its signature with ML-DSA-65 under the context string quantova/qprocure/1, following FIPS 204.
4. Compute the reference of each linked record and of each earlier record of each series, confirm each is the one named, and apply the rules of verification listed above.
5. Compute the anchor value of each record and verify its receipt by the procedure published with Qstamp under record kind 1103.

## Network

The live Quantova network is named Q-test-net-1 with genesis hash ca91e093bb8de33e90db52d7c89876597d14760703793ea7211929e73e613062. Anchors are recorded by the official Qstamp contract on that network. The public endpoint is https://rpc-testnet.quantova.org.

## Licence

QProcure is created and owned by Quantova Inc. It is licensed under the Apache License 2.0 or the MIT licence, at your option. The full texts are in the files LICENSE-APACHE and LICENSE-MIT, and the notice is in NOTICE.
