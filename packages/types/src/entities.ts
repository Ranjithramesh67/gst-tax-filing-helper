import {
  ClientStatus,
  DevicePlatform,
  DocumentType,
  FilingStatus,
  FirmStatus,
  PaymentMethod,
  PaymentStatus,
  ReleaseChannel,
  ReturnType,
  Role,
  SmsCategory,
  SmsStatus,
} from './enums';

export interface Firm {
  id: string;
  name: string;
  slug: string;
  gstin?: string | null;
  email?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  address?: string | null;
  defaultFilingFee?: number | null;
  status: FirmStatus;
  createdAt: string;
  updatedAt: string;
  _count?: { clients: number; users: number; payments?: number };
}

export interface FirmBranding {
  name: string;
  slug: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  address?: string | null;
  defaultFilingFee?: number | null;
  status: FirmStatus;
}

export interface User {
  id: string;
  firmId?: string | null;
  email: string;
  name: string;
  phone?: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  firm?: Pick<Firm, 'id' | 'name' | 'slug'> | null;
}

export interface Client {
  id: string;
  firmId: string;
  name: string;
  gstin?: string | null;
  pan?: string | null;
  email?: string | null;
  phone: string;
  address?: string | null;
  stateCode?: string | null;
  status: ClientStatus;
  consentGranted: boolean;
  lastSmsAt?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { smsMessages: number; devices: number; documents: number };
}

export interface Device {
  id: string;
  clientId: string;
  platform: DevicePlatform;
  androidId: string;
  model?: string | null;
  osVersion?: string | null;
  appVersion?: string | null;
  revoked: boolean;
  lastSeenAt?: string | null;
  createdAt: string;
}

export interface ConsentRecord {
  id: string;
  clientId: string;
  deviceId?: string | null;
  version: string;
  acceptedAt: string;
  ip?: string | null;
  otpVerified: boolean;
  revokedAt?: string | null;
}

export interface SmsMessage {
  id: string;
  clientId: string;
  deviceId?: string | null;
  sender: string;
  body: string;
  receivedAt: string;
  category: SmsCategory;
  status: SmsStatus;
  createdAt: string;
  client?: Pick<Client, 'id' | 'name' | 'gstin'>;
  parsed?: ParsedGstData | null;
  documents?: Document[];
}

export interface ParsedGstData {
  id: string;
  smsMessageId: string;
  gstin?: string | null;
  invoiceNo?: string | null;
  amount?: number | null;
  taxableValue?: number | null;
  taxAmount?: number | null;
  hsn?: string | null;
  dueDate?: string | null;
  confidence: number;
  rawJson?: Record<string, unknown> | null;
}

export interface Document {
  id: string;
  clientId: string;
  smsMessageId?: string | null;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  uploadedById?: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  clientId: string;
  smsMessageId?: string | null;
  invoiceNo?: string | null;
  invoiceDate?: string | null;
  counterpartyGstin?: string | null;
  taxableValue?: number | null;
  taxAmount?: number | null;
  totalAmount?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface GstReturn {
  id: string;
  clientId: string;
  type: ReturnType;
  period: string;
  status: FilingStatus;
  dueDate?: string | null;
  filedAt?: string | null;
  filedById?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Filing {
  id: string;
  clientId: string;
  returnId?: string | null;
  type: ReturnType;
  period: string;
  status: FilingStatus;
  feeAmount?: number | null;
  paidAmount?: number;
  balanceAmount?: number;
  paymentState?: PaymentState;
  filedById?: string | null;
  filedAt?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PaymentState = 'NONE' | 'UNPAID' | 'PARTIAL' | 'PAID';

export interface PaymentLink {
  id: string;
  paymentId: string;
  label: string;
  url: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  firmId: string;
  clientId: string;
  filingId?: string | null;
  invoiceId?: string | null;
  amount: number;
  status: PaymentStatus;
  method?: PaymentMethod | null;
  paidAt?: string | null;
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  links?: PaymentLink[];
  client?: Pick<Client, 'id' | 'name'>;
}

export interface ClientReceivable {
  clientId: string;
  clientName: string;
  billed: number;
  collected: number;
  outstanding: number;
  filingsCount: number;
}

export interface FirmReceivable extends ClientReceivable {
  firmId: string;
  firmName: string;
}

export interface FirmBillingSummary {
  firmId: string;
  firmName: string;
  slug: string;
  billed: number;
  collected: number;
  outstanding: number;
  filingsCount: number;
  paymentsCount: number;
}

export type BillingInvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PARTIAL'
  | 'PAID'
  | 'VOID';

export type BillingInvoiceType = 'PER_FILING' | 'CUMULATIVE' | 'SUBSCRIPTION';

export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';

export type PaymentRequestProvider = 'MANUAL' | 'CASHFREE';

export interface BillingInvoiceItem {
  id: string;
  invoiceId: string;
  filingId?: string | null;
  description: string;
  amount: number;
  createdAt: string;
}

export interface BillingInvoice {
  id: string;
  firmId: string;
  clientId: string;
  number: string;
  type: BillingInvoiceType;
  status: BillingInvoiceStatus;
  issueDate: string;
  dueDate?: string | null;
  subtotal: number;
  total: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: BillingInvoiceItem[];
  client?: Pick<Client, 'id' | 'name'>;
  paid?: number;
  outstanding?: number;
}

export interface Subscription {
  id: string;
  firmId: string;
  clientId: string;
  amount: number;
  cycle: BillingCycle;
  startDate: string;
  nextDueDate: string;
  active: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  client?: Pick<Client, 'id' | 'name'>;
}

export interface PaymentRequest {
  id: string;
  firmId: string;
  clientId: string;
  invoiceId?: string | null;
  filingId?: string | null;
  amount: number;
  description?: string | null;
  status: PaymentStatus;
  provider: PaymentRequestProvider;
  providerRef?: string | null;
  url?: string | null;
  expiresAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
  client?: Pick<Client, 'id' | 'name'>;
  firm?: { id: string; name: string; slug: string } | null;
}

export interface PublicPaymentRequest {
  id: string;
  amount: number;
  description?: string | null;
  status: PaymentStatus;
  provider: PaymentRequestProvider;
  url?: string | null;
  expiresAt?: string | null;
  paidAt?: string | null;
  clientName?: string | null;
  invoiceNumber?: string | null;
  firm: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
    brandColor?: string | null;
    supportEmail?: string | null;
    supportPhone?: string | null;
  };
}

export interface AppRelease {
  id: string;
  platform: DevicePlatform;
  version: string;
  versionCode: number;
  channel: ReleaseChannel;
  url: string;
  checksum?: string | null;
  changelog?: string | null;
  mandatory: boolean;
  publishedAt: string;
}

export interface AuditLog {
  id: string;
  actorId?: string | null;
  firmId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
