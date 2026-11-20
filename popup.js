const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const monitorStatus = document.getElementById("monitorStatus");
const stockStatus = document.getElementById("stockStatus");
const lastCheck = document.getElementById("lastCheck");

function updateUI(data) {
  const isMonitoring = data.monitoring;

  monitorStatus.textContent = isMonitoring ? "Active" : "Off";
  monitorStatus.className = "value" + (isMonitoring ? " monitoring" : "");

  const status = data.lastStatus || "unknown";
  const statusMap = {
    in_stock: "In Stock ✓",
    out_of_stock: "Out of Stock",
    unknown: "Unknown",
    loading: "Loading...",
  };
  stockStatus.textContent = statusMap[status] || status;
  stockStatus.className = "value " + (status === "in_stock" ? "in-stock" : status === "out_of_stock" ? "out-of-stock" : "unknown");

  lastCheck.textContent = data.lastCheck || "-";

  startBtn.classList.toggle("hidden", isMonitoring);
  stopBtn.classList.toggle("hidden", !isMonitoring);
}

// Load current status
chrome.runtime.sendMessage({ action: "getStatus" }, (data) => {
  updateUI(data || {});
});

startBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "startMonitoring" }, () => {
    updateUI({ monitoring: true, lastStatus: "loading", lastCheck: "-" });
  });
});

stopBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "stopMonitoring" }, () => {
    chrome.runtime.sendMessage({ action: "getStatus" }, (data) => {
      updateUI(data || { monitoring: false });
    });
  });
});
