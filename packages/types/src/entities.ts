import {
  ClientStatus,
  DevicePlatform,
  DocumentType,
  FilingStatus,
  FirmStatus,
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
  status: FirmStatus;
  createdAt: string;
  updatedAt: string;
  _count?: { clients: number; users: number };
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
  filedById?: string | null;
  filedAt?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
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
