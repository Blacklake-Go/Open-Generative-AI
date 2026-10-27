import 'server-only';

import { createHash } from 'node:crypto';

import { CosStorageAdapter } from './cosStorageAdapter.js';

const ACL_VALUES = new Set(['private', 'public-read', 'public-read-write']);
const CORS_METHODS = new Set(['GET', 'PUT', 'POST', 'DELETE', 'HEAD']);

const XML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

function decodeXml(value) {
  return String(value || '').replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity] || entity);
}

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[char]));
}

function tagValues(xml, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  const values = [];
  let match = pattern.exec(String(xml || ''));
  while (match) {
    values.push(decodeXml(match[1]));
    match = pattern.exec(String(xml || ''));
  }
  return values;
}

function tagValue(xml, tag) {
  return tagValues(xml, tag)[0] || '';
}

function sectionError(status, text) {
  const code = tagValue(text, 'Code') || `HTTP_${status}`;
  const message = tagValue(text, 'Message');
  return Object.assign(new Error(`COS ${code}${message ? `：${message}` : ''}`), {
    code: 'COS_BUCKET_REQUEST_FAILED',
    statusCode: status,
  });
}

function createClient(config = {}) {
  const client = new CosStorageAdapter({
    secretId: config.accessKeyId,
    secretKey: config.accessKeySecret,
    bucket: config.bucket,
    region: config.region || 'ap-guangzhou',
    endpoint: config.endpoint,
  });
  if (!client.configured) {
    throw Object.assign(new Error('桶级配置缺少 Bucket 或访问密钥'), { code: 'COS_BUCKET_CONFIG_INCOMPLETE', statusCode: 422 });
  }
  return client;
}

async function request(client, {
  method = 'get',
  queryKey = '',
  body = '',
  contentType = '',
  extraHeaders = {},
} = {}) {
  const queryParams = queryKey ? { [queryKey]: '' } : {};
  const signedHeaders = { host: client.host };
  if (body && contentType) signedHeaders['content-type'] = contentType;
  const contentMd5 = body ? createHash('md5').update(body).digest('base64') : '';
  if (contentMd5) signedHeaders['content-md5'] = contentMd5;
  for (const [name, value] of Object.entries(extraHeaders)) {
    signedHeaders[name.toLowerCase()] = value;
  }

  const auth = client.generateCosSignature({
    method,
    pathname: '/',
    queryParams,
    headers: signedHeaders,
  });

  const url = `https://${client.host}/${queryKey ? `?${queryKey}` : ''}`;
  const headers = { Host: client.host, Authorization: auth.authorization };
  if (body && contentType) headers['Content-Type'] = contentType;
  if (contentMd5) headers['Content-MD5'] = contentMd5;
  for (const [name, value] of Object.entries(extraHeaders)) headers[name] = value;

  const response = await fetch(url, {
    method: method.toUpperCase(),
    headers,
    body: body || undefined,
    cache: 'no-store',
  });
  const text = await response.text().catch(() => '');
  return { status: response.status, ok: response.ok, text };
}

async function readSection(client, queryKey) {
  const response = await request(client, { method: 'get', queryKey });
  if (response.status === 404) return null;
  if (!response.ok) throw sectionError(response.status, response.text);
  return response.text;
}

function parseAcl(xml) {
  if (!xml) return null;
  const grants = tagValues(xml, 'Grant').map((grant) => {
    const grantee = tagValue(grant, 'Grantee') || grant;
    return {
      type: tagValue(grantee, 'Type'),
      id: tagValue(grantee, 'ID'),
      displayName: tagValue(grantee, 'DisplayName'),
      uri: tagValue(grantee, 'URI'),
      permission: tagValue(grant, 'Permission'),
    };
  });
  const allUsers = grants.filter((grant) => grant.uri.includes('AllUsers'));
  let cannedAcl = 'private';
  if (allUsers.some((grant) => grant.permission === 'READ')) cannedAcl = 'public-read';
  if (allUsers.some((grant) => grant.permission === 'WRITE' || grant.permission === 'FULL_CONTROL')) cannedAcl = 'public-read-write';
  return { cannedAcl, grants };
}

function parseCors(xml) {
  if (!xml) return null;
  const rules = tagValues(xml, 'CORSRule').map((rule) => ({
    id: tagValue(rule, 'ID'),
    allowedOrigins: tagValues(rule, 'AllowedOrigin'),
    allowedMethods: tagValues(rule, 'AllowedMethod'),
    allowedHeaders: tagValues(rule, 'AllowedHeader'),
    exposeHeaders: tagValues(rule, 'ExposeHeader'),
    maxAgeSeconds: Number(tagValue(rule, 'MaxAgeSeconds')) || null,
  }));
  return { rules };
}

