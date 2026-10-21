import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('关于页面底部品牌 Logo 动态化与后台同步审计', () => {
  const footerPath = path.join(repoRoot, 'components/about/AboutFooter.jsx');
  const footerCode = fs.readFileSync(footerPath, 'utf8');
  const brandLogoPath = path.join(repoRoot, 'components/site/BrandLogo.js');
  const brandLogoCode = fs.readFileSync(brandLogoPath, 'utf8');

  // 1. AboutFooter 必须引入并使用 useBranding 和 BrandLogo
  assert.match(
    footerCode,
    /import BrandLogo from '@\/components\/site\/BrandLogo'/,
    'AboutFooter 必须导入通用 BrandLogo 组件'
  );
  assert.match(
    footerCode,
    /import \{ useBranding \} from '@\/lib\/hooks\/useBranding'/,
    'AboutFooter 必须导入 useBranding hook'
  );
  assert.match(
    footerCode,
    /const \{ brand \} = useBranding\(\);/,
    'AboutFooter 必须通过 useBranding() 消费全局品牌状态'
  );

  // 2. 彻底移除旧版写死的示例品牌占位（Zap 图标与纯写死静态框）
  assert.doesNotMatch(
    footerCode,
    /<Zap className="w-4 h-4 text-white fill-current" \/>/,
    'AboutFooter 必须彻底移除写死的示例品牌 Zap 图标'
  );

  // 3. 必须通过 BrandLogo 动态渲染当前生效的品牌 Logo，且包裹在动态 logoHref 链接中
  assert.match(
    footerCode,
    /<BrandLogo[^>]*brand=\{brand\}/,
    'AboutFooter 必须将 brand 传入 BrandLogo 进行动态渲染'
  );
  assert.match(
    footerCode,
    /href=\{logoHref\}/,
    'AboutFooter Logo 必须链接到后台配置的动态 logoHref'
  );
  assert.match(
    footerCode,
    /target=\{logoTarget\}/,
    'AboutFooter Logo 必须支持后台配置的 logoTarget'
  );

  // 4. BrandLogo 具备响应后台更新与兜底名称能力
  assert.match(
    brandLogoCode,
    /brand\?\.logoUrl && !imgError/,
    'BrandLogo 必须基于 brand.logoUrl 动态加载后台图片'
  );
  assert.match(
    brandLogoCode,
    /useEffect\(\(\) => \{\s*setImgError\(false\);\s*\}, \[brand\?\.logoUrl\]\);/,
    'BrandLogo 必须监听 brand.logoUrl 变化并在切换时重置错误状态'
  );
});
