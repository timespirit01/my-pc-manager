// 코드를 고치지 않고 바꿀 수 있는 값은 모두 이 파일에 모은다.
// API 키와 접속 암호는 여기에 두지 않는다 (배포 환경의 환경 변수).

export const CONFIG = {
  appName: '마주 통역',
  // 통역 모델. 미리보기 모델이 정식판으로 바뀌면 이 줄만 고친다.
  model: 'models/gemini-3.5-live-translate-preview',
  myLang: 'ko',
  defaultPartnerLang: 'en',

  audio: {
    inputRate: 16000, // 마이크 음성을 보내는 샘플레이트 (Hz)
    chunkMs: 40, // 한 번에 보내는 음성 길이. 작을수록 지연이 줄어든다
    playbackLeadMs: 20, // 통역 음성 첫 조각을 받은 뒤 재생까지 두는 여유
    // 엔진은 통역할 말이 없을 때도 무음 조각을 계속 보낸다(실측: 최대 진폭 0, 말 앞뒤는 100 안팎,
    // 실제 음성은 3000 이상). 이 값보다 작은 조각은 무음으로 보고 재생하지 않는다.
    silencePeak: 500,
  },

  session: {
    maxAgeMs: 9 * 60 * 1000, // 이 시간이 지나면 대화가 비는 틈에 재연결 (엔진 한도 10분)
    idlePauseMs: 2 * 60 * 1000, // 아무도 말하지 않으면 듣기를 멈추는 시간
    // 듣기를 멈춘 뒤 연결까지 끊는 시간. 연결돼 있는 동안 엔진이 무음을 계속 내려보내 데이터를 쓰므로 짧게 둔다.
    releaseMs: 15 * 1000,
    turnGapMs: 2500, // 이 시간 동안 새 내용이 없으면 한 마디가 끝난 것으로 본다 (엔진은 끝 신호를 주지 않는다)
    // 말이 끝난 뒤에도 이만큼 무음을 계속 보낸다. 엔진은 음성이 들어오는 동안에만 통역을 진행해서,
    // 바로 끊으면 문장 끝부분이 통역되지 않는다(실측).
    flushTailMs: 4000,
    echoTailMs: 300, // 통역 음성이 끝난 뒤에도 반대 방향 전송을 막아 두는 시간
    micBufferMs: 3000, // 재연결 중 모아 두는 마이크 음성 길이
    maxRetries: 6, // 연속 실패가 이 횟수를 넘으면 자동 재시도를 멈춘다
  },

  // 눌러서 말하기에서 자동으로 버튼을 떼는 기준
  pushToTalk: {
    silenceAfterSpeechMs: 2500,
    silenceNoSpeechMs: 7000,
  },

  latencyTargetMs: 1000, // 완료 기준: 말 끝 → 통역 음성 시작
};

// 상대 언어 목록. code는 통역 모델에 넘기는 BCP-47 코드.
export const LANGUAGES = [
  { code: 'en', name: 'English', ko: '영어' },
  { code: 'ja', name: '日本語', ko: '일본어' },
  { code: 'zh', name: '中文', ko: '중국어' },
  { code: 'es', name: 'Español', ko: '스페인어' },
  { code: 'fr', name: 'Français', ko: '프랑스어' },
  { code: 'de', name: 'Deutsch', ko: '독일어' },
  { code: 'vi', name: 'Tiếng Việt', ko: '베트남어' },
  { code: 'th', name: 'ไทย', ko: '태국어' },
  { code: 'id', name: 'Bahasa Indonesia', ko: '인도네시아어' },
  { code: 'ru', name: 'Русский', ko: '러시아어' },
];

