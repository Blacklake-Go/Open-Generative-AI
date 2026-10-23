'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Folder,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  LayoutGrid,
  List,
  Star,
  Download,
  Copy,
  Trash2,
  Wand2,
  ChevronDown,
  Layers,
  AudioLines,
  X,
  Play,
  RotateCcw,
  Loader2,
  Scan,
} from 'lucide-react';
import { normalizeLocale, localizeStudioPath } from '@/lib/locales';
import { useUserSession } from '@/lib/hooks/useUserSession';
import BrandLogo from '@/components/site/BrandLogo';
import UserDropdownMenu from '@/components/UserDropdownMenu';
import AuthModal from '@/components/AuthModal';
import { useBranding } from '@/lib/hooks/useBranding';

// 动态日期分组算法 (基于真实 ISO 8601 时间戳转换，支持 6 种语言)
function formatTimelineDate(dateStr, locale = 'en') {
  const norm = normalizeLocale(locale);
  const otherMap = {
    en: 'Other',
    'zh-CN': '其他时间',
    'zh-TW': '其他時間',
    'ja-JP': 'その他',
    'ko-KR': '기타',
    es: 'Otro',
  };
  const todayMap = {
    en: 'Today',
    'zh-CN': '今天',
    'zh-TW': '今天',
    'ja-JP': '今日',
    'ko-KR': '오늘',
    es: 'Hoy',
  };
  const yesterdayMap = {
    en: 'Yesterday',
    'zh-CN': '昨天',
    'zh-TW': '昨天',
    'ja-JP': '昨日',
    'ko-KR': '어제',
    es: 'Ayer',
  };
  const daysAgoMap = {
    en: (n) => `${n} days ago`,
    'zh-CN': () => '前天',
    'zh-TW': () => '前天',
    'ja-JP': (n) => `${n}日前`,
    'ko-KR': (n) => `${n}일 전`,
    es: (n) => `Hace ${n} días`,
  };

  if (!dateStr) return otherMap[norm] || otherMap.en;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return otherMap[norm] || otherMap.en;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - targetDay) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return todayMap[norm] || todayMap.en;
  if (diffDays === 1) return yesterdayMap[norm] || yesterdayMap.en;
  if (diffDays === 2) {
    const fn = daysAgoMap[norm] || daysAgoMap.en;
    return fn(2);
  }

  const intlLocales = {
    en: 'en-US',
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW',
    'ja-JP': 'ja-JP',
    'ko-KR': 'ko-KR',
    es: 'es-ES',
  };
  const targetIntl = intlLocales[norm] || 'en-US';

  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();

  if (year === now.getFullYear()) {
    if (norm === 'zh-CN' || norm === 'zh-TW') return `${month}月${day}日`;
    return d.toLocaleDateString(targetIntl, { month: 'short', day: 'numeric' });
  }
  if (norm === 'zh-CN' || norm === 'zh-TW') return `${year}年${month}月${day}日`;
  return d.toLocaleDateString(targetIntl, { year: 'numeric', month: 'short', day: 'numeric' });
}

