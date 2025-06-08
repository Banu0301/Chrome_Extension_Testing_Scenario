(function () {
  // Only inject once
  if (window.webPaintInjected) return;
  window.webPaintInjected = true;

  let canvas, ctx, drawing = false, startX = 0, startY = 0, lastX = 0, lastY = 0;
  let tool = "brush";
  let color = "#222222";
  let size = 4;
  let drawingHistory = [];
  let undoHistory = [];
  let redoHistory = [];
  let currentPath = [];
  let toolbarZ = 2147483647; // Max z-index
  let annotations = [];
  let uiElements = [];
  let isAnnotationMode = false;
  let selectedElement = null;
  let hoverElement = null;
  let extensionEnabled = false; // Default to OFF

  // Create overlay canvas
  function createCanvas() {
    canvas = document.createElement("canvas");
    canvas.id = "web-paint-canvas";
    Object.assign(canvas.style, {
      position: "fixed",
      left: 0,
      top: 0,
      width: "100vw",
      height: "100vh",
      pointerEvents: "none",
      zIndex: toolbarZ,
      background: "transparent"
    });
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    window.addEventListener("resize", resizeCanvas);
    
    // Save initial state for undo/redo
    saveState();
  }

  function resizeCanvas() {
    // Save current image
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.putImageData(img, 0, 0);
  }

  function enableDrawing() {
    canvas.style.pointerEvents = "auto";
    canvas.addEventListener("mousedown", onPointerDown);
    canvas.addEventListener("mousemove", onPointerMove);
    canvas.addEventListener("mouseup", onPointerUp);
    canvas.addEventListener("mouseleave", onPointerUp);
    canvas.addEventListener("touchstart", onPointerDown, { passive: false });
    canvas.addEventListener("touchmove", onPointerMove, { passive: false });
    canvas.addEventListener("touchend", onPointerUp, { passive: false });
  }

  function disableDrawing() {
    canvas.style.pointerEvents = "none";
    canvas.removeEventListener("mousedown", onPointerDown);
    canvas.removeEventListener("mousemove", onPointerMove);
    canvas.removeEventListener("mouseup", onPointerUp);
    canvas.removeEventListener("mouseleave", onPointerUp);
    canvas.removeEventListener("touchstart", onPointerDown);
    canvas.removeEventListener("touchmove", onPointerMove);
    canvas.removeEventListener("touchend", onPointerUp);
  }

  function setTool(newTool) {
    tool = newTool;
    enableDrawing();
  }

  function setColor(newColor) {
    color = newColor;
  }

  function setSize(newSize) {
    size = newSize;
  }

  function saveState() {
    undoHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoHistory.length > 50) {
      undoHistory.shift(); // Keep only last 50 states
    }
    redoHistory = []; // Clear redo history when new action is performed
  }

  function undo() {
    if (undoHistory.length > 1) {
      redoHistory.push(undoHistory.pop());
      const previousState = undoHistory[undoHistory.length - 1];
      ctx.putImageData(previousState, 0, 0);
    }
  }

  function redo() {
    if (redoHistory.length > 0) {
      const nextState = redoHistory.pop();
      undoHistory.push(nextState);
      ctx.putImageData(nextState, 0, 0);
    }
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawingHistory = [];
    annotations = [];
    selectedElement = null;
    saveState();
  }

  function drawLine(x1, y1, x2, y2, color_, size_) {
    ctx.strokeStyle = color_;
    ctx.lineWidth = size_;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawRect(x1, y1, x2, y2, color_, size_) {
    ctx.strokeStyle = color_;
    ctx.lineWidth = size_;
    ctx.beginPath();
    ctx.rect(x1, y1, x2 - x1, y2 - y1);
    ctx.stroke();
  }

  function drawCircle(x1, y1, x2, y2, color_, size_) {
    ctx.strokeStyle = color_;
    ctx.lineWidth = size_;
    ctx.beginPath();
    const r = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    ctx.arc(x1, y1, r, 0, 2 * Math.PI);
    ctx.stroke();
  }

  function erase(x, y, size_) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, size_ / 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }

  function highlight(x, y, size_) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(x, y, size_ / 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }

  function onPointerDown(e) {
    e.preventDefault();
    const [x, y] = getXY(e);
    
    // Handle annotation mode
    if (tool === "annotate") {
      const text = prompt("Enter annotation text:");
      if (text) {
        addAnnotation(x, y, text);
        saveState();
      }
      return;
    }
    
    // Handle element inspection mode
    if (tool === "inspect") {
      const elementInfo = detectElementUnderCursor(x, y);
      if (elementInfo) {
        selectedElement = elementInfo;
        redraw();
        highlightElement(elementInfo);
        const prompt = generateDesignPrompt(elementInfo);
        console.log("Design Prompt:", prompt);
        navigator.clipboard?.writeText(prompt);
      }
      return;
    }
    
    drawing = true;
    startX = lastX = x;
    startY = lastY = y;
    currentPath = [{ x, y }];
    
    if (tool === "brush" || tool === "eraser" || tool === "highlighter") {
      if (tool === "brush") {
        ctx.beginPath();
        ctx.moveTo(x, y);
      } else if (tool === "eraser") {
        erase(x, y, size);
      } else if (tool === "highlighter") {
        highlight(x, y, size);
      }
    }
  }

  function onPointerMove(e) {
    if (!drawing) return;
    e.preventDefault();
    const [x, y] = getXY(e);
    
    if (tool === "brush") {
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      ctx.lineTo(x, y);
      ctx.stroke();
      lastX = x;
      lastY = y;
      currentPath.push({ x, y });
    } else if (tool === "eraser") {
      erase(x, y, size);
      lastX = x;
      lastY = y;
      currentPath.push({ x, y });
    } else if (tool === "highlighter") {
      highlight(x, y, size);
      lastX = x;
      lastY = y;
      currentPath.push({ x, y });
    } else {
      // For shapes, redraw preview
      redraw();
      if (tool === "line") {
        drawLine(startX, startY, x, y, color, size);
      } else if (tool === "arrow") {
        drawArrow(startX, startY, x, y, color, size);
      } else if (tool === "rect") {
        drawRect(startX, startY, x, y, color, size);
      } else if (tool === "circle") {
        drawCircle(startX, startY, x, y, color, size);
      } else if (tool === "ui-button") {
        drawUIElement("button", startX, startY, x - startX, y - startY);
      } else if (tool === "ui-input") {
        drawUIElement("input", startX, startY, x - startX, y - startY);
      } else if (tool === "ui-card") {
        drawUIElement("card", startX, startY, x - startX, y - startY);
      } else if (tool === "ui-navbar") {
        drawUIElement("navbar", startX, startY, x - startX, y - startY);
      }
    }
  }

  function onPointerUp(e) {
    if (!drawing) return;
    drawing = false;
    const [x, y] = getXY(e);
    
    // Save state for undo/redo after completing any drawing action
    if (tool === "brush" || tool === "eraser" || tool === "highlighter") {
      currentPath.push({ x, y });
      drawingHistory.push({
        tool,
        color,
        size,
        path: [...currentPath]
      });
      saveState();
    } else if (tool === "line") {
      drawLine(startX, startY, x, y, color, size);
      drawingHistory.push({
        tool: "line",
        color,
        size,
        from: { x: startX, y: startY },
        to: { x, y }
      });
      saveState();
    } else if (tool === "arrow") {
      drawArrow(startX, startY, x, y, color, size);
      drawingHistory.push({
        tool: "arrow",
        color,
        size,
        from: { x: startX, y: startY },
        to: { x, y }
      });
      saveState();
    } else if (tool === "rect") {
      drawRect(startX, startY, x, y, color, size);
      drawingHistory.push({
        tool: "rect",
        color,
        size,
        from: { x: startX, y: startY },
        to: { x, y }
      });
      saveState();
    } else if (tool === "circle") {
      drawCircle(startX, startY, x, y, color, size);
      drawingHistory.push({
        tool: "circle",
        color,
        size,
        from: { x: startX, y: startY },
        to: { x, y }
      });
      saveState();
    } else if (tool.startsWith("ui-")) {
      const uiType = tool.replace("ui-", "");
      drawUIElement(uiType, startX, startY, x - startX, y - startY);
      drawingHistory.push({
        tool: tool,
        uiType: uiType,
        from: { x: startX, y: startY },
        to: { x, y }
      });
      saveState();
    }
    currentPath = [];
  }

  function getXY(e) {
    if (e.touches && e.touches.length > 0) {
      return [e.touches[0].clientX, e.touches[0].clientY];
    }
    return [e.clientX, e.clientY];
  }

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Redraw all drawing history
    for (const item of drawingHistory) {
      if (item.tool === "brush") {
        ctx.strokeStyle = item.color;
        ctx.lineWidth = item.size;
        ctx.lineCap = "round";
        ctx.beginPath();
        const pts = item.path;
        if (pts.length > 0) ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
      } else if (item.tool === "eraser") {
        for (const pt of item.path) {
          erase(pt.x, pt.y, item.size);
        }
      } else if (item.tool === "highlighter") {
        for (const pt of item.path) {
          highlight(pt.x, pt.y, item.size);
        }
      } else if (item.tool === "line") {
        drawLine(item.from.x, item.from.y, item.to.x, item.to.y, item.color, item.size);
      } else if (item.tool === "arrow") {
        drawArrow(item.from.x, item.from.y, item.to.x, item.to.y, item.color, item.size);
      } else if (item.tool === "rect") {
        drawRect(item.from.x, item.from.y, item.to.x, item.to.y, item.color, item.size);
      } else if (item.tool === "circle") {
        drawCircle(item.from.x, item.from.y, item.to.x, item.to.y, item.color, item.size);
      } else if (item.tool && item.tool.startsWith("ui-")) {
        const width = item.to.x - item.from.x;
        const height = item.to.y - item.from.y;
        drawUIElement(item.uiType, item.from.x, item.from.y, width, height);
      }
    }
    
    // Redraw all annotations
    for (const annotation of annotations) {
      drawAnnotation(annotation);
    }
  }

  // Advanced UI Mockup Features
  function drawArrow(x1, y1, x2, y2, color_, size_) {
    ctx.strokeStyle = color_;
    ctx.fillStyle = color_;
    ctx.lineWidth = size_;
    ctx.lineCap = "round";
    
    // Draw line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    
    // Draw arrowhead
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLength = size_ * 3;
    
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function drawUIElement(type, x, y, width, height) {
    ctx.strokeStyle = "#007bff";
    ctx.fillStyle = "rgba(0, 123, 255, 0.1)";
    ctx.lineWidth = 2;
    
    switch (type) {
      case "button":
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
        ctx.fillStyle = "#007bff";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Button", x + width/2, y + height/2 + 5);
        break;
      case "input":
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
        ctx.fillStyle = "#666";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";
        ctx.fillText("Input field", x + 8, y + height/2 + 4);
        break;
      case "card":
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
        ctx.fillStyle = "#333";
        ctx.font = "16px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Card Component", x + width/2, y + 30);
        break;
      case "navbar":
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
        ctx.fillStyle = "#333";
        ctx.font = "14px Arial";
        ctx.textAlign = "left";
        ctx.fillText("Navigation Bar", x + 16, y + height/2 + 5);
        break;
    }
  }

  function addAnnotation(x, y, text) {
    const annotation = {
      id: Date.now(),
      x: x,
      y: y,
      text: text,
      timestamp: new Date().toLocaleTimeString()
    };
    annotations.push(annotation);
    drawAnnotation(annotation);
  }

  function drawAnnotation(annotation) {
    const padding = 8;
    const fontSize = 12;
    ctx.font = `${fontSize}px Arial`;
    const textWidth = ctx.measureText(annotation.text).width;
    const boxWidth = textWidth + padding * 2;
    const boxHeight = fontSize + padding * 2;
    
    // Draw annotation box
    ctx.fillStyle = "rgba(255, 193, 7, 0.9)";
    ctx.fillRect(annotation.x, annotation.y - boxHeight, boxWidth, boxHeight);
    ctx.strokeStyle = "#ffc107";
    ctx.lineWidth = 1;
    ctx.strokeRect(annotation.x, annotation.y - boxHeight, boxWidth, boxHeight);
    
    // Draw text
    ctx.fillStyle = "#333";
    ctx.textAlign = "left";
    ctx.fillText(annotation.text, annotation.x + padding, annotation.y - padding);
    
    // Draw pointer
    ctx.beginPath();
    ctx.moveTo(annotation.x + 10, annotation.y);
    ctx.lineTo(annotation.x + 15, annotation.y + 8);
    ctx.lineTo(annotation.x + 5, annotation.y + 8);
    ctx.closePath();
    ctx.fillStyle = "#ffc107";
    ctx.fill();
  }

  function detectElementUnderCursor(x, y) {
    // Temporarily disable canvas pointer events to detect underlying elements
    canvas.style.pointerEvents = "none";
    const element = document.elementFromPoint(x, y);
    canvas.style.pointerEvents = "auto";
    
    if (element && element !== document.body && element !== document.documentElement) {
      return {
        element: element,
        tagName: element.tagName.toLowerCase(),
        className: element.className,
        id: element.id,
        rect: element.getBoundingClientRect()
      };
    }
    return null;
  }

  function highlightElement(elementInfo) {
    if (!elementInfo) return;
    
    const rect = elementInfo.rect;
    ctx.strokeStyle = "#ff6b6b";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
    ctx.setLineDash([]);
    
    // Show element info
    ctx.fillStyle = "rgba(255, 107, 107, 0.9)";
    ctx.font = "12px Arial";
    const info = `${elementInfo.tagName}${elementInfo.id ? '#' + elementInfo.id : ''}${elementInfo.className ? '.' + elementInfo.className.split(' ')[0] : ''}`;
    const textWidth = ctx.measureText(info).width;
    ctx.fillRect(rect.left, rect.top - 20, textWidth + 8, 18);
    ctx.fillStyle = "white";
    ctx.fillText(info, rect.left + 4, rect.top - 6);
  }

  function generateDesignPrompt(elementInfo) {
    if (!elementInfo) return "";
    
    const prompts = {
      button: "Redesign this button with modern glassmorphism effect and subtle animations",
      input: "Transform this input field with floating labels and smooth focus transitions",
      nav: "Modernize this navigation with gradient backgrounds and hover effects",
      div: "Convert this section into a modern card component with shadows and rounded corners",
      img: "Add a stylish image overlay with zoom effects and captions",
      h1: "Style this heading with modern typography and gradient text effects",
      h2: "Enhance this heading with custom fonts and spacing",
      p: "Improve this text with better typography and reading experience",
      a: "Style this link with modern hover effects and transitions"
    };
    
    return prompts[elementInfo.tagName] || `Redesign this ${elementInfo.tagName} element with modern UI principles`;
  }

  // Screenshot functionality
  function takeScreenshot(mode = "edit") {
    // Load html2canvas if not present
    if (!window.html2canvas) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
      script.onload = () => doScreenshot(mode);
      document.body.appendChild(script);
    } else {
      doScreenshot(mode);
    }
  }

  function doScreenshot(mode) {
    // Hide the canvas temporarily to capture clean screenshot
    canvas.style.display = "none";
    
    const options = {
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      scrollX: 0,
      scrollY: 0
    };

    // For full page screenshot
    if (mode === "full") {
      options.height = document.body.scrollHeight;
      options.width = document.body.scrollWidth;
    }
    
    html2canvas(document.body, options).then((canvasScreenshot) => {
      // Show canvas again
      canvas.style.display = "block";
      
      // Convert screenshot to data URL
      const screenshotDataURL = canvasScreenshot.toDataURL("image/png");
      
      if (mode === "edit") {
        // Open editor in new tab
        openScreenshotEditor(screenshotDataURL);
      } else {
        // Download directly
        downloadImage(screenshotDataURL, `screenshot-${mode}-${Date.now()}.png`);
      }
      
    }).catch((error) => {
      console.error("Screenshot failed:", error);
      canvas.style.display = "block";
    });
  }

  function downloadImage(dataURL, filename) {
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataURL;
    link.click();
  }

  function copyToClipboard() {
    canvas.toBlob(blob => {
      if (blob) {
        navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]).then(() => {
          console.log('Canvas copied to clipboard!');
        }).catch(err => {
          console.error('Failed to copy canvas: ', err);
        });
      }
    });
  }

  function openScreenshotEditor(screenshotDataURL) {
    // Create HTML content for the new tab with enhanced drawing tools
    const editorHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Screenshot Editor</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #f0f0f0;
            font-family: Arial, sans-serif;
            overflow: hidden;
        }
        .toolbar {
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            padding: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            z-index: 1000;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            max-width: 400px;
        }
        .toolbar button {
            border: none;
            background: rgba(255, 255, 255, 0.8);
            cursor: pointer;
            font-size: 16px;
            padding: 8px;
            border-radius: 6px;
            transition: all 0.2s;
            min-width: 36px;
            height: 36px;
        }
        .toolbar button:hover {
            background: rgba(103, 126, 234, 0.1);
            transform: translateY(-1px);
        }
        .toolbar button.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .toolbar input[type="color"] {
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 6px;
            cursor: pointer;
        }
        .toolbar input[type="range"] {
            width: 80px;
        }
        #canvas {
            display: block;
            margin: 0 auto;
            background: white;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            margin-top: 80px;
        }
        .action-buttons {
            position: fixed;
            top: 10px;
            right: 10px;
            display: flex;
            gap: 10px;
        }
        .action-buttons button {
            background: #28a745;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
        }
        .action-buttons button:hover {
            background: #218838;
        }
        .action-buttons button.copy {
            background: #007bff;
        }
        .action-buttons button.copy:hover {
            background: #0056b3;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="brush" class="active" title="Brush">🖊️</button>
        <button id="line" title="Line">/</button>
        <button id="arrow" title="Arrow">➡️</button>
        <button id="rect" title="Rectangle">▭</button>
        <button id="circle" title="Circle">◯</button>
        <button id="eraser" title="Eraser">🧽</button>
        <button id="highlighter" title="Highlighter">🖍️</button>
        <button id="annotate" title="Add Text">💬</button>
        <input type="color" id="colorPicker" value="#ff0000" title="Color">
        <input type="range" id="brushSize" min="2" max="20" value="4" title="Size">
        <button id="undo" title="Undo">↶</button>
        <button id="redo" title="Redo">↷</button>
        <button id="clear" title="Clear All">🗑️</button>
    </div>
    
    <div class="action-buttons">
        <button class="copy" id="copyClipboard">📋 Copy</button>
        <button id="download">💾 Download</button>
    </div>
    
    <canvas id="canvas"></canvas>

    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        let tool = 'brush';
        let color = '#ff0000';
        let size = 4;
        let drawing = false;
        let startX, startY;
        let undoHistory = [];
        let redoHistory = [];
        
        img.onload = function() {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            saveState();
        };
        img.src = '${screenshotDataURL}';
        
        function saveState() {
            undoHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
            if (undoHistory.length > 50) undoHistory.shift();
            redoHistory = [];
        }
        
        function undo() {
            if (undoHistory.length > 1) {
                redoHistory.push(undoHistory.pop());
                const previousState = undoHistory[undoHistory.length - 1];
                ctx.putImageData(previousState, 0, 0);
            }
        }
        
        function redo() {
            if (redoHistory.length > 0) {
                const nextState = redoHistory.pop();
                undoHistory.push(nextState);
                ctx.putImageData(nextState, 0, 0);
            }
        }
        
        document.querySelectorAll('.toolbar button[id]').forEach(btn => {
            if (!['clear', 'undo', 'redo'].includes(btn.id)) {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    tool = btn.id;
                });
            }
        });
        
        document.getElementById('colorPicker').addEventListener('change', (e) => {
            color = e.target.value;
        });
        
        document.getElementById('brushSize').addEventListener('input', (e) => {
            size = parseInt(e.target.value);
        });
        
        document.getElementById('undo').addEventListener('click', undo);
        document.getElementById('redo').addEventListener('click', redo);
        document.getElementById('clear').addEventListener('click', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            saveState();
        });
        
        document.getElementById('download').addEventListener('click', () => {
            const link = document.createElement('a');
            link.download = 'annotated-screenshot-' + Date.now() + '.png';
            link.href = canvas.toDataURL();
            link.click();
        });
        
        document.getElementById('copyClipboard').addEventListener('click', () => {
            canvas.toBlob(blob => {
                navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]).then(() => {
                    alert('Image copied to clipboard!');
                }).catch(err => {
                    console.error('Failed to copy image: ', err);
                });
            });
        });
        
        // Drawing functions
        function getXY(e) {
            const rect = canvas.getBoundingClientRect();
            return [e.clientX - rect.left, e.clientY - rect.top];
        }
        
        function drawLine(x1, y1, x2, y2) {
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        
        function drawArrow(x1, y1, x2, y2) {
            drawLine(x1, y1, x2, y2);
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLength = size * 3;
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
        }
        
        function drawRect(x1, y1, x2, y2) {
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        }
        
        function drawCircle(x1, y1, x2, y2) {
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.beginPath();
            const r = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            ctx.arc(x1, y1, r, 0, 2 * Math.PI);
            ctx.stroke();
        }
        
        function erase(x, y) {
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.arc(x, y, size, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();
        }
        
        function highlight(x, y) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();
        }
        
        function addAnnotation(x, y) {
            const text = prompt('Enter annotation text:');
            if (text) {
                ctx.fillStyle = 'rgba(255, 193, 7, 0.9)';
                ctx.font = '14px Arial';
                const textWidth = ctx.measureText(text).width;
                ctx.fillRect(x, y - 20, textWidth + 16, 24);
                ctx.fillStyle = '#333';
                ctx.fillText(text, x + 8, y - 4);
                saveState();
            }
        }
        
        // Mouse events
        canvas.addEventListener('mousedown', (e) => {
            const [x, y] = getXY(e);
            
            if (tool === 'annotate') {
                addAnnotation(x, y);
                return;
            }
            
            drawing = true;
            startX = x;
            startY = y;
            
            if (tool === 'brush') {
                ctx.beginPath();
                ctx.moveTo(x, y);
            } else if (tool === 'eraser') {
                erase(x, y);
            } else if (tool === 'highlighter') {
                highlight(x, y);
            }
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (!drawing) return;
            const [x, y] = getXY(e);
            
            if (tool === 'brush') {
                ctx.strokeStyle = color;
                ctx.lineWidth = size;
                ctx.lineCap = 'round';
                ctx.lineTo(x, y);
                ctx.stroke();
            } else if (tool === 'eraser') {
                erase(x, y);
            } else if (tool === 'highlighter') {
                highlight(x, y);
            }
        });
        
        canvas.addEventListener('mouseup', (e) => {
            if (!drawing) return;
            drawing = false;
            const [x, y] = getXY(e);
            
            if (tool === 'line') {
                drawLine(startX, startY, x, y);
                saveState();
            } else if (tool === 'arrow') {
                drawArrow(startX, startY, x, y);
                saveState();
            } else if (tool === 'rect') {
                drawRect(startX, startY, x, y);
                saveState();
            } else if (tool === 'circle') {
                drawCircle(startX, startY, x, y);
                saveState();
            } else if (tool === 'brush' || tool === 'eraser' || tool === 'highlighter') {
                saveState();
            }
        });
        
        // Prevent context menu
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    </script>
</body>
</html>`;
      
      // Open the editor in a new tab
      const newTab = window.open();
      newTab.document.write(editorHTML);
      newTab.document.close();
      
      console.log("Screenshot opened in new tab for editing!");
    }

  function toggleExtension(enabled) {
    extensionEnabled = enabled;
    if (enabled) {
      enableDrawing();
      canvas.style.display = "block";
    } else {
      disableDrawing();
      canvas.style.display = "none";
    }
  }

  // Listen for messages from popup.js
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "setTool") setTool(msg.tool);
    else if (msg.type === "setColor") setColor(msg.color);
    else if (msg.type === "setSize") setSize(msg.size);
    else if (msg.type === "clearCanvas") clearCanvas();
    else if (msg.type === "undo") undo();
    else if (msg.type === "redo") redo();
    else if (msg.type === "takeScreenshot") takeScreenshot(msg.mode);
    else if (msg.type === "copyToClipboard") copyToClipboard();
    else if (msg.type === "toggleExtension") toggleExtension(msg.enabled);
  });

  // Inject canvas on page load
  createCanvas();
  // Start with extension disabled by default
  disableDrawing();
  canvas.style.display = "none";

  // Redraw on resize
  window.addEventListener("resize", redraw);
})();
