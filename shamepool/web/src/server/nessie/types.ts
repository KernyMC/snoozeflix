// SERVER ONLY. Nothing under src/app or src/components may import this directory
// (enforced by client-isolation.test.ts). The Nessie API key must never reach the browser.

/** Error thrown by every Nessie operation. Never contains the API key. */
export class NessieError extends Error {
  readonly status: number;
  readonly code: string;
  readonly culprit: string[];
  /** true when retrying the same job later may succeed (network, 5xx, 429). */
  readonly retryable: boolean;

  constructor(opts: { status: number; code?: string; message: string; culprit?: string[]; retryable?: boolean }) {
    super(opts.message);
    this.name = 'NessieError';
    this.status = opts.status;
    this.code = opts.code ?? `http_${opts.status}`;
    this.culprit = opts.culprit ?? [];
    this.retryable = opts.retryable ?? (opts.status === 0 || opts.status === 429 || opts.status >= 500);
  }
}

export type AccountType = 'Checking' | 'Savings' | 'Credit Card';

export interface AccountInfo {
  accountId: string;
  customerId: string;
  nickname: string;
  type: string;
  /** Balance in cents, converted from the sandbox's whole-dollar balance. */
  balanceCents: number;
}

export interface LedgerEntry {
  id: string;
  /** Sandbox amount in whole dollars. */
  amountDollars: number;
  status: string;
  description: string;
  date: string;
}

export interface TransferResult {
  transferId: string;
  status: string;
  /** false when an earlier call with the same idempotency key was found and reused. */
  created: boolean;
}

export interface NessieClient {
  readonly mode: 'live' | 'mock';
  createCustomer(input: { firstName: string; lastName: string; streetName?: string }): Promise<{ customerId: string }>;
  listCustomers(): Promise<Array<{ customerId: string; firstName: string; lastName: string; streetName: string }>>;
  createAccount(
    customerId: string,
    input: { nickname: string; type?: AccountType; startingBalanceCents?: number },
  ): Promise<{ accountId: string }>;
  listAccounts(customerId: string): Promise<AccountInfo[]>;
  getAccount(accountId: string): Promise<AccountInfo>;
  deleteAccount(accountId: string): Promise<void>;
  createMerchant(input: { name: string; category?: string }): Promise<{ merchantId: string }>;
  listMerchants(): Promise<Array<{ merchantId: string; name: string }>>;
  /** Find a merchant by exact name or create it. */
  ensureMerchant(input: { name: string; category?: string }): Promise<{ merchantId: string }>;
  /** Idempotent on idempotencyKey. Records the payee in the description (the sandbox has no payee field). */
  transfer(input: {
    fromAccountId: string;
    toAccountId: string;
    amountCents: number;
    description: string;
    idempotencyKey: string;
  }): Promise<TransferResult>;
  listTransfers(accountId: string): Promise<LedgerEntry[]>;
  purchase(input: {
    accountId: string;
    merchantId: string;
    amountCents: number;
    description: string;
    idempotencyKey: string;
  }): Promise<{ purchaseId: string; status: string; created: boolean }>;
  listPurchases(accountId: string): Promise<LedgerEntry[]>;
  withdraw(input: {
    accountId: string;
    amountCents: number;
    description: string;
    idempotencyKey: string;
  }): Promise<{ withdrawalId: string; status: string; created: boolean }>;
  listWithdrawals(accountId: string): Promise<LedgerEntry[]>;
  deposit(input: {
    accountId: string;
    amountCents: number;
    description: string;
    idempotencyKey: string;
  }): Promise<{ depositId: string; status: string; created: boolean }>;
  listDeposits(accountId: string): Promise<LedgerEntry[]>;
}