function parseVersioning(xml) {
  if (!xml) return null;
  return { status: tagValue(xml, 'Status') || 'Suspended' };
}

function parseEncryption(xml) {
  if (!xml) return null;
  return {
    enabled: true,
    algorithm: tagValue(xml, 'SSEAlgorithm') || 'AES256',
    kmsMasterKeyId: tagValue(xml, 'KMSMasterKeyID') || '',
  };
}

function parseReferer(xml) {
  if (!xml) return null;
  return {
    status: tagValue(xml, 'Status') || 'Disabled',
    refererType: tagValue(xml, 'RefererType') || 'White-List',
    domains: tagValues(xml, 'Domain'),
    allowEmpty: tagValue(xml, 'EmptyReferer') !== 'false',
  };
}

function parseLifecycle(xml) {
  if (!xml) return null;
  const rules = tagValues(xml, 'Rule').map((rule) => {
    const filter = tagValue(rule, 'Filter');
    const expiration = tagValue(rule, 'Expiration');
    const abort = tagValue(rule, 'AbortIncompleteMultipartUpload');
    return {
      id: tagValue(rule, 'ID'),
      prefix: filter ? tagValue(filter, 'Prefix') : tagValue(rule, 'Prefix'),
      status: tagValue(rule, 'Status') || 'Enabled',
      expirationDays: Number(tagValue(expiration, 'Days')) || null,
      abortIncompleteMultipartUploadDays: Number(tagValue(abort, 'DaysAfterInitiation') || tagValue(abort, 'Days')) || null,
      transitions: tagValues(rule, 'Transition').map((transition) => ({
        days: Number(tagValue(transition, 'Days')) || null,
        storageClass: tagValue(transition, 'StorageClass'),
      })),
    };
  });
  return { rules };
}

function parsePolicy(text) {
  if (!text) return null;
  try {
    const document = JSON.parse(text);
    return {
      document,
      statementCount: Array.isArray(document?.statement) ? document.statement.length : 0,
    };
  } catch {
    return { document: null, statementCount: 0, raw: text.slice(0, 2000) };
  }
}

async function collectSection(loader, parser, errors, name) {
  try {
    const xml = await loader();
    return parser(xml);
  } catch (error) {
    errors[name] = String(error?.message || '读取失败').slice(0, 240);
    return null;
  }
}

export async function testCosBucketAdminCredentials(config = {}) {
  const client = createClient(config);
  const response = await request(client, { method: 'head' });
  if (!response.ok) throw sectionError(response.status, response.text);
  return { ok: true, host: client.host };
}

export async function readCosBucketConfig(config = {}) {
  const client = createClient(config);
  const errors = {};
  const [acl, cors, versioning, encryption, referer, lifecycle, policy] = await Promise.all([
    collectSection(() => readSection(client, 'acl'), parseAcl, errors, 'acl'),
    collectSection(() => readSection(client, 'cors'), parseCors, errors, 'cors'),
    collectSection(() => readSection(client, 'versioning'), parseVersioning, errors, 'versioning'),
    collectSection(() => readSection(client, 'encryption'), parseEncryption, errors, 'encryption'),
    collectSection(() => readSection(client, 'referer'), parseReferer, errors, 'referer'),
    collectSection(() => readSection(client, 'lifecycle'), parseLifecycle, errors, 'lifecycle'),
    collectSection(() => readSection(client, 'policy'), parsePolicy, errors, 'policy'),
  ]);

  const errorCount = Object.keys(errors).length;
  if (errorCount === 7) {
    throw Object.assign(new Error(Object.values(errors)[0] || '桶级配置读取失败'), {
      code: 'COS_BUCKET_ADMIN_UNAVAILABLE',
      statusCode: 502,
    });
  }

  return {
    host: client.host,
    bucket: client.bucket,
    region: client.region,
    acl,
    cors,
    versioning,
    encryption,
    referer,
    lifecycle,
    policy,
    errors,
    fetchedAt: new Date().toISOString(),
  };
}

