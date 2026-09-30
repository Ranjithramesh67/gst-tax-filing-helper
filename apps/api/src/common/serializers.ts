import type {
  AppRelease,
  AuditLog,
  Client,
  ConsentRecord,
  Device,
  Document,
  Filing,
  Firm,
  GstReturn,
  Invoice,
  ParsedGstData,
  SmsMessage,
  User,
} from '@gstflow/types';

// Serialisers convert Prisma rows (Date objects, nullable relations) into the
// JSON shapes declared in @gstflow/types. All date-like fields become ISO strings.

type DateLike = Date | string | null | undefined;

const iso = (value: DateLike): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString() : value;

export function serialiseFirm(firm: {
  id: string;
  name: string;
  slug: string;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: { clients: number; users: number };
}): Firm {
  return {
    id: firm.id,
    name: firm.name,
    slug: firm.slug,
    gstin: firm.gstin,
    email: firm.email,
    phone: firm.phone,
    status: firm.status as Firm['status'],
    createdAt: iso(firm.createdAt)!,
    updatedAt: iso(firm.updatedAt)!,
    ...(firm._count ? { _count: firm._count } : {}),
  };
}

export function serialiseUser(user: {
  id: string;
  firmId: string | null;
  email: string;
  name: string;
  phone?: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  firm?: { id: string; name: string; slug: string } | null;
}): User {
  return {
    id: user.id,
    firmId: user.firmId,
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    role: user.role as User['role'],
    isActive: user.isActive,
    lastLoginAt: iso(user.lastLoginAt),
    createdAt: iso(user.createdAt)!,
    updatedAt: iso(user.updatedAt)!,
    firm: user.firm ?? null,
  };
}

export function serialiseClient(client: {
  id: string;
  firmId: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string;
  address: string | null;
  stateCode: string | null;
  status: string;
  consentGranted: boolean;
  lastSmsAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { smsMessages: number; devices: number; documents: number };
}): Client {
  return {
    id: client.id,
    firmId: client.firmId,
    name: client.name,
    gstin: client.gstin,
    pan: client.pan,
    email: client.email,
    phone: client.phone,
    address: client.address,
    stateCode: client.stateCode,
    status: client.status as Client['status'],
    consentGranted: client.consentGranted,
    lastSmsAt: iso(client.lastSmsAt),
    createdAt: iso(client.createdAt)!,
    updatedAt: iso(client.updatedAt)!,
    ...(client._count ? { _count: client._count } : {}),
  };
}

export function serialiseDevice(device: {
  id: string;
  clientId: string;
  platform: string;
  androidId: string;
  model: string | null;
  osVersion: string | null;
  appVersion: string | null;
  revoked: boolean;
  lastSeenAt?: Date | null;
  createdAt: Date;
}): Device {
  return {
    id: device.id,
    clientId: device.clientId,
    platform: device.platform as Device['platform'],
    androidId: device.androidId,
    model: device.model,
    osVersion: device.osVersion,
    appVersion: device.appVersion,
    revoked: device.revoked,
    lastSeenAt: iso(device.lastSeenAt),
    createdAt: iso(device.createdAt)!,
  };
}

export function serialiseConsent(consent: {
  id: string;
  clientId: string;
  deviceId: string | null;
  version: string;
  acceptedAt: Date;
  ip: string | null;
  otpVerified: boolean;
  revokedAt: Date | null;
}): ConsentRecord {
  return {
    id: consent.id,
    clientId: consent.clientId,
    deviceId: consent.deviceId,
    version: consent.version,
    acceptedAt: iso(consent.acceptedAt)!,
    ip: consent.ip,
    otpVerified: consent.otpVerified,
    revokedAt: iso(consent.revokedAt),
  };
}

export function serialiseParsed(parsed: {
  id: string;
  smsMessageId: string;
  gstin: string | null;
  invoiceNo: string | null;
  amount: number | null;
  taxableValue: number | null;
  taxAmount: number | null;
  hsn: string | null;
  dueDate: Date | null;
  confidence: number;
  rawJson: unknown;
}): ParsedGstData {
  return {
    id: parsed.id,
    smsMessageId: parsed.smsMessageId,
    gstin: parsed.gstin,
    invoiceNo: parsed.invoiceNo,
    amount: parsed.amount,
    taxableValue: parsed.taxableValue,
    taxAmount: parsed.taxAmount,
    hsn: parsed.hsn,
    dueDate: iso(parsed.dueDate),
    confidence: parsed.confidence,
    rawJson: (parsed.rawJson as Record<string, unknown> | null) ?? null,
  };
}