const ASSET_CENTER_COPY = {
  en: {
    signInTitle: 'Sign in to Access Assets',
    signInDesc: 'Asset Center securely archives all your generated AI creations. Please sign in to continue.',
    signInBtn: 'Sign In / Register',
    goToLoginPage: 'Go to Login Page',
    collapseSidebar: 'Collapse sidebar',
    expandSidebar: 'Expand sidebar',
    navStudio: 'Studio',
    navAssets: 'Assets',
    navSubjects: 'Subjects',
    recentChats: 'Recent Chats',
    noRecentChats: 'No recent chats',
    canvases: 'Canvases',
    canvasStudio: 'Canvas Studio',
    tabHistory: 'History',
    tabCanvas: 'Canvases',
    searchPlaceholder: 'Search assets...',
    gridView: 'Grid View',
    listView: 'List View',
    mediaAll: 'All',
    mediaImage: 'Image',
    mediaVideo: 'Video',
    mediaAudio: 'Audio',
    mediaWorkflow: 'Workflow',
    filterStarred: 'Starred',
    timeAll: 'All Time',
    time7Days: '7 Days',
    timeLast7Days: 'Last 7 Days',
    time30Days: '30 Days',
    timeLast30Days: 'Last 30 Days',
    sortNewest: 'Newest',
    sortNewestFirst: 'Newest First',
    sortOldest: 'Oldest',
    sortOldestFirst: 'Oldest First',
    noMatchingAssets: 'No matching assets found',
    noAssetsYet: 'No generated assets yet',
    resetFilters: 'Reset Filters',
    startCreating: 'Start Creating',
    viewDetail: 'View Detail',
    star: 'Star',
    unstar: 'Unstar',
    starredDone: 'Starred',
    remix: 'Remix',
    remixTooltip: 'Remix with prompt',
    copyPrompt: 'Copy prompt',
    deleteAsset: 'Delete asset',
    untitledAsset: 'Untitled Asset',
    creditsLabel: 'credits',
    close: 'Close',
    badgeVideo: 'AI Video',
    badgeAudio: 'AI Audio',
    badgeImage: 'AI Image',
    promptLabel: 'Prompt',
    copyLabel: 'Copy',
    modelLabel: 'Model',
    ratioLabel: 'Ratio',
    creditsCostLabel: 'Credits',
    remixInStudio: 'Remix in Studio',
    downloadOriginal: 'Download Original',
    deleteLabel: 'Delete',
    addedToFavorites: 'Added to favorites',
    removedFromFavorites: 'Removed from favorites',
    failedToUpdateFavorite: 'Failed to update favorite',
    confirmDelete: 'Are you sure you want to delete this asset?',
    assetDeleted: 'Asset deleted',
    deleteFailed: 'Delete failed',
    promptCopied: 'Prompt copied to clipboard',
    audioArtwork: 'AI Audio Track',
    noPromptRecorded: 'No prompt recorded',
  },
  'zh-CN': {
    signInTitle: '登录访问个人资产中心',
    signInDesc: '资产中心集中归档您所有的 AI 生图、生视频与音频作品，请先登录您的创作者账号。',
    signInBtn: '立即登录 / 注册',
    goToLoginPage: '跳转完整登录页',
    collapseSidebar: '折叠侧边栏',
    expandSidebar: '展开侧边栏',
    navStudio: '创作',
    navAssets: '资产',
    navSubjects: '主体',
    recentChats: '历史创作会话',
    noRecentChats: '暂无历史记录',
    canvases: '设计画布',
    canvasStudio: '自由设计画布',
    tabHistory: '生成历史',
    tabCanvas: '画布',
    searchPlaceholder: '搜索提示词或标题...',
    gridView: '网格视图',
    listView: '列表视图',
    mediaAll: '全部',
    mediaImage: '图片',
    mediaVideo: '视频',
    mediaAudio: '音频',
    mediaWorkflow: '工作流',
    filterStarred: '收藏',
    timeAll: '全部时间',
    time7Days: '近7天',
    timeLast7Days: '近7天',
    time30Days: '近30天',
    timeLast30Days: '近30天',
    sortNewest: '最新生成',
    sortNewestFirst: '最新生成',
    sortOldest: '最早生成',
    sortOldestFirst: '最早生成',
    noMatchingAssets: '暂无匹配的资产作品',
    noAssetsYet: '暂无生成历史资产',
    resetFilters: '重置筛选',
    startCreating: '前往创作',
    viewDetail: '查看详情大图',
    star: '收藏',
    unstar: '取消收藏',
    starredDone: '已收藏',
    remix: '图生同款',
    remixTooltip: '使用相同提示词与参数进行二次创作',
    copyPrompt: '复制提示词',
    deleteAsset: '删除资产',
    untitledAsset: '无文字提示词',
    creditsLabel: '积分',
    close: '关闭',
    badgeVideo: 'AI 视频',
    badgeAudio: 'AI 音频',
    badgeImage: 'AI 图像',
    promptLabel: '提示词',
    copyLabel: '复制',
    modelLabel: '模型',
    ratioLabel: '画质比例',
    creditsCostLabel: '消耗积分',
    remixInStudio: '立即做同款',
    downloadOriginal: '下载原文件',
    deleteLabel: '删除',
    addedToFavorites: '已加入收藏',
    removedFromFavorites: '已取消收藏',
    failedToUpdateFavorite: '收藏状态同步失败',
    confirmDelete: '确定要删除该生成资产吗？删除后将无法恢复。',
    assetDeleted: '资产已删除',
    deleteFailed: '删除失败，请稍后重试',
    promptCopied: '提示词已复制到剪贴板',
    audioArtwork: 'AI 音频作品',
    noPromptRecorded: '无文字提示词',
  },
  'zh-TW': {
    signInTitle: '登入訪問個人資產中心',
    signInDesc: '資產中心集中歸檔您所有的 AI 生圖、生視頻與音頻作品，請先登入您的創作者帳號。',
    signInBtn: '立即登入 / 註冊',
    goToLoginPage: '跳轉完整登入頁',
    collapseSidebar: '折疊側邊欄',
    expandSidebar: '展開側邊欄',
    navStudio: '創作',
    navAssets: '資產',
    navSubjects: '主體',
    recentChats: '歷史創作會話',
    noRecentChats: '暫無歷史記錄',
    canvases: '設計畫布',
    canvasStudio: '自由設計畫布',
    tabHistory: '生成歷史',
    tabCanvas: '畫布',
    searchPlaceholder: '搜尋提示詞或標題...',
    gridView: '網格視圖',
    listView: '列表視圖',
    mediaAll: '全部',
    mediaImage: '圖片',
    mediaVideo: '視頻',
    mediaAudio: '音頻',
    mediaWorkflow: '工作流',
    filterStarred: '收藏',
    timeAll: '全部時間',
    time7Days: '近7天',
    timeLast7Days: '近7天',
    time30Days: '近30天',
    timeLast30Days: '近30天',
    sortNewest: '最新生成',
    sortNewestFirst: '最新生成',
    sortOldest: '最早生成',
    sortOldestFirst: '最早生成',
    noMatchingAssets: '暫無匹配的資產作品',
    noAssetsYet: '暫無生成歷史資產',
    resetFilters: '重置篩選',
    startCreating: '前往創作',
    viewDetail: '查看詳情大圖',
    star: '收藏',
    unstar: '取消收藏',
    starredDone: '已收藏',
    remix: '圖生同款',
    remixTooltip: '使用相同提示詞與參數進行二次創作',
    copyPrompt: '複製提示詞',
    deleteAsset: '刪除資產',
    untitledAsset: '無文字提示詞',
    creditsLabel: '積分',
    close: '關閉',
    badgeVideo: 'AI 視頻',
    badgeAudio: 'AI 音頻',
    badgeImage: 'AI 圖像',
    promptLabel: '提示詞',
    copyLabel: '複製',
    modelLabel: '模型',
    ratioLabel: '畫質比例',
    creditsCostLabel: '消耗積分',
    remixInStudio: '立即做同款',
    downloadOriginal: '下載原文件',
    deleteLabel: '刪除',
    addedToFavorites: '已加入收藏',
    removedFromFavorites: '已取消收藏',
    failedToUpdateFavorite: '收藏狀態同步失敗',
    confirmDelete: '確定要刪除該生成資產嗎？刪除後將無法恢復。',
    assetDeleted: '資產已刪除',
    deleteFailed: '刪除失敗，請稍後重試',
    promptCopied: '提示詞已複製到剪貼板',
    audioArtwork: 'AI 音頻作品',
    noPromptRecorded: '無文字提示詞',
  },
  'ja-JP': {
    signInTitle: 'アセットセンターへログイン',
    signInDesc: 'アセットセンターには生成した画像、動画、音楽などの全作品がアーカイブされます。クリエイターアカウントでログインしてください。',
    signInBtn: 'ログイン / 新規登録',
    goToLoginPage: 'ログインページへ',
    collapseSidebar: 'サイドバーを閉じる',
    expandSidebar: 'サイドバーを開く',
    navStudio: '制作',
    navAssets: 'アセット',
    navSubjects: '被写体',
    recentChats: '最近のセッション',
    noRecentChats: '履歴がありません',
    canvases: 'デザインキャンバス',
    canvasStudio: 'フリーデザインキャンバス',
    tabHistory: '生成履歴',
    tabCanvas: 'キャンバス',
    searchPlaceholder: 'プロンプトまたはタイトルを検索...',
    gridView: 'グリッド表示',
    listView: 'リスト表示',
    mediaAll: 'すべて',
    mediaImage: '画像',
    mediaVideo: '動画',
    mediaAudio: '音声',
    mediaWorkflow: 'ワークフロー',
    filterStarred: 'お気に入り',
    timeAll: '全期間',
    time7Days: '過去7日間',
    timeLast7Days: '過去7日間',
    time30Days: '過去30日間',
    timeLast30Days: '過去30日間',
    sortNewest: '新しい順',
    sortNewestFirst: '新しい順',
    sortOldest: '古い順',
    sortOldestFirst: '古い順',
    noMatchingAssets: '該当するアセットが見つかりません',
    noAssetsYet: '生成されたアセットはまだありません',
    resetFilters: 'フィルターをリセット',
    startCreating: '制作を始める',
    viewDetail: '詳細を表示',
    star: 'お気に入り',
    unstar: 'お気に入り解除',
    starredDone: 'お気に入り済み',
    remix: 'リミックス',
    remixTooltip: '同じプロンプトと設定で再生成',
    copyPrompt: 'プロンプトをコピー',
    deleteAsset: 'アセットを削除',
    untitledAsset: '名称未設定のアセット',
    creditsLabel: 'クレジット',
    close: '閉じる',
    badgeVideo: 'AI 動画',
    badgeAudio: 'AI 音声',
    badgeImage: 'AI 画像',
    promptLabel: 'プロンプト',
    copyLabel: 'コピー',
    modelLabel: 'モデル',
    ratioLabel: '解像度・比率',
    creditsCostLabel: '消費クレジット',
    remixInStudio: 'Studioで同スタイル作成',
    downloadOriginal: '元ファイルをダウンロード',
    deleteLabel: '削除',
    addedToFavorites: 'お気に入りに追加しました',
    removedFromFavorites: 'お気に入りを解除しました',
    failedToUpdateFavorite: 'お気に入りの更新に失敗しました',
    confirmDelete: 'このアセットを削除してもよろしいですか？削除後は復元できません。',
    assetDeleted: 'アセットを削除しました',
    deleteFailed: '削除に失敗しました',
    promptCopied: 'プロンプトをクリップボードにコピーしました',
    audioArtwork: 'AI 楽曲作品',
    noPromptRecorded: 'プロンプト記録なし',
  },
  'ko-KR': {
    signInTitle: '개인 에셋 센터 로그인',
    signInDesc: '에셋 센터는 생성된 모든 AI 이미지, 비디오 및 오디오 작품을 안전하게 보관합니다. 크리에이터 계정으로 로그인해 주세요.',
    signInBtn: '로그인 / 회원가입',
    goToLoginPage: '로그인 페이지로 이동',
    collapseSidebar: '사이드바 접기',
    expandSidebar: '사이드바 펼치기',
    navStudio: '제작',
    navAssets: '에셋',
    navSubjects: '피사체',
    recentChats: '최근 대화',
    noRecentChats: '최근 기록이 없습니다',
    canvases: '디자인 캔버스',
    canvasStudio: '자유 디자인 캔버스',
    tabHistory: '생성 기록',
    tabCanvas: '캔버스',
    searchPlaceholder: '프롬프트 또는 제목 검색...',
    gridView: '그리드 뷰',
    listView: '리스트 뷰',
    mediaAll: '전체',
    mediaImage: '이미지',
    mediaVideo: '비디오',
    mediaAudio: '오디오',
    mediaWorkflow: '워크플로',
    filterStarred: '즐겨찾기',
    timeAll: '전체 기간',
    time7Days: '최근 7일',
    timeLast7Days: '최근 7일',
    time30Days: '최근 30일',
    timeLast30Days: '최근 30일',
    sortNewest: '최신순',
    sortNewestFirst: '최신순',
    sortOldest: '오래된순',
    sortOldestFirst: '오래된순',
    noMatchingAssets: '일치하는 에셋이 없습니다',
    noAssetsYet: '생성된 에셋이 없습니다',
    resetFilters: '필터 초기화',
    startCreating: '제작 시작하기',
    viewDetail: '상세 보기',
    star: '즐겨찾기',
    unstar: '즐겨찾기 해제',
    starredDone: '즐겨찾기됨',
    remix: '동일 스타일 제작',
    remixTooltip: '동일한 프롬프트 및 설정으로 재창작',
    copyPrompt: '프롬프트 복사',
    deleteAsset: '에셋 삭제',
    untitledAsset: '제목 없는 에셋',
    creditsLabel: '크레딧',
    close: '닫기',
    badgeVideo: 'AI 비디오',
    badgeAudio: 'AI 오디오',
    badgeImage: 'AI 이미지',
    promptLabel: '프롬프트',
    copyLabel: '복사',
    modelLabel: '모델',
    ratioLabel: '화질 비율',
    creditsCostLabel: '소모 크레딧',
    remixInStudio: '스튜디오에서 동스타일 제작',
    downloadOriginal: '원본 다운로드',
    deleteLabel: '삭제',
    addedToFavorites: '즐겨찾기에 추가되었습니다',
    removedFromFavorites: '즐겨찾기에서 제거되었습니다',
    failedToUpdateFavorite: '즐겨찾기 업데이트 실패',
    confirmDelete: '이 생성 에셋을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.',
    assetDeleted: '에셋이 삭제되었습니다',
    deleteFailed: '삭제 실패, 나중에 다시 시도해 주세요',
    promptCopied: '프롬프트가 클립보드에 복사되었습니다',
    audioArtwork: 'AI 오디오 작품',
    noPromptRecorded: '기록된 프롬프트 없음',
  },
  es: {
    signInTitle: 'Inicia sesión para acceder a Activos',
    signInDesc: 'El Centro de Activos archiva de forma segura todas tus creaciones de IA. Inicia sesión para continuar.',
    signInBtn: 'Iniciar Sesión / Registrarse',
    goToLoginPage: 'Ir a Página de Inicio de Sesión',
    collapseSidebar: 'Contraer barra lateral',
    expandSidebar: 'Expandir barra lateral',
    navStudio: 'Estudio',
    navAssets: 'Activos',
    navSubjects: 'Sujetos',
    recentChats: 'Chats Recientes',
    noRecentChats: 'Sin chats recientes',
    canvases: 'Lienzos',
    canvasStudio: 'Lienzo de Diseño',
    tabHistory: 'Historial',
    tabCanvas: 'Lienzos',
    searchPlaceholder: 'Buscar por prompt o título...',
    gridView: 'Vista de cuadrícula',
    listView: 'Vista de lista',
    mediaAll: 'Todos',
    mediaImage: 'Imagen',
    mediaVideo: 'Video',
    mediaAudio: 'Audio',
    mediaWorkflow: 'Flujo',
    filterStarred: 'Favoritos',
    timeAll: 'Todo el tiempo',
    time7Days: '7 Días',
    timeLast7Days: 'Últimos 7 Días',
    time30Days: '30 Días',
    timeLast30Days: 'Últimos 30 Días',
    sortNewest: 'Más recientes',
    sortNewestFirst: 'Más recientes primero',
    sortOldest: 'Más antiguos',
    sortOldestFirst: 'Más antiguos primero',
    noMatchingAssets: 'No se encontraron activos coincidentes',
    noAssetsYet: 'Aún no hay activos generados',
    resetFilters: 'Restablecer filtros',
    startCreating: 'Comenzar a Crear',
    viewDetail: 'Ver Detalle',
    star: 'Favorito',
    unstar: 'Quitar de favoritos',
    starredDone: 'En favoritos',
    remix: 'Recrear',
    remixTooltip: 'Recrear con mismo prompt y ajustes',
    copyPrompt: 'Copiar prompt',
    deleteAsset: 'Eliminar activo',
    untitledAsset: 'Activo sin título',
    creditsLabel: 'créditos',
    close: 'Cerrar',
    badgeVideo: 'Video IA',
    badgeAudio: 'Audio IA',
    badgeImage: 'Imagen IA',
    promptLabel: 'Prompt',
    copyLabel: 'Copiar',
    modelLabel: 'Modelo',
    ratioLabel: 'Proporción',
    creditsCostLabel: 'Créditos gastados',
    remixInStudio: 'Recrear en Studio',
    downloadOriginal: 'Descargar Original',
    deleteLabel: 'Eliminar',
    addedToFavorites: 'Añadido a favoritos',
    removedFromFavorites: 'Eliminado de favoritos',
    failedToUpdateFavorite: 'Error al actualizar favorito',
    confirmDelete: '¿Estás seguro de eliminar este activo? No se podrá recuperar.',
    assetDeleted: 'Activo eliminado',
    deleteFailed: 'Error al eliminar',
    promptCopied: 'Prompt copiado al portapapeles',
    audioArtwork: 'Pista de Audio IA',
    noPromptRecorded: 'Sin prompt registrado',
  },
};

