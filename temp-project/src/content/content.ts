// Amazon Prime Translatorのコンテンツスクリプト
// Amazon Prime Videoの字幕を検出し、翻訳機能を追加します

interface Settings {
  targetLanguage: string;
  sourceLanguage: string;
  showOriginal: boolean;
  showTranslation: boolean;
  fontSize: number;
  position: string;
  enabled: boolean;
}

// デフォルト設定
let settings: Settings = {
  targetLanguage: 'ja',
  sourceLanguage: 'en',
  showOriginal: true,
  showTranslation: true,
  fontSize: 16,
  position: 'bottom',
  enabled: true
};

// 設定を読み込む
function loadSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(settings, (items) => {
      settings = items as Settings;
      resolve(settings);
    });
  });
}

// 字幕コンテナを作成
function createSubtitleContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'amazon-prime-translator-container';
  container.style.position = 'absolute';
  container.style.zIndex = '9999';
  container.style.width = '100%';
  container.style.textAlign = 'center';
  container.style.color = 'white';
  container.style.textShadow = '0 0 2px black';
  container.style.fontSize = `${settings.fontSize}px`;
  
  if (settings.position === 'bottom') {
    container.style.bottom = '10%';
  } else {
    container.style.top = '10%';
  }
  
  document.body.appendChild(container);
  return container;
}

// 字幕を翻訳する
function translateSubtitle(text: string): Promise<string> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'translate', text, from: settings.sourceLanguage, to: settings.targetLanguage },
      (response) => {
        if (response && response.translation) {
          resolve(response.translation);
        } else {
          resolve(`翻訳エラー: ${text}`);
        }
      }
    );
  });
}

// 字幕を表示する
function displaySubtitles(original: string, translation: string, container: HTMLElement): void {
  container.innerHTML = '';
  
  if (settings.showOriginal) {
    const originalElem = document.createElement('div');
    originalElem.className = 'amazon-prime-translator-original';
    originalElem.textContent = original;
    container.appendChild(originalElem);
  }
  
  if (settings.showTranslation) {
    const translationElem = document.createElement('div');
    translationElem.className = 'amazon-prime-translator-translation';
    translationElem.style.color = '#ffcc00';
    translationElem.textContent = translation;
    container.appendChild(translationElem);
  }
}

// 字幕要素を監視する
function observeSubtitles(): void {
  // Amazon Prime Videoの字幕要素を探す
  // 注: セレクタは変更される可能性があるため、実際のWebサイトに合わせて調整が必要
  const subtitleSelector = '.atvwebplayersdk-captions-text';
  
  // MutationObserverを使用して字幕の変更を監視
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'characterData') {
        const subtitleElement = document.querySelector(subtitleSelector);
        if (subtitleElement && subtitleElement.textContent) {
          const originalText = subtitleElement.textContent.trim();
          if (originalText) {
            translateSubtitle(originalText).then((translatedText) => {
              const container = document.getElementById('amazon-prime-translator-container') || createSubtitleContainer();
              displaySubtitles(originalText, translatedText, container);
            });
          }
        }
      }
    }
  });
  
  // 字幕の変更を監視開始
  const startObserving = () => {
    const subtitleElement = document.querySelector(subtitleSelector);
    if (subtitleElement) {
      observer.observe(subtitleElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
      console.log('Amazon Prime Translator: 字幕の監視を開始しました');
    } else {
      // 字幕要素が見つからない場合は少し待ってから再試行
      setTimeout(startObserving, 1000);
    }
  };
  
  startObserving();
}

// 拡張機能の初期化
async function initialize(): Promise<void> {
  await loadSettings();
  
  if (!settings.enabled) {
    console.log('Amazon Prime Translator: 拡張機能は無効になっています');
    return;
  }
  
  console.log('Amazon Prime Translator: 初期化中...');
  
  // URLが変わった時に再初期化
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Amazon Primeのビデオページでのみ動作
      if (location.href.includes('amazon') && (location.href.includes('/gp/video/') || location.href.includes('/watch'))) {
        setTimeout(observeSubtitles, 2000);
      }
    }
  }).observe(document, { subtree: true, childList: true });
  
  // 初期実行
  if (location.href.includes('amazon') && (location.href.includes('/gp/video/') || location.href.includes('/watch'))) {
    setTimeout(observeSubtitles, 2000);
  }
}

// 拡張機能を起動
initialize(); 