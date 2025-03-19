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
// 画面下部の吹き出し表示は廃止
// translationContainer は互換性のために保持するが使用しない
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

// リストの自動スクロールを管理するためのグローバル変数
let isUserScrolling = false;
let userScrollTimeout = null;
let lastSubtitleAddedTime = 0; // 最後に字幕が追加された時間

// 初期化
function init() {
  // 既存のパネルを削除
  const existingPanel = document.getElementById(
    "prime-translate-subtitles-panel"
  );
  if (existingPanel) {
    existingPanel.remove();
  }

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
            // 既存のパネルを削除
            const existingPanel = document.getElementById(
              "prime-translate-subtitles-panel"
            );
            if (existingPanel) {
              existingPanel.remove();
            }
            checkIfPrimeVideo();
          }
        }).observe(document, { subtree: true, childList: true });
      }
    }
  );

  // 遅延実行で字幕パネルの表示を確保
  setTimeout(() => {
    const subtitlesPanel = document.getElementById(
      "prime-translate-subtitles-panel"
    );
    if (subtitlesPanel) {
      subtitlesPanel.classList.remove("hidden");
      const playerContainer = document.querySelector(".webPlayerSDKContainer");
      if (playerContainer) {
        playerContainer.classList.add("panel-visible");
      }
    }
  }, 1000);
}

