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
let captionsContainer = null;
let pendingTranslations = {}; // 翻訳待ちのテキスト
let previousSubtitles = []; // 過去の字幕を記録
let isInitialLoad = true; // 初回ロード判定フラグ
let lastTranslationTime = 0; // 最後に翻訳を行った時間

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
      isInitialLoad = true;
      setupTranslationContainer();
      startObservingCaptions();

      // タイムラインのシーカーハンドルを監視して動画位置の変更を検出
      observeSeekbarChanges();
    }
  }, 500); // 検出間隔を短縮

  // 一定時間チェックしても見つからなければクリア
  setTimeout(() => clearInterval(isPrimeVideoInterval), 10000);
}

// シーカーバーの変更を監視（動画の位置変更を検出）
function observeSeekbarChanges() {
  const seekbarInterval = setInterval(() => {
    const seekbar = document.querySelector(".atvwebplayersdk-seekbar-range");
    if (seekbar) {
      clearInterval(seekbarInterval);

      // シーカーの値が変わったときに字幕キャッシュをクリア
      seekbar.addEventListener("change", () => {
        console.log("Amazon Prime Translate: 動画位置変更を検出");
        // キャッシュはそのまま保持し、現在の字幕情報をリセット
        currentSubtitle = "";
        previousSubtitles = [];
        isInitialLoad = true;
      });
    }
  }, 1000);
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
  translationContainer.style.bottom = "10%";
  translationContainer.style.left = "0";
  translationContainer.style.width = "100%";
  translationContainer.style.textAlign = "center";
  translationContainer.style.zIndex = "9999";
  translationContainer.style.pointerEvents = "none";
  translationContainer.style.transition = "opacity 0.2s ease-in-out"; // 追加: 表示をスムーズに

  // プレーヤーコンテナに追加
  const playerContainer = document.querySelector(".webPlayerSDKContainer");
  if (playerContainer) {
    playerContainer.appendChild(translationContainer);
  }

  // フォントサイズを設定
  updateFontSize();

  // 元の字幕位置を調整
  adjustOriginalCaptions();
}

// 元の字幕位置を調整
function adjustOriginalCaptions() {
  const styleElement = document.createElement("style");
  styleElement.id = "amazon-prime-translate-style";
  styleElement.textContent = `
    .atvwebplayersdk-captions-overlay {
      bottom: 5% !important;
      position: absolute !important;
    }
    
    /* 表示トランジションを追加 */
    .amazon-prime-translate-container {
      transition: opacity 0.2s ease-in-out;
    }
    
    /* より高いパフォーマンスのためのGPU加速 */
    .amazon-prime-translate-container,
    .atvwebplayersdk-captions-overlay span {
      transform: translateZ(0);
      will-change: transform, opacity;
    }
  `;
  document.head.appendChild(styleElement);
}

// 字幕の監視を開始
function startObservingCaptions() {
  console.log("Amazon Prime Translate: 字幕の監視を開始");

  // 元の字幕要素を探すループ
  const findCaptionsInterval = setInterval(() => {
    captionsContainer = document.querySelector(
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
        let hasSubtitleChange = false;

        for (const mutation of mutations) {
          if (
            mutation.type === "childList" ||
            (mutation.type === "characterData" &&
              mutation.target.nodeName === "#text")
          ) {
            hasSubtitleChange = true;
            break;
          }
        }

        if (hasSubtitleChange) {
          handleSubtitleChange(captionsContainer);
        }
      });

      mutationObserver.observe(captionsContainer, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: true,
      });

      // 初回チェック
      handleSubtitleChange(captionsContainer);

      // 動画再生中は定期的にチェック（MutationObserverが取りこぼす場合の保険）
      setInterval(() => {
        if (captionsContainer) {
          handleSubtitleChange(captionsContainer);
        }
      }, 500);
    }
  }, 500); // 検出間隔を短縮

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
      // 過去の字幕リストに追加（最大5個まで保持）
      if (!previousSubtitles.includes(newSubtitle)) {
        previousSubtitles.push(newSubtitle);
        if (previousSubtitles.length > 5) {
          previousSubtitles.shift();
        }
      }

      currentSubtitle = newSubtitle;
      console.log("Amazon Prime Translate: 新しい字幕検出", currentSubtitle);

      // オリジナル字幕の表示/非表示を設定
      if (originalSubtitleNode) {
        originalSubtitleNode.style.display = settings.showOriginal
          ? "block"
          : "none";

        // オリジナル字幕のスタイルを調整
        if (settings.showOriginal) {
          originalSubtitleNode.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
          originalSubtitleNode.style.padding = "2px 5px";
          originalSubtitleNode.style.borderRadius = "3px";
        }
      }

      // 翻訳を取得して表示
      getTranslation(currentSubtitle);

      // 次の字幕も先読みで翻訳（将来の字幕を予測）
      preloadNextSubtitles();
    } else if (!newSubtitle) {
      // 字幕がなくなった場合は翻訳も消す
      clearTranslation();
    }
  } else {
    // 字幕要素がなくなった場合
    clearTranslation();
  }
}

