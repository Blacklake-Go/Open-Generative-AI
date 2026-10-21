'use client';

/**
 * 官方高保真第三方品牌矢量图标库 (Official Brand Vector SVGs)
 * 来源：各品牌官方设计系统与开放平台标准资产
 * - 微信 (WeChat): 腾讯官方 TDesign / WeDesign 矢量规范
 * - QQ: 腾讯官方 TDesign / QQ互联官方标准矢量
 * - 抖音 (Douyin): 字节跳动 Semi Design (@douyinfe/semi-icons) 官方 3D 拟态音符
 * - 哔哩哔哩 (Bilibili): Bilibili 官方开放平台标准小电视
 * - Google: 官方四色 G 标
 * - X (Twitter): 官方 𝕏 矢量
 * - TikTok: 官方双色色偏音符
 * - Instagram: 官方渐变多彩镜头
 */

export function GoogleIcon({ className = '', size = 20, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.88c2.27-2.09 3.665-5.17 3.665-9.09z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.09C3.25 21.3 7.34 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.32c-.25-.72-.38-1.49-.38-2.32s.14-1.6.38-2.32V6.59H1.27C.46 8.21 0 10.05 0 12s.46 3.79 1.27 5.41l4.01-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.7 1.27 6.59l4.01 3.09c.95-2.83 3.6-4.93 6.72-4.93z"
      />
    </svg>
  );
}

export function WeChatIcon({ className = '', size = 20, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      {/* 腾讯官方 TDesign / WeDesign 标准双气泡矢量 */}
      {/* 1. 大气泡 (微信原版绿 #07C160) */}
      <path
        fill="#07C160"
        d="M8.8 17.03h-.05c-1.15 0-2.25-.2-3.26-.53l-2.84 1.42.35-2.71a6.95 6.95 0 01-3-5.57c0-4.08 3.92-7.39 8.75-7.39 4.17 0 7.66 2.47 8.54 5.77a9.4 9.4 0 00-.6-.02c-4.36 0-8.19 3.04-8.19 7.11 0 .67.1 1.31.3 1.92z"
      />
      {/* 大气泡双眼 (纯白镂空发光圆点) */}
      <circle cx="6" cy="7.2" r="1.1" fill="#FFFFFF" />
      <circle cx="11.5" cy="7.2" r="1.1" fill="#FFFFFF" />

      {/* 2. 小气泡 (微信原版绿 #07C160) */}
      <path
        fill="#07C160"
        d="M21.87 19.52A5.72 5.72 0 0024 15.16C24 11.76 20.75 9 16.75 9S9.5 11.76 9.5 15.16c0 3.4 3.25 6.16 7.25 6.16.95 0 1.86-.15 2.69-.43l2.43 1.4v-2.77z"
      />
      {/* 小气泡双眼 (纯白镂空发光圆点) */}
      <circle cx="14.3" cy="14.2" r="0.9" fill="#FFFFFF" />
      <circle cx="19.2" cy="14.2" r="0.9" fill="#FFFFFF" />
    </svg>
  );
}