function normalizeCorsRules(value) {
  const rules = Array.isArray(value?.rules) ? value.rules : [];
  if (rules.length > 100) {
    throw Object.assign(new Error('CORS 规则最多 100 条'), { code: 'COS_CORS_INVALID', statusCode: 422 });
  }
  return rules.map((rule) => {
    const allowedOrigins = (Array.isArray(rule.allowedOrigins) ? rule.allowedOrigins : [rule.allowedOrigins])
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const allowedMethods = (Array.isArray(rule.allowedMethods) ? rule.allowedMethods : [rule.allowedMethods])
      .map((item) => String(item || '').trim().toUpperCase())
      .filter(Boolean);
    if (!allowedOrigins.length) {
      throw Object.assign(new Error('CORS 规则至少需要一个来源'), { code: 'COS_CORS_INVALID', statusCode: 422 });
    }
    if (!allowedMethods.length || allowedMethods.some((method) => !CORS_METHODS.has(method))) {
      throw Object.assign(new Error('CORS 方法仅支持 GET / PUT / POST / DELETE / HEAD'), { code: 'COS_CORS_INVALID', statusCode: 422 });
    }
    return {
      id: String(rule.id || '').trim(),
      allowedOrigins,
      allowedMethods,
      allowedHeaders: (Array.isArray(rule.allowedHeaders) ? rule.allowedHeaders : [rule.allowedHeaders])
        .map((item) => String(item || '').trim())
        .filter(Boolean),
      exposeHeaders: (Array.isArray(rule.exposeHeaders) ? rule.exposeHeaders : [rule.exposeHeaders])
        .map((item) => String(item || '').trim())
        .filter(Boolean),
      maxAgeSeconds: Math.max(0, Math.min(315360000, Number(rule.maxAgeSeconds) || 0)),
    };
  });
}

function buildCorsXml(rules) {
  const body = rules.map((rule) => [
    '<CORSRule>',
    rule.id ? `<ID>${escapeXml(rule.id)}</ID>` : '',
    ...rule.allowedOrigins.map((origin) => `<AllowedOrigin>${escapeXml(origin)}</AllowedOrigin>`),
    ...rule.allowedMethods.map((method) => `<AllowedMethod>${escapeXml(method)}</AllowedMethod>`),
    ...rule.allowedHeaders.map((header) => `<AllowedHeader>${escapeXml(header)}</AllowedHeader>`),
    ...rule.exposeHeaders.map((header) => `<ExposeHeader>${escapeXml(header)}</ExposeHeader>`),
    rule.maxAgeSeconds ? `<MaxAgeSeconds>${rule.maxAgeSeconds}</MaxAgeSeconds>` : '',
    '</CORSRule>',
  ].join('')).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration>${body}</CORSConfiguration>`;
}

function buildLifecycleXml(rules) {
  const body = (Array.isArray(rules) ? rules : []).map((rule) => {
    const days = Number(rule.expirationDays);
    const abortDays = Number(rule.abortIncompleteMultipartUploadDays);
    const transitions = Array.isArray(rule.transitions) ? rule.transitions : [];
    if (!rule.id && !rule.prefix && !days && !abortDays && !transitions.length) return '';
    return [
      '<Rule>',
      rule.id ? `<ID>${escapeXml(rule.id)}</ID>` : '',
      `<Filter><Prefix>${escapeXml(rule.prefix || '')}</Prefix></Filter>`,
      `<Status>${rule.status === 'Disabled' ? 'Disabled' : 'Enabled'}</Status>`,
      days ? `<Expiration><Days>${Math.max(1, Math.min(3650, days))}</Days></Expiration>` : '',
      abortDays ? `<AbortIncompleteMultipartUpload><DaysAfterInitiation>${Math.max(1, Math.min(3650, abortDays))}</DaysAfterInitiation></AbortIncompleteMultipartUpload>` : '',
      ...transitions.map((transition) => {
        const transitionDays = Number(transition.days);
        if (!transitionDays || !transition.storageClass) return '';
        return `<Transition><Days>${Math.max(1, Math.min(3650, transitionDays))}</Days><StorageClass>${escapeXml(transition.storageClass)}</StorageClass></Transition>`;
      }),
      '</Rule>',
    ].join('');
  }).filter(Boolean).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><LifecycleConfiguration>${body}</LifecycleConfiguration>`;
}

async function putSection(client, queryKey, body, contentType = 'application/xml') {
  const response = await request(client, { method: 'put', queryKey, body, contentType });
  if (!response.ok) throw sectionError(response.status, response.text);
  return true;
}

async function deleteSection(client, queryKey) {
  const response = await request(client, { method: 'delete', queryKey });
  if (!response.ok && response.status !== 404) throw sectionError(response.status, response.text);
  return true;
}

