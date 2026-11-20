const PRODUCT_URL =
  "https://shop.amul.com/en/product/amul-high-protein-rose-lassi-200-ml-or-pack-of-30";
const CHECK_INTERVAL_SECONDS = 30;

// Keep track of monitoring state
let monitoring = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ monitoring: false, lastStatus: "unknown" });
});

// Listen for messages from popup / content script
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "startMonitoring") {
    monitoring = true;
    chrome.storage.local.set({ monitoring: true });
    chrome.alarms.create("checkStock", { periodInMinutes: CHECK_INTERVAL_SECONDS / 60 });
    // Also immediately trigger a check
    openProductTab();
    sendResponse({ ok: true });
  }

  if (msg.action === "stopMonitoring") {
    monitoring = false;
    chrome.storage.local.set({ monitoring: false });
    chrome.alarms.clear("checkStock");
    sendResponse({ ok: true });
  }

  if (msg.action === "getStatus") {
    chrome.storage.local.get(["monitoring", "lastStatus", "lastCheck"], (data) => {
      sendResponse(data);
    });
    return true; // async response
  }

  // Content script reports stock status
  if (msg.action === "stockStatus") {
    const now = new Date().toLocaleTimeString();
    chrome.storage.local.set({ lastStatus: msg.status, lastCheck: now });

    if (msg.status === "in_stock") {
      // STOP monitoring - we found it!
      monitoring = false;
      chrome.storage.local.set({ monitoring: false });
      chrome.alarms.clear("checkStock");

      // Send desktop notification with sound
      chrome.notifications.create("amulInStock", {
        type: "basic",
        iconUrl: "icon.png",
        title: "🚨 Amul Protein Lassi IN STOCK!",
        message: "Product is available! Adding to cart...",
        priority: 2,
        requireInteraction: true,
      });
    }
    sendResponse({ ok: true });
  }
});

// Alarm handler - reload the product tab to check stock
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkStock") {
    openProductTab();
  }
});

// Find existing product tab or create one, then reload it
async function openProductTab() {
  const tabs = await chrome.tabs.query({ url: "https://shop.amul.com/*" });
  const productTab = tabs.find((t) => t.url && t.url.includes("amul-high-protein-rose-lassi"));

  if (productTab) {
    chrome.tabs.reload(productTab.id);
  } else {
    chrome.tabs.create({ url: PRODUCT_URL, active: false });
  }
}

// Restore monitoring state on service worker restart
chrome.storage.local.get(["monitoring"], (data) => {
  if (data.monitoring) {
    monitoring = true;
    chrome.alarms.create("checkStock", { periodInMinutes: CHECK_INTERVAL_SECONDS / 60 });
  }
});
