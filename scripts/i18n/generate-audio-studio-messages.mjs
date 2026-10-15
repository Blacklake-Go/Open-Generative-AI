import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const STUDIO_MESSAGES = path.join(ROOT, 'packages/studio/src/messages');

const modelsData = {
  en: {
    "suno-create-music": {
      name: "Suno Create Music",
      description: "Suno generates music that turns text prompts into full songs — complete with vocals, lyrics, and instrumentation. Describe a mood, genre, or specific lyric idea, and Suno creates a realistic, studio-quality track in seconds."
    },
    "suno-remix-music": {
      name: "Suno Remix Music",
      description: "Remix and rearrange existing audio tracks with new styles and prompts to create brand-new musical arrangements."
    },
    "suno-extend-music": {
      name: "Suno Extend Music",
      description: "Seamlessly extend and continue existing audio tracks from any specified timestamp."
    },
    "suno-generate-sounds": {
      name: "Suno Generate Sounds",
      description: "Create realistic sound effects, ambient atmospheres, transition sounds, and rhythm loops from text descriptions."
    },
    "suno-add-vocals": {
      name: "Suno Add Vocals",
      description: "Add expressive, natural-sounding vocal tracks and singing over an existing instrumental track."
    },
    "suno-generate-mashup": {
      name: "Suno Generate Mashup",
      description: "Blend and mash up multiple audio tracks into a cohesive, creative musical fusion."
    },
    "suno-add-instrumental": {
      name: "Suno Add Instrumental",
      description: "Generate full instrumental backing arrangements for raw vocal recordings or audio snippets."
    },
    "suno-voice-clone": {
      name: "Suno Voice Cloning",
      description: "Clone and extract vocal personas from uploaded audio to use in custom music generation."
    },
    "minimax-voice-clone": {
      name: "Minimax Voice Clone",
      description: "High-accuracy voice replication with automatic background noise reduction and volume normalization."
    },
    "minimax-speech-2.6-hd": {
      name: "Minimax Speech HD",
      description: "Flagship high-definition multilingual text-to-speech with expressive emotions, pitch, and speed adjustments."
    },
    "minimax-speech-2.6-turbo": {
      name: "Minimax Speech Turbo",
      description: "Ultra-low latency speech synthesis optimized for real-time conversational agents and long-form voice generation."
    },
    "mmaudio-v2-text-to-audio": {
      name: "MM Audio V2",
      description: "Advanced multimodal audio synthesis that turns textual descriptions into high-fidelity soundscapes and audio effects."
    },
    "elevenlabs-text-to-dialogue-v3": {
      name: "ElevenLabs Text to Dialogue V3",
      description: "Multi-speaker theatrical dialogue generation with distinct persona voices and dramatic nuances."
    },
    "suno-convert-to-wav": {
      name: "Suno Convert to WAV",
      description: "Convert generated Suno audio tracks to lossless studio-grade WAV format."
    },
    "gemini-3-1-flash-tts": {
      name: "Gemini 3.1 Flash TTS",
      description: "Google Gemini next-generation Flash speech engine with natural pacing, multi-turn dialogue, and vivid expression."
    },
    "gemini-2-5-pro-tts": {
      name: "Gemini 2.5 Pro TTS",
      description: "Google Gemini 2.5 Pro studio-grade neural voice synthesis designed for audiobooks and cinematic narration."
    },
    "elevenlabs-tts-turbo-2-5": {
      name: "ElevenLabs TTS Turbo 2.5",
      description: "Industry-leading lifelike speech synthesis with ultra-fast generation and fine-grained voice stability control."
    },
    "minimax-music-3.0": {
      name: "MiniMax Music 3.0",
      description: "Generate full songs with vocals or instrumental tracks from text prompts and structured lyrics."
    }
  },
  zh: {
    "suno-create-music": {
      name: "Suno 音乐创作",
      description: "Suno 可将文本提示词生成包含人声、歌词和伴奏的完整歌曲。您可以描述情绪、风格甚至具体的歌词灵感，Suno 即可在数秒内创作出录音室品质的音轨。"
    },
    "suno-remix-music": {
      name: "Suno 音乐混音",
      description: "基于已有参考音频与文本提示词进行风格重混与重新编曲，创造全新音乐风格。"
    },
    "suno-extend-music": {
      name: "Suno 音乐续写",
      description: "延长或续写现有音轨，在指定时间点无缝衔接后续乐段或副歌。"
    },
    "suno-generate-sounds": {
      name: "Suno 音效生成",
      description: "根据文字描述生成各类拟真音效、环境音、过渡转场声与节奏循环。"
    },
    "suno-add-vocals": {
      name: "Suno 添加人声",
      description: "为已有的纯器乐伴奏音轨添加逼真且富有表现力的人声演唱。"
    },
    "suno-generate-mashup": {
      name: "Suno 混搭串烧",
      description: "融合多首参考音轨的旋律与风格，生成创意十足的音乐混搭作品。"
    },
    "suno-add-instrumental": {
      name: "Suno 添加伴奏",
      description: "为人声干音或音频片段智能编配完整的器乐伴奏。"
    },
    "suno-voice-clone": {
      name: "Suno 声音克隆",
      description: "上传人声音频提取音色特征，生成专属声音人设用于音乐创作。"
    },
    "minimax-voice-clone": {
      name: "MiniMax 声音克隆",
      description: "高精度复刻目标说话人的音色，支持降噪与音量自适应标准化。"
    },
    "minimax-speech-2.6-hd": {
      name: "MiniMax 语音 HD",
      description: "MiniMax 旗舰级高清多语种语音合成，支持细腻情感与语速音调调节。"
    },
    "minimax-speech-2.6-turbo": {
      name: "MiniMax 语音 Turbo",
      description: "极速低延迟语音合成模型，适合实时交互、对话与大段文本转语音。"
    },
    "mmaudio-v2-text-to-audio": {
      name: "MM Audio V2 文本生成音频",
      description: "先进的多模态音频合成模型，精准将文字描述转化为高保真自然声音与音效。"
    },
    "elevenlabs-text-to-dialogue-v3": {
      name: "ElevenLabs 多角色对话 V3",
      description: "支持多说话人角色的智能剧本对话合成，逼真呈现人物对白与语气张力。"
    },
    "suno-convert-to-wav": {
      name: "Suno 转 WAV 高清格式",
      description: "将之前生成的 Suno 音乐转换为无损高品质 WAV 音频文件。"
    },
    "gemini-3-1-flash-tts": {
      name: "Gemini 3.1 Flash 语音合成",
      description: "Google Gemini 最新 Flash 语音引擎，支持丰富场景、情感音色与多轮自然对话。"
    },
    "gemini-2-5-pro-tts": {
      name: "Gemini 2.5 Pro 语音合成",
      description: "Google Gemini 2.5 Pro 级超自然高拟真语音合成，专为专业长篇与影视级旁白设计。"
    },
    "elevenlabs-tts-turbo-2-5": {
      name: "ElevenLabs 极速语音 2.5",
      description: "ElevenLabs 行业领先的拟真人声合成，具备超高音色还原度与自然流利度。"
    },
    "minimax-music-3.0": {
      name: "MiniMax 音乐 3.0",
      description: "MiniMax 音乐大模型，支持根据提示词与结构化歌词生成完整歌曲或纯伴奏。"
    }
  },
  "zh-TW": {
    "suno-create-music": {
      name: "Suno 音樂創作",
      description: "Suno 可將文字提示詞生成包含人聲、歌詞與伴奏的完整歌曲。您可以描述情緒、風格甚至具體的歌詞靈感，Suno 即可在數秒內創作出錄音室品質的音軌。"
    },
    "suno-remix-music": {
      name: "Suno 音樂混音",
      description: "基於已有參考音訊與文字提示詞進行風格重混與重新編曲，創造全新音樂風格。"
    },
    "suno-extend-music": {
      name: "Suno 音樂續寫",
      description: "延長或續寫現有音軌，在指定時間點無縫銜接後續樂段或副歌。"
    },
    "suno-generate-sounds": {
      name: "Suno 音效生成",
      description: "根據文字描述生成各類擬真音效、環境音、過渡轉場聲與節奏循環。"
    },
    "suno-add-vocals": {
      name: "Suno 新增人聲",
      description: "為已有的純器樂伴奏音軌新增逼真且富有表現力的人聲演唱。"
    },
    "suno-generate-mashup": {
      name: "Suno 混搭串燒",
      description: "融合多首參考音軌的旋律與風格，生成創意十足的音樂混搭作品。"
    },
    "suno-add-instrumental": {
      name: "Suno 新增伴奏",
      description: "為人聲乾音或音訊片段智慧編配完整的器樂伴奏。"
    },
    "suno-voice-clone": {
      name: "Suno 聲音克隆",
      description: "上傳人聲音訊提取音色特徵，生成專屬聲音人設用於音樂創作。"
    },
    "minimax-voice-clone": {
      name: "MiniMax 聲音克隆",
      description: "高精度復刻目標說話人的音色，支援降噪與音量自適應標準化。"
    },
    "minimax-speech-2.6-hd": {
      name: "MiniMax 語音 HD",
      description: "MiniMax 旗艦級高解析多語種語音合成，支援細膩情感與語速音調調節。"
    },
    "minimax-speech-2.6-turbo": {
      name: "MiniMax 語音 Turbo",
      description: "極速低延遲語音合成模型，適合即時互動、對話與大段文字轉語音。"
    },
    "mmaudio-v2-text-to-audio": {
      name: "MM Audio V2 文字生成音訊",
      description: "先進的多模態音訊合成模型，精準將文字描述轉化為高保真自然聲音與音效。"
    },
    "elevenlabs-text-to-dialogue-v3": {
      name: "ElevenLabs 多角色對話 V3",
      description: "支援多說話人角色的智慧劇本對話合成，逼真呈現人物對白與語氣張力。"
    },
    "suno-convert-to-wav": {
      name: "Suno 轉 WAV 高清格式",
      description: "將之前生成的 Suno 音樂轉換為無損高品質 WAV 音訊檔案。"
    },
    "gemini-3-1-flash-tts": {
      name: "Gemini 3.1 Flash 語音合成",
      description: "Google Gemini 最新 Flash 語音引擎，支援豐富場景、情感音色與多輪自然對話。"
    },
    "gemini-2-5-pro-tts": {
      name: "Gemini 2.5 Pro 語音合成",
      description: "Google Gemini 2.5 Pro 級超自然高擬真語音合成，專為專業長篇與影視級旁白設計。"
    },
    "elevenlabs-tts-turbo-2-5": {
      name: "ElevenLabs 極速語音 2.5",
      description: "ElevenLabs 行業領先的擬真人聲合成，具備超高音色還原度與自然流利度。"
    },
    "minimax-music-3.0": {
      name: "MiniMax 音樂 3.0",
      description: "MiniMax 音樂大模型，支援根據提示詞與結構化歌詞生成完整歌曲或純伴奏。"
    }
  },
  "ja-JP": {
    "suno-create-music": {
      name: "Suno 音楽生成",
      description: "Sunoはテキストプロンプトからボーカル、歌詞、楽器演奏を含むフル楽曲を即座に生成します。気分、ジャンル、具体的な歌詞のアイデアを指定すれば、スタジオ品質のトラックを作成できます。"
    },
    "suno-remix-music": {
      name: "Suno 音楽リミックス",
      description: "既存の音声トラックを新しいスタイルやプロンプトで再構成し、全く新しいアレンジを生み出します。"
    },
    "suno-extend-music": {
      name: "Suno 音楽拡張・延長",
      description: "既存の音声トラックを指定した秒数からシームレスに延長・展開します。"
    },
    "suno-generate-sounds": {
      name: "Suno 効果音生成",
      description: "テキストからリアルな効果音、環境音、トランジション音、リズムループを生成します。"
    },
    "suno-add-vocals": {
      name: "Suno ボーカル追加",
      description: "既存のインストゥルメンタル音源に表現力豊かなボーカルと歌声を追加します。"
    },
    "suno-generate-mashup": {
      name: "Suno マッシュアップ",
      description: "複数のオーディオトラックを融合し、独創的なマッシュアップ作品を作成します。"
    },
    "suno-add-instrumental": {
      name: "Suno 伴奏追加",
      description: "アカペラや音声クリップに合わせた本格的な楽器伴奏を自動生成します。"
    },
    "suno-voice-clone": {
      name: "Suno 声・ボーカルクローン",
      description: "音声サンプルから声質を抽出し、楽曲制作に使える専用ボイスペルソナを作成します。"
    },
    "minimax-voice-clone": {
      name: "MiniMax 声・ボイスクローン",
      description: "高精度に対象の話者の声を再現。ノイズ除去と音量正規化にも対応しています。"
    },
    "minimax-speech-2.6-hd": {
      name: "MiniMax 音声合成 HD",
      description: "MiniMaxの高品位多言語音声合成。豊かな感情表現、話速、ピッチ調整に対応。"
    },
    "minimax-speech-2.6-turbo": {
      name: "MiniMax 音声合成 Turbo",
      description: "極めて低遅延な音声合成モデル。リアルタイム対話や長文の読み上げに最適です。"
    },
    "mmaudio-v2-text-to-audio": {
      name: "MM Audio V2 音声生成",
      description: "文字による描写を高品位な自然環境音やサウンドエフェクトに変換するマルチモーダル音声モデル。"
    },
    "elevenlabs-text-to-dialogue-v3": {
      name: "ElevenLabs 複数人対話 V3",
      description: "複数キャラクターによる掛け合いスクリプトを、臨場感あふれる声と表現力で合成します。"
    },
    "suno-convert-to-wav": {
      name: "Suno WAV 変換",
      description: "生成されたSunoトラックをスタジオ品質のロスレスWAV形式に変換します。"
    },
    "gemini-3-1-flash-tts": {
      name: "Gemini 3.1 Flash 音声合成",
      description: "Google Geminiの最新Flash音声エンジン。自然な間、対話、生き生きとした抑揚に対応。"
    },
    "gemini-2-5-pro-tts": {
      name: "Gemini 2.5 Pro 音声合成",
      description: "オーディオブックや映画のナレーション向けに設計された極めて自然なニューラル音声合成。"
    },
    "elevenlabs-tts-turbo-2-5": {
      name: "ElevenLabs 高速音声合成 2.5",
      description: "業界最高水準のリアルな音声合成。高速生成と細やかな声の安定性制御に対応。"
    },
    "minimax-music-3.0": {
      name: "MiniMax 音楽 3.0",
      description: "プロンプトと構造化された歌詞から、ボーカル入り楽曲または伴奏曲を生成します。"
    }
  },
  "ko-KR": {
    "suno-create-music": {
      name: "Suno 음악 생성",
      description: "Suno는 텍스트 프롬프트를 보컬, 가사, 악기 연주가 포함된 완성도 높은 음악으로 변환합니다. 분위기나 장르, 구체적인 가사를 입력하면 스튜디오급 고음질 트랙을 몇 초 만에 제작합니다."
    },
    "suno-remix-music": {
      name: "Suno 음악 리믹스",
      description: "기존 오디오 트랙을 새로운 스타일과 프롬프트로 재해석하여 색다른 음악적 편곡을 만듭니다."
    },
    "suno-extend-music": {
      name: "Suno 음악 이어하기 (연장)",
      description: "지정한 시간대부터 기존 트랙을 자연스럽고 매끄럽게 확장하여 이어갑니다."
    },
    "suno-generate-sounds": {
      name: "Suno 사운드 효과음 생성",
      description: "텍스트 설명으로 사실적인 음향 효과, 배경 분위기음, 전환음 및 리듬 루프를 만듭니다."
    },
    "suno-add-vocals": {
      name: "Suno 보컬 추가",
      description: "기존 연주곡 트랙에 감성적이고 자연스러운 보컬 가창을 추가합니다."
    },
    "suno-generate-mashup": {
      name: "Suno 매시업 생성",
      description: "여러 오디오 트랙의 멜로디와 분위기를 융합하여 독창적인 매시업 음악을 완성합니다."
    },
    "suno-add-instrumental": {
      name: "Suno 반주 추가",
      description: "음성 녹음이나 보컬 클립에 어울리는 풍성한 악기 반주를 자동으로 구성합니다."
    },
    "suno-voice-clone": {
      name: "Suno 음성 클론",
      description: "업로드한 음성에서 음색을 추출하여 음악 제작에 활용할 수 있는 보이스 페르소나를 생성합니다."
    },
    "minimax-voice-clone": {
      name: "MiniMax 음성 클론",
      description: "잡음 제거 및 볼륨 표준화 기능을 갖춘 정밀한 타깃 화자 음성 복제 모델입니다."
    },
    "minimax-speech-2.6-hd": {
      name: "MiniMax 음성 HD",
      description: "감정 표현, 말하기 속도, 음높이 조절이 가능한 MiniMax 프리미엄 다국어 음성 합성입니다."
    },
    "minimax-speech-2.6-turbo": {
      name: "MiniMax 음성 Turbo",
      description: "실시간 대화와 긴 텍스트 낭독에 최적화된 초저지연 음성 합성 모델입니다."
    },
    "mmaudio-v2-text-to-audio": {
      name: "MM Audio V2 텍스트-오디오",
      description: "텍스트 묘사를 고음질 자연 음향 및 사운드 효과로 구현하는 고급 멀티모달 오디오 모델입니다."
    },
    "elevenlabs-text-to-dialogue-v3": {
      name: "ElevenLabs 다자간 대화 V3",
      description: "다양한 캐릭터 음성과 연기 뉘앙스를 담은 시나리오 기반 다화자 대화를 생성합니다."
    },
    "suno-convert-to-wav": {
      name: "Suno WAV 변환",
      description: "생성된 Suno 음악을 무손실 스튜디오 품질의 WAV 파일로 변환합니다."
    },
    "gemini-3-1-flash-tts": {
      name: "Gemini 3.1 Flash 음성 합성",
      description: "자연스러운 호흡과 억양, 다자간 대화를 지원하는 Google Gemini 차세대 음성 엔진입니다."
    },
    "gemini-2-5-pro-tts": {
      name: "Gemini 2.5 Pro 음성 합성",
      description: "오디오북 및 영화 내레이션을 위해 설계된 스튜디오급 초자연적 신경망 음성 합성입니다."
    },
    "elevenlabs-tts-turbo-2-5": {
      name: "ElevenLabs 초고속 음성 2.5",
      description: "매우 빠른 생성 속도와 섬세한 음성 안정성 제어를 제공하는 최고 수준의 실감형 음성 합성입니다."
    },
    "minimax-music-3.0": {
      name: "MiniMax 음악 3.0",
      description: "프롬프트와 구조화된 가사를 바탕으로 보컬곡 또는 연주곡을 생성하는 음악 모델입니다."
    }
  },
  es: {
    "suno-create-music": {
      name: "Suno Creación Musical",
      description: "Suno transforma indicaciones de texto en canciones completas con voces, letra e instrumentación. Describe un estado de ánimo o género y crea pistas con calidad de estudio en segundos."
    },
    "suno-remix-music": {
      name: "Suno Remix Musical",
      description: "Remezcla y reorganiza pistas de audio existentes con nuevos estilos y descripciones para crear arreglos musicales originales."
    },
    "suno-extend-music": {
      name: "Suno Extensión Musical",
      description: "Extiende y continúa pistas de audio existentes sin cortes desde el segundo especificado."
    },
    "suno-generate-sounds": {
      name: "Suno Generación de Sonidos",
      description: "Crea efectos de sonido realistas, atmósferas ambientales y bucles rítmicos a partir de texto."
    },
    "suno-add-vocals": {
      name: "Suno Agregar Voces",
      description: "Agrega pistas vocales expresivas y canto sobre una pista instrumental existente."
    },
    "suno-generate-mashup": {
      name: "Suno Generador de Mashups",
      description: "Combina múltiples pistas de audio en una fusión musical creativa y armónica."
    },
    "suno-add-instrumental": {
      name: "Suno Agregar Instrumental",
      description: "Genera arreglos instrumentales completos para grabaciones de voz o fragmentos de audio."
    },
    "suno-voice-clone": {
      name: "Suno Clonación de Voz",
      description: "Clona y extrae personajes vocales de audios subidos para utilizarlos en creaciones musicales."
    },
    "minimax-voice-clone": {
      name: "MiniMax Clonación de Voz",
      description: "Replicación de voz de alta precisión con reducción automática de ruido y normalización de volumen."
    },
    "minimax-speech-2.6-hd": {
      name: "MiniMax Voz HD",
      description: "Síntesis de voz multilingüe de alta definición con emociones expresivas, tono y velocidad ajustables."
    },
    "minimax-speech-2.6-turbo": {
      name: "MiniMax Voz Turbo",
      description: "Modelo de voz de latencia ultrabaja optimizado para asistentes conversacionales y locuciones largas."
    },
    "mmaudio-v2-text-to-audio": {
      name: "MM Audio V2 Texto a Audio",
      description: "Síntesis de audio multimodal avanzada que convierte descripciones de texto en paisajes sonoros de alta fidelidad."
    },
    "elevenlabs-text-to-dialogue-v3": {
      name: "ElevenLabs Diálogo Múltiple V3",
      description: "Generación de diálogos teatrales con múltiples hablantes, personalidades vocales y matices dramáticos."
    },
    "suno-convert-to-wav": {
      name: "Suno Convertir a WAV",
      description: "Convierte pistas de música generadas en Suno a formato WAV sin pérdida con calidad de estudio."
    },
    "gemini-3-1-flash-tts": {
      name: "Gemini 3.1 Flash TTS",
      description: "Motor de voz Flash de Google Gemini con ritmo natural, diálogo multiturno y expresiones vívidas."
    },
    "gemini-2-5-pro-tts": {
      name: "Gemini 2.5 Pro TTS",
      description: "Síntesis de voz neuronal de calidad profesional para audiolibros y narraciones cinematográficas."
    },
    "elevenlabs-tts-turbo-2-5": {
      name: "ElevenLabs TTS Turbo 2.5",
      description: "Síntesis de voz hiperrealista con generación ultrarrápida y control preciso de estabilidad."
    },
    "minimax-music-3.0": {
      name: "MiniMax Música 3.0",
      description: "Genera canciones completas con voz o pistas puramente instrumentales con MiniMax Music 3.0."
    }
  }
};

