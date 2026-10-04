import type {
  AppRelease,
  AuditLog,
  BillingInvoice,
  BillingInvoiceItem,
  Client,
  ClientLink,
  ConsentRecord,
  Device,
  Document,
  Filing,
  Firm,
  GstReturn,
  Invoice,
  ParsedGstData,
  Payment,
  PaymentLink,
  PaymentRequest,
  PublicPaymentRequest,
  RoleDefinition,
  SmsMessage,
  Subscription,
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
  logoUrl?: string | null;
  brandColor?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  address?: string | null;
  defaultFilingFee?: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: { clients: number; users: number; payments?: number };
}): Firm {
  return {
    id: firm.id,
    name: firm.name,
    slug: firm.slug,
    gstin: firm.gstin,
    email: firm.email,
    phone: firm.phone,
    logoUrl: firm.logoUrl ?? null,
    brandColor: firm.brandColor ?? null,
    supportEmail: firm.supportEmail ?? null,
    supportPhone: firm.supportPhone ?? null,
    address: firm.address ?? null,
    defaultFilingFee: firm.defaultFilingFee ?? null,
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
  roleId?: string | null;
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  role?: { key: string; name: string } | null;
  firm?: { id: string; name: string; slug: string } | null;
}): User {
  return {
    id: user.id,
    firmId: user.firmId,
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    role: user.role?.key ?? 'NONE',
    roleId: user.roleId ?? null,
    roleName: user.role?.name ?? null,
    isActive: user.isActive,
    lastLoginAt: iso(user.lastLoginAt),
    createdAt: iso(user.createdAt)!,
    updatedAt: iso(user.updatedAt)!,
    firm: user.firm ?? null,
  };
}

export function serialiseRole(role: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: string;
  firmId: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions?: { permission: string }[];
  _count?: { users: number };
  firm?: { id: string; name: string; slug: string } | null;
}): RoleDefinition {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description ?? null,
    scope: role.scope as RoleDefinition['scope'],
    firmId: role.firmId ?? null,
    isSystem: role.isSystem,
    permissions: role.permissions?.map((p) => p.permission) ?? [],
    createdAt: iso(role.createdAt)!,
    updatedAt: iso(role.updatedAt)!,
    ...(role._count ? { _count: role._count } : {}),
    ...(role.firm ? { firm: role.firm } : {}),
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
  linkStatus: string;
  linkRequestedAt: Date;
  linkConfirmedAt: Date | null;
  linkRejectedAt: Date | null;
  linkRevokedAt: Date | null;
  linkNote: string | null;
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
    linkStatus: client.linkStatus as Client['linkStatus'],
    linkRequestedAt: iso(client.linkRequestedAt)!,
    linkConfirmedAt: iso(client.linkConfirmedAt),
    linkRejectedAt: iso(client.linkRejectedAt),
    linkRevokedAt: iso(client.linkRevokedAt),
    linkNote: client.linkNote,
    lastSmsAt: iso(client.lastSmsAt),
    createdAt: iso(client.createdAt)!,
    updatedAt: iso(client.updatedAt)!,
    ...(client._count ? { _count: client._count } : {}),
  };
}

export function serialiseClientLink(row: {
  id: string;
  name: string;
  phone: string;
  gstin: string | null;
  consentGranted: boolean;
  linkStatus: string;
  linkRequestedAt: Date;
  linkConfirmedAt: Date | null;
  linkRejectedAt: Date | null;
  linkRevokedAt: Date | null;
  linkNote: string | null;
  lastSmsAt?: Date | null;
  firm: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    brandColor: string | null;
    supportEmail: string | null;
    supportPhone: string | null;
  };
}): ClientLink {
  return {
    id: row.id,
    status: row.linkStatus as ClientLink['status'],
    clientName: row.name,
    phone: row.phone,
    gstin: row.gstin,
    requestedAt: iso(row.linkRequestedAt)!,
    confirmedAt: iso(row.linkConfirmedAt),
    rejectedAt: iso(row.linkRejectedAt),
    revokedAt: iso(row.linkRevokedAt),
    note: row.linkNote,
    consentGranted: row.consentGranted,
    lastSmsAt: iso(row.lastSmsAt),
    firm: row.firm,
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
  feeAmount?: number | null;
  filedById: string | null;
  filedAt: Date | null;
  referenceNo: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  payments?: { amount: number; status: string }[];
}): Filing {
  const fee = filing.feeAmount ?? null;
  const paid = (filing.payments ?? [])
    .filter((p) => p.status === 'COMPLETED')
    .reduce((sum, p) => sum + p.amount, 0);
  const paymentState = derivePaymentState(fee, paid);
  return {
    id: filing.id,
    clientId: filing.clientId,
    returnId: filing.returnId,
    type: filing.type as Filing['type'],
    period: filing.period,
    status: filing.status as Filing['status'],
    feeAmount: fee,
    paidAmount: paid,
    balanceAmount: fee == null ? 0 : Math.max(0, fee - paid),
    paymentState,
    filedById: filing.filedById,
    filedAt: iso(filing.filedAt),
    referenceNo: filing.referenceNo,
    notes: filing.notes,
    createdAt: iso(filing.createdAt)!,
    updatedAt: iso(filing.updatedAt)!,
  };
}

export function derivePaymentState(
  fee: number | null | undefined,
  paid: number,
): Filing['paymentState'] {
  if (fee == null) return 'NONE';
  if (paid <= 0) return 'UNPAID';
  if (paid < fee) return 'PARTIAL';
  return 'PAID';
}

export function serialisePaymentLink(link: {
  id: string;
  paymentId: string;
  label: string;
  url: string;
  createdAt: Date;
}): PaymentLink {
  return {
    id: link.id,
    paymentId: link.paymentId,
    label: link.label,
    url: link.url,
    createdAt: iso(link.createdAt)!,
  };
}

