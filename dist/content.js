// Amazon Prime Translatorのコンテンツスクリプト
// Amazon Prime Videoの字幕を検出し、翻訳機能を追加します

// デフォルト設定
let settings = {
  targetLanguage: "ja",
  sourceLanguage: "en",
  showOriginal: true,
  showTranslation: true,
  fontSize: 16,
  position: "bottom",
  enabled: true,
};

// 設定を読み込む
function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(settings, (items) => {
      settings = items;
      console.log("設定を読み込みました:", settings);
      resolve(settings);
    });
  });
}

// 字幕コンテナを作成
function createSubtitleContainer() {
  const container = document.createElement("div");
  container.id = "amazon-prime-translator-container";
  container.style.position = "absolute";
  container.style.zIndex = "10000";
  container.style.width = "100%";
  container.style.textAlign = "center";
  container.style.color = "white";
  container.style.textShadow = "0 0 3px black, 0 0 3px black, 0 0 3px black";
  container.style.fontSize = `${settings.fontSize}px`;
  container.style.padding = "10px";
  container.style.backgroundColor = "rgba(0, 0, 0, 0.5)";

  if (settings.position === "bottom") {
    container.style.bottom = "15%";
  } else {
    container.style.top = "15%";
  }

  document.body.appendChild(container);
  console.log("字幕コンテナを作成しました");
  return container;
}

// 字幕を翻訳する
function translateSubtitle(text) {
  console.log(`翻訳リクエスト: "${text}"`);
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: "translate",
        text,
        from: settings.sourceLanguage,
        to: settings.targetLanguage,
      },
      (response) => {
        if (response && response.translation) {
          console.log(`翻訳結果: "${response.translation}"`);
          resolve(response.translation);
        } else {
          console.error("翻訳エラー:", response);
          resolve(`翻訳エラー: ${text}`);
        }
      }
    );
  });
}

// 字幕を表示する
function displaySubtitles(original, translation, container) {
  container.innerHTML = "";

  if (settings.showOriginal) {
    const originalElem = document.createElement("div");
    originalElem.className = "amazon-prime-translator-original";
    originalElem.textContent = original;
    originalElem.style.marginBottom = "5px";
    originalElem.style.fontWeight = "500";
    container.appendChild(originalElem);
  }

  if (settings.showTranslation) {
    const translationElem = document.createElement("div");
    translationElem.className = "amazon-prime-translator-translation";
    translationElem.style.color = "#ffcc00";
    translationElem.style.fontWeight = "600";
    translationElem.textContent = translation;
    container.appendChild(translationElem);
  }
}

// 字幕要素を監視する
function observeSubtitles() {
  // Amazon Prime Videoの字幕要素を探す - 複数のセレクタを試す
  const subtitleSelectors = [
    ".atvwebplayersdk-captions-overlay", // 新しいセレクタ
    ".atvwebplayersdk-captions-text", // 古いセレクタ
    '.webPlayerUIContainer div[class*="subtitle"]',
    '.webPlayerContainer div[class*="subtitle"]',
    ".webPlayerContainer .subtitle-container",
  ];

  console.log("Amazon Prime Translator: 字幕要素の検索を開始します");

  // セレクタごとに字幕要素を探す
  let subtitleElement = null;
  let lastSubtitleText = "";

  function findSubtitleElement() {
    for (const selector of subtitleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log(
          `Amazon Prime Translator: 字幕要素が見つかりました (${selector})`
        );
        return element;
      }
    }
    return null;
  }

  // ドキュメント全体を監視
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" || mutation.type === "characterData") {
        // ドキュメント全体を監視して字幕要素の変更を検出
        subtitleElement = findSubtitleElement();

        if (subtitleElement && subtitleElement.textContent) {
          const originalText = subtitleElement.textContent.trim();
          if (originalText && originalText !== lastSubtitleText) {
            lastSubtitleText = originalText;
            console.log(
              `Amazon Prime Translator: 字幕テキストを検出しました: "${originalText}"`
            );
            translateSubtitle(originalText).then((translatedText) => {
              const container =
                document.getElementById("amazon-prime-translator-container") ||
                createSubtitleContainer();
              displaySubtitles(originalText, translatedText, container);
            });
          }
        }
      }
    }
  });

  // ドキュメント全体を監視
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // 初期検索
  subtitleElement = findSubtitleElement();
  if (subtitleElement) {
    console.log(
      "Amazon Prime Translator: 初期字幕要素が見つかりました。監視を開始します。"
    );
    if (subtitleElement.textContent) {
      const originalText = subtitleElement.textContent.trim();
      if (originalText) {
        lastSubtitleText = originalText;
        console.log(
          `Amazon Prime Translator: 初期字幕テキスト: "${originalText}"`
        );
        translateSubtitle(originalText).then((translatedText) => {
          const container =
            document.getElementById("amazon-prime-translator-container") ||
            createSubtitleContainer();
          displaySubtitles(originalText, translatedText, container);
        });
      }
    }
  } else {
    console.log(
      "Amazon Prime Translator: 初期字幕要素が見つかりません。ページ変更を待機しています。"
    );
    // 字幕要素が見つからない場合は少し待ってから再試行
    setTimeout(observeSubtitles, 3000);
  }
}

// Amazon Prime Videoのページかどうかを判定
function isAmazonPrimeVideoPage() {
  return (
    location.href.includes("amazon") &&
    (location.href.includes("/gp/video/") ||
      location.href.includes("/watch") ||
      document.querySelector(".webPlayerSDKContainer") !== null)
  );
}

// 拡張機能の初期化
async function initialize() {
  await loadSettings();

  if (!settings.enabled) {
    console.log("Amazon Prime Translator: 拡張機能は無効になっています");
    return;
  }

  console.log("Amazon Prime Translator: 初期化中...");

  // URLが変わった時に再初期化
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Amazon Primeのビデオページでのみ動作
      if (isAmazonPrimeVideoPage()) {
        console.log(
          "Amazon Prime Translator: URLが変更されました。再初期化します。"
        );
        setTimeout(observeSubtitles, 2000);
      }
    }
  }).observe(document, { subtree: true, childList: true });

  // 初期実行
  if (isAmazonPrimeVideoPage()) {
    console.log(
      "Amazon Prime Translator: Amazon Primeビデオページを検出しました。"
    );
    setTimeout(observeSubtitles, 2000);
  }
}

// 拡張機能を起動
console.log("Amazon Prime Translator: コンテンツスクリプトが読み込まれました");
initialize();
