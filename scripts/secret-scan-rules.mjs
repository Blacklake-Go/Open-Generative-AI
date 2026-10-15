const credentialPatterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['stripe-secret', /(?:sk|rk)_live_[A-Za-z0-9]{12,}/],
  ['webhook-secret', /whsec_[A-Za-z0-9]{16,}/],
  ['aws-access-key-id', /AKIA[0-9A-Z]{16}/],
  ['aliyun-access-key-id', /LTAI[A-Za-z0-9]{16,}/],
  ['tencent-secret-id', /AKID[A-Za-z0-9]{32}/],
  ['google-api-key', /AIza[0-9A-Za-z_-]{35}/],
  ['github-token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['slack-token', /xox[baprs]-[A-Za-z0-9-]{20,}/],
  ['huggingface-token', /hf_[A-Za-z0-9]{30,}/],
  ['postgres-connection-string', /postgres(?:ql)?:\/\/[^/\s:@]+:[^@\s/]+@/i],
  ['azure-storage-key', /AccountKey=[A-Za-z0-9+/=]{32,}/i],
];

const namedCredentialAssignment = /\b(?:[a-z0-9]+[_-])?(?:api[_-]?key|secret(?:[_-]?key)?|token|access[_-]?key|client[_-]?secret|private[_-]?key|password|credential)\b\s*[:=]\s*['"`]([A-Za-z0-9+/_=-]{28,})['"`]/gi;

function shannonEntropy(value) {
  const frequencies = new Map();
  for (const character of value) frequencies.set(character, (frequencies.get(character) || 0) + 1);
  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

export function findSecretFindings(content) {
  const source = String(content || '');
  const findings = new Set();
  for (const [name, pattern] of credentialPatterns) {
    if (pattern.test(source)) findings.add(name);
  }
  for (const match of source.matchAll(namedCredentialAssignment)) {
    if (match[1].length >= 28 && shannonEntropy(match[1]) >= 3.4) {
      findings.add('high-entropy-credential-assignment');
      break;
    }
  }
  return [...findings];
}