// 화면 문안. 상대 쪽 화면은 상대 언어로, 내 쪽 화면은 한국어로 나온다.
export const STRINGS = {
  ko: {
    hello: '안녕하세요!',
    intro: '가운데 버튼을 누르고 편하게 말해 보세요. 상대 언어로 바로 통역됩니다.',
    notice: '음성은 통역을 위해 AI 서비스로 전송되며, 이 앱에는 저장되지 않습니다.',
    connecting: '연결하는 중…',
    listening: '듣는 중…',
    tapToSpeak: '눌러서 말하기',
    speakNow: '말씀하세요',
    interpreting: '통역 중…',
    reconnecting: '다시 연결하는 중…',
    paused: '멈춤',
    replay: '다시 듣기',
  },
  en: {
    hello: 'Hello!',
    intro: 'Just speak English. This phone interprets between Korean and English.',
    notice: 'Your voice is sent to an AI service for interpretation.',
    listening: 'Listening…',
    tapToSpeak: 'Tap to speak',
    speakNow: 'Speak now',
    interpreting: 'Interpreting…',
    reconnecting: 'Reconnecting…',
    paused: 'Paused',
    replay: 'Play again',
  },
  ja: {
    hello: 'こんにちは！',
    intro: '日本語でそのまま話してください。このスマホが韓国語と日本語を通訳します。',
    notice: '音声は通訳のためAIサービスに送信されます。',
    listening: '聞いています…',
    tapToSpeak: 'タップして話す',
    speakNow: 'お話しください',
    interpreting: '通訳中…',
    reconnecting: '再接続中…',
    paused: '一時停止中',
    replay: 'もう一度聞く',
  },
  zh: {
    hello: '你好！',
    intro: '请直接说中文。这部手机会在韩语和中文之间进行口译。',
    notice: '您的语音将发送至AI服务进行翻译。',
    listening: '正在聆听…',
    tapToSpeak: '点击后说话',
    speakNow: '请说话',
    interpreting: '正在翻译…',
    reconnecting: '正在重新连接…',
    paused: '已暂停',
    replay: '再听一次',
  },
  es: {
    hello: '¡Hola!',
    intro: 'Habla en español con normalidad. Este teléfono interpreta entre coreano y español.',
    notice: 'Tu voz se envía a un servicio de IA para la interpretación.',
    listening: 'Escuchando…',
    tapToSpeak: 'Toca para hablar',
    speakNow: 'Habla ahora',
    interpreting: 'Interpretando…',
    reconnecting: 'Reconectando…',
    paused: 'En pausa',
    replay: 'Reproducir de nuevo',
  },
  fr: {
    hello: 'Bonjour !',
    intro: 'Parlez simplement en français. Ce téléphone interprète entre le coréen et le français.',
    notice: "Votre voix est envoyée à un service d'IA pour l'interprétation.",
    listening: "À l'écoute…",
    tapToSpeak: 'Touchez pour parler',
    speakNow: 'Parlez maintenant',
    interpreting: 'Interprétation…',
    reconnecting: 'Reconnexion…',
    paused: 'En pause',
    replay: 'Réécouter',
  },
  de: {
    hello: 'Hallo!',
    intro: 'Sprechen Sie einfach Deutsch. Dieses Handy dolmetscht zwischen Koreanisch und Deutsch.',
    notice: 'Ihre Stimme wird zum Dolmetschen an einen KI-Dienst gesendet.',
    listening: 'Ich höre zu…',
    tapToSpeak: 'Zum Sprechen tippen',
    speakNow: 'Bitte sprechen',
    interpreting: 'Wird gedolmetscht…',
    reconnecting: 'Verbindung wird wiederhergestellt…',
    paused: 'Pausiert',
    replay: 'Noch einmal anhören',
  },
  vi: {
    hello: 'Xin chào!',
    intro: 'Bạn cứ nói tiếng Việt. Điện thoại này sẽ phiên dịch giữa tiếng Hàn và tiếng Việt.',
    notice: 'Giọng nói của bạn được gửi đến dịch vụ AI để phiên dịch.',
    listening: 'Đang nghe…',
    tapToSpeak: 'Chạm để nói',
    speakNow: 'Mời bạn nói',
    interpreting: 'Đang phiên dịch…',
    reconnecting: 'Đang kết nối lại…',
    paused: 'Đã tạm dừng',
    replay: 'Nghe lại',
  },
  th: {
    hello: 'สวัสดี!',
    intro: 'พูดภาษาไทยได้เลย โทรศัพท์เครื่องนี้จะแปลระหว่างภาษาเกาหลีกับภาษาไทย',
    notice: 'เสียงของคุณจะถูกส่งไปยังบริการ AI เพื่อการแปล',
    listening: 'กำลังฟัง…',
    tapToSpeak: 'แตะเพื่อพูด',
    speakNow: 'พูดได้เลย',
    interpreting: 'กำลังแปล…',
    reconnecting: 'กำลังเชื่อมต่อใหม่…',
    paused: 'หยุดชั่วคราว',
    replay: 'ฟังอีกครั้ง',
  },
  id: {
    hello: 'Halo!',
    intro: 'Silakan bicara dalam bahasa Indonesia. Ponsel ini menerjemahkan antara bahasa Korea dan bahasa Indonesia.',
    notice: 'Suara Anda dikirim ke layanan AI untuk diterjemahkan.',
    listening: 'Mendengarkan…',
    tapToSpeak: 'Ketuk untuk bicara',
    speakNow: 'Silakan bicara',
    interpreting: 'Menerjemahkan…',
    reconnecting: 'Menghubungkan kembali…',
    paused: 'Dijeda',
    replay: 'Putar lagi',
  },
  ru: {
    hello: 'Здравствуйте!',
    intro: 'Просто говорите по-русски. Этот телефон переводит между корейским и русским.',
    notice: 'Ваш голос отправляется в ИИ-сервис для перевода.',
    listening: 'Слушаю…',
    tapToSpeak: 'Нажмите, чтобы говорить',
    speakNow: 'Говорите',
    interpreting: 'Перевожу…',
    reconnecting: 'Переподключение…',
    paused: 'Пауза',
    replay: 'Прослушать ещё раз',
  },
};