export default function JimengAssetCenter({ locale = 'en', initialUser = null }) {
  const router = useRouter();
  const { brand } = useBranding();
  const { user, credits, entitlements, refresh: refreshSession } = useUserSession(initialUser);

  const activeLocale = normalizeLocale(locale);
  const copy = ASSET_CENTER_COPY[activeLocale] || ASSET_CENTER_COPY.en;
  const studioBase = localizeStudioPath(activeLocale);

  // 认证与弹窗状态
  const [showAuthModal, setShowAuthModal] = useState(false);

  // 布局状态
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [topTab, setTopTab] = useState('history'); // 'history' | 'canvas'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // 筛选与排序状态
  const [selectedMediaType, setSelectedMediaType] = useState('all'); // 'all' | 'image' | 'video' | 'audio' | 'workflow'
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState('all'); // 'all' | '7days' | '30days'
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest' | 'oldest'
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  const timeDropdownRef = useRef(null);
  const sortDropdownRef = useRef(null);

  // 搜索防抖 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 真实资产数据流状态
  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // 弹窗关闭动效处理
  const handleCloseDetail = useCallback(() => {
    setIsDetailClosing(true);
    setTimeout(() => {
      setSelectedAsset(null);
      setIsDetailClosing(false);
    }, 200);
  }, []);

  // ESC 键监听关闭详情弹窗
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedAsset) {
        handleCloseDetail();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAsset, handleCloseDetail]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (timeDropdownRef.current && !timeDropdownRef.current.contains(event.target)) {
        setIsTimeDropdownOpen(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target)) {
        setIsSortDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  // 获取真实资产历史列表
  const fetchAssets = useCallback(async () => {
    if (!user) {
      setAssets([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch('/api/assets');
      if (!res.ok) throw new Error('Failed to fetch assets');
      const data = await res.json();
      setAssets(Array.isArray(data.assets) ? data.assets : []);
    } catch (err) {
      setAssets([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // 从真实资产流中派生侧边栏「历史创作会话」
  const dynamicSessions = useMemo(() => {
    const sessions = [];
    const seenPrompts = new Set();

    for (const item of assets) {
      const p = item.prompt ? item.prompt.trim() : '';
      if (p && !seenPrompts.has(p)) {
        seenPrompts.add(p);
        sessions.push({
          id: item.id,
          title: p.length > 16 ? `${p.slice(0, 16)}...` : p,
          fullTitle: p,
          tab: item.type === 'video' ? 'video' : item.type === 'audio' ? 'audio' : 'image',
          prompt: p,
          model: item.model,
        });
      }
      if (sessions.length >= 8) break;
    }
    return sessions;
  }, [assets]);

  // 收藏 / 取消收藏 (乐观更新 + 真实落库)
  const handleToggleStar = async (e, asset) => {
    if (e) e.stopPropagation();
    const nextStarred = !asset.starred;

    // 乐观更新本地资产列表状态
    setAssets((prev) =>
      prev.map((item) => (item.id === asset.id ? { ...item, starred: nextStarred } : item))
    );
    if (selectedAsset?.id === asset.id) {
      setSelectedAsset((prev) => (prev ? { ...prev, starred: nextStarred } : prev));
    }

    try {
      const res = await fetch(`/api/assets/${asset.id}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: nextStarred }),
      });
      if (!res.ok) throw new Error('更新失败');
      showToast(nextStarred ? copy.addedToFavorites : copy.removedFromFavorites);
    } catch (err) {
      // 失败回滚
      setAssets((prev) =>
        prev.map((item) => (item.id === asset.id ? { ...item, starred: !nextStarred } : item))
      );
      if (selectedAsset?.id === asset.id) {
        setSelectedAsset((prev) => (prev ? { ...prev, starred: !nextStarred } : prev));
      }
      showToast(copy.failedToUpdateFavorite);
    }
  };

  // 删除单条真实资产
  const handleDeleteAsset = async (e, asset) => {
    if (e) e.stopPropagation();
    if (!window.confirm(copy.confirmDelete)) {
      return;
    }

    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('删除失败');
      setAssets((prev) => prev.filter((item) => item.id !== asset.id));
      if (selectedAsset?.id === asset.id) setSelectedAsset(null);
      showToast(copy.assetDeleted);
    } catch (err) {
      showToast(copy.deleteFailed);
    }
  };

  // 图生同款 / 做同款 -> 携带 Prompt 与参数跳转至工作台
  const handleDoSame = (e, asset) => {
    if (e) e.stopPropagation();
    const params = new URLSearchParams();
    const targetTab =
      asset.type === 'video' ? 'video' : asset.type === 'audio' ? 'audio' : 'image';
    params.set('tab', targetTab);
    if (asset.prompt) params.set('prompt', asset.prompt);
    if (asset.model) params.set('model', asset.model);
    if (asset.aspectRatio && asset.aspectRatio !== 'auto') params.set('aspect_ratio', asset.aspectRatio);
    router.push(`${studioBase}?${params.toString()}`);
  };

  // 复制提示词
  const handleCopyPrompt = (e, prompt) => {
    if (e) e.stopPropagation();
    if (prompt) {
      navigator.clipboard.writeText(prompt);
      showToast(copy.promptCopied);
    }
  };

  // 时间范围过滤 (基于 real createdAt)
  const timeFilteredAssets = useMemo(() => {
    if (timeFilter === 'all') return assets;
    const now = Date.now();
    const maxAgeMs = timeFilter === '7days' ? 7 * 86400 * 1000 : 30 * 86400 * 1000;
    return assets.filter((item) => {
      const created = new Date(item.createdAt || 0).getTime();
      return now - created <= maxAgeMs;
    });
  }, [assets, timeFilter]);

  // 时间轴分组算法核心 (对过滤和排序后的资产进行日期流聚类)
  const groupedTimeline = useMemo(() => {
    // 1. 媒体类型过滤
    let filtered = timeFilteredAssets;
    if (selectedMediaType !== 'all') {
      filtered = filtered.filter((item) => item.type === selectedMediaType);
    }

    // 2. 收藏筛选
    if (onlyStarred) {
      filtered = filtered.filter((item) => item.starred);
    }

    // 3. 搜索过滤 (匹配 prompt 或 title 或 model)
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().trim();
      filtered = filtered.filter(
        (item) =>
          (item.prompt && item.prompt.toLowerCase().includes(q)) ||
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.model && item.model.toLowerCase().includes(q))
      );
    }

    // 4. 排序 (newest vs oldest)
    filtered = [...filtered].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

    // 5. 按日期标题聚类分组
    const groups = new Map();
    for (const item of filtered) {
      const key = formatTimelineDate(item.createdAt, activeLocale);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(item);
    }

    return Array.from(groups.entries());
  }, [timeFilteredAssets, selectedMediaType, onlyStarred, debouncedSearch, sortOrder, activeLocale]);

  // 未登录提示守卫视图
  if (!user && !isLoading) {
    const loginTarget = localizeStudioPath(`/login?redirect=${encodeURIComponent(localizeStudioPath('/assets', activeLocale))}`, activeLocale);
    return (
      <div className="min-h-screen bg-[#0d0e12] text-ink flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-[#14161b] p-8 text-center shadow-elevation-3">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-brand">
            <Folder className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            {copy.signInTitle}
          </h2>
          <p className="text-xs text-ink-muted leading-relaxed mb-6">
            {copy.signInDesc}
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="w-full h-10 rounded-full bg-brand hover:bg-brand-hover active:bg-brand-active text-ink-on-accent text-xs font-semibold transition-[background-color,color,transform] duration-fast ease-standard active:scale-[0.98] active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring shadow-elevation-1 cursor-pointer"
            >
              {copy.signInBtn}
            </button>
            <Link
              href={loginTarget}
              className="w-full h-10 rounded-full bg-surface hover:bg-surface-raised border border-line text-ink-muted hover:text-ink text-xs font-medium flex items-center justify-center transition-[background-color,color,border-color,transform] duration-fast ease-standard active:scale-[0.98] active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring cursor-pointer"
            >
              {copy.goToLoginPage}
            </Link>
          </div>
        </div>

        {showAuthModal && (
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onSuccess={() => {
              setShowAuthModal(false);
              refreshSession();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0e12] text-ink flex overflow-hidden">
      {/* ============================================================ */}
      {/* 1. 左侧常驻导航侧边栏                                       */}
      {/* ============================================================ */}
      <aside
        className={`h-screen border-r border-white/[0.08] bg-[#111317] flex flex-col shrink-0 transition-all duration-300 z-30 select-none ${
          isSidebarExpanded ? 'w-60' : 'w-[68px]'
        }`}
      >
        {/* 顶部 Logo & 折叠切换按钮 */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-white/[0.06]">
          <Link href={localizeStudioPath('/', activeLocale)} className="flex items-center gap-2 overflow-hidden">
            <BrandLogo brand={brand} />
          </Link>
          <button
            type="button"
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            className="w-7 h-7 rounded-lg text-ink-subtle hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
            title={isSidebarExpanded ? copy.collapseSidebar : copy.expandSidebar}
          >
            {isSidebarExpanded ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* 主菜单导航项 */}
        <nav className="p-3 space-y-1">
          {/* 创作 */}
          <Link
            href={studioBase}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-ink-muted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title={copy.navStudio}
          >
            <Sparkles className="w-5 h-5 shrink-0 text-white/70" />
            {isSidebarExpanded && <span className="text-sm font-medium">{copy.navStudio}</span>}
          </Link>

          {/* 资产 (当前激活项) */}
          <div
            className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/10 text-white font-semibold transition-colors cursor-default shadow-sm"
            title={copy.navAssets}
          >
            <Folder className="w-5 h-5 shrink-0 text-brand" />
            {isSidebarExpanded && <span className="text-sm">{copy.navAssets}</span>}
          </div>

          {/* 主体 */}
          <Link
            href={`${studioBase}?tab=headshot`}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-ink-muted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title={copy.navSubjects}
          >
            <User className="w-5 h-5 shrink-0 text-white/70" />
            {isSidebarExpanded && <span className="text-sm font-medium">{copy.navSubjects}</span>}
          </Link>
        </nav>

        {/* 分割线与下层真实动态子列表 (仅在展开态展示) */}
        {isSidebarExpanded && (
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5 scrollbar-rail border-t border-white/[0.04]">
            {/* 对话列表：真实历史提示词直达入口 */}
            <div>
              <div className="px-3 pb-1 text-xs font-semibold text-ink-subtle uppercase tracking-wider">
                {copy.recentChats}
              </div>
              <div className="space-y-0.5 mt-1">
                {dynamicSessions.length === 0 ? (
                  <div className="px-3 py-1.5 text-xs text-ink-subtle/50 italic">
                    {copy.noRecentChats}
                  </div>
                ) : (
                  dynamicSessions.map((sess) => (
                    <button
                      key={sess.id}
                      type="button"
                      onClick={() => {
                        const params = new URLSearchParams();
                        params.set('tab', sess.tab);
                        if (sess.prompt) params.set('prompt', sess.prompt);
                        if (sess.model) params.set('model', sess.model);
                        router.push(`${studioBase}?${params.toString()}`);
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/5 truncate transition-colors flex items-center gap-2 cursor-pointer"
                      title={sess.fullTitle}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-brand/60 shrink-0" />
                      <span className="truncate">{sess.title}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* 画布功能快捷入口 */}
            <div>
              <div className="px-3 pb-1 text-xs font-semibold text-ink-subtle uppercase tracking-wider">
                {copy.canvases}
              </div>
              <div className="space-y-0.5 mt-1">
                <button
                  type="button"
                  onClick={() => router.push(`${studioBase}?tab=layers`)}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/5 truncate transition-colors flex items-center gap-2 cursor-pointer"
                  title={copy.canvasStudio}
                >
                  <Layers className="w-3.5 h-3.5 text-white/40 shrink-0" />
                  <span className="truncate">{copy.canvasStudio}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ============================================================ */}
      {/* 2. 主内容展示区 (顶部Tabs + 筛选栏 + 时间轴网格)             */}
      {/* ============================================================ */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* 顶部二级导航栏 (生成历史 vs 画布) */}
        <header className="h-14 px-6 border-b border-white/[0.08] bg-[#111317]/80 backdrop-blur-md flex items-center justify-between shrink-0 z-20">
          {/* 左侧 Tabs 切换 */}
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setTopTab('history')}
              className={`text-base font-semibold transition-colors relative py-1 cursor-pointer ${
                topTab === 'history' ? 'text-white' : 'text-ink-muted hover:text-white'
              }`}
            >
              <span>{copy.tabHistory}</span>
              {topTab === 'history' && (
                <span className="absolute bottom-[-15px] left-0 right-0 h-0.5 bg-brand rounded-full shadow-elevation-1" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setTopTab('canvas');
                router.push(`${studioBase}?tab=layers`);
              }}
              className={`text-base font-medium transition-colors relative py-1 cursor-pointer ${
                topTab === 'canvas' ? 'text-white' : 'text-ink-muted hover:text-white'
              }`}
            >
              <span>{copy.tabCanvas}</span>
              {topTab === 'canvas' && (
                <span className="absolute bottom-[-15px] left-0 right-0 h-0.5 bg-brand rounded-full shadow-elevation-1" />
              )}
            </button>
          </div>

          {/* 右侧工具组 (搜索、视图模式、真实积分、用户菜单) */}
          <div className="flex items-center gap-3">
            {/* 搜索框 */}
            <div className="relative hidden sm:block w-48 lg:w-60">
              <Search className="w-3.5 h-3.5 text-ink-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={copy.searchPlaceholder}
                className="w-full h-8 pl-8 pr-3 rounded-full bg-white/5 border border-white/10 text-xs text-white placeholder:text-ink-subtle focus:outline-none focus:border-brand-line transition-colors"
              />
            </div>

            {/* 视图切换 */}
            <div className="flex items-center rounded-lg bg-white/5 p-0.5 border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'grid' ? 'bg-white/15 text-white' : 'text-ink-subtle hover:text-white'
                }`}
                title={copy.gridView}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'list' ? 'bg-white/15 text-white' : 'text-ink-subtle hover:text-white'
                }`}
                title={copy.listView}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 用户下拉菜单 (已内置算力与会员状态胶囊，不再在此处重复展示积分) */}
            <UserDropdownMenu
              user={user}
              credits={credits ?? user?.credits ?? 0}
              entitlements={entitlements}
              locale={activeLocale}
              onOpenAuth={() => setShowAuthModal(true)}
            />
          </div>
        </header>

        {/* 二级筛选栏 (多媒体胶囊 + 筛选/时间/排序下拉) */}
        <div className="h-12 px-6 border-b border-white/[0.06] bg-[#111317]/50 flex items-center justify-between shrink-0 gap-4 relative z-20 overflow-visible">
          {/* 左侧多媒体分类胶囊 (允许在窄屏独立横向滚动，不干扰右侧浮层) */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1 min-w-0">
            {[
              { id: 'all', label: copy.mediaAll },
              { id: 'image', label: copy.mediaImage },
              { id: 'video', label: copy.mediaVideo },
              { id: 'audio', label: copy.mediaAudio },
              { id: 'workflow', label: copy.mediaWorkflow },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedMediaType(cat.id)}
                className={`h-7 px-3.5 rounded-full text-xs shrink-0 transition-[background-color,color,border-color,transform] duration-fast ease-standard active:scale-[0.98] active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring cursor-pointer ${
                  selectedMediaType === cat.id
                    ? 'bg-brand text-ink-on-accent font-semibold shadow-elevation-1'
                    : 'text-ink-muted hover:text-ink hover:bg-wash'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* 右侧筛选下拉控制器 */}
          <div className="flex items-center gap-2 shrink-0 relative">
            {/* 只看收藏 */}
            <button
              type="button"
              onClick={() => setOnlyStarred(!onlyStarred)}
              className={`h-7 px-2.5 rounded-full border text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                onlyStarred
                  ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                  : 'border-white/10 bg-white/5 text-ink-muted hover:text-white'
              }`}
            >
              <Star className={`w-3 h-3 ${onlyStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
              <span>{copy.filterStarred}</span>
            </button>

            {/* 时间范围下拉框 */}
            <div className="relative" ref={timeDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsTimeDropdownOpen((prev) => !prev);
                  setIsSortDropdownOpen(false);
                }}
                className={`h-7 px-2.5 rounded-full border text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                  isTimeDropdownOpen
                    ? 'border-white/25 bg-white/10 text-white'
                    : 'border-white/10 bg-white/5 text-ink-muted hover:text-white'
                }`}
              >
                <span>
                  {timeFilter === 'all'
                    ? copy.timeAll
                    : timeFilter === '7days'
                    ? copy.time7Days
                    : copy.time30Days}
                </span>
                <ChevronDown className={`w-3 h-3 text-white/50 transition-transform ${isTimeDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {isTimeDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-32 rounded-xl bg-[#1c1f26] border border-white/10 shadow-elevation-3 py-1 z-50 animate-fade-in duration-fast">
                  <button
                    type="button"
                    onClick={() => {
                      setTimeFilter('all');
                      setIsTimeDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                      timeFilter === 'all'
                        ? 'text-brand font-medium bg-brand/10'
                        : 'text-ink-muted hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{copy.timeAll}</span>
                    {timeFilter === 'all' && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimeFilter('7days');
                      setIsTimeDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                      timeFilter === '7days'
                        ? 'text-brand font-medium bg-brand/10'
                        : 'text-ink-muted hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{copy.timeLast7Days}</span>
                    {timeFilter === '7days' && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimeFilter('30days');
                      setIsTimeDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                      timeFilter === '30days'
                        ? 'text-brand font-medium bg-brand/10'
                        : 'text-ink-muted hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{copy.timeLast30Days}</span>
                    {timeFilter === '30days' && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                  </button>
                </div>
              )}
            </div>

            {/* 排序下拉框 */}
            <div className="relative" ref={sortDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsSortDropdownOpen((prev) => !prev);
                  setIsTimeDropdownOpen(false);
                }}
                className={`h-7 px-2.5 rounded-full border text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                  isSortDropdownOpen
                    ? 'border-white/25 bg-white/10 text-white'
                    : 'border-white/10 bg-white/5 text-ink-muted hover:text-white'
                }`}
              >
                <span>{sortOrder === 'newest' ? copy.sortNewest : copy.sortOldest}</span>
                <ChevronDown className={`w-3 h-3 text-white/50 transition-transform ${isSortDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {isSortDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-32 rounded-xl bg-[#1c1f26] border border-white/10 shadow-elevation-3 py-1 z-50 animate-fade-in duration-fast">
                  <button
                    type="button"
                    onClick={() => {
                      setSortOrder('newest');
                      setIsSortDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                      sortOrder === 'newest'
                        ? 'text-brand font-medium bg-brand/10'
                        : 'text-ink-muted hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{copy.sortNewestFirst}</span>
                    {sortOrder === 'newest' && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSortOrder('oldest');
                      setIsSortDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                      sortOrder === 'oldest'
                        ? 'text-brand font-medium bg-brand/10'
                        : 'text-ink-muted hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{copy.sortOldestFirst}</span>
                    {sortOrder === 'oldest' && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 核心主展示区：时间轴聚合流 */}
        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-8 scrollbar-rail">
          {isLoading ? (
            /* 加载骨架屏 */
            <div className="space-y-4">
              <div className="h-6 w-32 bg-white/5 rounded-md animate-pulse" />
              <div className="grid grid-cols-[repeat(auto-fill,175px)] gap-3.5 justify-start">
                {Array.from({ length: 14 }).map((_, index) => (
                  <div
                    key={index}
                    className="w-[175px] h-[175px] rounded-xl bg-white/[0.04] border border-white/[0.06] animate-pulse"
                  />
                ))}
              </div>
            </div>
          ) : groupedTimeline.length === 0 ? (
            /* 真实历史空状态 */
            <div className="h-96 flex flex-col items-center justify-center text-center gap-3">
              <Folder className="w-12 h-12 text-ink-subtle/30" />
              <div className="text-sm text-ink-muted">
                {searchQuery || onlyStarred || selectedMediaType !== 'all' || timeFilter !== 'all'
                  ? copy.noMatchingAssets
                  : copy.noAssetsYet}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {(searchQuery || onlyStarred || selectedMediaType !== 'all' || timeFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setOnlyStarred(false);
                      setSelectedMediaType('all');
                      setTimeFilter('all');
                    }}
                    className="h-8 px-4 rounded-full border border-white/15 bg-white/5 text-white/80 text-xs font-medium hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    {copy.resetFilters}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push(studioBase)}
                  className="h-8 px-4 rounded-full bg-brand text-white text-xs font-medium hover:bg-brand-hover transition-colors cursor-pointer shadow-elevation-1"
                >
                  {copy.startCreating}
                </button>
              </div>
            </div>
          ) : (
            groupedTimeline.map(([dateTitle, items]) => (
              <section key={dateTitle} className="space-y-3.5">
                {/* 时间轴吸顶日期标题 */}
                <div className="sticky top-0 z-10 py-1.5 bg-[#0d0e12]/90 backdrop-blur-sm flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white/90 tracking-wide flex items-center gap-2">
                    <span>{dateTitle}</span>
                    <span className="text-xs text-white/40 font-normal">({items.length})</span>
                  </h3>
                </div>

                {/* 媒体卡片响应式网格 (固定175px正方形状) / 列表 */}
                <div
                  className={
                    viewMode === 'grid'
                      ? 'grid grid-cols-[repeat(auto-fill,175px)] gap-3.5 justify-start'
                      : 'flex flex-col gap-3'
                  }
                >
                  {items.map((asset) => (
                    viewMode === 'grid' ? (
                      <div
                        key={asset.id}
                        onClick={() => setSelectedAsset(asset)}
                        className="group relative w-[175px] h-[175px] rounded-xl overflow-hidden border border-white/[0.08] hover:border-white/25 bg-[#17181c] cursor-pointer transition-all duration-300 shadow-sm flex flex-col justify-end shrink-0"
                      >
                        {/* 背景缩略图 / 媒体视图 */}
                        {asset.type === 'audio' ? (
                          <div className="absolute inset-0 bg-[#131418] flex flex-col items-center justify-center gap-1.5 p-3 text-center">
                            <AudioLines className="w-8 h-8 text-brand" />
                            <span className="text-[9px] text-white/50 font-mono tracking-wider">AUDIO</span>
                            <span className="text-[11px] text-white/70 line-clamp-2">{asset.prompt || asset.title}</span>
                          </div>
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={asset.thumbnailUrl || asset.url || '/placeholder.png'}
                            alt={asset.title || 'AI Asset'}
                            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/icon.png'; }}
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        )}

                        {/* 悬停暗色渐变蒙层 */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

                        {/* 左上角扫瞄/检视图标 (悬停展示) */}
                        <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAsset(asset);
                            }}
                            className="w-6 h-6 rounded-lg bg-black/60 hover:bg-black/90 backdrop-blur-md border border-white/10 text-amber-400 hover:text-amber-300 flex items-center justify-center transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer shadow-sm active:scale-95 active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                            title={copy.viewDetail}
                          >
                            <Scan className="w-3 h-3" />
                          </button>
                        </div>

                        {/* 视频角标 (未悬停时显现，悬停时让位给扫瞄图标) */}
                        {asset.type === 'video' && (
                          <div className="absolute top-2 left-2 z-10 pointer-events-none group-hover:opacity-0 transition-opacity">
                            <span className="p-1 rounded-md bg-black/60 backdrop-blur-md text-white flex items-center justify-center">
                              <Play className="w-2.5 h-2.5 fill-white" />
                            </span>
                          </div>
                        )}

                        {/* 右上角收藏星标 (点击即时落库) */}
                        <div className="absolute top-2 right-2 z-10">
                          <button
                            type="button"
                            onClick={(e) => handleToggleStar(e, asset)}
                            className={`w-6 h-6 rounded-full backdrop-blur-md border flex items-center justify-center transition-[background-color,color,border-color,transform] duration-fast ease-standard cursor-pointer active:scale-95 active:duration-instant shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring ${
                              asset.starred
                                ? 'border-amber-400/40 bg-black/70 text-amber-400 opacity-100'
                                : 'border-white/10 bg-black/50 text-white/70 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-black/80'
                            }`}
                            title={asset.starred ? copy.unstar : copy.star}
                          >
                            <Star className={`w-3 h-3 ${asset.starred ? 'fill-amber-400' : ''}`} />
                          </button>
                        </div>

                        {/* 底部悬停操作栏 (图生同款 + 复制提示词 + 删除) */}
                        <div className="relative z-10 p-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between gap-1 w-full">
                          <button
                            type="button"
                            onClick={(e) => handleDoSame(e, asset)}
                            className="h-6 px-2.5 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md border border-white/10 hover:border-white/20 text-white text-[10px] font-medium transition-[background-color,color,border-color,transform] duration-fast ease-standard shadow-sm flex items-center gap-1 cursor-pointer active:scale-95 active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring shrink-0"
                            title={copy.remixTooltip}
                          >
                            <Wand2 className="w-2.5 h-2.5 text-brand" />
                            <span>{copy.remix}</span>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => handleCopyPrompt(e, asset.prompt)}
                              className="w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md border border-white/10 text-white/80 hover:text-white flex items-center justify-center transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer active:scale-95 active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                              title={copy.copyPrompt}
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteAsset(e, asset)}
                              className="w-6 h-6 rounded-full bg-black/60 hover:bg-red-500/80 backdrop-blur-md border border-white/10 text-white/80 hover:text-white flex items-center justify-center transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer active:scale-95 active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                              title={copy.deleteAsset}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* 列表视图：结构清晰的行式卡片 */
                      <div
                        key={asset.id}
                        onClick={() => setSelectedAsset(asset)}
                        className="group relative rounded-xl border border-white/[0.08] hover:border-white/20 bg-[#16181d] hover:bg-[#1a1d23] cursor-pointer transition-all duration-200 p-3 flex items-center justify-between gap-4 shadow-sm"
                      >
                        {/* 左侧固定缩略图 */}
                        <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-lg overflow-hidden shrink-0 bg-black/50 border border-white/10 flex items-center justify-center">
                          {asset.type === 'audio' ? (
                            <div className="flex flex-col items-center justify-center gap-1 text-brand">
                              <AudioLines className="w-6 h-6" />
                              <span className="text-[9px] text-white/50 font-mono">AUDIO</span>
                            </div>
                          ) : (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={asset.thumbnailUrl || asset.url || '/placeholder.png'}
                              alt={asset.title || 'AI Asset'}
                              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/icon.png'; }}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          )}
                          {asset.type === 'video' && (
                            <div className="absolute top-1 left-1 p-0.5 rounded bg-black/70 text-white">
                              <Play className="w-2.5 h-2.5 fill-white" />
                            </div>
                          )}
                        </div>

                        {/* 中间信息区 */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5 gap-1.5">
                          <p className="text-xs font-semibold text-white/90 line-clamp-2 select-text group-hover:text-white">
                            {asset.prompt || asset.title || copy.untitledAsset}
                          </p>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-subtle">
                            <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[10px] text-white/70">
                              {asset.model || 'AI Model'}
                            </span>
                            <span>{asset.quality || '2K'} · {asset.aspectRatio || 'auto'}</span>
                            <span>·</span>
                            <span>{formatTimelineDate(asset.createdAt, activeLocale)}</span>
                            {asset.creditCost > 0 && (
                              <>
                                <span>·</span>
                                <span className="text-brand font-mono">{asset.creditCost} {copy.creditsLabel}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* 右侧动作区 */}
                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => handleDoSame(e, asset)}
                            className="h-7 px-3 rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-medium flex items-center gap-1 cursor-pointer shadow-elevation-1 transition-colors"
                            title={copy.remix}
                          >
                            <Wand2 className="w-3 h-3" />
                            <span className="hidden sm:inline">{copy.remix}</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleCopyPrompt(e, asset.prompt)}
                            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                            title={copy.copyPrompt}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleToggleStar(e, asset)}
                            className={`w-7 h-7 rounded-full border text-xs flex items-center justify-center transition-colors cursor-pointer ${
                              asset.starred
                                ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                                : 'border-white/10 bg-white/5 text-ink-muted hover:text-white'
                            }`}
                            title={asset.starred ? copy.unstar : copy.star}
                          >
                            <Star className={`w-3.5 h-3.5 ${asset.starred ? 'fill-amber-400 text-amber-400' : ''}`} />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleDeleteAsset(e, asset)}
                            className="w-7 h-7 rounded-full bg-white/5 hover:bg-red-500/20 text-ink-subtle hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer"
                            title={copy.deleteAsset}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </section>
            ))
          )}
        </main>
      </div>

      {/* ============================================================ */}
      {/* 3. 资产详情高清预览模态框 (Asset Detail Modal)               */}
      {/* ============================================================ */}
      {selectedAsset && (
        <div
          className={`fixed inset-0 z-modal flex items-center justify-center bg-scrim backdrop-blur-xl p-4 sm:p-6 transition-opacity duration-modal ease-enter ${
            isDetailClosing ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseDetail();
          }}
        >
          <div
            className={`relative max-w-5xl w-full bg-overlay border border-line rounded-2xl overflow-hidden shadow-elevation-4 flex flex-col md:flex-row h-auto md:h-[640px] max-h-[92vh] transition-all duration-modal ease-enter transform ${
              isDetailClosing ? 'scale-95 opacity-0 -translate-y-2' : 'scale-100 opacity-100 translate-y-0'
            }`}
          >
            {/* 关闭按钮 (绝对定位在右上角，加高 z-index 确保永远可点并带缩放微动效) */}
            <button
              type="button"
              onClick={handleCloseDetail}
              className="absolute top-4 right-4 z-40 size-8 rounded-full bg-overlay-glass backdrop-blur-md border border-line-subtle text-ink-muted hover:text-ink hover:bg-well active:scale-95 active:duration-instant flex items-center justify-center transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring shadow-elevation-1"
              title={copy.close}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>

            {/* 左侧高清大图 / 视频 / 音频 展台 (占据 flex-1 且有独立深色背景) */}
            <div className="flex-1 min-w-0 bg-base relative flex items-center justify-center p-4 md:p-8 select-none overflow-hidden min-h-[300px] md:min-h-0">
              {selectedAsset.type === 'video' ? (
                <video
                  src={selectedAsset.url}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="max-h-[75vh] md:max-h-full max-w-full w-auto h-auto object-contain rounded-xl drop-shadow-2xl"
                />
              ) : selectedAsset.type === 'audio' ? (
                <div className="flex flex-col items-center justify-center p-8 text-center max-w-md w-full">
                  <div className="w-20 h-20 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-4 text-brand">
                    <AudioLines className="w-10 h-10" />
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-2">{selectedAsset.title || copy.audioArtwork}</h4>
                  <audio src={selectedAsset.url} controls className="w-full mt-4" />
                </div>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={selectedAsset.url || selectedAsset.previewUrl || selectedAsset.thumbnailUrl}
                  alt={selectedAsset.title || 'Asset Detail'}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = selectedAsset.thumbnailUrl || '/icon.png';
                  }}
                  className="max-h-[75vh] md:max-h-full max-w-full w-auto h-auto object-contain rounded-xl drop-shadow-2xl"
                />
              )}
            </div>

            {/* 右侧元数据与操作面板 (固定宽 380px，保证左右分栏比例绝不折叠；pr-10 避免与右上角关闭按钮发生重叠) */}
            <div className="w-full md:w-[380px] shrink-0 p-6 flex flex-col justify-between border-t md:border-t-0 md:border-l border-line bg-overlay overflow-y-auto max-h-[92vh] md:max-h-none scrollbar-rail min-h-0">
              <div className="space-y-4">
                {/* 顶栏：标签与日期 (加 pr-8 彻底避免与关闭按钮重叠) */}
                <div className="flex items-center justify-between pr-8">
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-soft border border-brand-line text-brand font-medium">
                    {selectedAsset.type === 'video'
                      ? copy.badgeVideo
                      : selectedAsset.type === 'audio'
                      ? copy.badgeAudio
                      : copy.badgeImage}
                  </span>
                  <span className="text-xs text-ink-muted font-mono">
                    {formatTimelineDate(selectedAsset.createdAt, activeLocale)}
                  </span>
                </div>

                {/* 提示词 */}
                <div>
                  <div className="text-xs text-ink-muted mb-1.5 flex items-center justify-between">
                    <span>{copy.promptLabel}</span>
                    <button
                      type="button"
                      onClick={(e) => handleCopyPrompt(e, selectedAsset.prompt)}
                      className="text-xs text-brand hover:text-brand-hover active:scale-95 active:duration-instant flex items-center gap-1 cursor-pointer transition-[color,transform] duration-fast ease-standard"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copy.copyLabel}</span>
                    </button>
                  </div>
                  <p className="text-xs text-ink leading-relaxed bg-well p-3.5 rounded-xl border border-line select-text max-h-40 overflow-y-auto scrollbar-rail">
                    {selectedAsset.prompt ? `“${selectedAsset.prompt}”` : copy.noPromptRecorded}
                  </p>
                </div>

                {/* 真实参数细节 */}
                <div className="space-y-2 pt-2 border-t border-line">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">{copy.modelLabel}</span>
                    <span className="text-ink font-mono truncate max-w-[180px] text-right" title={selectedAsset.model || 'AI Model'}>
                      {selectedAsset.model || 'AI Model'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">{copy.ratioLabel}</span>
                    <span className="text-ink font-mono">
                      {selectedAsset.quality || '2K'} · {selectedAsset.aspectRatio || 'auto'}
                    </span>
                  </div>
                  {selectedAsset.creditCost > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted">{copy.creditsCostLabel}</span>
                      <span className="text-brand font-mono font-semibold">{selectedAsset.creditCost}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 底部动作按钮 (加 shrink-0 与 pb-1 确保绝不被截断) */}
              <div className="pt-6 space-y-2 shrink-0 pb-1">
                <button
                  type="button"
                  onClick={(e) => handleDoSame(e, selectedAsset)}
                  className="w-full h-9 rounded-xl bg-brand hover:bg-brand-hover active:bg-brand-active active:scale-[0.98] active:duration-instant text-ink-on-accent text-xs font-semibold flex items-center justify-center gap-2 shadow-elevation-1 cursor-pointer transition-[background-color,transform] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>{copy.remixInStudio}</span>
                </button>

                {selectedAsset.url && (
                  <a
                    href={selectedAsset.url}
                    download={`${selectedAsset.title || 'asset'}.${selectedAsset.type === 'video' ? 'mp4' : selectedAsset.type === 'audio' ? 'mp3' : 'webp'}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full h-8 rounded-xl bg-well hover:bg-raised active:scale-[0.98] active:duration-instant border border-line text-ink-muted hover:text-ink text-xs font-medium flex items-center justify-center gap-2 transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{copy.downloadOriginal}</span>
                  </a>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={(e) => handleToggleStar(e, selectedAsset)}
                    className={`flex-1 h-8 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-[background-color,color,border-color,transform] duration-fast ease-standard cursor-pointer active:scale-[0.98] active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring ${
                      selectedAsset.starred
                        ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                        : 'border-line bg-well text-ink-muted hover:text-ink hover:bg-raised'
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${selectedAsset.starred ? 'fill-amber-400' : ''}`} />
                    <span>{selectedAsset.starred ? copy.starredDone : copy.star}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDeleteAsset(e, selectedAsset)}
                    className="h-8 px-3.5 rounded-xl border border-danger-line bg-danger-soft text-danger hover:bg-danger hover:text-ink-on-accent active:scale-[0.98] active:duration-instant text-xs font-medium flex items-center justify-center gap-1 transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-danger"
                    title={copy.deleteAsset}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{copy.deleteLabel}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 浮动 Toast 反馈 */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-white text-black text-xs font-semibold shadow-elevation-3 animate-fade-in">
          {toastMessage}
        </div>
      )}

      {/* 登录弹窗 */}
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => {
            setShowAuthModal(false);
            refreshSession();
          }}
        />
      )}
    </div>
  );
}
