const COPY = {
  en: {
    password: { title: 'Reset your password', intro: 'Use this security code to choose a new password for your SupDance account.', label: 'PASSWORD RESET CODE', note: 'If you did not request a password reset, you can safely ignore this email. Your password will not change.', subject: 'Your SupDance password reset code' },
    username: { title: 'Recover your account name', intro: 'Use this security code to recover the sign-in name linked to your SupDance account.', label: 'ACCOUNT RECOVERY CODE', note: 'If you did not request account recovery, you can safely ignore this email. Never share this code with anyone.', subject: 'Your SupDance account recovery code' },
    verify: { title: 'Verify your email address', intro: 'Use this security code to verify your email address for SupDance.', label: 'EMAIL VERIFICATION CODE', note: 'If you did not request this code, you can safely ignore this email.', subject: 'Your SupDance email verification code' },
    lead: 'YOUR ONE-TIME SECURITY CODE', expiry: 'This code expires in 10 minutes.', footer: 'SupDance · Next-Gen Generative AI Creative Platform', safety: 'For your security, SupDance will never ask you to share this code.'
  },
  'zh-cn': {
    password: { title: '重置您的密码', intro: '使用以下安全验证码，为您的 SupDance 账户设置新密码。', label: '密码重置验证码', note: '如果这不是您发起的操作，请忽略此邮件。您的密码不会因此更改。', subject: 'SupDance 密码重置验证码' },
    username: { title: '找回您的账号名称', intro: '使用以下安全验证码，找回与 SupDance 账户关联的登录账号信息。', label: '账号找回验证码', note: '如果这不是您发起的操作，请忽略此邮件。请勿向任何人透露验证码。', subject: 'SupDance 账号找回验证码' },
    verify: { title: '验证您的邮箱', intro: '使用以下安全验证码，完成 SupDance 邮箱验证。', label: '邮箱验证码', note: '如果这不是您发起的操作，请忽略此邮件。', subject: 'SupDance 邮箱验证码' },
    lead: '您的专属安全验证码', expiry: '验证码将在 10 分钟后失效。', footer: 'SupDance · 让创作灵感自由生长', safety: '为保障账户安全，SupDance 官方绝不会向您索取此验证码。'
  },
  'zh-tw': {
    password: { title: '重設您的密碼', intro: '使用以下安全驗證碼，為您的 SupDance 帳戶設定新密碼。', label: '密碼重設驗證碼', note: '如果這不是您發起的操作，請忽略此郵件。您的密碼不會因此更改。', subject: 'SupDance 密碼重設驗證碼' },
    username: { title: '找回您的帳號名稱', intro: '使用以下安全驗證碼，找回與 SupDance 帳戶關聯的登入帳號資訊。', label: '帳號找回驗證碼', note: '如果這不是您發起的操作，請忽略此郵件。請勿向任何人透露驗證碼。', subject: 'SupDance 帳號找回驗證碼' },
    verify: { title: '驗證您的電子郵件', intro: '使用以下安全驗證碼，完成 SupDance 電子郵件驗證。', label: '電子郵件驗證碼', note: '如果這不是您發起的操作，請忽略此郵件。', subject: 'SupDance 電子郵件驗證碼' },
    lead: '您的專屬安全驗證碼', expiry: '驗證碼將於 10 分鐘後失效。', footer: 'SupDance · 讓創作靈感自由生長', safety: '為保障帳戶安全，SupDance 官方絕不會向您索取此驗證碼。'
  }
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function buildAuthRecoveryEmail({ code, flow = 'verify', locale = 'zh-CN' }) {
  const language = String(locale || '').toLowerCase();
  const copy = COPY[language] || (language.startsWith('zh-tw') || language.startsWith('zh-hk') || language.startsWith('zh-mo') ? COPY['zh-tw'] : language.startsWith('zh') ? COPY['zh-cn'] : COPY.en) || COPY.en;
  const content = copy[flow] || copy.verify;
  const safeCode = escapeHtml(code);
  const text = `${content.title}\n\n${content.intro}\n\n${copy.lead}: ${code}\n${copy.expiry}\n\n${content.note}\n${copy.safety}\n\n${copy.footer}`;

  const html = `<!doctype html>
<html lang="${language.startsWith('zh') ? 'zh' : 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark only">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHtml(content.subject)}</title>
  <style>
    :root { color-scheme: dark only; supported-color-schemes: dark; }
    body { margin: 0; padding: 0; background-color: #0a0b0d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; }
    img { border: 0; line-height: 100%; outline: none; text-decoration: none; }
  </style>
</head>
<body style="margin:0;padding:32px 12px;background-color:#0a0b0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ededf0;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;margin:0 auto;background-color:#131519;border:1px solid #23272f;border-radius:16px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.6);">
    <!-- Brand Header -->
    <tr>
      <td style="padding:28px 36px 24px;background-color:#181b22;border-bottom:1px solid #23272f;">
        <table role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <td width="36" height="36" align="center" valign="middle" style="border-radius:10px;background:linear-gradient(135deg,#e11d74 0%,#ff2d88 100%);color:#ffffff;font-weight:800;font-size:18px;letter-spacing:-0.5px;box-shadow:0 4px 12px rgba(225,29,116,0.35);">
              S
            </td>
            <td style="padding-left:14px;color:#ededf0;font-size:19px;font-weight:700;letter-spacing:-0.3px;">
              SupDance
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Main Content -->
    <tr>
      <td style="padding:36px 36px 16px;">
        <div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.5px;color:#e11d74;text-transform:uppercase;">
          ${escapeHtml(content.label)}
        </div>
        <h1 style="margin:12px 0 14px;font-size:25px;line-height:1.3;letter-spacing:-0.4px;color:#ededf0;font-weight:700;">
          ${escapeHtml(content.title)}
        </h1>
        <p style="margin:0;color:#9aa0a6;font-size:15px;line-height:1.65;">
          ${escapeHtml(content.intro)}
        </p>
      </td>
    </tr>
    <!-- 6-digit Code Well -->
    <tr>
      <td style="padding:16px 36px 28px;">
        <div style="padding:24px 20px;border:1px solid #23272f;border-radius:12px;background-color:#0d0e12;text-align:center;">
          <div style="font-size:11px;line-height:16px;color:#70757e;letter-spacing:1.2px;text-transform:uppercase;font-weight:600;">
            ${escapeHtml(copy.lead)}
          </div>
          <div style="padding-top:12px;padding-bottom:4px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;font-size:40px;line-height:48px;font-weight:800;letter-spacing:10px;color:#e11d74;">
            ${safeCode}
          </div>
          <div style="padding-top:8px;font-size:12px;line-height:18px;color:#70757e;">
            ${escapeHtml(copy.expiry)}
          </div>
        </div>
      </td>
    </tr>
    <!-- Security Notes -->
    <tr>
      <td style="padding:0 36px 32px;">
        <p style="margin:0 0 10px;color:#9aa0a6;font-size:13px;line-height:1.6;">
          ${escapeHtml(content.note)}
        </p>
        <p style="margin:0;color:#70757e;font-size:12px;line-height:1.6;">
          ${escapeHtml(copy.safety)}
        </p>
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="padding:20px 36px;border-top:1px solid #23272f;background-color:#0d0e12;color:#70757e;font-size:11px;line-height:1.65;text-align:center;">
        ${escapeHtml(copy.footer)}<br>
        This is an automated security transmission. Please do not reply directly to this email.
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: content.subject, text, html };
}