export async function updateCosBucketAcl(config = {}, value = {}) {
  const cannedAcl = String(value?.cannedAcl || value || '').trim();
  if (!ACL_VALUES.has(cannedAcl)) {
    throw Object.assign(new Error('访问权限仅支持 private / public-read / public-read-write'), { code: 'COS_ACL_INVALID', statusCode: 422 });
  }
  const client = createClient(config);
  const response = await request(client, {
    method: 'put',
    queryKey: 'acl',
    extraHeaders: { 'x-cos-acl': cannedAcl },
  });
  if (!response.ok) throw sectionError(response.status, response.text);
  return true;
}

export async function updateCosBucketCors(config = {}, value = {}) {
  const rules = normalizeCorsRules(value);
  const client = createClient(config);
  return putSection(client, 'cors', buildCorsXml(rules));
}

export async function updateCosBucketVersioning(config = {}, value = {}) {
  const status = String(value?.status || value || '').trim();
  if (!['Enabled', 'Suspended'].includes(status)) {
    throw Object.assign(new Error('版本控制仅支持 Enabled / Suspended'), { code: 'COS_VERSIONING_INVALID', statusCode: 422 });
  }
  const client = createClient(config);
  return putSection(client, 'versioning', `<?xml version="1.0" encoding="UTF-8"?><VersioningConfiguration><Status>${status}</Status></VersioningConfiguration>`);
}

export async function updateCosBucketEncryption(config = {}, value = {}) {
  const enabled = value?.enabled !== false && String(value?.algorithm || value || 'AES256') !== 'none';
  const client = createClient(config);
  if (!enabled) return deleteSection(client, 'encryption');
  const algorithm = String(value?.algorithm || 'AES256').trim();
  if (!['AES256', 'aws:kms'].includes(algorithm)) {
    throw Object.assign(new Error('加密算法仅支持 AES256 / aws:kms'), { code: 'COS_ENCRYPTION_INVALID', statusCode: 422 });
  }
  const kms = algorithm === 'aws:kms' && value?.kmsMasterKeyId
    ? `<KMSMasterKeyID>${escapeXml(value.kmsMasterKeyId)}</KMSMasterKeyID>`
    : '';
  return putSection(
    client,
    'encryption',
    `<?xml version="1.0" encoding="UTF-8"?><ServerSideEncryptionConfiguration><Rule><ApplyServerSideEncryptionByDefault><SSEAlgorithm>${algorithm}</SSEAlgorithm>${kms}</ApplyServerSideEncryptionByDefault></Rule></ServerSideEncryptionConfiguration>`
  );
}

export async function updateCosBucketReferer(config = {}, value = {}) {
  const enabled = Boolean(value?.enabled);
  const domains = (Array.isArray(value?.domains) ? value.domains : [])
    .map((domain) => String(domain || '').trim())
    .filter(Boolean)
    .slice(0, 100);
  const allowEmpty = value?.allowEmpty !== false;
  const client = createClient(config);
  const xml = `<?xml version="1.0" encoding="UTF-8"?><RefererConfiguration><Status>${enabled ? 'Enabled' : 'Disabled'}</Status><RefererType>White-List</RefererType><DomainList>${domains.map((domain) => `<Domain>${escapeXml(domain)}</Domain>`).join('')}</DomainList><EmptyReferer>${allowEmpty ? 'true' : 'false'}</EmptyReferer></RefererConfiguration>`;
  return putSection(client, 'referer', xml);
}

export async function updateCosBucketLifecycle(config = {}, value = {}) {
  const rules = Array.isArray(value?.rules) ? value.rules : [];
  const xml = buildLifecycleXml(rules);
  const client = createClient(config);
  if (!rules.some((rule) => rule?.id || rule?.prefix || Number(rule?.expirationDays) || Number(rule?.abortIncompleteMultipartUploadDays) || rule?.transitions?.length)) {
    return deleteSection(client, 'lifecycle');
  }
  return putSection(client, 'lifecycle', xml);
}

export async function updateCosBucketPolicy(config = {}, value = {}) {
  const document = value?.document ?? value;
  const client = createClient(config);
  if (document === null || document === '' || (typeof document === 'object' && Object.keys(document).length === 0)) {
    return deleteSection(client, 'policy');
  }
  const text = typeof document === 'string' ? document : JSON.stringify(document);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Object.assign(new Error('桶策略必须是合法 JSON'), { code: 'COS_POLICY_INVALID', statusCode: 422 });
  }
  const statements = Array.isArray(parsed?.statement) ? parsed.statement : null;
  if (!statements || !statements.length) {
    throw Object.assign(new Error('桶策略至少包含一条 statement'), { code: 'COS_POLICY_INVALID', statusCode: 422 });
  }
  return putSection(client, 'policy', JSON.stringify(parsed), 'application/json');
}
