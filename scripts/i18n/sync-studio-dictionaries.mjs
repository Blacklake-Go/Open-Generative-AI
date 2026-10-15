import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const STUDIO_MESSAGES = path.join(ROOT, 'packages/studio/src/messages');

function deepMerge(target, source) {
  const output = { ...target };
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = deepMerge(target[key] || {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

const EXTENSIONS = {
  agentStudio: {
    en: {
      auth: {
        heading: "Sign in to use agents",
        description: "Templates, your agents, and chat history are linked to your SupDance account. Please sign in.",
        cta: "Sign in"
      }
    },
    'zh-CN': {
      auth: {
        heading: "登录以使用智能体",
        description: "模板、智能体配置与对话历史已同步至您的 SupDance 账号。请先登录。",
        cta: "立即登录"
      }
    },
    'zh-TW': {
      auth: {
        heading: "登入以使用智慧體",
        description: "範本、智慧體設定與對話歷史已同步至您的 SupDance 帳號。請先登入。",
        cta: "立即登入"
      }
    },
    'ja-JP': {
      auth: {
        heading: "エージェントを使用するにはログインしてください",
        description: "テンプレート、作成したエージェント、チャット履歴はSupDanceアカウントと連携されます。",
        cta: "ログイン"
      }
    },
    'ko-KR': {
      auth: {
        heading: "에이전트를 사용하려면 로그인하세요",
        description: "템플릿, 사용자 에이전트 및 대화 기록이 SupDance 계정과 연동됩니다. 로그인해 주세요.",
        cta: "로그인"
      }
    },
    es: {
      auth: {
        heading: "Inicia sesión para usar los agentes",
        description: "Las plantillas, tus agentes y el historial de chats están vinculados a tu cuenta de SupDance. Inicia sesión.",
        cta: "Iniciar sesión"
      }
    }
  },
  audioStudio: {
    en: {
      player: {
        seek: "Seek position",
        volume: "Volume"
      }
    },
    'zh-CN': {
      player: {
        seek: "调节进度",
        volume: "音量"
      }
    },
    'zh-TW': {
      player: {
        seek: "調節進度",
        volume: "音量"
      }
    },
    'ja-JP': {
      player: {
        seek: "シーク",
        volume: "音量"
      }
    },
    'ko-KR': {
      player: {
        seek: "위치 탐색",
        volume: "볼륨"
      }
    },
    es: {
      player: {
        seek: "Buscar posición",
        volume: "Volumen"
      }
    }
  },
  imageStudio: {
    en: {
      mediaMenu: {
        image: "Image",
        imageDesc: "Generate realistic and stylized images",
        video: "Video",
        videoDesc: "Generate cinematic videos",
        script: "Script",
        scriptDesc: "Generate creative scripts and dialogue",
        audio: "Audio",
        audioDesc: "Generate sound effects and voiceovers"
      },
      paramsPanel: {
        titleRatio: "Aspect Ratio",
        titleResolution: "Resolution",
        titleQuantity: "Generation Quantity",
        titleDimensions: "Dimensions",
        smartRatio: "Smart",
        standard15k: "Standard 1.5K",
        hd2k: "High Definition 2K ✦",
        ultra4k: "Ultra Definition 4K ✦",
        smartReference: "Smart Reference",
        addReference: "Add Reference",
        referenceCount: "Reference Images ({count}/{max})",
        autoSwitchedToI2I: "Switched to reference-compatible model: {model}",
        autoSwitchedToT2I: "Reverted to text-to-image model",
        modeImageGen: "Image Generation",
        modeImageToImage: "Image-to-Image",
        creditPerImage: "✦ {cost}/image",
        creditPerImageOriginal: "11/image",
        batchCountUnit: "{count} img"
      },
      modelDropdown: {
        selectModelHeader: "Select Model"
      }
    },
    'zh-CN': {
      mediaMenu: {
        image: "图片",
        imageDesc: "生成逼真细腻的各类风格图像",
        video: "视频",
        videoDesc: "生成高画质电影级运镜视频",
        script: "剧本",
        scriptDesc: "生成创意剧本分镜与对白",
        audio: "音频",
        audioDesc: "生成拟真音效与专业配音"
      },
      paramsPanel: {
        titleRatio: "画幅比例",
        titleResolution: "分辨率",
        titleQuantity: "生成张数",
        titleDimensions: "尺寸规格",
        smartRatio: "智能自适应",
        standard15k: "标准 1.5K",
        hd2k: "高清 2K ✦",
        ultra4k: "超清 4K ✦",
        smartReference: "智能垫图参考",
        addReference: "添加参考图",
        referenceCount: "参考图 ({count}/{max})",
        autoSwitchedToI2I: "已自动切换至垫图兼容模型：{model}",
        autoSwitchedToT2I: "已恢复为文生图模型",
        modeImageGen: "文生图",
        modeImageToImage: "图生图",
        creditPerImage: "✦ {cost}/张",
        creditPerImageOriginal: "11/张",
        batchCountUnit: "{count} 张"
      },
      modelDropdown: {
        selectModelHeader: "选择生成模型"
      }
    },
    'zh-TW': {
      mediaMenu: {
        image: "圖片",
        imageDesc: "生成逼真細膩的各類風格圖像",
        video: "影片",
        videoDesc: "生成高畫質電影級運鏡影片",
        script: "劇本",
        scriptDesc: "生成創意劇本分鏡與對白",
        audio: "音訊",
        audioDesc: "生成擬真音效與專業配音"
      },
      paramsPanel: {
        titleRatio: "畫幅比例",
        titleResolution: "解析度",
        titleQuantity: "生成張數",
        titleDimensions: "尺寸規格",
        smartRatio: "智慧自適應",
        standard15k: "標準 1.5K",
        hd2k: "高清 2K ✦",
        ultra4k: "超清 4K ✦",
        smartReference: "智慧墊圖參考",
        addReference: "新增參考圖",
        referenceCount: "參考圖 ({count}/{max})",
        autoSwitchedToI2I: "已自動切換至墊圖相容模型：{model}",
        autoSwitchedToT2I: "已恢復為文生圖模型",
        modeImageGen: "文生圖",
        modeImageToImage: "圖生圖",
        creditPerImage: "✦ {cost}/張",
        creditPerImageOriginal: "11/張",
        batchCountUnit: "{count} 張"
      },
      modelDropdown: {
        selectModelHeader: "選擇生成模型"
      }
    },
    'ja-JP': {
      mediaMenu: {
        image: "画像",
        imageDesc: "リアルでスタイリッシュな画像を生成",
        video: "動画",
        videoDesc: "映画クオリティの映像を生成",
        script: "シナリオ",
        scriptDesc: "クリエイティブな脚本とセリフを生成",
        audio: "音声",
        audioDesc: "効果音や高品質ナレーションを生成"
      },
      paramsPanel: {
        titleRatio: "アスペクト比",
        titleResolution: "解像度",
        titleQuantity: "生成枚数",
        titleDimensions: "サイズ",
        smartRatio: "スマート比率",
        standard15k: "標準 1.5K",
        hd2k: "高解像度 2K ✦",
        ultra4k: "超高解像度 4K ✦",
        smartReference: "スマート参照",
        addReference: "参照画像を追加",
        referenceCount: "参照画像 ({count}/{max})",
        autoSwitchedToI2I: "参照対応モデルに切り替えました: {model}",
        autoSwitchedToT2I: "テキスト生成モデルに戻しました",
        modeImageGen: "画像生成",
        modeImageToImage: "画像から画像",
        creditPerImage: "✦ {cost}/枚",
        creditPerImageOriginal: "11/枚",
        batchCountUnit: "{count} 枚"
      },
      modelDropdown: {
        selectModelHeader: "モデルを選択"
      }
    },
    'ko-KR': {
      mediaMenu: {
        image: "이미지",
        imageDesc: "고품질 스타일의 이미지 생성",
        video: "비디오",
        videoDesc: "영화 같은 연출의 영상 생성",
        script: "대본",
        scriptDesc: "창의적인 스토리 및 대사 생성",
        audio: "오디오",
        audioDesc: "생생한 효과음 및 보이스 생성"
      },
      paramsPanel: {
        titleRatio: "화면 비율",
        titleResolution: "해상도",
        titleQuantity: "생성 수량",
        titleDimensions: "크기",
        smartRatio: "스마트 비율",
        standard15k: "기본 1.5K",
        hd2k: "고해상도 2K ✦",
        ultra4k: "초고해상도 4K ✦",
        smartReference: "스마트 참조",
        addReference: "참조 이미지 추가",
        referenceCount: "참조 이미지 ({count}/{max})",
        autoSwitchedToI2I: "참조 지원 모델로 전환됨: {model}",
        autoSwitchedToT2I: "텍스트-이미지 모델로 복귀됨",
        modeImageGen: "이미지 생성",
        modeImageToImage: "이미지 투 이미지",
        creditPerImage: "✦ {cost}/장",
        creditPerImageOriginal: "11/장",
        batchCountUnit: "{count} 장"
      },
      modelDropdown: {
        selectModelHeader: "모델 선택"
      }
    },
    es: {
      mediaMenu: {
        image: "Imagen",
        imageDesc: "Genera imágenes realistas y estilizadas",
        video: "Video",
        videoDesc: "Genera videos cinematográficos",
        script: "Guión",
        scriptDesc: "Genera guiones y diálogos creativos",
        audio: "Audio",
        audioDesc: "Genera efectos de sonido y locuciones"
      },
      paramsPanel: {
        titleRatio: "Relación de Aspecto",
        titleResolution: "Resolución",
        titleQuantity: "Cantidad de Generación",
        titleDimensions: "Dimensiones",
        smartRatio: "Inteligente",
        standard15k: "Estándar 1.5K",
        hd2k: "Alta Definición 2K ✦",
        ultra4k: "Ultra Definición 4K ✦",
        smartReference: "Referencia Inteligente",
        addReference: "Añadir Referencia",
        referenceCount: "Imágenes de Referencia ({count}/{max})",
        autoSwitchedToI2I: "Cambiado a modelo compatible con referencias: {model}",
        autoSwitchedToT2I: "Revertido a modelo de texto a imagen",
        modeImageGen: "Generación de Imagen",
        modeImageToImage: "Imagen a Imagen",
        creditPerImage: "✦ {cost}/imagen",
        creditPerImageOriginal: "11/imagen",
        batchCountUnit: "{count} img"
      },
      modelDropdown: {
        selectModelHeader: "Seleccionar modelo"
      }
    }
  }
};

const LOCALE_DIRS = {
  en: 'en',
  'zh-CN': 'zh',
  'zh-TW': 'zh-TW',
  'ja-JP': 'ja-JP',
  'ko-KR': 'ko-KR',
  es: 'es'
};

for (const [moduleName, locMap] of Object.entries(EXTENSIONS)) {
  for (const [locCode, extension] of Object.entries(locMap)) {
    const dir = LOCALE_DIRS[locCode];
    const filePath = path.join(STUDIO_MESSAGES, dir, `${moduleName}.json`);
    if (!fs.existsSync(filePath)) continue;
    let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data = deepMerge(data, extension);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`✓ Updated packages/studio/src/messages/${dir}/${moduleName}.json`);
  }
}
