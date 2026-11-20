// Content script - runs on the Amul product page
// Waits for the Vue app to render, then checks stock status

const TARGET_SLUG = "amul-high-protein-rose-lassi-200-ml-or-pack-of-30";

// Only run on the target product page
if (window.location.pathname.includes(TARGET_SLUG)) {
  console.log("[Amul Checker] Content script loaded on target product page");
  waitForPageAndCheck();
}

function waitForPageAndCheck() {
  // The page is a Vue SPA - DOM renders after JS loads.
  // We poll until we find actionable buttons or the product data.
  let attempts = 0;
  const maxAttempts = 40; // 40 * 500ms = 20 seconds max wait

  const poller = setInterval(() => {
    attempts++;
    const result = detectStockStatus();

    if (result.status !== "loading" || attempts >= maxAttempts) {
      clearInterval(poller);
      console.log(`[Amul Checker] Stock status: ${result.status} (after ${attempts} checks)`);

      // Report to background
      chrome.runtime.sendMessage({ action: "stockStatus", status: result.status });

      if (result.status === "in_stock") {
        handleInStock(result);
      }
    }
  }, 500);
}

function detectStockStatus() {
  // Strategy 1: Check the global ms.product object (StoreHippo exposes this)
  if (window.ms && window.ms.product) {
    const product = window.ms.product;
    if (product.available === true || product.available === "1") {
      return { status: "in_stock", source: "ms.product" };
    }
    if (product.available === false || product.available === "0") {
      return { status: "out_of_stock", source: "ms.product" };
    }
  }

  // Strategy 2: Look for button text in the DOM
  const allButtons = document.querySelectorAll("button, a.btn, [role='button'], .btn");
  for (const btn of allButtons) {
    const text = (btn.textContent || "").trim().toLowerCase();

    // In-stock indicators
    if (text.includes("add to cart") || text.includes("add to bag") || text.includes("buy now")) {
      // Make sure it's not disabled
      if (!btn.disabled && !btn.classList.contains("disabled")) {
        return { status: "in_stock", source: "button", element: btn, text };
      }
    }

    // Out-of-stock indicators
    if (text.includes("notify me") || text.includes("notify when available") || text.includes("sold out") || text.includes("out of stock")) {
      return { status: "out_of_stock", source: "button" };
    }
  }

  // Strategy 3: Look for stock-related text anywhere
  const bodyText = document.body?.innerText?.toLowerCase() || "";
  if (bodyText.includes("out of stock") || bodyText.includes("currently unavailable") || bodyText.includes("sold out")) {
    return { status: "out_of_stock", source: "text" };
  }

  // Strategy 4: Check for disabled add-to-cart (some sites disable the button rather than hide it)
  for (const btn of allButtons) {
    const text = (btn.textContent || "").trim().toLowerCase();
    if (text.includes("add to cart") && (btn.disabled || btn.classList.contains("disabled"))) {
      return { status: "out_of_stock", source: "disabled_button" };
    }
  }

  return { status: "loading" };
}

function handleInStock(result) {
  console.log("[Amul Checker] 🎉 PRODUCT IS IN STOCK! Attempting to add to cart...");

  // Try to click "Add to Cart" button
  let clicked = false;

  if (result.source === "button" && result.element) {
    result.element.click();
    clicked = true;
  } else {
    // Find and click the add to cart button
    const allButtons = document.querySelectorAll("button, a.btn, [role='button'], .btn");
    for (const btn of allButtons) {
      const text = (btn.textContent || "").trim().toLowerCase();
      if ((text.includes("add to cart") || text.includes("buy now")) && !btn.disabled) {
        btn.click();
        clicked = true;
        break;
      }
    }
  }

  if (clicked) {
    console.log("[Amul Checker] Clicked Add to Cart! Navigating to checkout in 3s...");
    // Wait a moment for cart to update, then go to checkout
    setTimeout(() => {
      window.location.href = "https://shop.amul.com/en/checkout";
    }, 3000);
  } else {
    console.log("[Amul Checker] Could not find Add to Cart button, but product IS in stock!");
    // Still navigate to the page visibly so user can act
    alert("🚨 Amul Protein Lassi is IN STOCK! Check the page now!");
  }
}

// Also inject a script to access `ms.product` from the page context
// (content scripts run in isolated world, so we need to bridge)
const bridge = document.createElement("script");
bridge.textContent = `
  (function() {
    // Expose ms.product to the content script via a DOM event
    function broadcastProduct() {
      if (window.ms && window.ms.product) {
        window.postMessage({
          type: "AMUL_CHECKER_PRODUCT",
          available: window.ms.product.available,
          inventory: window.ms.product.inventory_quantity,
          name: window.ms.product.name
        }, "*");
      }
    }
    // Try immediately and also after a delay
    broadcastProduct();
    setTimeout(broadcastProduct, 2000);
    setTimeout(broadcastProduct, 5000);
  })();
`;
document.documentElement.appendChild(bridge);

// Listen for the bridged data
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "AMUL_CHECKER_PRODUCT") {
    console.log("[Amul Checker] Product data from page context:", event.data);

    const isAvailable = event.data.available === true || event.data.available === "1";

    chrome.runtime.sendMessage({
      action: "stockStatus",
      status: isAvailable ? "in_stock" : "out_of_stock",
    });

    if (isAvailable) {
      handleInStock({ status: "in_stock", source: "ms.product" });
    }
  }
});