export function serialiseDocument(doc: {
  id: string;
  clientId: string;
  smsMessageId: string | null;
  type: string;
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  uploadedById: string | null;
  createdAt: Date;
}): Document {
  return {
    id: doc.id,
    clientId: doc.clientId,
    smsMessageId: doc.smsMessageId,
    type: doc.type as Document['type'],
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    size: doc.size,
    storageKey: doc.storageKey,
    uploadedById: doc.uploadedById,
    createdAt: iso(doc.createdAt)!,
  };
}

export function serialiseSms(sms: {
  id: string;
  clientId: string;
  deviceId: string | null;
  sender: string;
  receivedAt: Date;
  category: string;
  status: string;
  createdAt: Date;
  body?: string;
  client?: { id: string; name: string; gstin: string | null } | null;
  parsed?: Parameters<typeof serialiseParsed>[0] | null;
  documents?: Parameters<typeof serialiseDocument>[0][];
}): SmsMessage {
  return {
    id: sms.id,
    clientId: sms.clientId,
    deviceId: sms.deviceId,
    sender: sms.sender,
    body: sms.body ?? '',
    receivedAt: iso(sms.receivedAt)!,
    category: sms.category as SmsMessage['category'],
    status: sms.status as SmsMessage['status'],
    createdAt: iso(sms.createdAt)!,
    client: sms.client ?? undefined,
    parsed: sms.parsed ? serialiseParsed(sms.parsed) : null,
    documents: sms.documents ? sms.documents.map(serialiseDocument) : undefined,
  };
}

export function serialiseInvoice(invoice: {
  id: string;
  clientId: string;
  smsMessageId: string | null;
  invoiceNo: string | null;
  invoiceDate: Date | null;
  counterpartyGstin: string | null;
  taxableValue: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  createdAt: Date;
  updatedAt: Date;
}): Invoice {
  return {
    id: invoice.id,
    clientId: invoice.clientId,
    smsMessageId: invoice.smsMessageId,
    invoiceNo: invoice.invoiceNo,
    invoiceDate: iso(invoice.invoiceDate),
    counterpartyGstin: invoice.counterpartyGstin,
    taxableValue: invoice.taxableValue,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    createdAt: iso(invoice.createdAt)!,
    updatedAt: iso(invoice.updatedAt)!,
  };
}

export function serialiseReturn(ret: {
  id: string;
  clientId: string;
  type: string;
  period: string;
  status: string;
  dueDate: Date | null;
  filedAt: Date | null;
  filedById: string | null;
  referenceNo: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): GstReturn {
  return {
    id: ret.id,
    clientId: ret.clientId,
    type: ret.type as GstReturn['type'],
    period: ret.period,
    status: ret.status as GstReturn['status'],
    dueDate: iso(ret.dueDate),
    filedAt: iso(ret.filedAt),
    filedById: ret.filedById,
    referenceNo: ret.referenceNo,
    notes: ret.notes,
    createdAt: iso(ret.createdAt)!,
    updatedAt: iso(ret.updatedAt)!,
  };
}

export function serialiseFiling(filing: {
  id: string;
  clientId: string;
  returnId: string | null;
  type: string;
  period: string;
  status: string;
  filedById: string | null;
  filedAt: Date | null;
  referenceNo: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Filing {
  return {
    id: filing.id,
    clientId: filing.clientId,
    returnId: filing.returnId,
    type: filing.type as Filing['type'],
    period: filing.period,
    status: filing.status as Filing['status'],
    filedById: filing.filedById,
    filedAt: iso(filing.filedAt),
    referenceNo: filing.referenceNo,
    notes: filing.notes,
    createdAt: iso(filing.createdAt)!,
    updatedAt: iso(filing.updatedAt)!,
  };
}

export function serialiseRelease(release: {
  id: string;
  platform: string;
  version: string;
  versionCode: number;
  channel: string;
  url: string;
  checksum: string | null;
  changelog: string | null;
  mandatory: boolean;
  publishedAt: Date;
}): AppRelease {
  return {
    id: release.id,
    platform: release.platform as AppRelease['platform'],
    version: release.version,
    versionCode: release.versionCode,
    channel: release.channel as AppRelease['channel'],
    url: release.url,
    checksum: release.checksum,
    changelog: release.changelog,
    mandatory: release.mandatory,
    publishedAt: iso(release.publishedAt)!,
  };
}

export function serialiseAudit(log: {
  id: string;
  actorId: string | null;
  firmId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  meta: unknown;
  ip: string | null;
  createdAt: Date;
}): AuditLog {
  return {
    id: log.id,
    actorId: log.actorId,
    firmId: log.firmId,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    meta: (log.meta as Record<string, unknown> | null) ?? null,
    ip: log.ip,
    createdAt: iso(log.createdAt)!,
  };
}