export function serialisePayment(payment: {
  id: string;
  firmId: string;
  clientId: string;
  filingId: string | null;
  invoiceId?: string | null;
  amount: number;
  status: string;
  method: string | null;
  paidAt: Date | null;
  reference: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  links?: Parameters<typeof serialisePaymentLink>[0][];
  client?: { id: string; name: string } | null;
}): Payment {
  return {
    id: payment.id,
    firmId: payment.firmId,
    clientId: payment.clientId,
    filingId: payment.filingId,
    invoiceId: payment.invoiceId ?? null,
    amount: payment.amount,
    status: payment.status as Payment['status'],
    method: (payment.method as Payment['method']) ?? null,
    paidAt: iso(payment.paidAt),
    reference: payment.reference,
    notes: payment.notes,
    createdAt: iso(payment.createdAt)!,
    updatedAt: iso(payment.updatedAt)!,
    links: payment.links ? payment.links.map(serialisePaymentLink) : undefined,
    client: payment.client ?? undefined,
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

export function serialiseBillingInvoiceItem(item: {
  id: string;
  invoiceId: string;
  filingId: string | null;
  description: string;
  amount: number;
  createdAt: Date;
}): BillingInvoiceItem {
  return {
    id: item.id,
    invoiceId: item.invoiceId,
    filingId: item.filingId,
    description: item.description,
    amount: item.amount,
    createdAt: iso(item.createdAt)!,
  };
}

export function serialiseBillingInvoice(invoice: {
  id: string;
  firmId: string;
  clientId: string;
  number: string;
  type: string;
  status: string;
  issueDate: Date;
  dueDate: Date | null;
  subtotal: number;
  total: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items?: Parameters<typeof serialiseBillingInvoiceItem>[0][];
  client?: { id: string; name: string } | null;
  paid?: number;
}): BillingInvoice {
  const paid = invoice.paid ?? 0;
  return {
    id: invoice.id,
    firmId: invoice.firmId,
    clientId: invoice.clientId,
    number: invoice.number,
    type: invoice.type as BillingInvoice['type'],
    status: invoice.status as BillingInvoice['status'],
    issueDate: iso(invoice.issueDate)!,
    dueDate: iso(invoice.dueDate),
    subtotal: invoice.subtotal,
    total: invoice.total,
    notes: invoice.notes,
    createdAt: iso(invoice.createdAt)!,
    updatedAt: iso(invoice.updatedAt)!,
    items: invoice.items ? invoice.items.map(serialiseBillingInvoiceItem) : undefined,
    client: invoice.client ?? undefined,
    paid,
    outstanding: Math.max(0, invoice.total - paid),
  };
}

export function serialiseSubscription(subscription: {
  id: string;
  firmId: string;
  clientId: string;
  amount: number;
  cycle: string;
  startDate: Date;
  nextDueDate: Date;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  client?: { id: string; name: string } | null;
}): Subscription {
  return {
    id: subscription.id,
    firmId: subscription.firmId,
    clientId: subscription.clientId,
    amount: subscription.amount,
    cycle: subscription.cycle as Subscription['cycle'],
    startDate: iso(subscription.startDate)!,
    nextDueDate: iso(subscription.nextDueDate)!,
    active: subscription.active,
    notes: subscription.notes,
    createdAt: iso(subscription.createdAt)!,
    updatedAt: iso(subscription.updatedAt)!,
    client: subscription.client ?? undefined,
  };
}

export function serialisePaymentRequest(request: {
  id: string;
  firmId: string;
  clientId: string;
  invoiceId: string | null;
  filingId: string | null;
  amount: number;
  description: string | null;
  status: string;
  provider: string;
  providerRef: string | null;
  url: string | null;
  expiresAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  client?: { id: string; name: string } | null;
  firm?: { id: string; name: string; slug: string } | null;
}): PaymentRequest {
  return {
    id: request.id,
    firmId: request.firmId,
    clientId: request.clientId,
    invoiceId: request.invoiceId,
    filingId: request.filingId,
    amount: request.amount,
    description: request.description,
    status: request.status as PaymentRequest['status'],
    provider: request.provider as PaymentRequest['provider'],
    providerRef: request.providerRef,
    url: request.url,
    expiresAt: iso(request.expiresAt),
    paidAt: iso(request.paidAt),
    createdAt: iso(request.createdAt)!,
    updatedAt: iso(request.updatedAt)!,
    client: request.client ?? undefined,
    firm: request.firm ?? undefined,
  };
}

export function serialisePublicPaymentRequest(request: {
  id: string;
  amount: number;
  description: string | null;
  status: string;
  provider: string;
  url: string | null;
  expiresAt: Date | null;
  paidAt: Date | null;
  client?: { name: string } | null;
  invoice?: { number: string } | null;
  firm: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    brandColor: string | null;
    supportEmail: string | null;
    supportPhone: string | null;
  };
}): PublicPaymentRequest {
  return {
    id: request.id,
    amount: request.amount,
    description: request.description,
    status: request.status as PublicPaymentRequest['status'],
    provider: request.provider as PublicPaymentRequest['provider'],
    url: request.url,
    expiresAt: iso(request.expiresAt),
    paidAt: iso(request.paidAt),
    clientName: request.client?.name ?? null,
    invoiceNumber: request.invoice?.number ?? null,
    firm: {
      id: request.firm.id,
      name: request.firm.name,
      slug: request.firm.slug,
      logoUrl: request.firm.logoUrl,
      brandColor: request.firm.brandColor,
      supportEmail: request.firm.supportEmail,
      supportPhone: request.firm.supportPhone,
    },
  };
}
