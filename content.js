// グローバル変数
let settings = {
  apiKey: "",
  targetLang: "ja",
  fontSize: "medium",
  showOriginal: true,
  showTranslation: true,
};

let translationCache = {};
let currentSubtitle = "";
let translationContainer = null;
let originalSubtitleNode = null;
let mutationObserver = null;
let isAmazonPrimeVideo = false;
let translationDebounceTimer = null;
let apiKeyPlaceholder =
  "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";

// 初期化
function init() {
  // ストレージから設定を読み込む
  chrome.storage.sync.get(
    {
      apiKey: "",
      targetLang: "ja",
      fontSize: "medium",
      showOriginal: true,
      showTranslation: true,
    },
    (items) => {
      settings = items;

      // APIキーが設定されていない場合、プレースホルダーを使用
      if (!settings.apiKey) {
        settings.apiKey = apiKeyPlaceholder;
      }

      // Amazonのドメインかチェック
      if (window.location.hostname.includes("amazon")) {
        console.log("Amazon Prime Translate: Amazon ドメイン検出");

        // ページロード時とDOMの変更を監視
        checkIfPrimeVideo();

        // URLの変更を監視（SPAの対応）
        let lastUrl = location.href;
        new MutationObserver(() => {
          const url = location.href;
          if (url !== lastUrl) {
            lastUrl = url;
            checkIfPrimeVideo();
          }
        }).observe(document, { subtree: true, childList: true });
      }
    }
  );
}

// Amazon Prime Videoのプレーヤーページかどうか確認
function checkIfPrimeVideo() {
  console.log("Amazon Prime Translate: Prime Videoページチェック");

  // Prime Videoプレーヤーの特定要素が存在するか確認
  const isPrimeVideoInterval = setInterval(() => {
    const playerContainer = document.querySelector(".webPlayerSDKContainer");

    if (playerContainer) {
      console.log("Amazon Prime Translate: Prime Videoプレーヤー検出");
      clearInterval(isPrimeVideoInterval);
      isAmazonPrimeVideo = true;
      setupTranslationContainer();
      startObservingCaptions();
    }
  }, 1000);

  // 一定時間チェックしても見つからなければクリア
  setTimeout(() => clearInterval(isPrimeVideoInterval), 10000);
}

// 翻訳コンテナを作成
function setupTranslationContainer() {
  // 既存のコンテナがあれば削除
  if (translationContainer) {
    translationContainer.remove();
  }

  // 新しいコンテナを作成
  translationContainer = document.createElement("div");
  translationContainer.className = "amazon-prime-translate-container";
  translationContainer.style.position = "absolute";
  translationContainer.style.bottom = "20%";
  translationContainer.style.left = "0";
  translationContainer.style.width = "100%";
  translationContainer.style.textAlign = "center";
  translationContainer.style.zIndex = "9999";
  translationContainer.style.pointerEvents = "none";

  // プレーヤーコンテナに追加
  const playerContainer = document.querySelector(".webPlayerSDKContainer");
  if (playerContainer) {
    playerContainer.appendChild(translationContainer);
  }

  // フォントサイズを設定
  updateFontSize();
}

// 字幕の監視を開始
function startObservingCaptions() {
  console.log("Amazon Prime Translate: 字幕の監視を開始");

  // 元の字幕要素を探すループ
  const findCaptionsInterval = setInterval(() => {
    const captionsContainer = document.querySelector(
      ".atvwebplayersdk-captions-overlay"
    );

    if (captionsContainer) {
      console.log("Amazon Prime Translate: 字幕コンテナを検出");
      clearInterval(findCaptionsInterval);

      // 字幕の変更を監視するMutationObserverを設定
      if (mutationObserver) {
        mutationObserver.disconnect();
      }

      mutationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
            handleSubtitleChange(captionsContainer);
          }
        }
      });

      mutationObserver.observe(captionsContainer, {
        childList: true,
        subtree: true,
      });

      // 初回チェック
      handleSubtitleChange(captionsContainer);
    }
  }, 1000);

  // 一定時間チェックしても見つからなければクリア
  setTimeout(() => clearInterval(findCaptionsInterval), 10000);
}

