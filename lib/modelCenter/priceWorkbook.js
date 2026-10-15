import { deflateRawSync, inflateRawSync } from 'node:zlib';

export const PRICE_IMPORT_COLUMNS = Object.freeze([
  'canonical_model_id', 'provider_id', 'provider_model_id', 'provider_model_version',
  'provider_endpoint', 'task_types', 'input_types', 'output_types', 'resolutions', 'durations', 'qualities', 'regions',
  'license_requirements', 'verified_license_conditions',
  'price_version_id', 'price_version_no', 'price_type', 'billing_unit', 'currency',
  'price_config_json', 'applicability_json', 'official_price_version_id', 'channel_price_version_id',
  'official_billing_unit', 'official_currency', 'official_price_json', 'official_source_url',
  'official_source_api', 'official_source_observed_at', 'channel_billing_unit', 'channel_currency',
  'channel_price_json', 'channel_source_url', 'channel_source_api', 'channel_source_observed_at',
  'conservative_upper_bound_json', 'conservative_upper_bound_currency',
  'conservative_upper_bound_expires_at', 'conservative_upper_bound_reason',
  'site_price_cny', 'credits', 'source_url', 'source_api', 'source_observed_at', 'fetched_at',
  'effective_at', 'expires_at', 'price_status', 'mapping_status', 'enabled',
  'override_reason', 'override_expires_at',
]);

const FORMULA_PREFIX = /^[\s\u0000-\u001f]*[=+@-]/;
const REQUIRED_IMPORT_COLUMNS = new Set(['canonical_model_id', 'provider_id', 'provider_model_id']);

function validateHeaders(headers) {
  const missing = [...REQUIRED_IMPORT_COLUMNS].filter((key) => !headers.includes(key));
  if (missing.length) throw Object.assign(new Error(`导入文件缺少必填列：${missing.join(', ')}`), { code: 'IMPORT_REQUIRED_COLUMNS_MISSING' });
}

function validateCellText(value) {
  const text = String(value ?? '');
  if (FORMULA_PREFIX.test(text)) {
    throw Object.assign(new Error('导入文件含有公式样式的单元格，已拒绝以防表格公式注入'), { code: 'IMPORT_FORMULA_NOT_ALLOWED' });
  }
  return text;
}

