function main() {
  const ArrayFrom =
    Array.from ||
    ((iterable) => {
      return [].slice.call(iterable);
    });

  const identity = (x) => x;

  const $unescape = window.unescape || identity;

  /** @param {CanvasRenderingContext2D} ctx */

  function isTainted(ctx) {
    try {
      return !ctx.getImageData(0, 0, 1, 1);
    } catch (err) {
      return true;
    }
  }

  const defer = Promise.prototype.then.bind(Promise.resolve());
  const _callback = window.requestAnimationFrame || defer || queueMicrotask; //?

  const callback = (fn) => _callback(() => _callback(fn));

  function createEventPromise(obj, event, timeout) {
    return new Promise((resolve) => {
      let timeout;
      const $resolveClearTimeout = () => {
        clearTimeout(timeout);
        resolve();
      };
      obj.addEventListener(event, $resolveClearTimeout, { once: true });
      obj.addEventListener("error", $resolveClearTimeout, {
        once: true,
      });
      timeout = setTimeout($resolveClearTimeout, timeout || 5000);
    });
  }

  class DOMShot {
    /** @param {HTMLElement} sourceNode
     *  @param {{}} options
     */
    constructor(sourceNode, options) {
      /**
       * @type  {{drawImgTagsOnCanvas:boolean,timeout:number}}
       */

      this.options = options || { drawImgTagsOnCanvas: false, timeout: 5000 };

      /** @type {HTMLImageElement} the svg encoded to base64 */

      this._img = null;

      /** @type {Promise<Event>} */

      this._imgReadyForCanvas = null;

      /** @type {number} scrollWidth of `sourceNode` */

      this._width = null;

      /** @type {number} scrollHeight of `sourceNode` */

      this._height = null;

      /** @type {string} DOM to svg string */

      this._svg = null;

      /** @type {HTMLCanvasElement} the canvas to get a rendered JPEG from */

      this._canvas = document.createElement("canvas");

      /** @type {CanvasRenderingContext2D} */

      this._canvasContext = this._canvas.getContext("2d");

      /** @type {0|1} */

      this._canvasState = null;

      /** @type {HTMLElement} the node to clone */

      this._sourceNode = null;

      /** @type {HTMLElement} cloned this._sourceNode */

      this._clonedNode = null;

      /** @type {HTMLElement[]} children of the source node `sourceNode.querySelectorAll('*')` */

      this._sourceChildren = null;

      /** @type {HTMLElement[]} children of the clone node `clonedNode.querySelectorAll('*')` */

      this._clonedChildren = null;

      if (sourceNode) {
        this.from(sourceNode);
      }
      this._xmlSerializer = new XMLSerializer();
    }
    /**
     *
     * @param {HTMLElement} source Node to copy CSS from
     * @param {HTMLElement} target Node to copy CSS to
     */

    static cloneStyle(source, target) {
      const computed = getComputedStyle(source);

      const css = [];

      for (const style of computed) {
        const value = computed.getPropertyValue(style);
        if (!value) continue;
        css.push(`${style}:${value};`);
      }

      target.style.cssText = css.join("");
    }

    /** @param {HTMLImageElement} img */

    static inlineImageIfPossible(img, timeout) {
      if (["blob", "data"].indexOf(img.src.substr(0, 4)) === 0) return;

      const prom = createEventPromise(img, "load", timeout).then(() => {
        const c = document.createElement("canvas");

        c.height = img.height;

        c.width = img.width;

        const ctx = c.getContext("2d");

        ctx.drawImage(img, 0, 0);

        if (!isTainted(ctx)) {
          const imgOnLoad = createEventPromise(img, "load", timeout);
          img.src = c.toDataURL();
          return imgOnLoad;
        }
      });

      img.crossOrigin = "anonymous";
      return prom;
    }

    /** @param {HTMLElement} node */

    _clone(node) {
      const cloned = node.cloneNode(true);
      return cloned;
    }
    /**
     * @param {HTMLElement} node sets the new source node
     *  @returns {DOMToSVG}
     */

    from(node) {
      this._width = this._height = 0;

      this._canvasState = DOMShot.DRAW_PENDING;

      this._sourceNode = node;

      this._clonedNode = this._clone(this._sourceNode);

      this._sourceChildren = ArrayFrom(this._sourceNode.querySelectorAll("*"));

      this._clonedChildren = ArrayFrom(this._clonedNode.querySelectorAll("*"));

      return this;
    }

    _cloneChildNodeStyle() {
      const clonedChildren = this._clonedChildren;

      const nodeChildren = this._sourceChildren;

      for (let i = 0; i < clonedChildren.length; i++) {
        const sourceChild = nodeChildren[i];

        const cloneChild = clonedChildren[i];

        DOMShot.cloneStyle(sourceChild, cloneChild);
      }
    }

    _walkChildNodes() {
      const clonedChildren = this._clonedChildren;
      const imgProm = [];
      for (const child of clonedChildren) {
        const tag = child.tagName;
        if (
          tag === "SCRIPT" ||
          tag === "STYLE" ||
          tag === "HEAD" ||
          tag === "NOSCRIPT" ||
          child.style.display === "none"
        ) {
          child.remove();
          continue;
        }
        if (this.options.drawImgTagsOnCanvas && tag === "IMG") {
          imgProm.push(
            DOMShot.inlineImageIfPossible(child, this.options.timeout)
          );
        }
      }
      return imgProm;
    }

    _cleanMargin() {
      [
        "margin",
        "marginLeft",
        "marginTop",
        "marginBottom",
        "marginRight",
      ].forEach((prop) => (this._clonedNode.style[prop] = ""));
    }

    _generateSVG() {
      const sourceNode = this._sourceNode;

      const clonedNode = this._clonedNode;

      const width = sourceNode.scrollWidth;

      const height = sourceNode.scrollHeight;

      clonedNode.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
      const xml = this._xmlSerializer.serializeToString(clonedNode);

      this._svg = `<?xml version='1.0' encoding='UTF-8' ?><svg
          xmlns="http://www.w3.org/2000/svg"
            width="${width}"
            height="${height}">
            <foreignObject width="100%" height="100%" x="0" y="0">${xml}</foreignObject>
          </svg>
         `;

      this._img = new Image(width, height);

      this._imgReadyForCanvas = createEventPromise(
        this._img,
        "load",
        this.options.timeout
      );

      this._img.crossOrigin = "anonymous"; // ?

      this._img.src = `data:image/svg+xml;charset=utf-8;base64,${btoa(
        $unescape(encodeURIComponent(this._svg))
      )}`;

      this._width = width;

      this._height = height;
    }

    _generateCanvas() {
      if (this._canvasState === DOMShot.DRAWN) return;

      const canvas = document.createElement("canvas");

      const ctx = canvas.getContext("2d");

      canvas.height = this._height;

      canvas.width = this._width;

      this._canvas = canvas;
      this._canvasContext = ctx;
    }

    _fillCanvas() {
      if (this._canvasState === DOMShot.DRAWN) return;

      const ctx = this._canvasContext;

      const img = this._img;

      ctx.drawImage(img, 0, 0);

      this._canvasState = DOMShot.DRAWN;

      this._imgReadyForCanvas = null;
      this._clonedChildren = null;
      this._sourceChildren = null;
      this._clonedChildren = null;
      this._sourceNode = null;
      this._clonedNode = null;
    }

    /** @returns {Promise<DOMToSVG>} */

    screenshot() {
      return new Promise((resolve) =>
        callback(() => {
          if (!this._clonedNode)
            throw new Error("No source node has been specified");

          this._cloneChildNodeStyle();

          const promiseArr = this._walkChildNodes();

          return Promise.all(promiseArr)
            .then(() => {
              DOMShot.cloneStyle(this._sourceNode, this._clonedNode);

              this._cleanMargin();

              this._generateSVG();
              return this._imgReadyForCanvas.then(() => {
                this._imgReadyForCanvas = null;
                this._generateCanvas();

                this._fillCanvas();

                resolve(this);
              });
            })
            .catch((e) => {
              console.log(e);
              resolve(this);
            });
        })
      );
    }

    /** @returns {Promise<DOMToSVG>} */

    drawImage() {
      return new Promise((resolve) =>
        callback(() => {
          this._fillCanvas();
          return resolve(this);
        })
      );
    }
    /**
     * @returns {Promise<string>}
     * @param {string} type
     * @param {number} quality
     */
    toDataUri(type, quality) {
      return new Promise((resolve) =>
        this.drawImage().then(() =>
          callback(() =>
            resolve(this._canvas.toDataURL(type || "image/jpeg", quality || 1))
          )
        )
      );
    }

    /**
     * @returns {Promise<string>}
     * @param {Blob} type
     * @param {number} quality
     */
    toBlob(type, quality) {
      return new Promise((resolve) =>
        this.drawImage().then(() =>
          callback(() =>
            this._canvas.toBlob(resolve, type || "image/jpeg", quality || 1)
          )
        )
      );
    }
  }

  DOMShot.DRAW_PENDING = 0;
  DOMShot.DRAWN = 1;

  async function screenshot() {
    const shot = new DOMShot(document.documentElement, {
      drawImgTagsOnCanvas: true,
    });
    await shot.screenshot();
    return URL.createObjectURL(await shot.toBlob("image/png"));
  }

  async function screenshotElement(element) {
    const shot = new DOMShot(element, {
      drawImgTagsOnCanvas: true,
    });
    await shot.screenshot();
    return URL.createObjectURL(await shot.toBlob("image/png"));
  }

  function download(url) {
    Object.assign(document.createElement("a"), {
      download: `image-${+new Date()}`,
      href: url,
    }).click();
  }
  function recursivelyGetParentBackground(el) {
    if (!el) return;
    const parent = el.parentElement;

    if (!parent || !parent.style) return;
    return (
      parent.style.background ||
      parent.style.backgroundColor ||
      parent.style.backgroundImage ||
      recursivelyGetParentBackground(parent)
    );
  }
  function noBg(el) {
    return !(
      el.style.background ||
      el.style.backgroundImage ||
      el.style.backgroundColor
    );
  }

  let toReset;

  const reset = (t) =>
    t && (t.style.background = t.getAttribute("data-old_background") || "");
  const mouseover = (e) => {
    toReset = e.target;
    e.target.setAttribute("data-old_background", e.target.style.background);
    e.target.style.background = "red";
  };
  const mouseout = (e) => {
    const t = e.target;
    reset(t);
  };
  // var numberofclicks = 0;
  function getElementName() {
    window.removeEventListener("click", getElementName);
    removeEventListener("mouseover", mouseover);
    removeEventListener("mouseout", mouseout);
    reset(toReset);
    document.documentElement.removeAttribute("is-extension-waiting-click");
    // numberofclicks++;
    const hoveredNodes = ArrayFrom(document.querySelectorAll(":hover"));
    console.log(hoveredNodes);
    const selectedElement = hoveredNodes[hoveredNodes.length - 1];
    const isTransparent = noBg(selectedElement);
    if (isTransparent) {
      selectedElement.style.background = recursivelyGetParentBackground(
        selectedElement
      );
    }
    screenshotElement(selectedElement)
      .then(download)
      .then(() => {
        isTransparent && (selectedElement.style.background = "");
      });
  }

  window.addEventListener("mouseover", mouseover);
  window.addEventListener("mouseout", mouseout);
  window.addEventListener("click", getElementName);
}

main();
