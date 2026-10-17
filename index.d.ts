// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

export type RecordType = 'notice' | 'bid' | 'opening' | 'exclusion' | 'score' | 'award' | 'amendment';
export type Role = 'authority' | 'bidder' | 'committee' | 'evaluator' | 'awarder' | 'approver';

export interface Envelope {
  format: 'qprocure/1';
  type: RecordType;
  algorithm: 'ML-DSA-65';
  signer: { id: string; publicKey: string };
  statement: Record<string, unknown>;
  signature: string;
  anchor?: unknown;
}

export interface KeyDescription {
  format: 'qprocure-key/1';
  algorithm: 'ML-DSA-65';
  id: string;
  publicKey: string;
}

export type KeyRef = string | Uint8Array | KeyDescription;

export interface NoticeOptions {
  key: Uint8Array;
  title: string;
  criteriaDigest?: string;
  criteria?: Uint8Array;
  currency: string;
  estimate: string;
  maxScore: string;
  deadline: string;
  publishedAt?: string;
  note?: string;
}

export interface BidOptions {
  key: Uint8Array;
  notice: Envelope;
  seal: string;
  sealedAt?: string;
  note?: string;
}

export interface OpeningOptions {
  key: Uint8Array;
  notice: Envelope;
  bid: Envelope;
  bidDigest?: string;
  bidDocument?: Uint8Array;
  bidSalt: string;
  currency?: string;
  price: string;
  openedAt?: string;
  note?: string;
}

export interface ExclusionOptions {
  key: Uint8Array;
  notice: Envelope;
  bid: Envelope;
  reason: string;
  excludedAt?: string;
  note?: string;
}

export interface ScoreOptions {
  key: Uint8Array;
  notice: Envelope;
  opening: Envelope;
  score: string;
  scoredAt?: string;
  note?: string;
}

export interface AwardOptions {
  key: Uint8Array;
  notice: Envelope;
  opening: Envelope;
  contractDigest?: string;
  contractDocument?: Uint8Array;
  currency?: string;
  value?: string;
  awardedAt?: string;
  note?: string;
}

export interface AmendmentOptions {
  key: Uint8Array;
  award: Envelope;
  approvalDigest?: string;
  approval?: Uint8Array;
  currency?: string;
  value: string;
  previous?: Envelope;
  first?: boolean;
  amendedAt?: string;
  note?: string;
}

export interface VerifyOptions {
  type: RecordType;
  authorityKeys?: KeyRef[];
  bidderKeys?: KeyRef[];
  committeeKeys?: KeyRef[];
  evaluatorKeys?: KeyRef[];
  awarderKeys?: KeyRef[];
  approverKeys?: KeyRef[];
  records?: Envelope[];
  allSupplied?: boolean;
  party?: { field: string; identity: string; salt: Uint8Array };
  criteriaDigest?: string;
  criteria?: Uint8Array;
  bidDigest?: string;
  bidDocument?: Uint8Array;
  contractDigest?: string;
  contractDocument?: Uint8Array;
  approvalDigest?: string;
  approval?: Uint8Array;
  requireAnchor?: boolean;
  at?: string;
  maxAnchorDelay?: number;
  maxAnchorLookups?: number;
  keyStatus?: (keyId: string) => unknown;
  rpc?: string | string[];
  client?: unknown;
  clients?: Array<string | unknown>;
  trustSingleEndpoint?: boolean;
  trustCustomEndpoints?: boolean;
  allowLoopback?: boolean;
  endpointAllowList?: string[];
  expectedSender?: string | string[];
  contract?: string;
  trustCustomContract?: boolean;
}

export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail: string;
  transport: boolean;
  indeterminate: boolean;
}

export interface VerifyResult {
  valid: boolean;
  status: 'valid' | 'invalid' | 'indeterminate';
  type: RecordType | null;
  checks: VerifyCheck[];
  endpoints: string[];
  officialEndpoints: boolean | null;
  notices: string[];
  [field: string]: unknown;
}

export interface AnchorOptions {
  seed: Uint8Array;
  index: number;
  network?: 'testnet';
  rpc?: string | string[];
  client?: unknown;
  clients?: Array<string | unknown>;
  trustSingleEndpoint?: boolean;
  allowLoopback?: boolean;
  endpointAllowList?: string[];
  meter?: number;
  maxFee?: string | number;
  timeoutMs?: number;
  onPending?: (pending: unknown) => void | Promise<void>;
}

export function generateKey(): Uint8Array;
export function publicKey(key: Uint8Array): Uint8Array;
export function keyId(key: Uint8Array): string;
export function describeKey(key: Uint8Array): KeyDescription;
export function commitParty(identity: string, options?: { salt?: Uint8Array; secret?: Uint8Array; scope?: string }): { salt: Uint8Array; ref: string };
export function notice(options: NoticeOptions): Envelope;
export function bid(options: BidOptions): Envelope;
export function opening(options: OpeningOptions): Envelope;
export function exclusion(options: ExclusionOptions): Envelope;
export function score(options: ScoreOptions): Envelope;
export function award(options: AwardOptions): Envelope;
export function amendment(options: AmendmentOptions): Envelope;
export function create(type: RecordType, options: Record<string, unknown>): Envelope;
export function anchor(envelopes: Envelope | Envelope[], options: AnchorOptions): Promise<Envelope[]>;
export function complete(envelopes: Envelope | Envelope[], pending: unknown, options?: { rpc?: string | string[]; client?: unknown; clients?: Array<string | unknown>; trustSingleEndpoint?: boolean; allowLoopback?: boolean; endpointAllowList?: string[]; timeoutMs?: number }): Promise<Envelope[]>;
export function verify(envelope: unknown, options: VerifyOptions): Promise<VerifyResult>;
export function refOf(envelope: Envelope): string;
export function anchorDigest(envelope: Envelope): string;
export function sealBid(bid: Uint8Array, price: string, notice: Envelope, bidder: KeyRef): { salt: string; bidDigest: string; price: string; seal: string };
export const FORMAT: 'qprocure/1';
export const ALGORITHM: 'ML-DSA-65';
export const KIND: 1103;
export const TYPES: readonly RecordType[];
export const ROLES: readonly Role[];
