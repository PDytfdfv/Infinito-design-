(() => {
  "use strict";

  const canvas = document.getElementById("artboard");
  const ctx = canvas.getContext("2d");

  const wrap = document.getElementById("artboardWrap");
  const layersList = document.getElementById("layersList");
  const selectionBox = document.getElementById("selectionBox");
  const status = document.getElementById("status");
  const importMenu = document.getElementById("importMenu");

  const state = {
    version: 1,
    width: 1200,
    height: 800,
    zoom: 1,

    tool: "pen",
    color: "#111111",
    size: 6,

    layers: [],
    activeLayer: 0,

    drawing: false,
    pointerId: null,
    currentStroke: null,

    selectedImage: null,
    transform: null,

    history: [],
    historyIndex: -1
  };

  /* =========================
     أدوات مساعدة
  ========================= */

  function uid(prefix = "id") {
    return (
      prefix +
      "_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function currentLayer() {
    return state.layers[state.activeLayer] || null;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function makeStrokeLayer(name = "رسم") {
    return {
      id: uid("layer"),
      type: "stroke",
      name,
      visible: true,
      strokes: []
    };
  }

  function makeImageLayer(data, name = "صورة") {
    return {
      id: uid("layer"),
      type: "image",
      name,
      visible: true,
      image: data,
      x: 100,
      y: 100,
      w: 400,
      h: 300
    };
  }

  /* =========================
     التاريخ Undo / Redo
  ========================= */

  function makeSnapshot() {
    return JSON.stringify({
      width: state.width,
      height: state.height,
      layers: state.layers,
      activeLayer: state.activeLayer
    });
  }

  function pushHistory() {
    const snapshot = makeSnapshot();

    state.history = state.history.slice(
      0,
      state.historyIndex + 1
    );

    state.history.push(snapshot);

    if (state.history.length > 50) {
      state.history.shift();
    }

    state.historyIndex = state.history.length - 1;
  }

  function restoreSnapshot(snapshot) {
    const data = JSON.parse(snapshot);

    state.width = data.width;
    state.height = data.height;
    state.layers = data.layers;
    state.activeLayer = Math.min(
      data.activeLayer,
      state.layers.length - 1
    );

    canvas.width = state.width;
    canvas.height = state.height;

    applyZoom();
    renderLayers();
    render();
  }

  function undo() {
    if (state.historyIndex <= 0) {
      setStatus("لا يوجد تراجع");
      return;
    }

    state.historyIndex--;

    restoreSnapshot(
      state.history[state.historyIndex]
    );

    setStatus("تم التراجع");
  }

  function redo() {
    if (
      state.historyIndex >=
      state.history.length - 1
    ) {
      setStatus("لا توجد إعادة");
      return;
    }

    state.historyIndex++;

    restoreSnapshot(
      state.history[state.historyIndex]
    );

    setStatus("تمت الإعادة");
  }

  /* =========================
     مشروع جديد
  ========================= */

  function resetProject() {
    state.layers = [
      makeStrokeLayer("رسم 1")
    ];

    state.activeLayer = 0;
    state.selectedImage = null;

    state.width = 1200;
    state.height = 800;

    canvas.width = state.width;
    canvas.height = state.height;

    state.history = [];
    state.historyIndex = -1;

    pushHistory();

    renderLayers();
    render();

    setStatus("مشروع جديد");
  }

  /* =========================
     Layers
  ========================= */

  function renderLayers() {
    layersList.innerHTML = "";

    [...state.layers]
      .reverse()
      .forEach((layer, reverseIndex) => {

        const realIndex =
          state.layers.length -
          1 -
          reverseIndex;

        const row =
          document.createElement("div");

        row.className =
          "layer-row" +
          (
            realIndex === state.activeLayer
              ? " active"
              : ""
          );

        const icon =
          layer.type === "image"
            ? "🖼"
            : "✎";

        row.innerHTML = `
          <span class="layer-icon">
            ${icon}
          </span>

          <span class="layer-name"></span>
        `;

        row.querySelector(
          ".layer-name"
        ).textContent = layer.name;

        row.onclick = () => {
          state.activeLayer = realIndex;

          state.selectedImage =
            layer.type === "image"
              ? layer.id
              : null;

          renderLayers();
          renderSelection();
        };

        layersList.appendChild(row);
      });
  }

  function addLayer() {
    state.layers.push(
      makeStrokeLayer(
        `رسم ${state.layers.length + 1}`
      )
    );

    state.activeLayer =
      state.layers.length - 1;

    pushHistory();

    renderLayers();
    render();

    setStatus("أضيفت طبقة");
  }

  function deleteLayer() {
    if (state.layers.length === 1) {
      setStatus("لا يمكن حذف آخر طبقة");
      return;
    }

    state.layers.splice(
      state.activeLayer,
      1
    );

    state.activeLayer =
      Math.max(0, state.activeLayer - 1);

    state.selectedImage = null;

    pushHistory();

    renderLayers();
    render();

    setStatus("حُذفت الطبقة");
  }

  function duplicateLayer() {
    const source = currentLayer();

    if (!source) return;

    const copy =
      JSON.parse(
        JSON.stringify(source)
      );

    copy.id = uid("layer");
    copy.name =
      source.name + " نسخة";

    if (copy.type === "image") {
      copy.x += 25;
      copy.y += 25;
    }

    state.layers.splice(
      state.activeLayer + 1,
      0,
      copy
    );

    state.activeLayer++;

    pushHistory();

    renderLayers();
    render();

    setStatus("نُسخت الطبقة");
  }

  /* =========================
     Zoom
  ========================= */

  function applyZoom() {
    wrap.style.width =
      state.width * state.zoom + "px";

    wrap.style.height =
      state.height * state.zoom + "px";

    canvas.style.width =
      state.width * state.zoom + "px";

    canvas.style.height =
      state.height * state.zoom + "px";

    renderSelection();
  }

  /* =========================
     تحويل الماوس إلى إحداثيات
     داخل الـ Canvas
  ========================= */

  function screenToCanvas(e) {
    const rect =
      canvas.getBoundingClientRect();

    return {
      x:
        (e.clientX - rect.left) *
        (state.width / rect.width),

      y:
        (e.clientY - rect.top) *
        (state.height / rect.height)
    };
  }

  /* =========================
     رسم Vector Stroke
  ========================= */

  function drawSmoothStroke(c, stroke) {
    if (!stroke.points.length) {
      return;
    }

    c.save();

    c.strokeStyle = stroke.color;
    c.lineWidth = stroke.size;

    /*
      أهم جزء في حل مشكلة
      المثلثات والسنون:

      لا نبني Polygon حول الخط.

      نخزن Centerline فقط
      ونرسمه كـ Stroke حقيقي.

      وبالتالي لو المستخدم رجع فوق
      نفس الخط أو عكس الاتجاه
      لا يحصل Self Intersection
      في حدود الـ Polygon.
    */

    c.lineCap = "round";
    c.lineJoin = "round";

    c.globalAlpha =
      stroke.opacity ?? 1;

    const points = stroke.points;

    c.beginPath();

    if (points.length === 1) {
      c.fillStyle = stroke.color;

      c.arc(
        points[0].x,
        points[0].y,
        stroke.size / 2,
        0,
        Math.PI * 2
      );

      c.fill();

      c.restore();

      return;
    }

    c.moveTo(
      points[0].x,
      points[0].y
    );

    /*
      تنعيم الحركة باستخدام
      Quadratic Bezier.
    */

    for (
      let i = 1;
      i < points.length - 1;
      i++
    ) {
      const p = points[i];
      const next = points[i + 1];

      const middleX =
        (p.x + next.x) / 2;

      const middleY =
        (p.y + next.y) / 2;

      c.quadraticCurveTo(
        p.x,
        p.y,
        middleX,
        middleY
      );
    }

    const previous =
      points[points.length - 2];

    const last =
      points[points.length - 1];

    c.quadraticCurveTo(
      previous.x,
      previous.y,
      last.x,
      last.y
    );

    c.stroke();

    c.restore();
  }

  /* =========================
     رسم الصور
  ========================= */

  function drawImageLayer(c, layer) {
    if (
      !layer.visible ||
      !layer.image
    ) {
      return;
    }

    const image =
      new Image();

    image.onload = () => {
      c.save();

      c.globalAlpha =
        layer.opacity ?? 1;

      c.drawImage(
        image,
        layer.x,
        layer.y,
        layer.w,
        layer.h
      );

      c.restore();
    };

    image.src = layer.image;
  }

  /* =========================
     Render كامل
  ========================= */

  function render() {
    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    /*
      خلفية بيضاء
    */

    ctx.fillStyle = "#ffffff";

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    /*
      رسم الطبقات بالترتيب
    */

    for (const layer of state.layers) {

      if (!layer.visible) {
        continue;
      }

      if (layer.type === "stroke") {

        for (
          const stroke of layer.strokes
        ) {
          drawSmoothStroke(
            ctx,
            stroke
          );
        }

      } else if (
        layer.type === "image"
      ) {

        drawImageLayer(
          ctx,
          layer
        );
      }
    }

    renderSelection();
  }

  /* =========================
     Selection
  ========================= */

  function renderSelection() {
    const layer =
      state.layers.find(
        l =>
          l.id ===
          state.selectedImage
      );

    if (
      !layer ||
      layer.type !== "image"
    ) {
      selectionBox.classList.add(
        "hidden"
      );

      return;
    }

    selectionBox.classList.remove(
      "hidden"
    );

    selectionBox.style.left =
      layer.x * state.zoom + "px";

    selectionBox.style.top =
      layer.y * state.zoom + "px";

    selectionBox.style.width =
      layer.w * state.zoom + "px";

    selectionBox.style.height =
      layer.h * state.zoom + "px";
  }

  /* =========================
     بداية الرسم
  ========================= */

  function beginStroke(e) {
    const layer =
      currentLayer();

    if (
      !layer ||
      layer.type !== "stroke"
    ) {
      return;
    }

    const point =
      screenToCanvas(e);

    state.drawing = true;

    state.pointerId =
      e.pointerId;

    canvas.setPointerCapture(
      e.pointerId
    );

    state.currentStroke = {
      id: uid("stroke"),

      color: state.color,

      size: state.size,

      opacity: 1,

      points: [point]
    };

    layer.strokes.push(
      state.currentStroke
    );

    render();
  }

  /* =========================
     أثناء الرسم
  ========================= */

  function moveStroke(e) {
    if (
      !state.drawing ||
      e.pointerId !==
        state.pointerId
    ) {
      return;
    }

    const point =
      screenToCanvas(e);

    const points =
      state.currentStroke.points;

    const last =
      points[points.length - 1];

    /*
      منع Jitter فقط.

      لا نحظر تغيير الاتجاه.

      المستخدم يستطيع الرجوع
      فوق الخط نفسه بشكل طبيعي.
    */

    if (
      distance(point, last) >= 1.2
    ) {
      points.push(point);

      render();
    }
  }

  /* =========================
     نهاية الرسم
  ========================= */

  function endStroke(e) {
    if (
      !state.drawing ||
      e.pointerId !==
        state.pointerId
    ) {
      return;
    }

    state.drawing = false;

    state.currentStroke = null;

    state.pointerId = null;

    try {
      canvas.releasePointerCapture(
        e.pointerId
      );
    } catch (_) {}

    pushHistory();

    render();

    setStatus("تم الرسم");
  }

  /* =========================
     الممحاة
  ========================= */

  function eraseAt(e) {
    const layer =
      currentLayer();

    if (
      !layer ||
      layer.type !== "stroke"
    ) {
      return;
    }

    const point =
      screenToCanvas(e);

    const radius =
      state.size * 1.5;

    layer.strokes =
      layer.strokes.filter(
        stroke =>
          !stroke.points.some(
            p =>
              distance(
                p,
                point
              ) <= radius
          )
      );

    render();
  }

  /* =========================
     اختيار صورة
  ========================= */

  function pickImageAt(point) {
    for (
      let i = state.layers.length - 1;
      i >= 0;
      i--
    ) {
      const layer =
        state.layers[i];

      if (
        layer.type === "image" &&
        layer.visible &&
        point.x >= layer.x &&
        point.x <=
          layer.x + layer.w &&
        point.y >= layer.y &&
        point.y <=
          layer.y + layer.h
      ) {
        return layer;
      }
    }

    return null;
  }

  /* =========================
     تحريك الصورة
  ========================= */

  function moveSelectedImage(e) {
    const layer =
      state.layers.find(
        l =>
          l.id ===
          state.selectedImage
      );

    if (!layer) {
      return;
    }

    const point =
      screenToCanvas(e);

    if (!state.transform) {
      state.transform = {
        start: point,
        x: layer.x,
        y: layer.y,
        w: layer.w,
        h: layer.h
      };
    }

    layer.x =
      state.transform.x +
      (
        point.x -
        state.transform.start.x
      );

    layer.y =
      state.transform.y +
      (
        point.y -
        state.transform.start.y
      );

    render();

    renderSelection();
  }

  let draggingImage = false;

  /* =========================
     Pointer Down
  ========================= */

  canvas.addEventListener(
    "pointerdown",
    e => {

      if (state.tool === "pen") {
        beginStroke(e);
        return;
      }

      if (
        state.tool === "eraser"
      ) {
        eraseAt(e);
        return;
      }

      if (
        state.tool === "select"
      ) {

        const point =
          screenToCanvas(e);

        const image =
          pickImageAt(point);

        if (image) {

          state.selectedImage =
            image.id;

          state.activeLayer =
            state.layers.indexOf(
              image
            );

          draggingImage = true;

          state.transform = {
            start: point,
            x: image.x,
            y: image.y,
            w: image.w,
            h: image.h
          };

          renderLayers();
          renderSelection();

          canvas.setPointerCapture(
            e.pointerId
          );

        } else {

          state.selectedImage =
            null;

          renderSelection();
        }
      }
    }
  );

  /* =========================
     Pointer Move
  ========================= */

  canvas.addEventListener(
    "pointermove",
    e => {

      if (
        state.tool === "pen"
      ) {
        moveStroke(e);
        return;
      }

      if (
        state.tool === "eraser" &&
        (e.buttons & 1)
      ) {
        eraseAt(e);
        return;
      }

      if (
        state.tool === "select" &&
        draggingImage
      ) {
        moveSelectedImage(e);
      }
    }
  );

  /* =========================
     Pointer Up
  ========================= */

  canvas.addEventListener(
    "pointerup",
    e => {

      if (
        state.tool === "pen"
      ) {
        endStroke(e);
      }

      if (
        state.tool === "select" &&
        draggingImage
      ) {

        draggingImage = false;

        state.transform = null;

        pushHistory();

        setStatus(
          "تم تحريك الصورة"
        );

        try {
          canvas.releasePointerCapture(
            e.pointerId
          );
        } catch (_) {}
      }
    }
  );

  canvas.addEventListener(
    "pointercancel",
    e => {

      if (
        state.tool === "pen"
      ) {
        endStroke(e);
      }

      draggingImage = false;

      state.transform = null;
    }
  );

  /* =========================
     الأدوات
  ========================= */

  document
    .querySelectorAll(".tool")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(
              ".tool"
            )
            .forEach(
              b =>
                b.classList.remove(
                  "active"
                )
            );

          button.classList.add(
            "active"
          );

          state.tool =
            button.dataset.tool;

          if (
            state.tool !==
            "select"
          ) {
            state.selectedImage =
              null;
          }

          renderSelection();

          setStatus(
            button.title
          );
        }
      );
    });

  /* =========================
     اللون
  ========================= */

  document
    .getElementById("colorInput")
    .addEventListener(
      "input",
      e => {
        state.color =
          e.target.value;
      }
    );

  /* =========================
     حجم القلم
  ========================= */

  document
    .getElementById("sizeInput")
    .addEventListener(
      "input",
      e => {

        state.size =
          Number(e.target.value);

        document
          .getElementById(
            "sizeValue"
          )
          .value =
          state.size;
      }
    );

  /* =========================
     Zoom
  ========================= */

  document
    .getElementById("zoomInput")
    .addEventListener(
      "input",
      e => {

        state.zoom =
          Number(e.target.value) /
          100;

        document
          .getElementById(
            "zoomValue"
          )
          .value =
          e.target.value + "%";

        applyZoom();
      }
    );

  /* =========================
     أزرار Undo / Redo
  ========================= */

  document
    .getElementById("undoBtn")
    .onclick = undo;

  document
    .getElementById("redoBtn")
    .onclick = redo;

  /* =========================
     مشروع جديد
  ========================= */

  document
    .getElementById("newBtn")
    .onclick = () => {

      if (
        confirm(
          "بدء مشروع جديد؟"
        )
      ) {
        resetProject();
      }
    };

  /* =========================
     Layers
  ========================= */

  document
    .getElementById("addLayerBtn")
    .onclick = addLayer;

  document
    .getElementById(
      "deleteLayerBtn"
    )
    .onclick = deleteLayer;

  document
    .getElementById(
      "duplicateLayerBtn"
    )
    .onclick = duplicateLayer;

  /* =========================
     قائمة الاستيراد
  ========================= */

  document
    .getElementById("menuBtn")
    .onclick = e => {

      e.stopPropagation();

      importMenu.classList.toggle(
        "hidden"
      );
    };

  document.addEventListener(
    "click",
    e => {

      if (
        !importMenu.contains(
          e.target
        ) &&
        e.target.id !==
          "menuBtn"
      ) {
        importMenu.classList.add(
          "hidden"
        );
      }
    }
  );

  /* =========================
     عناصر الاستيراد
  ========================= */

  importMenu.addEventListener(
    "click",
    e => {

      const button =
        e.target.closest(
          "button[data-import]"
        );

      if (!button) {
        return;
      }

      importMenu.classList.add(
        "hidden"
      );

      const type =
        button.dataset.import;

      if (type === "image") {

        document
          .getElementById(
            "imageInput"
          )
          .click();

      } else if (
        type === "project"
      ) {

        document
          .getElementById(
            "projectInput"
          )
          .click();

      } else {

        setStatus(
          "هذا النوع سيضاف في المرحلة التالية"
        );
      }
    }
  );

  /* =========================
     استيراد صورة
  ========================= */

  document
    .getElementById(
      "imageInput"
    )
    .addEventListener(
      "change",
      e => {

        const file =
          e.target.files[0];

        if (!file) {
          return;
        }

        const reader =
          new FileReader();

        reader.onload = () => {

          const image =
            new Image();

          image.onload = () => {

            const maxWidth =
              500;

            const maxHeight =
              400;

            const scale =
              Math.min(
                1,
                maxWidth /
                  image.width,
                maxHeight /
                  image.height
              );

            const layer =
              makeImageLayer(
                reader.result,
                file.name
              );

            layer.w =
              image.width *
              scale;

            layer.h =
              image.height *
              scale;

            layer.x =
              (
                state.width -
                layer.w
              ) / 2;

            layer.y =
              (
                state.height -
                layer.h
              ) / 2;

            state.layers.push(
              layer
            );

            state.activeLayer =
              state.layers.length -
              1;

            state.selectedImage =
              layer.id;

            pushHistory();

            renderLayers();
            render();

            setStatus(
              "تم إدراج الصورة"
            );
          };

          image.src =
            reader.result;
        };

        reader.readAsDataURL(
          file
        );

        e.target.value = "";
      }
    );

  /* =========================
     تحميل ملف
  ========================= */

  function downloadBlob(
    blob,
    filename
  ) {

    const link =
      document.createElement(
        "a"
      );

    const url =
      URL.createObjectURL(
        blob
      );

    link.href = url;
    link.download = filename;

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();

    setTimeout(
      () =>
        URL.revokeObjectURL(
          url
        ),
      1000
    );
  }

  /* =========================
     حفظ مشروع ريشة
  ========================= */

  document
    .getElementById("saveBtn")
    .onclick = () => {

      const data = {

        format: "vpaint",

        version:
          state.version,

        width:
          state.width,

        height:
          state.height,

        layers:
          state.layers,

        activeLayer:
          state.activeLayer
      };

      const blob =
        new Blob(
          [
            JSON.stringify(
              data
            )
          ],
          {
            type:
              "application/json"
          }
        );

      downloadBlob(
        blob,
        "reesha-project.vpaint"
      );

      setStatus(
        "تم حفظ المشروع"
      );
    };

  /* =========================
     فتح مشروع
  ========================= */

  document
    .getElementById("openBtn")
    .onclick = () => {

      document
        .getElementById(
          "projectInput"
        )
        .click();
    };

  document
    .getElementById(
      "projectInput"
    )
    .addEventListener(
      "change",
      e => {

        const file =
          e.target.files[0];

        if (!file) {
          return;
        }

        const reader =
          new FileReader();

        reader.onload = () => {

          try {

            const data =
              JSON.parse(
                reader.result
              );

            if (
              data.format !==
                "vpaint" ||
              !Array.isArray(
                data.layers
              )
            ) {
              throw new Error(
                "ملف غير صالح"
              );
            }

            state.width =
              data.width || 1200;

            state.height =
              data.height || 800;

            state.layers =
              data.layers;

            state.activeLayer =
              Math.max(
                0,
                Math.min(
                  data.activeLayer || 0,
                  state.layers.length -
                    1
                )
              );

            state.selectedImage =
              null;

            canvas.width =
              state.width;

            canvas.height =
              state.height;

            state.history = [];
            state.historyIndex = -1;

            pushHistory();

            renderLayers();
            render();

            setStatus(
              "تم فتح المشروع"
            );

          } catch (error) {

            alert(
              "تعذر فتح المشروع: " +
              error.message
            );
          }
        };

        reader.readAsText(
          file
        );

        e.target.value = "";
      }
    );

  /* =========================
     تصدير PNG
  ========================= */

  document
    .getElementById(
      "exportPngBtn"
    )
    .onclick = () => {

      canvas.toBlob(
        blob => {

          downloadBlob(
            blob,
            "reesha.png"
          );
        },
        "image/png"
      );

      setStatus(
        "تم تصدير PNG"
      );
    };

  /* =========================
     SVG
  ========================= */

  function svgEscape(value) {

    return String(value)
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      );
  }

  function pointsToPath(points) {

    if (!points.length) {
      return "";
    }

    if (points.length === 1) {

      return (
        "M " +
        points[0].x +
        " " +
        points[0].y
      );
    }

    let d =
      "M " +
      points[0].x +
      " " +
      points[0].y;

    for (
      let i = 1;
      i < points.length - 1;
      i++
    ) {

      const p =
        points[i];

      const next =
        points[i + 1];

      const middleX =
        (p.x + next.x) / 2;

      const middleY =
        (p.y + next.y) / 2;

      d +=
        ` Q ${p.x} ${p.y} ` +
        `${middleX} ${middleY}`;
    }

    const previous =
      points[
        points.length - 2
      ];

    const last =
      points[
        points.length - 1
      ];

    d +=
      ` Q ${previous.x} ${previous.y} ` +
      `${last.x} ${last.y}`;

    return d;
  }

  /* =========================
     تصدير SVG Vector
  ========================= */

  document
    .getElementById(
      "exportSvgBtn"
    )
    .onclick = () => {

      const parts = [];

      parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" ` +
        `width="${state.width}" ` +
        `height="${state.height}" ` +
        `viewBox="0 0 ${state.width} ${state.height}">`
      );

      parts.push(
        `<rect width="100%" height="100%" fill="white"/>`
      );

      for (
        const layer of state.layers
      ) {

        if (!layer.visible) {
          continue;
        }

        /* -----------------
           Vector strokes
        ----------------- */

        if (
          layer.type ===
          "stroke"
        ) {

          for (
            const stroke of
              layer.strokes
          ) {

            if (
              !stroke.points.length
            ) {
              continue;
            }

            if (
              stroke.points.length ===
              1
            ) {

              parts.push(
                `<circle ` +
                `cx="${stroke.points[0].x}" ` +
                `cy="${stroke.points[0].y}" ` +
                `r="${stroke.size / 2}" ` +
                `fill="${svgEscape(
                  stroke.color
                )}"/>`
              );

            } else {

              parts.push(
                `<path ` +
                `d="${pointsToPath(
                  stroke.points
                )}" ` +
                `fill="none" ` +
                `stroke="${svgEscape(
                  stroke.color
                )}" ` +
                `stroke-width="${stroke.size}" ` +
                `stroke-linecap="round" ` +
                `stroke-linejoin="round"/>`
              );
            }
          }
        }

        /* -----------------
           Images
        ----------------- */

        else if (
          layer.type ===
          "image"
        ) {

          if (!layer.image) {
            continue;
          }

          parts.push(
            `<image ` +
            `href="${layer.image}" ` +
            `x="${layer.x}" ` +
            `y="${layer.y}" ` +
            `width="${layer.w}" ` +
            `height="${layer.h}" ` +
            `preserveAspectRatio="none"/>`
          );
        }
      }

      parts.push(
        "</svg>"
      );

      const svg =
        parts.join("");

      downloadBlob(
        new Blob(
          [svg],
          {
            type:
              "image/svg+xml"
          }
        ),
        "reesha.svg"
      );

      setStatus(
        "تم تصدير SVG"
      );
    };

  /* =========================
     اختصارات لوحة المفاتيح
  ========================= */

  document.addEventListener(
    "keydown",
    e => {

      const modifier =
        e.ctrlKey ||
        e.metaKey;

      if (
        modifier &&
        e.key.toLowerCase() ===
          "z"
      ) {

        e.preventDefault();

        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if (
        modifier &&
        e.key.toLowerCase() ===
          "y"
      ) {

        e.preventDefault();

        redo();
      }

      if (
        modifier &&
        e.key.toLowerCase() ===
          "s"
      ) {

        e.preventDefault();

        document
          .getElementById(
            "saveBtn"
          )
          .click();
      }
    }
  );

  /* =========================
     تشغيل التطبيق
  ========================= */

  resetProject();

})();