// 字幕の変更を処理
function handleSubtitleChange(captionsContainer) {
  // アクティブな字幕要素を探す
  const subtitleElement = captionsContainer.querySelector("span");

  if (subtitleElement) {
    originalSubtitleNode = subtitleElement;
    const newSubtitle = subtitleElement.textContent.trim();

    // 字幕が変更された場合のみ処理
    if (newSubtitle && newSubtitle !== currentSubtitle) {
      currentSubtitle = newSubtitle;
      console.log("Amazon Prime Translate: 新しい字幕検出", currentSubtitle);

      // オリジナル字幕の表示/非表示を設定
      if (originalSubtitleNode) {
        originalSubtitleNode.style.display = settings.showOriginal
          ? "block"
          : "none";
      }

      // 翻訳を取得して表示
      getTranslation(currentSubtitle);
    } else if (!newSubtitle) {
      // 字幕がなくなった場合は翻訳も消す
      clearTranslation();
    }
  } else {
    // 字幕要素がなくなった場合
    clearTranslation();
  }
}

// 字幕を翻訳して表示
function getTranslation(text) {
  if (!settings.showTranslation) {
    return;
  }

  // デバウンス処理（短時間に連続してAPIを呼ばないようにする）
  clearTimeout(translationDebounceTimer);
  translationDebounceTimer = setTimeout(() => {
    // キャッシュの確認
    if (translationCache[text]) {
      displayTranslation(translationCache[text]);
      return;
    }

    // バックグラウンドスクリプトに翻訳を依頼
    chrome.runtime.sendMessage(
      {
        action: "translate",
        text: text,
        apiKey: settings.apiKey,
        targetLang: settings.targetLang,
      },
      (response) => {
        if (response && response.translation) {
          // キャッシュに保存
          translationCache[text] = response.translation;
          displayTranslation(response.translation);
        } else if (response && response.error) {
          console.error("Amazon Prime Translate: 翻訳エラー", response.error);
          displayTranslation(`[翻訳エラー: ${response.error}]`);
        }
      }
    );
  }, 300);
}

// 翻訳を表示
function displayTranslation(translatedText) {
  if (!translationContainer) return;

  translationContainer.textContent = translatedText;
  translationContainer.style.display = settings.showTranslation
    ? "block"
    : "none";
}

// 翻訳表示をクリア
function clearTranslation() {
  currentSubtitle = "";
  if (translationContainer) {
    translationContainer.textContent = "";
  }
}

// フォントサイズを更新
function updateFontSize() {
  if (!translationContainer) return;

  switch (settings.fontSize) {
    case "small":
      translationContainer.style.fontSize = "16px";
      break;
    case "medium":
      translationContainer.style.fontSize = "20px";
      break;
    case "large":
      translationContainer.style.fontSize = "24px";
      break;
    default:
      translationContainer.style.fontSize = "20px";
  }

  // 字幕のスタイル
  translationContainer.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  translationContainer.style.color = "white";
  translationContainer.style.padding = "5px 10px";
  translationContainer.style.borderRadius = "5px";
  translationContainer.style.maxWidth = "80%";
  translationContainer.style.margin = "0 auto";
  translationContainer.style.textShadow = "1px 1px 1px rgba(0, 0, 0, 0.8)";
}

// メッセージリスナー（設定更新への対応）
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateSettings") {
    const newSettings = request.settings;

    // APIキーが空なら、デフォルトのプレースホルダーを使用
    if (!newSettings.apiKey) {
      newSettings.apiKey = apiKeyPlaceholder;
    }

    settings = newSettings;

    // 字幕表示を更新
    if (originalSubtitleNode) {
      originalSubtitleNode.style.display = settings.showOriginal
        ? "block"
        : "none";
    }

    if (translationContainer) {
      translationContainer.style.display = settings.showTranslation
        ? "block"
        : "none";
      updateFontSize();
    }

    sendResponse({ success: true });
  }
  return true;
});

// スタイルシートを追加
function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .amazon-prime-translate-container {
      font-family: Arial, sans-serif;
      line-height: 1.4;
      font-weight: bold;
    }
  `;
  document.head.appendChild(style);
}

// 初期化
injectStyles();
init();