function safeSpreadsheetText(value) {
  const text = String(value ?? '');
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

function xmlEscape(value) {
  return safeSpreadsheetText(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function stringifyCsvCell(value) {
  const text = safeSpreadsheetText(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildCsv(rows, columns = PRICE_IMPORT_COLUMNS) {
  return [columns.map(stringifyCsvCell).join(','), ...rows.map((row) => columns.map((key) => stringifyCsvCell(row[key])).join(','))].join('\r\n');
}

export function parseCsv(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const records = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
      if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value !== '')) records.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw Object.assign(new Error('CSV 存在未闭合的引号'), { code: 'IMPORT_CSV_INVALID' });
  row.push(cell);
  if (row.some((value) => value !== '')) records.push(row);
  if (!records.length) return [];
  const headers = records.shift().map((value) => String(value).trim());
  if (new Set(headers).size !== headers.length) throw Object.assign(new Error('导入文件包含重复列名'), { code: 'IMPORT_DUPLICATE_HEADER' });
  validateHeaders(headers);
  return records.map((values, index) => Object.fromEntries(headers.map((header, column) => [header, validateCellText(values[column] ?? '')])
    .concat([['__row_number', index + 2]])));
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function zipStore(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTime();
  for (const [name, rawContent] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const content = Buffer.from(rawContent, 'utf8');
    const compressed = deflateRawSync(content);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function columnName(index) {
  let n = index + 1;
  let name = '';
  while (n > 0) { const rem = (n - 1) % 26; name = String.fromCharCode(65 + rem) + name; n = Math.floor((n - 1) / 26); }
  return name;
}

function columnIndex(reference) {
  const letters = String(reference || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase() || '';
  let index = 0;
  for (const char of letters) index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

export function buildXlsx(rows, columns = PRICE_IMPORT_COLUMNS) {
  const allRows = [columns, ...rows.map((row) => columns.map((key) => row[key] ?? ''))];
  const sheetRows = allRows.map((values, rowIndex) => {
    const cells = values.map((value, columnIndexValue) => {
      const reference = `${columnName(columnIndexValue)}${rowIndex + 1}`;
      return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
  return zipStore([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="价格映射" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', sheet],
  ]);
}

function decodeXml(value) {
  return String(value || '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'").replaceAll('&amp;', '&');
}

function unzipEntries(buffer) {
  const MAX_ENTRIES = 64;
  const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
  if (buffer.length < 22 || buffer.length > 10 * 1024 * 1024) {
    throw Object.assign(new Error('XLSX 文件大小或 ZIP 结构无效'), { code: 'IMPORT_XLSX_INVALID' });
  }
  const endSignature = 0x06054b50;
  let eocdOffset = -1;
  const min = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === endSignature) { eocdOffset = offset; break; }
  }
  if (eocdOffset < 0) throw Object.assign(new Error('XLSX 不是有效的 ZIP 工作簿'), { code: 'IMPORT_XLSX_INVALID' });
  const count = buffer.readUInt16LE(eocdOffset + 10);
  let cursor = buffer.readUInt32LE(eocdOffset + 16);
  if (count > MAX_ENTRIES || cursor < 0 || cursor >= eocdOffset) {
    throw Object.assign(new Error('XLSX 包含过多文件或目录偏移无效'), { code: 'IMPORT_XLSX_INVALID' });
  }
  const entries = new Map();
  let totalBytes = 0;
  for (let i = 0; i < count; i += 1) {
    if (cursor + 46 > buffer.length) throw Object.assign(new Error('XLSX 目录被截断'), { code: 'IMPORT_XLSX_INVALID' });
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw Object.assign(new Error('XLSX 目录结构无效'), { code: 'IMPORT_XLSX_INVALID' });
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    if ((flags & 0x0001) !== 0 || uncompressedSize > MAX_ENTRY_BYTES
      || totalBytes + uncompressedSize > MAX_TOTAL_BYTES) {
      throw Object.assign(new Error('XLSX 条目使用了不支持的加密或解压大小超限'), { code: 'IMPORT_XLSX_SIZE_LIMIT' });
    }
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    if (!nameLength || cursor + 46 + nameLength + extraLength + commentLength > buffer.length
      || localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw Object.assign(new Error('XLSX 文件条目偏移无效'), { code: 'IMPORT_XLSX_INVALID' });
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > buffer.length) throw Object.assign(new Error('XLSX 数据块被截断'), { code: 'IMPORT_XLSX_INVALID' });
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const content = method === 0 ? compressed : method === 8
      ? inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES }) : null;
    if (!content) throw Object.assign(new Error('XLSX 使用了不支持的 ZIP 压缩方式'), { code: 'IMPORT_XLSX_UNSUPPORTED_COMPRESSION' });
    if (content.length !== uncompressedSize) throw Object.assign(new Error('XLSX 解压大小与目录信息不一致'), { code: 'IMPORT_XLSX_INVALID' });
    totalBytes += content.length;
    entries.set(name, content.toString('utf8'));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function parseXmlRows(sheetXml, sharedStrings) {
  const rows = [];
  const rowMatches = sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g);
  for (const rowMatch of rowMatches) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const reference = attrs.match(/\br="([^"]+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] || '';
      const index = columnIndex(reference);
      if (index < 0) continue;
      const body = cellMatch[2] || '';
      if (/<f\b/.test(body)) throw Object.assign(new Error('XLSX 导入不接受包含公式的单元格'), { code: 'IMPORT_FORMULA_NOT_ALLOWED' });
      const value = type === 'inlineStr'
        ? [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join('')
        : decodeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '');
      row[index] = validateCellText(type === 's' ? sharedStrings[Number(value)] ?? '' : value);
    }
    rows.push(row.map((value) => value ?? ''));
  }
  if (rows.length < 1) throw Object.assign(new Error('XLSX 工作表没有表格行'), { code: 'IMPORT_XLSX_EMPTY' });
  return rows;
}

export function parseXlsx(input) {
  const entries = unzipEntries(Buffer.isBuffer(input) ? input : Buffer.from(input));
  const sheetPath = [...entries.keys()].find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetPath) throw Object.assign(new Error('XLSX 中没有工作表'), { code: 'IMPORT_XLSX_EMPTY' });
  const sharedXml = entries.get('xl/sharedStrings.xml') || '';
  const sharedStrings = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((item) =>
    [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join(''));
  const matrix = parseXmlRows(entries.get(sheetPath), sharedStrings);
  const headers = matrix.shift().map((value) => String(value).trim());
  if (new Set(headers).size !== headers.length) throw Object.assign(new Error('导入文件包含重复列名'), { code: 'IMPORT_DUPLICATE_HEADER' });
  validateHeaders(headers);
  return matrix.map((values, index) => Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ''])
    .concat([['__row_number', index + 2]])));
}