export function QQIcon({ className = '', size = 20, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      {/* 腾讯官方 QQ 互联标准高精度企鹅彩色矢量 */}
      {/* 1. 金黄双掌 */}
      <path
        fill="#FFA800"
        d="M6.8 21.6c-1.4 0-2.3-.5-2.3-1.2 0-.8 1.1-1.4 2.5-1.4.8 0 1.5.2 2 .5l.2.2c-.3.8-1.2 1.9-2.4 1.9zm10.4 0c1.4 0 2.3-.5 2.3-1.2 0-.8-1.1-1.4-2.5-1.4-.8 0-1.5.2-2 .5l-.2.2c.3.8 1.2 1.9 2.4 1.9z"
      />
      {/* 2. 腾讯企鹅经典深黑头部与背翼 (官方轮廓) */}
      <path
        fill="#12161A"
        d="M12 2C8.5 2 5.8 4.8 5.8 8.3c0 1.3.4 2.5 1 3.5C5.4 12.8 4.6 14.3 4.6 16c0 2 1.3 3.8 3.2 4.6 1.3.6 2.8.9 4.2.9s2.9-.3 4.2-.9c1.9-.8 3.2-2.6 3.2-4.6 0-1.7-.8-3.2-2.2-4.2.6-1 1-2.2 1-3.5C18.2 4.8 15.5 2 12 2z"
      />
      {/* 3. 伸展双翅 */}
      <path
        fill="#12161A"
        d="M4.2 14.5c-.7.8-1.1 1.9-1 3 .2 1.1 1 2 2.1 2.2.3-1.5 1.3-3.4 2.4-4.2-1.4-.4-2.7 0-3.5-1zm15.6 0c.7.8 1.1 1.9 1 3-.2 1.1-1 2-2.1 2.2-.3-1.5-1.3-3.4-2.4-4.2 1.4-.4 2.7 0 3.5-1z"
      />
      {/* 4. 纯白面部圆润大肚腩 */}
      <path
        fill="#FFFFFF"
        d="M12 7c-2.4 0-4.3 1.7-4.3 3.7 0 .6.2 1.2.5 1.7.7.5 2.3 1 3.8 1s3.1-.5 3.8-1c.3-.5.5-1.1.5-1.7 0-2-1.9-3.7-4.3-3.7zm0 7.8c-2.9 0-5.2 1.9-5.2 4.4 0 .3.1.6.2.9 1.5.8 3.2 1.2 5 1.2s3.5-.4 5-1.2c.1-.3.2-.6.2-.9 0-2.5-2.3-4.4-5.2-4.4z"
      />
      {/* 5. 黑色眼珠 */}
      <ellipse cx="9.8" cy="9.8" rx="0.75" ry="1.25" fill="#12161A" />
      <ellipse cx="14.2" cy="9.8" rx="0.75" ry="1.25" fill="#12161A" />
      {/* 6. 经典亮红飘角围巾 (官方红 #FF2B42) */}
      <path
        fill="#FF2B42"
        d="M6.5 14c1.5 1 3.4 1.5 5.5 1.5s4-.5 5.5-1.5c.5-.3.8-.8.8-1.3 0-.6-.4-1.1-.9-1.2-1.6-.3-3.5-.5-5.4-.5s-3.8.2-5.4.5c-.5.1-.9.6-.9 1.2 0 .5.3 1 .8 1.3z"
      />
      <path
        fill="#FF2B42"
        d="M15.4 13.6l2.3 3.7c.2.3.6.4.9.2.3-.2.4-.6.2-.9l-1.9-3.3c-.5.1-1 .2-1.5.3z"
      />
      {/* 7. 金黄鸟喙 */}
      <path
        fill="#FFA800"
        d="M12 11c-1.3 0-2.3.5-2.3 1.2s1 1.2 2.3 1.2 2.3-.5 2.3-1.2-1-1.2-2.3-1.2z"
      />
    </svg>
  );
}

export function DouyinIcon({ className = '', size = 20, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      {/* 字节跳动 Semi Design 官方标准音符矢量 (3D 拟态色偏通道) */}
      {/* 青色通道色偏 (#24F6F0) */}
      <path
        fill="#24F6F0"
        d="M16.07 1h-3.8V16.13A3.17 3.17 0 1 1 10.14 13v-3.9a6.98 6.98 0 1 0 5.94 6.91V8.47a9.05 9.05 0 0 0 5.3 1.7V6.37a5.3 5.3 0 0 1-5.3-5.31V1Z"
        transform="translate(-0.8, 0.7)"
      />
      {/* 洋红通道色偏 (#FE2C55) */}
      <path
        fill="#FE2C55"
        d="M16.07 1h-3.8V16.13A3.17 3.17 0 1 1 10.14 13v-3.9a6.98 6.98 0 1 0 5.94 6.91V8.47a9.05 9.05 0 0 0 5.3 1.7V6.37a5.3 5.3 0 0 1-5.3-5.31V1Z"
        transform="translate(0.8, -0.7)"
      />
      {/* 中央纯白主高光音符 (#FFFFFF) */}
      <path
        fill="#FFFFFF"
        d="M16.07 1h-3.8V16.13A3.17 3.17 0 1 1 10.14 13v-3.9a6.98 6.98 0 1 0 5.94 6.91V8.47a9.05 9.05 0 0 0 5.3 1.7V6.37a5.3 5.3 0 0 1-5.3-5.31V1Z"
      />
    </svg>
  );
}

export function BilibiliIcon({ className = '', size = 20, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      {/* Bilibili 官方标准小电视矢量 (经典蓝 #00A1D6 + 纯白荧屏高对比) */}
      <rect x="5.2" y="7.2" width="13.6" height="9.7" rx="2" fill="#FFFFFF" />
      <path
        fill="#00A1D6"
        d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z"
      />
    </svg>
  );
}

export function TikTokIcon({ className = '', size = 20, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <path
        fill="#25F4EE"
        d="M18.6 6.3a4.8 4.8 0 0 1-3.6-4.1H12v13.6a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.8a6.3 6.3 0 1 0 5.2 6.2V8.6a8.2 8.2 0 0 0 4.8 1.6V7a4.8 4.8 0 0 1-1.4-.7z"
      />
      <path
        fill="#FE2C55"
        d="M19.8 6.9a4.8 4.8 0 0 1-3.6-4.1h-3.1v13.6a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1v-3.2a6.3 6.3 0 1 0 5.2 6.2V9.2a8.2 8.2 0 0 0 4.8 1.6V7.6a4.8 4.8 0 0 1-1.3-.7z"
      />
      <path
        fill="#FFFFFF"
        d="M19.2 6.6a4.8 4.8 0 0 1-3.6-4.1h-3.1v13.6a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V10a6.3 6.3 0 1 0 5.2 6.2V8.9a8.2 8.2 0 0 0 4.8 1.6V7.3a4.8 4.8 0 0 1-1.3-.7z"
      />
    </svg>
  );
}