// 次の字幕を先読みして翻訳しておく
function preloadNextSubtitles() {
  // 字幕の先読みは初回ロード時は行わない（APIコール数を抑制）
  if (isInitialLoad) {
    isInitialLoad = false;
    return;
  }

  // 現在再生中の動画要素を取得
  const videoElement = document.querySelector(".webPlayerSDKContainer video");
  if (!videoElement) return;

  // 動画が再生中かつシークバーが取得できる場合のみ実行
  const seekbar = document.querySelector(".atvwebplayersdk-seekbar-range");
  if (!seekbar || videoElement.paused) return;

  // 動画の進行度（%）を取得
  const progress = parseFloat(seekbar.value);

  // 進行度から次の字幕が出る可能性が高いと予測できる場合、字幕を先読み翻訳
  // 既に表示された字幕の順番や、字幕のパターンから次に表示される可能性が高い字幕を推測

  // 過去の字幕からパターンを検出して、次の可能性が高い字幕を翻訳しておく
  // これは実験的機能であり、実際の効果は限定的かもしれない
  for (let i = 0; i < previousSubtitles.length; i++) {
    const subtitle = previousSubtitles[i];
    if (
      subtitle &&
      !translationCache[subtitle] &&
      !pendingTranslations[subtitle]
    ) {
      // 優先度を低く設定して翻訳を事前実行
      preloadTranslation(subtitle);
      break; // 1つだけ先読み
    }
  }
}

// 先読み用の優先度低め翻訳
function preloadTranslation(text) {
  // 既に翻訳中のテキストは処理しない
  if (pendingTranslations[text]) return;

  // 既にキャッシュに存在する場合はスキップ
  if (translationCache[text]) return;

  // 現在時刻を取得
  const now = Date.now();

  // 前回の翻訳から500ミリ秒以内なら、APIコールを抑制する
  if (now - lastTranslationTime < 500) return;

  // 翻訳中フラグを立てる
  pendingTranslations[text] = true;

  // バックグラウンドスクリプトに翻訳を依頼
  chrome.runtime.sendMessage(
    {
      action: "translate",
      text: text,
      apiKey: settings.apiKey,
      targetLang: settings.targetLang,
      priority: "low", // 優先度低
    },
    (response) => {
      // 翻訳が完了したらフラグを下ろす
      delete pendingTranslations[text];

      if (response && response.translation) {
        // キャッシュに保存
        translationCache[text] = response.translation;
        lastTranslationTime = Date.now();
      }
    }
  );
}

// 字幕を翻訳して表示
function getTranslation(text) {
  if (!settings.showTranslation) {
    return;
  }

  // キャッシュの確認（即時表示）
  if (translationCache[text]) {
    displayTranslation(translationCache[text]);
    return;
  }

  // 翻訳中であることを表示
  displayTranslation("翻訳中...");

  // 既に翻訳中のテキストは重複リクエストしない
  if (pendingTranslations[text]) return;

  // 翻訳中フラグを立てる
  pendingTranslations[text] = true;

  // デバウンス処理（短時間に連続してAPIを呼ばないようにする）
  clearTimeout(translationDebounceTimer);
  translationDebounceTimer = setTimeout(() => {
    // バックグラウンドスクリプトに翻訳を依頼
    chrome.runtime.sendMessage(
      {
        action: "translate",
        text: text,
        apiKey: settings.apiKey,
        targetLang: settings.targetLang,
        priority: "high", // 優先度高
      },
      (response) => {
        // 翻訳中フラグを下ろす
        delete pendingTranslations[text];
        lastTranslationTime = Date.now();

        if (response && response.translation) {
          // キャッシュに保存
          translationCache[text] = response.translation;

          // 現在の字幕と一致する場合のみ表示（タイミングがずれる場合がある）
          if (text === currentSubtitle) {
            displayTranslation(response.translation);
          }
        } else if (response && response.error) {
          console.error("Amazon Prime Translate: 翻訳エラー", response.error);

          if (text === currentSubtitle) {
            displayTranslation(`[翻訳エラー: ${response.error}]`);
          }
        }
      }
    );
  }, 100); // デバウンス時間を短縮（100ms）
}

// 翻訳を表示
function displayTranslation(translatedText) {
  if (!translationContainer) return;

  // 滑らかに表示するためのアニメーション効果
  translationContainer.style.opacity = "0";

  // 非同期でテキスト更新と表示を行う
  setTimeout(() => {
    translationContainer.textContent = translatedText;
    translationContainer.style.display = settings.showTranslation
      ? "block"
      : "none";

    // 表示を滑らかに
    requestAnimationFrame(() => {
      translationContainer.style.opacity = "1";
    });
  }, 50);
}

// 翻訳表示をクリア
function clearTranslation() {
  currentSubtitle = "";
  if (translationContainer) {
    translationContainer.style.opacity = "0";

    setTimeout(() => {
      translationContainer.textContent = "";
    }, 100);
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
  translationContainer.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.3)";
}

// メッセージリスナー（設定更新への対応）
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateSettings") {
    const newSettings = request.settings;

    // APIキーが空なら、デフォルトのプレースホルダーを使用
    if (!newSettings.apiKey) {
      newSettings.apiKey = apiKeyPlaceholder;
    }

    // 言語が変わった場合はキャッシュをクリア
    if (settings.targetLang !== newSettings.targetLang) {
      translationCache = {};
      pendingTranslations = {};
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

// ページ遷移時やアンロード時のクリーンアップ
window.addEventListener("beforeunload", cleanUp);

function cleanUp() {
  if (mutationObserver) {
    mutationObserver.disconnect();
  }

  // スタイル要素を削除
  const styleElement = document.getElementById("amazon-prime-translate-style");
  if (styleElement) {
    styleElement.remove();
  }

  // 翻訳コンテナを削除
  if (translationContainer) {
    translationContainer.remove();
  }
}

// スタイルシートを追加
function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .amazon-prime-translate-container {
      font-family: Arial, sans-serif;
      line-height: 1.4;
      font-weight: bold;
      opacity: 1;
      transition: opacity 0.2s ease-in-out;
    }
  `;
  document.head.appendChild(style);
}

// 初期化
injectStyles();
init();