modelsData['es-ES'] = modelsData.es;

const fieldsData = {
  en: {
    prompt: {
      title: "Lyrics / Prompt",
      description: "Text prompt describing desired audio content or exact lyrics to be sung in the track.",
      placeholder: "Enter what you want generated or type your lyrics here...",
      example: "Hard-hitting rap track with aggressive beat and confident male vocals about winning."
    },
    style: {
      title: "Music Style",
      description: "Music style specification for the generated audio.",
      placeholder: "Jazz, Classical, Electronic, Pop, Rock, Hip-hop, etc.",
      example: "Classical"
    },
    model: {
      title: "Model Version",
      description: "The AI model version to use for generation."
    },
    custom_mode: {
      title: "Custom Mode",
      description: "Enable custom mode for advanced settings."
    },
    title: {
      title: "Track Title",
      description: "Title for the generated music track (optional).",
      placeholder: "Peaceful Piano Meditation"
    },
    persona_id: {
      title: "Persona ID",
      description: "Persona ID or custom voice ID to apply to the generated music (optional).",
      placeholder: "Enter persona ID..."
    },
    persona_model: {
      title: "Persona Model Type",
      description: "Select persona model type (style or voice persona).",
      options: {
        style_persona: "Style Persona",
        voice_persona: "Voice Persona"
      }
    },
    instrumental: {
      title: "Instrumental Only",
      description: "Generate purely instrumental music without vocals or sung lyrics."
    },
    negative_tags: {
      title: "Negative Tags",
      description: "Music styles or traits to exclude from the generated audio (optional).",
      placeholder: "Heavy Metal, Upbeat Drums"
    },
    vocal_gender: {
      title: "Vocal Gender",
      description: "Preferred gender for vocal performances.",
      options: {
        male: "Male",
        female: "Female"
      }
    },
    style_weight: {
      title: "Style Weight",
      description: "Influence weight of the specified musical style (0 to 1)."
    },
    weirdness_constraint: {
      title: "Creativity / Weirdness",
      description: "Adjust experimental freedom and unconventionality."
    },
    audio_weight: {
      title: "Audio Weight",
      description: "Weight of source audio reference in remix or continuation."
    },
    audio_url: {
      title: "Audio File",
      description: "Upload or provide an audio URL to use as reference."
    },
    continue_at: {
      title: "Continue At (seconds)",
      description: "Exact timestamp in seconds from which to extend the track."
    },
    sound_loop: {
      title: "Seamless Loop",
      description: "Generate an audio track that loops seamlessly."
    },
    sound_tempo: {
      title: "Tempo (BPM)",
      description: "Tempo specification in beats per minute."
    },
    sound_key: {
      title: "Musical Key",
      description: "Musical key and scale for the generated sound (e.g. C Major, A Minor)."
    },
    grab_lyrics: {
      title: "Extract Lyrics",
      description: "Extract and retain sung lyrics from the input audio."
    },
    audios_list: {
      title: "Audio Track List",
      description: "List of audio tracks to combine into a mashup."
    },
    tags: {
      title: "Style Tags",
      description: "Tags describing musical genre, mood, and instruments."
    },
    voice_name: {
      title: "Voice Name",
      description: "Custom name for the cloned voice profile."
    },
    description: {
      title: "Description",
      description: "Description of voice profile or musical style."
    },
    language: {
      title: "Language",
      description: "Primary speaking or singing language."
    },
    vocal_start_s: {
      title: "Vocal Start Time (s)",
      description: "Start position of vocal sample in seconds."
    },
    vocal_end_s: {
      title: "Vocal End Time (s)",
      description: "End position of vocal sample in seconds."
    },
    custom_voice_id: {
      title: "Custom Voice ID",
      description: "Target voice profile identifier."
    },
    need_noise_reduction: {
      title: "Noise Reduction",
      description: "Filter background noise from uploaded voice recordings."
    },
    need_volume_normalization: {
      title: "Volume Normalization",
      description: "Automatically balance audio volume levels."
    },
    accuracy: {
      title: "Cloning Accuracy",
      description: "Voice similarity fidelity setting."
    },
    voice_id: {
      title: "Preset Voice / Speaker",
      description: "Select a curated speaker profile for voice synthesis."
    },
    speed: {
      title: "Speech Speed",
      description: "Speed multiplier for speech synthesis (1.0 is normal speed)."
    },
    volume: {
      title: "Speech Volume",
      description: "Audio output volume multiplier."
    },
    pitch: {
      title: "Voice Pitch",
      description: "Pitch adjustment for synthesized speech."
    },
    emotion: {
      title: "Emotion",
      description: "Emotional expression and delivery style.",
      options: {
        happy: "Happy",
        sad: "Sad",
        angry: "Angry",
        fearful: "Fearful",
        disgusted: "Disgusted",
        surprised: "Surprised",
        neutral: "Neutral"
      }
    },
    english_normalization: {
      title: "English Normalization",
      description: "Enhance text normalization for numbers, symbols, and dates in English."
    },
    sample_rate: {
      title: "Sample Rate (Hz)",
      description: "Audio sampling rate in Hertz."
    },
    bitrate: {
      title: "Bitrate (bps)",
      description: "Audio bitrate in bits per second."
    },
    channel: {
      title: "Audio Channels",
      description: "Audio channel format.",
      options: {
        "1": "Mono (1 Channel)",
        "2": "Stereo (2 Channels)"
      }
    },
    format: {
      title: "Audio Format",
      description: "Output audio file container format.",
      options: {
        mp3: "MP3",
        wav: "WAV",
        pcm: "PCM",
        flac: "FLAC"
      }
    },
    language_boost: {
      title: "Language Boost",
      description: "Enhance speech clarity and dialect recognition for selected language."
    },
    duration: {
      title: "Duration (seconds)",
      description: "Length of generated audio in seconds."
    },
    dialogue: {
      title: "Dialogue Script",
      description: "Multi-turn conversational script for speech synthesis."
    },
    stability: {
      title: "Voice Stability",
      description: "Voice consistency and delivery stability (0 to 1)."
    },
    similarity_boost: {
      title: "Similarity Boost",
      description: "Enhance vocal similarity and character fidelity."
    },
    language_code: {
      title: "Language Code",
      description: "Target language ISO code for speech synthesis."
    },
    task_id: {
      title: "Task ID",
      description: "Task identifier from a previous generation to convert."
    },
    audio_id: {
      title: "Audio ID",
      description: "Specific audio track identifier to convert."
    },
    speakers: {
      title: "Speakers",
      description: "Configured character voices for dialogue generation."
    },
    dialogue_turns: {
      title: "Dialogue Turns",
      description: "Sequential speaker dialogue turns."
    },
    scene: {
      title: "Acoustic Scene",
      description: "Acoustic atmosphere and reverberation environment."
    },
    sample_context: {
      title: "Sample Context / Tone",
      description: "Overall narration tone, delivery style, and context."
    },
    temperature: {
      title: "Temperature",
      description: "Sampling creativity and variability (0 to 2)."
    },
    lyrics: {
      title: "Structured Lyrics",
      description: "Lyrics text with line breaks and optional instrumental section markers.",
      placeholder: "Enter lyrics with verse/chorus structure...",
      example: "Walking through the neon lights\nWe are shining, we are free"
    },
    is_instrumental: {
      title: "Instrumental Only",
      description: "Generate purely instrumental music with no vocals."
    }
  },
  zh: {
    prompt: {
      title: "歌词 / 提示词",
      description: "描述您想要的音频内容。提示词将作为歌词在生成的曲目中演唱。",
      placeholder: "输入您想要生成的内容或在此输入歌词...",
      example: "激昂震撼的中文说唱曲目，伴随强劲节奏与自信的男声演唱，主题关于追逐胜利与梦想。"
    },
    style: {
      title: "音乐风格",
      description: "生成音频的音乐风格规范与流派定义。",
      placeholder: "爵士、古典、电子、流行、摇滚、嘻哈、国风等",
      example: "古典"
    },
    model: {
      title: "模型版本",
      description: "用于生成的 AI 模型版本。"
    },
    custom_mode: {
      title: "自定义模式",
      description: "开启自定义模式以解锁更多高级设置。"
    },
    title: {
      title: "曲目标题",
      description: "生成音乐曲目的标题（可选）。",
      placeholder: "宁静钢琴冥想"
    },
    persona_id: {
      title: "音色/人设 ID",
      description: "应用于生成音乐的角色 ID 或自定义声音 ID（可选）。",
      placeholder: "输入人设或声音 ID..."
    },
    persona_model: {
      title: "人设模型类型",
      description: "选择人设 ID 类型，用于区分克隆音色与预设风格。",
      options: {
        style_persona: "风格人设",
        voice_persona: "声音人设"
      }
    },
    instrumental: {
      title: "纯音乐伴奏",
      description: "开启此选项可生成纯器乐伴奏（无人声）。若关闭，提示词将作为歌词演唱。"
    },
    negative_tags: {
      title: "排除风格 / 负向标签",
      description: "从生成音频中排除的音乐风格或特征（可选）。",
      placeholder: "重金属，强烈鼓点"
    },
    vocal_gender: {
      title: "人声音色性别",
      description: "生成演唱人声的首选性别。",
      options: {
        male: "男声",
        female: "女声"
      }
    },
    style_weight: {
      title: "风格权重",
      description: "所指定音乐风格对生成结果的影响比重（0 到 1）。"
    },
    weirdness_constraint: {
      title: "创意自由度 / 奇特度约束",
      description: "调节音乐旋律的实验性与非常规自由度。"
    },
    audio_weight: {
      title: "参考音频权重",
      description: "参考或原音频在混音/续写中的权重占比。"
    },
    audio_url: {
      title: "音频文件",
      description: "上传或输入音频 URL 作为参考音轨。"
    },
    continue_at: {
      title: "续写起点（秒）",
      description: "从指定时间点（秒）开始继续延长生成音频。"
    },
    sound_loop: {
      title: "无缝循环音效",
      description: "生成可无缝循环播放的音频片段。"
    },
    sound_tempo: {
      title: "节拍速度 (BPM)",
      description: "生成音频的每分钟节拍数 (BPM)。"
    },
    sound_key: {
      title: "调式 / 调号",
      description: "生成音频的音乐调号与调式（如 C大调、A小调）。"
    },
    grab_lyrics: {
      title: "提取歌词",
      description: "自动提取并保留输入音频中的演唱歌词。"
    },
    audios_list: {
      title: "音频文件列表",
      description: "待合并混搭的多段音频文件列表。"
    },
    tags: {
      title: "风格标签",
      description: "描述音乐流派、情绪与乐器特征的标签。"
    },
    voice_name: {
      title: "音色名称",
      description: "为克隆的声音角色设置自定义名称。"
    },
    description: {
      title: "音色描述",
      description: "声音角色的音色特点或应用场景描述。"
    },
    language: {
      title: "主要语言",
      description: "说话人或演唱的主要语言。"
    },
    vocal_start_s: {
      title: "人声起始时间（秒）",
      description: "截取目标人声样本的起始秒数。"
    },
    vocal_end_s: {
      title: "人声结束时间（秒）",
      description: "截取目标人声样本的结束秒数。"
    },
    custom_voice_id: {
      title: "自定义音色 ID",
      description: "目标声音角色的唯一识别码。"
    },
    need_noise_reduction: {
      title: "智能降噪",
      description: "自动消除输入人声音频中的环境背景杂音。"
    },
    need_volume_normalization: {
      title: "音量标准化",
      description: "自动平衡并标准化音频整体音量电平。"
    },
    accuracy: {
      title: "克隆保真度",
      description: "声音克隆的特征还原精度等级。"
    },
    voice_id: {
      title: "预设音色 / 说话人",
      description: "选择官方精选的预设配音音色角色。"
    },
    speed: {
      title: "语速倍率",
      description: "语音播放速度倍率（1.0 为正常语速）。"
    },
    volume: {
      title: "输出音量",
      description: "语音输出音量大小倍率。"
    },
    pitch: {
      title: "语调音高",
      description: "生成语音的音高升降调节。"
    },
    emotion: {
      title: "情感语调",
      description: "语音演绎所表达的情感色彩。",
      options: {
        happy: "高兴 / 开心",
        sad: "悲伤",
        angry: "愤怒",
        fearful: "恐惧",
        disgusted: "厌恶",
        surprised: "惊讶",
        neutral: "自然 / 中性"
      }
    },
    english_normalization: {
      title: "英文读法规范化",
      description: "优化英文文本中的数字、符号与日期读音规范。"
    },
    sample_rate: {
      title: "采样率 (Hz)",
      description: "输出音频的每秒采样频率。"
    },
    bitrate: {
      title: "比特率 (bps)",
      description: "输出音频的数据传输速率。"
    },
    channel: {
      title: "声道设置",
      description: "输出音频的声音通道格式。",
      options: {
        "1": "单声道 (Mono)",
        "2": "立体声 (Stereo)"
      }
    },
    format: {
      title: "音频格式",
      description: "生成的音频文件封装格式。",
      options: {
        mp3: "MP3 格式",
        wav: "WAV 无损",
        pcm: "PCM 原始",
        flac: "FLAC 无损"
      }
    },
    language_boost: {
      title: "多语种识别增强",
      description: "针对选定语言优化音素识别与发音清晰度。"
    },
    duration: {
      title: "音频时长（秒）",
      description: "期望生成的音频长度（秒）。"
    },
    dialogue: {
      title: "对话剧本",
      description: "用于多角色配音对话的结构化剧本文本。"
    },
    stability: {
      title: "声音稳定性",
      description: "合成音色的稳定一致性控制（0 到 1）。"
    },
    similarity_boost: {
      title: "音色相似度增强",
      description: "强化与原始说话人音色的声线相似程度。"
    },
    language_code: {
      title: "语言代码",
      description: "语音合成的目标语言 ISO 代码。"
    },
    task_id: {
      title: "任务 ID",
      description: "先前生成任务的请求 ID，用于格式转换。"
    },
    audio_id: {
      title: "音频 ID",
      description: "待转换处理的目标音频音轨识别码。"
    },
    speakers: {
      title: "说话人角色配置",
      description: "对话中参与的说话人角色音色定义。"
    },
    dialogue_turns: {
      title: "对话对白轮次",
      description: "按时间顺序排列的多角色对话对白。"
    },
    scene: {
      title: "声学场景氛围",
      description: "设定录音环境的声学反射与环境空间混响。"
    },
    sample_context: {
      title: "演播风格 / 语调背景",
      description: "整体朗读风格、叙事基调与氛围背景描述。"
    },
    temperature: {
      title: "创意发散度 (Temperature)",
      description: "语音生成的随机性与创造性自由度（0 到 2）。"
    },
    lyrics: {
      title: "结构化歌词",
      description: "包含主歌、副歌等乐段标记的歌词文本。",
      placeholder: "在此输入带有结构标记的歌词...",
      example: "漫步在闪烁的霓虹街头\n我们自由奔跑，光芒万丈"
    },
    is_instrumental: {
      title: "仅生成纯音乐伴奏",
      description: "生成无人声演唱的纯乐器演奏曲目。"
    }
  },
  "zh-TW": {
    prompt: {
      title: "歌詞 / 提示詞",
      description: "描述您想要的音訊內容。提示詞將作為歌詞在生成的曲目中演唱。",
      placeholder: "輸入您想要生成的內容或在此輸入歌詞...",
      example: "激昂震撼的中文說唱曲目，伴隨強勁節奏與自信的男聲演唱，主題關於追逐勝利與夢想。"
    },
    style: {
      title: "音樂風格",
      description: "生成音訊的音樂風格規範與流派定義。",
      placeholder: "爵士、古典、電子、流行、搖滾、嘻哈、國風等",
      example: "古典"
    },
    model: {
      title: "模型版本",
      description: "用於生成的 AI 模型版本。"
    },
    custom_mode: {
      title: "自訂模式",
      description: "開啟自訂模式以解鎖更多進階設定。"
    },
    title: {
      title: "曲目標題",
      description: "生成音樂曲目的標題（可選）。",
      placeholder: "寧靜鋼琴冥想"
    },
    persona_id: {
      title: "音色/人設 ID",
      description: "應用於生成音樂的角色 ID 或自訂聲音 ID（可選）。",
      placeholder: "輸入人設或聲音 ID..."
    },
    persona_model: {
      title: "人設模型類型",
      description: "選擇人設 ID 類型，用於區分克隆音色與預設風格。",
      options: {
        style_persona: "風格人設",
        voice_persona: "聲音人設"
      }
    },
    instrumental: {
      title: "純音樂伴奏",
      description: "開啟此選項可生成純器樂伴奏（無人聲）。若關閉，提示詞將作為歌詞演唱。"
    },
    negative_tags: {
      title: "排除風格 / 負向標籤",
      description: "從生成音訊中排除的音樂風格或特徵（可選）。",
      placeholder: "重金屬，強烈鼓點"
    },
    vocal_gender: {
      title: "人聲音色性別",
      description: "生成演唱人聲的首選性別。",
      options: {
        male: "男聲",
        female: "女聲"
      }
    },
    style_weight: {
      title: "風格權重",
      description: "所指定音樂風格對生成結果的影響比重（0 到 1）。"
    },
    weirdness_constraint: {
      title: "創意自由度 / 奇特度約束",
      description: "調節音樂旋律的實驗性與非常規自由度。"
    },
    audio_weight: {
      title: "參考音訊權重",
      description: "參考或原音訊在混音/續寫中的權重佔比。"
    },
    audio_url: {
      title: "音訊檔案",
      description: "上傳或輸入音訊 URL 作為參考音軌。"
    },
    continue_at: {
      title: "續寫起點（秒）",
      description: "從指定時間點（秒）開始繼續延長生成音訊。"
    },
    sound_loop: {
      title: "無縫循環音效",
      description: "生成可無縫循環播放的音訊片段。"
    },
    sound_tempo: {
      title: "節拍速度 (BPM)",
      description: "生成音訊的每分鐘節拍數 (BPM)。"
    },
    sound_key: {
      title: "調式 / 調號",
      description: "生成音訊的音樂調號與調式（如 C大調、A小調）。"
    },
    grab_lyrics: {
      title: "提取歌詞",
      description: "自動提取並保留輸入音訊中的演唱歌詞。"
    },
    audios_list: {
      title: "音訊檔案列表",
      description: "待合併混搭的多段音訊檔案列表。"
    },
    tags: {
      title: "風格標籤",
      description: "描述音樂流派、情緒與樂器特徵的標籤。"
    },
    voice_name: {
      title: "音色名稱",
      description: "為克隆的聲音角色設定自訂名稱。"
    },
    description: {
      title: "音色描述",
      description: "聲音角色的音色特點或應用場景描述。"
    },
    language: {
      title: "主要語言",
      description: "說話人或演唱的主要語言。"
    },
    vocal_start_s: {
      title: "人聲起始時間（秒）",
      description: "截取目標人聲樣本的起始秒數。"
    },
    vocal_end_s: {
      title: "人聲結束時間（秒）",
      description: "截取目標人聲樣本的結束秒數。"
    },
    custom_voice_id: {
      title: "自訂音色 ID",
      description: "目標聲音角色的唯一識別碼。"
    },
    need_noise_reduction: {
      title: "智慧降噪",
      description: "自動消除輸入人聲音訊中的環境背景雜音。"
    },
    need_volume_normalization: {
      title: "音量標準化",
      description: "自動平衡並標準化音訊整體音量電平。"
    },
    accuracy: {
      title: "克隆保真度",
      description: "聲音克隆的特徵還原精度等級。"
    },
    voice_id: {
      title: "預設音色 / 說話人",
      description: "選擇官方精選的預設配音音色角色。"
    },
    speed: {
      title: "語速倍率",
      description: "語音播放速度倍率（1.0 為正常語速）。"
    },
    volume: {
      title: "輸出音量",
      description: "語音輸出音量大小倍率。"
    },
    pitch: {
      title: "語調音高",
      description: "生成語音的音高升降調節。"
    },
    emotion: {
      title: "情感語調",
      description: "語音演繹所表達的情感色彩。",
      options: {
        happy: "高興 / 開心",
        sad: "悲傷",
        angry: "憤怒",
        fearful: "恐懼",
        disgusted: "厭惡",
        surprised: "驚訝",
        neutral: "自然 / 中性"
      }
    },
    english_normalization: {
      title: "英文讀法規範化",
      description: "優化英文文字中的數字、符號與日期讀音規範。"
    },
    sample_rate: {
      title: "取樣率 (Hz)",
      description: "輸出音訊的每秒取樣頻率。"
    },
    bitrate: {
      title: "位元速率 (bps)",
      description: "輸出音訊的資料傳輸速率。"
    },
    channel: {
      title: "聲道設定",
      description: "輸出音訊的聲音通道格式。",
      options: {
        "1": "單聲道 (Mono)",
        "2": "立體聲 (Stereo)"
      }
    },
    format: {
      title: "音訊格式",
      description: "生成的音訊檔案封裝格式。",
      options: {
        mp3: "MP3 格式",
        wav: "WAV 無損",
        pcm: "PCM 原始",
        flac: "FLAC 無損"
      }
    },
    language_boost: {
      title: "多語種識別增強",
      description: "針對選定語言優化音素識別與發音清晰度。"
    },
    duration: {
      title: "音訊時長（秒）",
      description: "期望生成的音訊長度（秒）。"
    },
    dialogue: {
      title: "對話劇本",
      description: "用於多角色配音對話的結構化劇本文字。"
    },
    stability: {
      title: "聲音穩定性",
      description: "合成音色的穩定一致性控制（0 到 1）。"
    },
    similarity_boost: {
      title: "音色相似度增強",
      description: "強化與原始說話人音色的聲線相似程度。"
    },
    language_code: {
      title: "語言代碼",
      description: "語音合成的目標語言 ISO 代碼。"
    },
    task_id: {
      title: "任務 ID",
      description: "先前生成任務的請求 ID，用於格式轉換。"
    },
    audio_id: {
      title: "音訊 ID",
      description: "待轉換處理的目標音訊音軌識別碼。"
    },
    speakers: {
      title: "說話人角色配置",
      description: "對話中參與的說話人角色音色定義。"
    },
    dialogue_turns: {
      title: "對話對白輪次",
      description: "按時間順序排列的多角色對話對白。"
    },
    scene: {
      title: "聲學場景氛圍",
      description: "設定錄音環境的聲學反射與環境空間混響。"
    },
    sample_context: {
      title: "演播風格 / 語調背景",
      description: "整體朗讀風格、敘事基調與氛圍背景描述。"
    },
    temperature: {
      title: "創意發散度 (Temperature)",
      description: "語音生成的隨機性與創造性自由度（0 到 2）。"
    },
    lyrics: {
      title: "結構化歌詞",
      description: "包含主歌、副歌等樂段標記的歌詞文字。",
      placeholder: "在此輸入帶有結構標記的歌詞...",
      example: "漫步在閃爍的霓虹街頭\n我們自由奔跑，光芒萬丈"
    },
    is_instrumental: {
      title: "僅生成純音樂伴奏",
      description: "生成無人聲演唱的純樂器演奏曲目。"
    }
  },
  "ja-JP": {
    prompt: {
      title: "歌詞 / プロンプト",
      description: "生成したい音声内容の説明。プロンプトは歌詞として楽曲内で歌唱されます。",
      placeholder: "生成したい内容や歌詞を入力してください...",
      example: "勝利への決意を歌う、重厚なビートと力強い男性ボーカルのラップトラック。"
    },
    style: {
      title: "音楽スタイル",
      description: "生成する音声の音楽スタイル指定。",
      placeholder: "ジャズ、クラシック、エレクトロニック、ポップ、ロック、ヒップホップなど",
      example: "クラシック"
    },
    model: {
      title: "モデルバージョン",
      description: "生成に使用する AI モデルのバージョン。"
    },
    custom_mode: {
      title: "カスタムモード",
      description: "高度な設定のためのカスタムモードを有効にします。"
    },
    title: {
      title: "曲名・タイトル",
      description: "生成する音楽トラックのタイトル（任意）。",
      placeholder: "穏やかなピアノ瞑想"
    },
    persona_id: {
      title: "ペルソナ ID",
      description: "生成音楽に適用するキャラクター ID またはカスタム音声 ID（任意）。",
      placeholder: "ペルソナ ID を入力..."
    },
    persona_model: {
      title: "ペルソナモデルタイプ",
      description: "スタイルプリセットとボイスクローンを区別するためのペルソナタイプ選択。",
      options: {
        style_persona: "スタイルペルソナ",
        voice_persona: "ボイスペルソナ"
      }
    },
    instrumental: {
      title: "インストゥルメンタルのみ",
      description: "ボーカルなしの純粋な楽器演奏曲を生成します。"
    },
    negative_tags: {
      title: "除外スタイル / ネガティブタグ",
      description: "生成音声から除外したい音楽スタイルや特徴（任意）。",
      placeholder: "ヘヴィメタル、アップビートドラム"
    },
    vocal_gender: {
      title: "ボーカルの性別",
      description: "歌唱ボーカルの希望する性別。",
      options: {
        male: "男性",
        female: "女性"
      }
    },
    style_weight: {
      title: "スタイルウェイト",
      description: "指定した音楽スタイルの反映度合い（0〜1）。"
    },
    weirdness_constraint: {
      title: "特異性制約 / 創造性",
      description: "音楽の実験性や独自性の度合いを調整します。"
    },
    audio_weight: {
      title: "オーディオウェイト",
      description: "リミックスや継続生成時における参照音声の重み。"
    },
    audio_url: {
      title: "音声ファイル",
      description: "参照用の音声ファイルをアップロードまたはURL入力。"
    },
    continue_at: {
      title: "継続開始位置（秒）",
      description: "トラックを延長開始する秒数位置。"
    },
    sound_loop: {
      title: "シームレスループ",
      description: "継ぎ目なくループ再生可能なオーディオを生成します。"
    },
    sound_tempo: {
      title: "テンポ (BPM)",
      description: "生成する音の1分あたりの拍数 (BPM)。"
    },
    sound_key: {
      title: "調・キー",
      description: "生成する音の調性（例：ハ長調、イ短調）。"
    },
    grab_lyrics: {
      title: "歌詞を抽出",
      description: "入力オーディオから歌唱歌詞を自動抽出して保持します。"
    },
    audios_list: {
      title: "オーディオトラック一覧",
      description: "マッシュアップに結合するオーディオトラックの一覧。"
    },
    tags: {
      title: "スタイルタグ",
      description: "ジャンル、ムード、楽器を表すタグ。"
    },
    voice_name: {
      title: "音声の名前",
      description: "クローンしたボイスプロファイルの名前。"
    },
    description: {
      title: "説明",
      description: "音声プロファイルやスタイルの説明。"
    },
    language: {
      title: "主要言語",
      description: "話者または歌唱のメイン言語。"
    },
    vocal_start_s: {
      title: "ボーカル開始秒数",
      description: "ボーカルサンプルの抽出開始秒数。"
    },
    vocal_end_s: {
      title: "ボーカル終了秒数",
      description: "ボーカルサンプルの抽出終了秒数。"
    },
    custom_voice_id: {
      title: "カスタム音声 ID",
      description: "対象ボイスプロファイルの識別子。"
    },
    need_noise_reduction: {
      title: "ノイズ低減",
      description: "録音音声の背景ノイズを自動で除去します。"
    },
    need_volume_normalization: {
      title: "音量正規化",
      description: "音声の音量を自動的に均一化します。"
    },
    accuracy: {
      title: "クローン精度",
      description: "音声クローンの再現精度設定。"
    },
    voice_id: {
      title: "音声プリセット",
      description: "厳選されたプリセット話者プロファイルを選択。"
    },
    speed: {
      title: "話速",
      description: "音声合成の読み上げ速度（1.0が標準速度）。"
    },
    volume: {
      title: "音量",
      description: "音声出力の音量倍率。"
    },
    pitch: {
      title: "ピッチ（音の高さ）",
      description: "合成音声の音の高さ調整。"
    },
    emotion: {
      title: "感情表現",
      description: "音声に込める感情トーン。",
      options: {
        happy: "喜び・明るい",
        sad: "悲しみ",
        angry: "怒り",
        fearful: "恐れ",
        disgusted: "嫌悪",
        surprised: "驚き",
        neutral: "標準・ニュートラル"
      }
    },
    english_normalization: {
      title: "英語テキスト正規化",
      description: "英語の数値、記号、日付の読み方を最適化します。"
    },
    sample_rate: {
      title: "サンプリングレート (Hz)",
      description: "生成音声の1秒あたりのサンプリング周波数。"
    },
    bitrate: {
      title: "ビットレート (bps)",
      description: "生成音声のビットレート。"
    },
    channel: {
      title: "チャンネル数",
      description: "オーディオ出力のチャンネル形式。",
      options: {
        "1": "モノラル (1ch)",
        "2": "ステレオ (2ch)"
      }
    },
    format: {
      title: "オーディオ形式",
      description: "出力する音声ファイルのコンテナ形式。",
      options: {
        mp3: "MP3 形式",
        wav: "WAV（ロスレス）",
        pcm: "PCM 生データ",
        flac: "FLAC（可逆圧縮）"
      }
    },
    language_boost: {
      title: "言語認識強化",
      description: "指定した言語の発音・イントネーション認識を強化。"
    },
    duration: {
      title: "音声の長さ（秒）",
      description: "生成する音声の秒数長。"
    },
    dialogue: {
      title: "対話スクリプト",
      description: "複数キャラクターによる掛け合いスクリプト。"
    },
    stability: {
      title: "音声の安定性",
      description: "合成音声の一貫性と安定性の度合い（0〜1）。"
    },
    similarity_boost: {
      title: "類似度ブースト",
      description: "元の話者との声質の類似性を強化します。"
    },
    language_code: {
      title: "言語コード",
      description: "音声合成の対象言語 ISO コード。"
    },
    task_id: {
      title: "タスク ID",
      description: "以前の生成リクエストのタスク ID。"
    },
    audio_id: {
      title: "オーディオ ID",
      description: "変換対象のオーディオトラック ID。"
    },
    speakers: {
      title: "話者設定",
      description: "対話に参加する各キャラクターの声の設定。"
    },
    dialogue_turns: {
      title: "対話ターン",
      description: "時系列順に並んだ対話セリフのリスト。"
    },
    scene: {
      title: "音響シーン設定",
      description: "録音環境の音響特性や空間リバーブ設定。"
    },
    sample_context: {
      title: "朗読スタイル・トーン",
      description: "全体的な語り口、トーン、文脈の指示。"
    },
    temperature: {
      title: "温度 (Temperature)",
      description: "サンプリングのランダム性と創造性（0〜2）。"
    },
    lyrics: {
      title: "構造化歌詞",
      description: "Aメロ、サビなどの構成マーカーを含む歌詞テキスト。",
      placeholder: "セクション分けされた歌詞を入力...",
      example: "街のネオンを駆け抜けて\n私たちは自由、輝き続ける"
    },
    is_instrumental: {
      title: "インストゥルメンタルのみ",
      description: "歌声を含まない純粋な楽器演奏のみを生成します。"
    }
  },
  "ko-KR": {
    prompt: {
      title: "가사 / 프롬프트",
      description: "원하는 오디오 콘텐츠를 설명하세요. 프롬프트는 가사로 사용되어 생성된 트랙에서 노래됩니다.",
      placeholder: "생성하고 싶은 내용이나 가사를 입력하세요...",
      example: "승리를 향한 결의를 노래하는 강렬한 비트와 자신감 넘치는 남성 보컬 랩 트랙."
    },
    style: {
      title: "음악 스타일",
      description: "생성할 오디오의 음악 스타일 지정.",
      placeholder: "재즈, 클래식, 일렉트로닉, 팝, 록, 힙합 등",
      example: "클래식"
    },
    model: {
      title: "모델 버전",
      description: "생성에 사용할 AI 모델 버전."
    },
    custom_mode: {
      title: "커스텀 모드",
      description: "고급 설정을 위한 커스텀 모드를 활성화합니다."
    },
    title: {
      title: "트랙 제목",
      description: "생성할 음악 트랙의 제목 (선택 사항).",
      placeholder: "평화로운 피아노 명상"
    },
    persona_id: {
      title: "페르소나 ID",
      description: "생성 음악에 적용할 캐릭터 ID 또는 커스텀 음성 ID (선택 사항).",
      placeholder: "페르소나 ID 입력..."
    },
    persona_model: {
      title: "페르소나 모델 유형",
      description: "스타일 프리셋과 복제 음성을 구분하기 위한 페르소나 유형 선택.",
      options: {
        style_persona: "스타일 페르소나",
        voice_persona: "보이스 페르소나"
      }
    },
    instrumental: {
      title: "연주곡 전용",
      description: "보컬이나 가사 없이 순수 악기 연주곡만 생성합니다."
    },
    negative_tags: {
      title: "제외할 스타일 / 부정적 태그",
      description: "생성 오디오에서 배제할 음악 스타일이나 특징 (선택 사항).",
      placeholder: "헤비메탈, 빠른 드럼"
    },
    vocal_gender: {
      title: "보컬 성별",
      description: "가창 보컬의 선호 성별.",
      options: {
        male: "남성",
        female: "여성"
      }
    },
    style_weight: {
      title: "스타일 가중치",
      description: "지정된 음악 스타일의 반영 비율 (0 ~ 1)."
    },
    weirdness_constraint: {
      title: "특이성 제약 / 창의성",
      description: "음악의 실험성과 파격성 수준을 조절합니다."
    },
    audio_weight: {
      title: "오디오 가중치",
      description: "리믹스나 이어하기 시 원본 참조 오디오의 반영 비율."
    },
    audio_url: {
      title: "오디오 파일",
      description: "참조할 오디오 파일을 업로드하거나 URL을 입력하세요."
    },
    continue_at: {
      title: "이어하기 시작 지점 (초)",
      description: "트랙 연장을 시작할 기준 시간 (초)."
    },
    sound_loop: {
      title: "심리스 루프",
      description: "매끄럽게 반복 재생되는 오디오 트랙을 생성합니다."
    },
    sound_tempo: {
      title: "템포 (BPM)",
      description: "생성할 사운드의 분당 비트 수 (BPM)."
    },
    sound_key: {
      title: "조성 / 키",
      description: "생성할 사운드의 음악 키 (예: C Major, A Minor)."
    },
    grab_lyrics: {
      title: "가사 추출",
      description: "입력 오디오에서 가창 가사를 자동으로 추출하여 보존합니다."
    },
    audios_list: {
      title: "오디오 트랙 목록",
      description: "매시업으로 결합할 오디오 트랙 목록."
    },
    tags: {
      title: "스타일 태그",
      description: "장르, 분위기, 악기를 설명하는 태그."
    },
    voice_name: {
      title: "음성 이름",
      description: "복제된 보이스 프로필의 사용자 지정 이름."
    },
    description: {
      title: "설명",
      description: "음성 프로필이나 음악 스타일에 대한 설명."
    },
    language: {
      title: "주요 언어",
      description: "화자 또는 가창의 주요 언어."
    },
    vocal_start_s: {
      title: "보컬 시작 시간 (초)",
      description: "보컬 샘플 추출 시작 초."
    },
    vocal_end_s: {
      title: "보컬 종료 시간 (초)",
      description: "보컬 샘플 추출 종료 초."
    },
    custom_voice_id: {
      title: "커스텀 음성 ID",
      description: "대상 보이스 프로필 고유 식별자."
    },
    need_noise_reduction: {
      title: "노이즈 감소",
      description: "업로드된 음성 녹음의 배경 잡음을 자동으로 제거합니다."
    },
    need_volume_normalization: {
      title: "음량 정규화",
      description: "오디오의 전반적인 볼륨을 자동으로 평준화합니다."
    },
    accuracy: {
      title: "클론 정확도",
      description: "음성 복제의 정밀도 설정."
    },
    voice_id: {
      title: "프리셋 음성 / 화자",
      description: "음성 합성을 위한 엄선된 화자 프로필을 선택하세요."
    },
    speed: {
      title: "말하기 속도",
      description: "음성 재생 속도 배율 (1.0이 기본 속도)."
    },
    volume: {
      title: "볼륨 크기",
      description: "음성 출력 볼륨 배율."
    },
    pitch: {
      title: "음높이 (피치)",
      description: "합성된 음성의 피치 조절."
    },
    emotion: {
      title: "감정 표현",
      description: "음성에 담길 감정 톤.",
      options: {
        happy: "기쁨 / 밝음",
        sad: "슬픔",
        angry: "분노",
        fearful: "두려움",
        disgusted: "혐오",
        surprised: "놀람",
        neutral: "자연스러움 / 중립"
      }
    },
    english_normalization: {
      title: "영어 텍스트 정규화",
      description: "영어 텍스트의 숫자, 기호, 날짜 발음을 최적화합니다."
    },
    sample_rate: {
      title: "샘플링 레이트 (Hz)",
      description: "출력 오디오의 초당 샘플링 주파수."
    },
    bitrate: {
      title: "비트레이트 (bps)",
      description: "출력 오디오의 데이터 전송률."
    },
    channel: {
      title: "채널 설정",
      description: "오디오 출력 채널 포맷.",
      options: {
        "1": "모노 (1채널)",
        "2": "스테레오 (2채널)"
      }
    },
    format: {
      title: "오디오 포맷",
      description: "출력 오디오 파일 형식.",
      options: {
        mp3: "MP3 포맷",
        wav: "WAV 무손실",
        pcm: "PCM 원시 데이터",
        flac: "FLAC 무손실"
      }
    },
    language_boost: {
      title: "언어 인식 강화",
      description: "선택한 언어의 발음 및 억양 인식을 강화합니다."
    },
    duration: {
      title: "오디오 길이 (초)",
      description: "생성할 오디오의 길이 (초)."
    },
    dialogue: {
      title: "대화 스크립트",
      description: "여러 캐릭터가 참여하는 대화 스크립트."
    },
    stability: {
      title: "음성 안정성",
      description: "합성 음성의 일관성 및 안정성 비율 (0 ~ 1)."
    },
    similarity_boost: {
      title: "유사도 향상",
      description: "원본 화자와의 음색 유사성을 극대화합니다."
    },
    language_code: {
      title: "언어 코드",
      description: "음성 합성 대상 언어의 ISO 코드."
    },
    task_id: {
      title: "작업 ID",
      description: "변환할 이전 생성 요청의 고유 작업 ID."
    },
    audio_id: {
      title: "오디오 ID",
      description: "변환할 대상 오디오 트랙의 ID."
    },
    speakers: {
      title: "화자 설정",
      description: "대화에 참여하는 캐릭터별 목소리 설정."
    },
    dialogue_turns: {
      title: "대화 턴",
      description: "순서대로 나열된 캐릭터별 대사 목록."
    },
    scene: {
      title: "음향 공간 배경",
      description: "녹음 환경의 음향 반사 및 공간 잔향 설정."
    },
    sample_context: {
      title: "낭독 스타일 / 어조",
      description: "전체적인 내레이션 어조, 스타일 및 분위기 지침."
    },
    temperature: {
      title: "온도 (Temperature)",
      description: "샘플링 창의성 및 가변성 수준 (0 ~ 2)."
    },
    lyrics: {
      title: "구조화된 가사",
      description: "절과 후렴구 등 섹션 구분이 포함된 가사 텍스트.",
      placeholder: "구조화된 가사를 입력하세요...",
      example: "네온 빛 거리를 가로질러\n우리는 자유롭게 찬란히 빛나리"
    },
    is_instrumental: {
      title: "연주곡 전용",
      description: "보컬 없이 악기 연주만으로 구성된 음악을 생성합니다."
    }
  },
  es: {
    prompt: {
      title: "Letra / Indicación (Prompt)",
      description: "Descripción del audio deseado o letra exacta que se cantará en la pista generada.",
      placeholder: "Introduce lo que deseas generar o escribe la letra aquí...",
      example: "Pista de rap contundente con ritmo agresivo y voz masculina segura sobre la victoria."
    },
    style: {
      title: "Estilo musical",
      description: "Especificación del estilo musical para el audio generado.",
      placeholder: "Jazz, Clásica, Electrónica, Pop, Rock, Hip-hop, etc.",
      example: "Clásica"
    },
    model: {
      title: "Versión del modelo",
      description: "Versión del modelo de IA a utilizar para la generación."
    },
    custom_mode: {
      title: "Modo personalizado",
      description: "Activa el modo personalizado para configuraciones avanzadas."
    },
    title: {
      title: "Título de la pista",
      description: "Título para la pista de música generada (opcional).",
      placeholder: "Meditación de piano pacífica"
    },
    persona_id: {
      title: "ID de personaje / voz",
      description: "ID de personaje o voz personalizada para aplicar a la música (opcional).",
      placeholder: "Introduce ID de personaje..."
    },
    persona_model: {
      title: "Tipo de modelo de personaje",
      description: "Selecciona el tipo de personaje para diferenciar voces clonadas de estilos predeterminados.",
      options: {
        style_persona: "Personaje de estilo",
        voice_persona: "Personaje de voz"
      }
    },
    instrumental: {
      title: "Solo instrumental",
      description: "Genera música exclusivamente instrumental sin voces ni canto."
    },
    negative_tags: {
      title: "Etiquetas negativas",
      description: "Estilos musicales o rasgos a excluir del audio generado (opcional).",
      placeholder: "Heavy Metal, Batería animada"
    },
    vocal_gender: {
      title: "Género de la voz",
      description: "Género preferido para la interpretación vocal.",
      options: {
        male: "Masculino",
        female: "Femenino"
      }
    },
    style_weight: {
      title: "Peso del estilo",
      description: "Peso de influencia del estilo musical especificado (0 a 1)."
    },
    weirdness_constraint: {
      title: "Creatividad / Rareza",
      description: "Ajusta el nivel de libertad experimental y originalidad."
    },
    audio_weight: {
      title: "Peso del audio",
      description: "Peso del audio de referencia en la remezcla o continuación."
    },
    audio_url: {
      title: "Archivo de audio",
      description: "Sube o proporciona una URL de audio como referencia."
    },
    continue_at: {
      title: "Continuar en (segundos)",
      description: "Marca de tiempo exacta en segundos desde la cual continuar la pista."
    },
    sound_loop: {
      title: "Bucle continuo",
      description: "Genera una pista de audio que se repite en bucle sin interrupciones."
    },
    sound_tempo: {
      title: "Tempo (BPM)",
      description: "Especificación de tempo en pulsaciones por minuto."
    },
    sound_key: {
      title: "Tonalidad musical",
      description: "Tonalidad y escala musical del sonido generado (ej. Do Mayor, La Menor)."
    },
    grab_lyrics: {
      title: "Extraer letra",
      description: "Extrae y conserva la letra cantada del audio de entrada."
    },
    audios_list: {
      title: "Lista de pistas de audio",
      description: "Lista de pistas de audio para combinar en un mashup."
    },
    tags: {
      title: "Etiquetas de estilo",
      description: "Etiquetas que describen género musical, estado de ánimo e instrumentos."
    },
    voice_name: {
      title: "Nombre de la voz",
      description: "Nombre personalizado para el perfil de voz clonado."
    },
    description: {
      title: "Descripción",
      description: "Descripción del perfil de voz o estilo musical."
    },
    language: {
      title: "Idioma principal",
      description: "Idioma principal del hablante o cantante."
    },
    vocal_start_s: {
      title: "Inicio de voz (s)",
      description: "Segundo de inicio de la muestra vocal."
    },
    vocal_end_s: {
      title: "Fin de voz (s)",
      description: "Segundo de fin de la muestra vocal."
    },
    custom_voice_id: {
      title: "ID de voz personalizada",
      description: "Identificador del perfil de voz objetivo."
    },
    need_noise_reduction: {
      title: "Reducción de ruido",
      description: "Filtra el ruido de fondo de las grabaciones de voz subidas."
    },
    need_volume_normalization: {
      title: "Normalización de volumen",
      description: "Equilibra automáticamente los niveles de volumen del audio."
    },
    accuracy: {
      title: "Precisión de clonación",
      description: "Nivel de fidelidad en la similitud de la voz."
    },
    voice_id: {
      title: "Voz predeterminada / Hablante",
      description: "Selecciona un perfil de voz preestablecido para la síntesis."
    },
    speed: {
      title: "Velocidad de habla",
      description: "Multiplicador de velocidad de habla (1.0 es velocidad normal)."
    },
    volume: {
      title: "Volumen de habla",
      description: "Multiplicador de volumen de salida."
    },
    pitch: {
      title: "Tono de voz",
      description: "Ajuste de tono para la voz sintetizada."
    },
    emotion: {
      title: "Emoción",
      description: "Expresión emocional y tono de la locución.",
      options: {
        happy: "Feliz / Alegre",
        sad: "Triste",
        angry: "Enojado",
        fearful: "Temeroso",
        disgusted: "Disgustado",
        surprised: "Sorprendido",
        neutral: "Neutral / Natural"
      }
    },
    english_normalization: {
      title: "Normalización en inglés",
      description: "Mejora la pronunciación de números, símbolos y fechas en inglés."
    },
    sample_rate: {
      title: "Frecuencia de muestreo (Hz)",
      description: "Frecuencia de muestreo del audio en hercios."
    },
    bitrate: {
      title: "Tasa de bits (bps)",
      description: "Tasa de bits del audio en bits por segundo."
    },
    channel: {
      title: "Canales de audio",
      description: "Formato de canales de audio.",
      options: {
        "1": "Mono (1 canal)",
        "2": "Estéreo (2 canales)"
      }
    },
    format: {
      title: "Formato de audio",
      description: "Formato de archivo de salida.",
      options: {
        mp3: "Formato MP3",
        wav: "WAV sin pérdida",
        pcm: "PCM sin procesar",
        flac: "FLAC sin pérdida"
      }
    },
    language_boost: {
      title: "Mejora de idioma",
      description: "Mejora la claridad y el reconocimiento de dialectos del idioma seleccionado."
    },
    duration: {
      title: "Duración (segundos)",
      description: "Longitud del audio generado en segundos."
    },
    dialogue: {
      title: "Guión de diálogo",
      description: "Guión conversacional de varios turnos para síntesis de voz."
    },
    stability: {
      title: "Estabilidad de voz",
      description: "Consistencia y estabilidad de la locución (0 a 1)."
    },
    similarity_boost: {
      title: "Aumento de similitud",
      description: "Aumenta el parecido vocal con la voz original."
    },
    language_code: {
      title: "Código de idioma",
      description: "Código ISO del idioma de destino."
    },
    task_id: {
      title: "ID de tarea",
      description: "Identificador de la tarea previa a convertir."
    },
    audio_id: {
      title: "ID de audio",
      description: "Identificador específico de la pista de audio."
    },
    speakers: {
      title: "Hablantes",
      description: "Configuración de voces de personajes para diálogos."
    },
    dialogue_turns: {
      title: "Turnos de diálogo",
      description: "Lista secuencial de intervenciones en el diálogo."
    },
    scene: {
      title: "Escenario acústico",
      description: "Entorno acústico y reverberación ambiental."
    },
    sample_context: {
      title: "Contexto / Tono de narración",
      description: "Tono general, estilo y contexto de la narración."
    },
    temperature: {
      title: "Temperatura",
      description: "Aleatoriedad y variedad creativa de la muestra (0 a 2)."
    },
    lyrics: {
      title: "Letra estructurada",
      description: "Texto de la letra con saltos de línea y marcadores de sección.",
      placeholder: "Introduce la letra con estructura de estrofas/estribillos...",
      example: "Caminando bajo las luces de neón\nSomos libres, brillamos sin fin"
    },
    is_instrumental: {
      title: "Solo instrumental",
      description: "Genera música exclusivamente instrumental sin partes vocales."
    }
  }
};

fieldsData['es-ES'] = fieldsData.es;

const TARGET_LOCALES = ['en', 'zh', 'zh-TW', 'ja-JP', 'ko-KR', 'es', 'es-ES'];

for (const loc of TARGET_LOCALES) {
  const filePath = path.join(STUDIO_MESSAGES, loc, 'audioStudio.json');
  if (!fs.existsSync(filePath)) {
    console.error(`File does not exist: ${filePath}`);
    continue;
  }
  const current = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  current.models = modelsData[loc] || modelsData.en;
  current.fields = fieldsData[loc] || fieldsData.en;

  fs.writeFileSync(filePath, JSON.stringify(current, null, 2) + '\n', 'utf8');
  console.log(`✓ Updated ${loc}/audioStudio.json`);
}