export function InstagramIcon({ className = '', size = 20, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <defs>
        <radialGradient id="ig-grad-radial" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect width="22" height="22" x="1" y="1" rx="6" fill="url(#ig-grad-radial)" />
      <rect width="13" height="13" x="5.5" y="5.5" rx="3.5" fill="none" stroke="#FFFFFF" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="#FFFFFF" strokeWidth="1.6" />
      <circle cx="15.8" cy="8.2" r="0.8" fill="#FFFFFF" />
    </svg>
  );
}

export function XIcon({ className = '', size = 18, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function GithubIcon({ className = '', size = 20, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

export function AppleIcon({ className = '', size = 20, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.38c.62-.75 1.04-1.8 0.92-2.85-.9.04-1.99.6-2.63 1.35-.57.65-1.06 1.72-.93 2.74 1 .08 2.02-.49 2.64-1.24z" />
    </svg>
  );
}

export function AlipayIcon({ className = '', size = 20, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <rect width="22" height="22" x="1" y="1" rx="5" fill="#1677FF" />
      <path
        fill="#FFFFFF"
        d="M17.8 11.2c-.6 0-2.8.2-5 .7-.8-1.5-1.5-3.3-1.8-5h5.1V5.7h-3.4V4.2h-1.6v1.5H8v1.2h4.5c-.3 1.4-.8 2.8-1.4 4H7.8v1.2h3.8c-1.3 3.2-3.1 5.3-5.2 6.6l.8 1.1c2.3-1.5 4.3-3.9 5.8-7.5 2.1-.5 4.2-.7 4.8-.7.2 0 .4 0 .5.1.2.2.3.8.3 1.8 0 1.9-.9 3.2-2.6 3.2-1.3 0-2.3-.7-2.6-1.7l-1.3.5c.5 1.7 2 2.5 3.9 2.5 2.5 0 3.9-1.8 3.9-4.5.1-1.7-.2-2.9-.6-3.4-.6-.7-1.6-.9-2.4-.9z"
      />
    </svg>
  );
}

export function MailIcon({ className = '', size = 18, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

export function PhoneIcon({ className = '', size = 18, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

export function StripeIcon({ className = '', size = 20, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <rect width="22" height="22" x="1" y="1" rx="5" fill="#635BFF" />
      <path
        fill="#FFFFFF"
        d="M14.6 10.3c0-.8-.6-1.2-1.7-1.2-1.5 0-3.3.6-4.6 1.4V7.6c1.4-.7 3.2-1.1 4.7-1.1 3.5 0 5.6 1.7 5.6 4.5 0 4.4-6.1 3.7-6.1 5.6 0 .9.8 1.3 2 1.3 1.8 0 3.8-.8 5.2-1.7v2.9c-1.5.8-3.5 1.2-5.3 1.2-3.7 0-5.9-1.8-5.9-4.6 0-4.6 6.1-3.9 6.1-5.4z"
      />
    </svg>
  );
}

export function PayPalIcon({ className = '', size = 20, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <path
        fill="#003087"
        d="M7.4 20.6l2.1-13.3h5.4c3.3 0 5.4 1.6 4.9 4.8-.4 2.7-2.3 4.8-5.4 4.8H11l-1 6.3H7.4z"
      />
      <path
        fill="#0079C1"
        d="M10.1 16.9h3.4c2.8 0 4.7-1.8 5.1-4.2.4-2.7-1.4-4.1-4.3-4.1h-4.2l-2.1 13h2.1l1.1-4.7z"
      />
      <path
        fill="#001C64"
        opacity="0.3"
        d="M11 16.9l.7-4.4h2.6c1.9 0 3.3.6 3.7 2.2-.4 2.4-2.3 4.2-5.1 4.2H11v-2z"
      />
    </svg>
  );
}

export const SOCIAL_ICON_COMPONENTS = {
  google: GoogleIcon,
  wechat: WeChatIcon,
  wechat_oauth: WeChatIcon,
  weixin: WeChatIcon,
  qq: QQIcon,
  douyin: DouyinIcon,
  bilibili: BilibiliIcon,
  bili: BilibiliIcon,
  tiktok: TikTokIcon,
  instagram: InstagramIcon,
  x: XIcon,
  twitter: XIcon,
  github: GithubIcon,
  apple: AppleIcon,
  alipay: AlipayIcon,
  stripe: StripeIcon,
  paypal: PayPalIcon,
  phone: PhoneIcon,
  email: MailIcon,
  mail: MailIcon,
};

export function getSocialIcon(id) {
  if (!id) return null;
  const key = String(id).toLowerCase().trim();
  return SOCIAL_ICON_COMPONENTS[key] || null;
}
