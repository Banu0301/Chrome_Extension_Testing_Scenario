document.addEventListener("DOMContentLoaded", () => {
  const toolButtons = {
    brush: document.getElementById("tool-brush"),
    line: document.getElementById("tool-line"),
    arrow: document.getElementById("tool-arrow"),
    rect: document.getElementById("tool-rect"),
    circle: document.getElementById("tool-circle"),
    eraser: document.getElementById("tool-eraser"),
    highlighter: document.getElementById("tool-highlighter"),
    "ui-button": document.getElementById("tool-ui-button"),
    "ui-input": document.getElementById("tool-ui-input"),
    "ui-card": document.getElementById("tool-ui-card"),
    "ui-navbar": document.getElementById("tool-ui-navbar"),
    annotate: document.getElementById("tool-annotate"),
    inspect: document.getElementById("tool-inspect")
  };
  
  const controlButtons = {
    undo: document.getElementById("tool-undo"),
    redo: document.getElementById("tool-redo"),
    clear: document.getElementById("tool-clear"),
    screenshot: document.getElementById("tool-screenshot"),
    screenshotVisible: document.getElementById("tool-screenshot-visible"),
    screenshotFull: document.getElementById("tool-screenshot-full"),
    copyClipboard: document.getElementById("tool-copy-clipboard")
  };
  
  const extensionToggle = document.getElementById("extension-toggle");
  
  const colorPicker = document.getElementById("color-picker");
  const brushSize = document.getElementById("brush-size");

  let activeTool = "brush";

  function setActiveTool(tool) {
    activeTool = tool;
    Object.entries(toolButtons).forEach(([key, btn]) => {
      if (key === tool) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
    sendMessage({ type: "setTool", tool });
  }

  function sendMessage(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message);
      }
    });
  }

  // Tool button events
  Object.entries(toolButtons).forEach(([tool, btn]) => {
    if (btn) {
      btn.addEventListener("click", () => setActiveTool(tool));
    }
  });

  // Color picker event
  if (colorPicker) {
    colorPicker.addEventListener("input", (e) => {
      sendMessage({ type: "setColor", color: e.target.value });
    });
  }

  // Brush size event
  if (brushSize) {
    brushSize.addEventListener("input", (e) => {
      sendMessage({ type: "setSize", size: parseInt(e.target.value, 10) });
    });
  }

  // Control button events
  if (controlButtons.undo) {
    controlButtons.undo.addEventListener("click", () => {
      sendMessage({ type: "undo" });
    });
  }

  if (controlButtons.redo) {
    controlButtons.redo.addEventListener("click", () => {
      sendMessage({ type: "redo" });
    });
  }

  if (controlButtons.clear) {
    controlButtons.clear.addEventListener("click", () => {
      sendMessage({ type: "clearCanvas" });
    });
  }

  // Screenshot events
  if (controlButtons.screenshot) {
    controlButtons.screenshot.addEventListener("click", () => {
      sendMessage({ type: "takeScreenshot", mode: "edit" });
    });
  }

  if (controlButtons.screenshotVisible) {
    controlButtons.screenshotVisible.addEventListener("click", () => {
      sendMessage({ type: "takeScreenshot", mode: "visible" });
    });
  }

  if (controlButtons.screenshotFull) {
    controlButtons.screenshotFull.addEventListener("click", () => {
      sendMessage({ type: "takeScreenshot", mode: "full" });
    });
  }

  if (controlButtons.copyClipboard) {
    controlButtons.copyClipboard.addEventListener("click", () => {
      sendMessage({ type: "copyToClipboard" });
    });
  }

  // Extension toggle functionality
  let extensionEnabled = false; // Default to OFF
  
  if (extensionToggle) {
    // Load saved state
    chrome.storage.local.get(['extensionEnabled'], (result) => {
      extensionEnabled = result.extensionEnabled === true; // Default to false (OFF)
      updateToggleButton();
      sendMessage({ type: "toggleExtension", enabled: extensionEnabled });
    });
    
    extensionToggle.addEventListener("click", () => {
      extensionEnabled = !extensionEnabled;
      updateToggleButton();
      sendMessage({ type: "toggleExtension", enabled: extensionEnabled });
      
      // Save state
      chrome.storage.local.set({ extensionEnabled: extensionEnabled });
    });
  }
  
  function updateToggleButton() {
    if (extensionToggle) {
      if (extensionEnabled) {
        extensionToggle.textContent = "🎨 ON";
        extensionToggle.classList.add("active");
        extensionToggle.style.background = "linear-gradient(135deg, #28a745 0%, #20c997 100%)";
      } else {
        extensionToggle.textContent = "❌ OFF";
        extensionToggle.classList.remove("active");
        extensionToggle.style.background = "linear-gradient(135deg, #dc3545 0%, #fd7e14 100%)";
      }
    }
  }

  // Initialize with default tool, color, and size
  setActiveTool("brush");
  if (colorPicker) {
    sendMessage({ type: "setColor", color: colorPicker.value });
  }
  if (brushSize) {
    sendMessage({ type: "setSize", size: parseInt(brushSize.value, 10) });
  }
});