// Amazon Prime Videoのプレーヤーページかどうか確認
function checkIfPrimeVideo() {
  console.log("Amazon Prime Translate: Prime Videoページチェック");

  // 既存のパネルを削除
  const existingPanel = document.getElementById(
    "prime-translate-subtitles-panel"
  );
  if (existingPanel) {
    existingPanel.remove();
  }

  // Prime Videoプレーヤーの特定要素が存在するか確認
  const isPrimeVideoInterval = setInterval(() => {
    const playerContainer = document.querySelector(".webPlayerSDKContainer");

    if (playerContainer) {
      console.log("Amazon Prime Translate: Prime Videoプレーヤー検出");
      clearInterval(isPrimeVideoInterval);
      isAmazonPrimeVideo = true;
      isInitialLoad = true;

      // パネルを表示するクラスを設定
      playerContainer.classList.add("panel-visible");

      // 翻訳コンテナは作成せず、プレーヤーUIのみ調整
      adjustPlayerUI(playerContainer);

      // 字幕パネルを直接作成
      createSubtitlesListPanel(playerContainer);

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

// 翻訳コンテナを作成する関数を削除し、プレーヤーUIの調整のみを行う
function adjustPlayerUI(playerContainer) {
  // 元のUIコンテナを取得
  const uiContainer = playerContainer.querySelector(".webPlayerUIContainer");
  const uiControlsContainer = playerContainer.querySelector(
    ".webPlayerSDKUiContainer"
  );

  if (uiContainer) {
    // 元々のプレーヤーUIのポジションを相対位置に設定し、適切なz-indexを確保
    uiContainer.style.position = "relative";
    uiContainer.style.zIndex = "2";
  }

  if (uiControlsContainer) {
    // コントロールUI要素が字幕の上に表示されるようにz-indexを調整
    uiControlsContainer.style.position = "absolute";
    uiControlsContainer.style.zIndex = "3";
    uiControlsContainer.style.left = "50%";
    uiControlsContainer.style.transform = "translateX(-50%)";
    uiControlsContainer.style.width = "100%";
  }

  // 元の字幕位置を調整
  adjustOriginalCaptions();
}

// 字幕一覧パネルを作成する関数
function createSubtitlesListPanel(playerContainer) {
  // 既存のパネルがあれば削除
  const existingPanel = document.getElementById(
    "prime-translate-subtitles-panel"
  );
  if (existingPanel) {
    existingPanel.remove();
  }

  // 字幕一覧パネルを作成
  const subtitlesPanel = document.createElement("div");
  subtitlesPanel.id = "prime-translate-subtitles-panel";
  subtitlesPanel.className = "prime-translate-subtitles-panel";

  // 初期状態では表示に設定 (hiddenクラスを削除)
  // subtitlesPanel.classList.add("hidden");

  // パネルのヘッダー（タイトル）を作成
  const panelHeader = document.createElement("div");
  panelHeader.className = "panel-header";

  // タブコンテナを作成
  const tabContainer = document.createElement("div");
  tabContainer.className = "tab-container";

  // 字幕タブ
  const subtitlesTab = document.createElement("button");
  subtitlesTab.className = "tab-button active";
  subtitlesTab.textContent = "Subtitles";
  subtitlesTab.onclick = () => {
    subtitlesTab.classList.add("active");
    savedItemsTab.classList.remove("active");
    subtitlesList.style.display = "block";
    savedItemsList.style.display = "none";
  };

  // 保存済みアイテムタブ
  const savedItemsTab = document.createElement("button");
  savedItemsTab.className = "tab-button";
  savedItemsTab.textContent = "Saved Items";
  savedItemsTab.onclick = () => {
    savedItemsTab.classList.add("active");
    subtitlesTab.classList.remove("active");
    subtitlesList.style.display = "none";
    savedItemsList.style.display = "block";
  };

  // 閉じるボタン
  const closeButton = document.createElement("button");
  closeButton.className = "close-button";
  closeButton.innerHTML = "✕";
  closeButton.onclick = () => {
    // パネルを一時的に非表示にする
    subtitlesPanel.classList.add("hidden");

    // プレーヤーコンテナからパネル表示状態のクラスを削除
    playerContainer.classList.remove("panel-visible");

    // 元のプレーヤーUIも調整
    adjustPlayerUIVisibility(playerContainer, false);

    // 3秒後に再表示する
    setTimeout(() => {
      ensurePanelVisibility();
    }, 3000);
  };

  // 印刷ボタン
  const printButton = document.createElement("button");
  printButton.className = "print-button";
  printButton.innerHTML = "🖨️";
  printButton.onclick = () => {
    // 印刷機能（将来的に実装）
    console.log("Print functionality will be implemented");
  };

  // タブをタブコンテナに追加
  tabContainer.appendChild(subtitlesTab);
  tabContainer.appendChild(savedItemsTab);

  // ヘッダーにタブコンテナとボタンを追加
  panelHeader.appendChild(tabContainer);
  panelHeader.appendChild(printButton);
  panelHeader.appendChild(closeButton);

  // 字幕リストコンテナを作成
  const subtitlesList = document.createElement("div");
  subtitlesList.className = "subtitles-list";

  // スクロールイベントを監視
  subtitlesList.addEventListener("scroll", () => {
    // ユーザーがスクロール中であることを記録
    isUserScrolling = true;

    // 前回のタイムアウトをクリア
    if (userScrollTimeout) {
      clearTimeout(userScrollTimeout);
    }

    // 2秒間スクロールがなければ自動スクロールを再開
    userScrollTimeout = setTimeout(() => {
      isUserScrolling = false;
    }, 2000);
  });

  // 保存済みアイテムリストを作成（初期状態では非表示）
  const savedItemsList = document.createElement("div");
  savedItemsList.className = "saved-items-list";
  savedItemsList.style.display = "none";

  /* 最下部の字幕表示エリアは非表示とする
  // 現在の字幕を表示するエリアを追加
  const bottomSubtitleArea = document.createElement("div");
  bottomSubtitleArea.className = "bottom-subtitle-area";

  const currentTranslationElement = document.createElement("div");
  currentTranslationElement.className = "current-translation";

  const currentSubtitleElement = document.createElement("div");
  currentSubtitleElement.className = "current-subtitle";

  // 順序を入れ替え：翻訳を先に、原文を後に
  bottomSubtitleArea.appendChild(currentTranslationElement);
  bottomSubtitleArea.appendChild(currentSubtitleElement);
  */

  // パネルにヘッダーとリストを追加
  subtitlesPanel.appendChild(panelHeader);
  subtitlesPanel.appendChild(subtitlesList);
  subtitlesPanel.appendChild(savedItemsList);
  // subtitlesPanel.appendChild(bottomSubtitleArea); // 最下部の字幕表示エリアは非表示

  // プレーヤーコンテナにパネルを追加
  playerContainer.appendChild(subtitlesPanel);

  // 初期状態ではパネル表示状態に変更
  playerContainer.classList.add("panel-visible");

  // 過去の字幕を表示するための関数も実装
  updateSubtitlesList();

  // パネル表示・非表示を切り替えるボタンを追加
  addPanelToggleButton(playerContainer, subtitlesPanel);
}

// パネル表示・非表示切り替えボタンを追加
function addPanelToggleButton(playerContainer, subtitlesPanel) {
  // 既存のトグルボタンがあれば削除
  const existingToggleButton = document.querySelector(".panel-toggle-button");
  if (existingToggleButton) {
    existingToggleButton.remove();
  }

  const toggleButton = document.createElement("button");
  toggleButton.className = "panel-toggle-button";
  toggleButton.title = "パネルを閉じる";
  toggleButton.textContent = "≪";

  // クリックイベントでパネル表示を切り替え
  toggleButton.onclick = () => {
    const isPanelVisible = !subtitlesPanel.classList.contains("hidden");

    if (isPanelVisible) {
      // パネルを非表示に
      subtitlesPanel.classList.add("hidden");
      playerContainer.classList.remove("panel-visible");
      toggleButton.title = "パネルを開く";
      toggleButton.textContent = "≫";
      adjustPlayerUIVisibility(playerContainer, false);
    } else {
      // パネルを表示
      subtitlesPanel.classList.remove("hidden");
      playerContainer.classList.add("panel-visible");
      toggleButton.title = "パネルを閉じる";
      toggleButton.textContent = "≪";
      adjustPlayerUIVisibility(playerContainer, true);
    }
  };

  // プレーヤーコンテナにボタンを追加
  playerContainer.appendChild(toggleButton);
}

// 字幕リストを更新する関数
function updateSubtitlesList() {
  const subtitlesList = document.querySelector(".subtitles-list");
  if (!subtitlesList) return;

  // ユーザーのスクロール位置を確認
  const wasAtBottom =
    !isUserScrolling &&
    subtitlesList.scrollHeight - subtitlesList.scrollTop <=
      subtitlesList.clientHeight + 50;

  // 現在の字幕を特定 - currentSubtitleを使用して特定する
  // 最新の字幕ではなく、currentSubtitleが一致するものをアクティブとして扱う
  const activeSubtitleData = previousSubtitles.find(
    (item) => item.original === currentSubtitle
  );

  // 既存のリストをクリア
  subtitlesList.innerHTML = "";

  // 過去の字幕を表示（最新の15個を古い順に表示）
  const subtitlesToShow = previousSubtitles.slice(-15);

  if (subtitlesToShow.length === 0) {
    const emptyMessage = document.createElement("div");
    emptyMessage.className = "subtitle-status";
    emptyMessage.textContent = "字幕がまだありません";
    subtitlesList.appendChild(emptyMessage);
    return;
  }

  // アクティブな字幕要素への参照を保持
  let activeSubtitleItem = null;

  subtitlesToShow.forEach((subtitle, index) => {
    const subtitleItem = document.createElement("div");
    subtitleItem.className = "subtitle-item";
    // クリック可能な要素として設定
    subtitleItem.style.cursor = "pointer";

    // 現在のアクティブな字幕にはアクティブクラスを追加
    if (
      activeSubtitleData &&
      subtitle.original === activeSubtitleData.original
    ) {
      subtitleItem.classList.add("active-subtitle");
      activeSubtitleItem = subtitleItem;
    }

    // 表示を削除するためのボタン
    const removeButton = document.createElement("span");
    removeButton.className = "remove-button";
    removeButton.innerHTML = "✕";
    removeButton.onclick = (e) => {
      e.stopPropagation();
      subtitleItem.remove();
      // 配列からも削除
      // 最新の15個を取得しているので、インデックスを計算
      const arrayIndex = previousSubtitles.length - 15 + index;
      if (arrayIndex >= 0 && arrayIndex < previousSubtitles.length) {
        previousSubtitles.splice(arrayIndex, 1);
      }
    };

    // お気に入りボタン
    const favoriteButton = document.createElement("span");
    favoriteButton.className = "favorite-button";
    favoriteButton.innerHTML = "☆";
    favoriteButton.onclick = (e) => {
      e.stopPropagation();
      favoriteButton.innerHTML = favoriteButton.innerHTML === "☆" ? "★" : "☆";
      // お気に入り状態を保存する処理（将来的に実装）
    };

    // 翻訳と原文を表示（順序を入れ替え）
    const translatedText = document.createElement("div");
    translatedText.className = "translated-text";
    translatedText.textContent = subtitle.translated || "翻訳中...";

    const originalText = document.createElement("div");
    originalText.className = "original-text";
    originalText.textContent = subtitle.original || "";

    // 字幕項目にコンポーネントを追加（順序を変更）
    subtitleItem.appendChild(removeButton);
    subtitleItem.appendChild(favoriteButton);
    subtitleItem.appendChild(translatedText); // 翻訳を先に表示
    subtitleItem.appendChild(originalText); // 原文を後に表示

    // クリックイベントで動画再生位置を移動
    subtitleItem.addEventListener("click", () => {
      try {
        // 字幕が表示された時間を取得
        const timestamp = subtitle.timestamp;

        // 動画要素を取得
        const videoElement = document.querySelector(
          ".webPlayerSDKContainer video"
        );

        if (videoElement && timestamp !== undefined) {
          // 記録された再生時間に直接移動
          videoElement.currentTime = timestamp;

          // 現在の字幕を更新（クリックしたものをカレントに）
          currentSubtitle = subtitle.original;

          // 字幕パネルの表示状態は変更しない
          // 短い時間を置いてから再生
          setTimeout(() => {
            if (videoElement && videoElement.paused) {
              videoElement.play();
            }
          }, 100);

          // 現在のアクティブな字幕をマーク
          const allSubtitleItems = document.querySelectorAll(".subtitle-item");
          allSubtitleItems.forEach((item) =>
            item.classList.remove("active-subtitle")
          );
          subtitleItem.classList.add("active-subtitle");

          // クリックした字幕が見えるようにスクロール
          // scrollIntoViewの代わりに親要素内でのスクロール処理を実装
          const subtitlesList = document.querySelector(".subtitles-list");
          if (subtitlesList) {
            const itemTop = subtitleItem.offsetTop;
            const listScrollTop = subtitlesList.scrollTop;
            const listHeight = subtitlesList.clientHeight;
            const itemHeight = subtitleItem.clientHeight;

            // 要素が表示領域の中央に来るようにスクロール
            subtitlesList.scrollTop = itemTop - listHeight / 2 + itemHeight / 2;
          }

          // ユーザーがスクロールしたとマーク（自動スクロールを一時的に無効化）
          isUserScrolling = true;
          // 少し時間を置いてから自動スクロールを再開できるようにする
          if (userScrollTimeout) {
            clearTimeout(userScrollTimeout);
          }
          userScrollTimeout = setTimeout(() => {
            isUserScrolling = false;
          }, 3000);

          // 現在の字幕パネル内の表示も更新
          updateCurrentSubtitleInPanel(subtitle.original);
          // 翻訳も更新（キャッシュがあればすぐに表示される）
          if (subtitle.translated && subtitle.translated !== "翻訳中...") {
            displayTranslation(subtitle.translated);
          } else {
            getTranslation(subtitle.original);
          }
        }
      } catch (e) {
        console.error(
          "Amazon Prime Translate: 再生位置の移動中にエラーが発生しました",
          e
        );
      }
    });

    subtitlesList.appendChild(subtitleItem);
  });

  // 現在のアクティブな字幕が見えるようにスクロール
  if (!isUserScrolling && activeSubtitleItem) {
    // 一度タイムアウトを設定して確実に実行
    setTimeout(() => {
      // スクロール実行前に要素が確実に存在することを確認
      if (activeSubtitleItem && activeSubtitleItem.isConnected) {
        // scrollIntoViewの代わりに親要素内でのスクロール処理を実装
        const subtitlesList = document.querySelector(".subtitles-list");
        if (subtitlesList) {
          const itemTop = activeSubtitleItem.offsetTop;
          const listScrollTop = subtitlesList.scrollTop;
          const listHeight = subtitlesList.clientHeight;
          const itemHeight = activeSubtitleItem.clientHeight;

          // 要素が表示領域の中央に来るようにスクロール
          subtitlesList.scrollTop = itemTop - listHeight / 2 + itemHeight / 2;
        }

        // スクロール後に要素に視覚的に注目させる
        activeSubtitleItem.classList.add("highlight-pulse");
        setTimeout(() => {
          if (activeSubtitleItem && activeSubtitleItem.isConnected) {
            activeSubtitleItem.classList.remove("highlight-pulse");
          }
        }, 1000);
      }
    }, 150); // スクロールタイミングを少し遅らせる
  }
  // 一番下に自動スクロール（以前の動作）- 現在は使用しない
  // if (wasAtBottom) {
  //   setTimeout(() => {
  //     subtitlesList.scrollTop = subtitlesList.scrollHeight;
  //   }, 100);
  // }
}

// 元の字幕位置を調整
function adjustOriginalCaptions() {
  // 字幕コンテナを探す
  const captionsOverlay = document.querySelector(
    ".atvwebplayersdk-captions-overlay"
  );
  if (captionsOverlay) {
    // 元の字幕のスタイルを調整
    captionsOverlay.style.bottom = "20%";
    captionsOverlay.style.position = "absolute";
    captionsOverlay.style.zIndex = "2";
    captionsOverlay.style.pointerEvents = "none";

    // 設定に応じて元の字幕を表示/非表示
    if (!settings.showOriginal) {
      captionsOverlay.parentElement.classList.add("hide-original-subtitle");
    } else {
      captionsOverlay.parentElement.classList.remove("hide-original-subtitle");
    }
  }
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

      // パネルの表示を確保
      ensurePanelVisibility();

      // 動画再生中は定期的にチェック（MutationObserverが取りこぼす場合の保険）
      setInterval(() => {
        if (captionsContainer) {
          handleSubtitleChange(captionsContainer);
          // 定期的にパネル表示を確認
          ensurePanelVisibility();
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
      // 前回の字幕をリセット
      clearActiveSubtitles();

      // 現在の字幕を更新
      currentSubtitle = newSubtitle;

      // オリジナル字幕の表示/非表示を設定
      if (originalSubtitleNode) {
        originalSubtitleNode.style.display = settings.showOriginal
          ? "block"
          : "none";
      }

      // 現在の動画再生時間を取得
      let currentTime = 0;
      const videoElement = document.querySelector(
        ".webPlayerSDKContainer video"
      );
      if (videoElement) {
        currentTime = videoElement.currentTime;
      }

      // 現在の字幕をパネル内に表示
      updateCurrentSubtitleInPanel(newSubtitle);

      // 字幕履歴に追加（翻訳前の状態で先に追加）
      addToSubtitleHistory(currentSubtitle, "翻訳中...", currentTime);

      // 翻訳を取得して表示
      if (settings.showTranslation) {
        getTranslation(currentSubtitle);
      }

      // 次の字幕も先読みで翻訳（将来の字幕を予測）
      preloadNextSubtitles();

      // ユーザースクロールフラグをリセット（自動スクロールを有効にするため）
      isUserScrolling = false;
    } else if (!newSubtitle) {
      // 字幕がなくなった場合は翻訳も消す
      clearTranslation();
    }
  } else {
    // 字幕要素がなくなった場合
    clearTranslation();
  }
}

// 全ての字幕からアクティブクラスを削除する補助関数
function clearActiveSubtitles() {
  const allSubtitleItems = document.querySelectorAll(".subtitle-item");
  allSubtitleItems.forEach((item) => item.classList.remove("active-subtitle"));
}

// 現在の字幕をパネル内に表示
function updateCurrentSubtitleInPanel(subtitle) {
  // 最下部の字幕表示エリアが非表示になったため、何もしない
  return;

  /* 元のコード
  // 現在の字幕を表示するエリア
  const currentSubtitleElement = document.querySelector(".current-subtitle");
  if (currentSubtitleElement) {
    currentSubtitleElement.textContent = subtitle;
  }

  // 翻訳を表示するエリア
  const currentTranslationElement = document.querySelector(
    ".current-translation"
  );
  if (currentTranslationElement) {
    currentTranslationElement.textContent = "翻訳中...";
    currentTranslationElement.classList.add("translating");
  }
  */
}

// 字幕履歴に追加
function addToSubtitleHistory(original, translated, timestamp) {
  // 同じ原文の字幕が既に履歴にあるか確認
  const existingIndex = previousSubtitles.findIndex(
    (item) => item.original === original
  );

  const isNewSubtitle = existingIndex < 0;
  const currentTime = Date.now();

  if (existingIndex >= 0) {
    // 既存の項目を更新
    previousSubtitles[existingIndex].translated = translated;
    previousSubtitles[existingIndex].timestamp = timestamp;
  } else {
    // 新しい項目を追加
    previousSubtitles.push({
      original: original,
      translated: translated,
      timestamp: timestamp,
    });

    // 履歴が多すぎる場合は古いものを削除
    if (previousSubtitles.length > 50) {
      previousSubtitles.shift();
    }

    // 新しい字幕が追加され、前回の追加から5秒以上経過していれば自動スクロールを再開
    if (currentTime - lastSubtitleAddedTime > 5000) {
      isUserScrolling = false;
    }

    // 最後の字幕追加時間を更新
    lastSubtitleAddedTime = currentTime;
  }

  // 字幕リストを更新
  updateSubtitlesList();
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

  // 前回の翻訳から250ミリ秒以内なら、APIコールを抑制する（間隔を短縮）
  if (now - lastTranslationTime < 250) return;

  // 翻訳中フラグを立てる
  pendingTranslations[text] = true;

  // バックグラウンドスクリプトに翻訳を依頼
  chrome.runtime.sendMessage(
    {
      action: "translate",
      text: text,
      apiKey: settings.apiKey,
      targetLang: settings.targetLang,
      priority: "medium", // 優先度を中程度に変更
    },
    (response) => {
      // 翻訳が完了したらフラグを下ろす
      delete pendingTranslations[text];

      if (response && response.translation) {
        // キャッシュに保存
        translationCache[text] = response.translation;
        lastTranslationTime = Date.now();

        // 字幕履歴の翻訳も更新
        updateSubtitleHistoryTranslation(text, response.translation);
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
    updateSubtitleHistoryTranslation(text, translationCache[text]);
    return;
  }

  // すでに翻訳中であれば処理しない
  if (pendingTranslations[text]) {
    displayTranslation("翻訳中...");
    return;
  }

  // 翻訳中フラグを立てる
  pendingTranslations[text] = true;
  displayTranslation("翻訳中...");

  // 翻訳処理を最適化（デバウンス時間を短縮）
  clearTimeout(translationDebounceTimer);
  translationDebounceTimer = setTimeout(() => {
    // バックグラウンドスクリプトに翻訳を依頼
    chrome.runtime.sendMessage(
      {
        action: "translate",
        text: text,
        apiKey: settings.apiKey,
        targetLang: settings.targetLang,
        priority: "high",
      },
      (response) => {
        // 翻訳中フラグを下ろす
        delete pendingTranslations[text];
        lastTranslationTime = Date.now();

        if (response && response.translation) {
          // キャッシュに保存
          translationCache[text] = response.translation;

          // 現在の字幕と一致する場合のみ表示
          if (text === currentSubtitle) {
            displayTranslation(response.translation);
          }

          // 字幕履歴の翻訳も更新
          updateSubtitleHistoryTranslation(text, response.translation);
        } else if (response && response.error) {
          console.error("Amazon Prime Translate: 翻訳エラー", response.error);

          if (text === currentSubtitle) {
            displayTranslation(`[翻訳エラー]`);
          }

          // 字幕履歴のエラー状態も更新
          updateSubtitleHistoryTranslation(text, `[翻訳エラー]`);
        }
      }
    );
  }, 50); // デバウンス時間を短縮
}

// 字幕履歴の翻訳を更新
function updateSubtitleHistoryTranslation(original, translation) {
  // 同じ原文の字幕が履歴にあるか確認して更新
  const existingIndex = previousSubtitles.findIndex(
    (item) => item.original === original
  );

  if (existingIndex >= 0) {
    // 既存の項目を更新
    previousSubtitles[existingIndex].translated = translation;

    // リストを更新
    updateSubtitlesList();
  }
}

// 翻訳結果を表示
function displayTranslation(translatedText) {
  // 最下部の字幕表示エリアが非表示になったため、何もしない
  return;

  /* 元のコード
  // パネル内の翻訳表示エリアを更新
  const currentTranslationElement = document.querySelector(
    ".current-translation"
  );
  if (currentTranslationElement) {
    currentTranslationElement.textContent = translatedText;

    // 「翻訳中...」の表示をすぐに更新するためにクラスを切り替え
    if (translatedText === "翻訳中...") {
      currentTranslationElement.classList.add("translating");
    } else {
      currentTranslationElement.classList.remove("translating");
    }
  }
  */
}

// 翻訳表示をクリア
function clearTranslation() {
  // 最下部の字幕表示エリアが非表示になったため、現在の字幕のクリア処理はスキップ
  /* 元のコード
  // パネル内の字幕エリアもクリア
  const currentSubtitleElement = document.querySelector(".current-subtitle");
  const currentTranslationElement = document.querySelector(
    ".current-translation"
  );

  if (currentSubtitleElement) {
    currentSubtitleElement.textContent = "";
  }

  if (currentTranslationElement) {
    currentTranslationElement.textContent = "";
    currentTranslationElement.classList.remove("translating");
  }
  */

  currentSubtitle = "";
}

// パネルが常に表示されるようにする
function ensurePanelVisibility() {
  const subtitlesPanel = document.getElementById(
    "prime-translate-subtitles-panel"
  );
  if (subtitlesPanel) {
    // hiddenクラスを削除
    subtitlesPanel.classList.remove("hidden");

    // プレーヤーコンテナにパネル表示状態のクラスを追加
    const playerContainer = document.querySelector(".webPlayerSDKContainer");
    if (playerContainer) {
      playerContainer.classList.add("panel-visible");

      // トグルボタンの状態も更新
      const toggleButton = document.querySelector(".panel-toggle-button");
      if (toggleButton) {
        toggleButton.title = "パネルを閉じる";
        toggleButton.textContent = "≪";
      }

      // プレーヤーUIの調整
      adjustPlayerUIVisibility(playerContainer, true);
    }
  }
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

    // 元の字幕表示を更新
    if (originalSubtitleNode) {
      originalSubtitleNode.style.display = settings.showOriginal
        ? "block"
        : "none";
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

  // パネル要素を削除
  const panel = document.getElementById("prime-translate-subtitles-panel");
  if (panel) {
    panel.remove();
  }

  // トグルボタンを削除
  const toggleButton = document.querySelector(".panel-toggle-button");
  if (toggleButton) {
    toggleButton.remove();
  }
}

// DOMが完全にロードされたら実行
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// パネルを常に表示するため、遅延実行で表示を確認する
setTimeout(() => {
  const subtitlesPanel = document.getElementById(
    "prime-translate-subtitles-panel"
  );
  if (subtitlesPanel) {
    subtitlesPanel.classList.remove("hidden");
    const playerContainer = document.querySelector(".webPlayerSDKContainer");
    if (playerContainer) {
      playerContainer.classList.add("panel-visible");
    }
  }
}, 2000);
