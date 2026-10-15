const COPY = {
  en: {
    password: { title: 'Reset your password', intro: 'Use this security code to choose a new password for your SupDance account.', label: 'PASSWORD RESET CODE', note: 'If you did not request a password reset, you can safely ignore this email. Your password will not change.', subject: 'Your SupDance password reset code' },
    username: { title: 'Recover your account name', intro: 'Use this security code to recover the sign-in name linked to your SupDance account.', label: 'ACCOUNT RECOVERY CODE', note: 'If you did not request account recovery, you can safely ignore this email. Never share this code with anyone.', subject: 'Your SupDance account recovery code' },
    verify: { title: 'Verify your email address', intro: 'Use this security code to verify your email address for SupDance.', label: 'EMAIL VERIFICATION CODE', note: 'If you did not request this code, you can safely ignore this email.', subject: 'Your SupDance email verification code' },
    lead: 'Your one-time security code', expiry: 'This code expires in 10 minutes.', footer: 'SupDance · AI creation, made yours', safety: 'For your security, SupDance will never ask you to share this code.'
  },
  'zh-cn': {
    password: { title: '重置您的密码', intro: '使用以下安全验证码，为您的 SupDance 账户设置新密码。', label: '密码重置验证码', note: '如果这不是您发起的操作，请忽略此邮件。您的密码不会因此更改。', subject: 'SupDance 密码重置验证码' },
    username: { title: '找回您的账号名称', intro: '使用以下安全验证码，找回与 SupDance 账户关联的登录账号信息。', label: '账号找回验证码', note: '如果这不是您发起的操作，请忽略此邮件。请勿向任何人透露验证码。', subject: 'SupDance 账号找回验证码' },
    verify: { title: '验证您的邮箱', intro: '使用以下安全验证码，完成 SupDance 邮箱验证。', label: '邮箱验证码', note: '如果这不是您发起的操作，请忽略此邮件。', subject: 'SupDance 邮箱验证码' },
    lead: '您的专属安全验证码', expiry: '验证码将在 10 分钟后失效。', footer: 'SupDance · 让创作灵感自由生长', safety: '为保障账户安全，SupDance 不会向您索取此验证码。'
  },
  'zh-tw': {
    password: { title: '重設您的密碼', intro: '使用以下安全驗證碼，為您的 SupDance 帳戶設定新密碼。', label: '密碼重設驗證碼', note: '如果這不是您發起的操作，請忽略此郵件。您的密碼不會因此更改。', subject: 'SupDance 密碼重設驗證碼' },
    username: { title: '找回您的帳號名稱', intro: '使用以下安全驗證碼，找回與 SupDance 帳戶關聯的登入帳號資訊。', label: '帳號找回驗證碼', note: '如果這不是您發起的操作，請忽略此郵件。請勿向任何人透露驗證碼。', subject: 'SupDance 帳號找回驗證碼' },
    verify: { title: '驗證您的電子郵件', intro: '使用以下安全驗證碼，完成 SupDance 電子郵件驗證。', label: '電子郵件驗證碼', note: '如果這不是您發起的操作，請忽略此郵件。', subject: 'SupDance 電子郵件驗證碼' },
    lead: '您的專屬安全驗證碼', expiry: '驗證碼將於 10 分鐘後失效。', footer: 'SupDance · 讓創作靈感自由生長', safety: '為保障帳戶安全，SupDance 不會向您索取此驗證碼。'
  }
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function buildAuthRecoveryEmail({ code, flow = 'verify', locale = 'zh-CN' }) {
  const language = String(locale || '').toLowerCase();
  const copy = COPY[language] || (language.startsWith('zh-tw') ? COPY['zh-TW'] : language.startsWith('zh') ? COPY['zh-CN'] : COPY.en);
  const content = copy[flow] || copy.verify;
  const safeCode = escapeHtml(code);
  const text = `${content.title}\n\n${content.intro}\n\n${copy.lead}: ${code}\n${copy.expiry}\n\n${content.note}\n${copy.safety}\n\n${copy.footer}`;
  const html = `<!doctype html><html lang="${language.startsWith('zh') ? 'zh' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:32px 12px;background:#f2f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#14243a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5edf5;border-radius:20px;overflow:hidden"><tr><td style="padding:28px 36px;background:#071827;background-image:linear-gradient(120deg,#071827,#10384c 72%,#126a72);"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="44" height="44" align="center" valign="middle" style="border-radius:13px;background:#15c6bd;color:#04242b;font-weight:800;font-size:18px;letter-spacing:-1px">S</td><td style="padding-left:12px;color:#fff;font-size:19px;font-weight:700;letter-spacing:.2px">SupDance</td></tr></table></td></tr><tr><td style="padding:38px 36px 16px"><div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.5px;color:#168b91;text-transform:uppercase">${escapeHtml(content.label)}</div><h1 style="margin:10px 0 12px;font-size:27px;line-height:1.25;letter-spacing:-.5px;color:#102238">${escapeHtml(content.title)}</h1><p style="margin:0;color:#58697d;font-size:15px;line-height:1.7">${escapeHtml(content.intro)}</p></td></tr><tr><td style="padding:18px 36px 24px"><div style="padding:22px 16px;border:1px solid #d8eef0;border-radius:14px;background:#f3fbfb;text-align:center"><div style="font-size:11px;line-height:16px;color:#637c88;letter-spacing:1.1px">${escapeHtml(copy.lead)}</div><div style="padding-top:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:36px;line-height:44px;font-weight:800;letter-spacing:9px;color:#087e86">${safeCode}</div><div style="padding-top:7px;font-size:12px;line-height:18px;color:#70838e">${escapeHtml(copy.expiry)}</div></div></td></tr><tr><td style="padding:0 36px 30px"><p style="margin:0 0 10px;color:#657486;font-size:13px;line-height:1.65">${escapeHtml(content.note)}</p><p style="margin:0;color:#8794a2;font-size:12px;line-height:1.6">${escapeHtml(copy.safety)}</p></td></tr><tr><td style="padding:20px 36px;border-top:1px solid #edf1f5;background:#fbfcfd;color:#93a0ae;font-size:11px;line-height:1.6">${escapeHtml(copy.footer)}<br>This is an automated message. Please do not reply.</td></tr></table></body></html>`;
  return { subject: content.subject, text, html };
}
