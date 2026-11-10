'use strict';

// Минимальный DOM для тестов renderer-скриптов без jsdom.
// Поддерживает только то, что используют home.js и playful.js.

class FakeClassList {
  constructor(element) {
    this.element = element;
    this._set = new Set();
  }
  add(...names) {
    for (const name of names) this._set.add(name);
    this._sync();
  }
  remove(...names) {
    for (const name of names) this._set.delete(name);
    this._sync();
  }
  contains(name) {
    return this._set.has(name);
  }
  toggle(name, force) {
    const wanted = force === undefined ? !this._set.has(name) : !!force;
    if (wanted) this._set.add(name); else this._set.delete(name);
    this._sync();
    return wanted;
  }
  _sync() {
    this.element._className = [...this._set].join(' ');
  }
}

class FakeText {
  constructor(text) {
    this.nodeType = 3;
    this.textContent = String(text);
    this.children = [];
    this.parentNode = null;
  }
  remove() {
    if (this.parentNode) {
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) this.parentNode.children.splice(index, 1);
      this.parentNode = null;
    }
  }
}

class FakeElement {
  constructor(tag, document, namespace) {
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = document;
    this.namespaceURI = namespace || null;
    this.children = [];
    this.parentNode = null;
    this.attributes = Object.create(null);
    this.style = {};
    this._text = '';
    this._className = '';
    this._classList = new FakeClassList(this);
    this._listeners = Object.create(null);
    this._innerHTML = '';
    this.id = '';
    this.type = '';
    this.title = '';
    this.value = '';
    this.disabled = false;
    this.onclick = null;
  }

  get className() {
    return this._className;
  }
  set className(value) {
    this._className = value == null ? '' : String(value);
    this._classList._set = new Set(this._className.split(/\s+/).filter(Boolean));
  }
  get classList() {
    return this._classList;
  }
  get textContent() {
    if (this.children.length) return this.children.map((child) => child.textContent || '').join('');
    return this._text;
  }
  set textContent(value) {
    this._text = value == null ? '' : String(value);
    this.children = [];
  }
  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(value) {
    this._innerHTML = value == null ? '' : String(value);
    this.children = [];
    // playful.js ищет внутри SVG-маршрута две группы.
    if (this.tagName === 'SVG') {
      if (this._innerHTML.includes('route-line')) {
        const line = new FakeElement('path', this.ownerDocument);
        line.className = 'route-line';
        this.append(line);
      }
      if (this._innerHTML.includes('class="ball"')) {
        const ball = new FakeElement('g', this.ownerDocument);
        ball.className = 'ball';
        this.append(ball);
      }
    }
  }
  append(...nodes) {
    for (const node of nodes) {
      const child = typeof node === 'string' ? new FakeText(node) : node;
      if (!child) continue;
      child.parentNode = this;
      this.children.push(child);
    }
  }
  appendChild(node) {
    this.append(node);
    return node;
  }
  prepend(...nodes) {
    const prepared = nodes.map((node) => (typeof node === 'string' ? new FakeText(node) : node)).filter(Boolean);
    for (const child of prepared) child.parentNode = this;
    this.children.unshift(...prepared);
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parentNode) {
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) this.parentNode.children.splice(index, 1);
      this.parentNode = null;
    }
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = value;
    if (name === 'id') this.id = String(value);
  }
  getAttribute(name) {
    return name in this.attributes ? this.attributes[name] : null;
  }
  addEventListener(type, listener) {
    (this._listeners[type] || (this._listeners[type] = [])).push(listener);
  }
  removeEventListener(type, listener) {
    const list = this._listeners[type] || [];
    const index = list.indexOf(listener);
    if (index >= 0) list.splice(index, 1);
  }
  dispatch(type, event = {}) {
    const plain = { type, target: this, ...event };
    for (const listener of this._listeners[type] || []) listener.call(this, plain);
    const handler = this['on' + type];
    if (typeof handler === 'function') handler.call(this, plain);
    return plain;
  }
  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }
  click() {
    this.dispatch('click');
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 120, height: 40, right: 120, bottom: 40 };
  }
  get offsetWidth() { return 120; }
  get offsetHeight() { return 40; }
  get clientWidth() { return 300; }
  get clientHeight() { return 200; }
  get clientLeft() { return 0; }
  get clientTop() { return 0; }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const found = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (child.nodeType !== 1) continue;
        if (matches(child, selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

function matches(element, selector) {
  if (selector === '*') return true;
  if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
  if (selector.startsWith('#')) return element.id === selector.slice(1);
  if (selector.includes('.')) {
    const [tag, className] = selector.split('.');
    return element.tagName === tag.toUpperCase() && element.classList.contains(className);
  }
  return element.tagName === selector.toUpperCase();
}

function canvasContext() {
  const context = {
    texts: [],
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    measureText(text) { return { width: String(text).length * 8 }; },
    fillText(text, x, y) { context.texts.push({ text: String(text), x, y, font: context.font }); },
  };
  for (const name of ['beginPath', 'fill', 'stroke', 'save', 'restore', 'translate', 'moveTo', 'lineTo',
    'bezierCurveTo', 'quadraticCurveTo', 'ellipse', 'arc', 'fillRect', 'roundRect']) {
    context[name] = () => {};
  }
  return context;
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body', this);
    this.activeElement = null;
    this.clicks = [];
    this._listeners = Object.create(null);
  }
  createElement(tag) {
    const element = new FakeElement(tag, this);
    if (tag === 'canvas') {
      element.context = canvasContext();
      element.getContext = () => element.context;
      element.toDataURL = () => 'data:image/png;base64,AAAA';
    }
    if (tag === 'a') {
      element.click = () => { this.clicks.push({ href: element.href, download: element.download }); };
    }
    return element;
  }
  createElementNS(namespace, tag) {
    return new FakeElement(tag, this, namespace);
  }
  addEventListener(type, listener) {
    (this._listeners[type] || (this._listeners[type] = [])).push(listener);
  }
  dispatch(type, event = {}) {
    const plain = { type, target: this, ...event };
    for (const listener of this._listeners[type] || []) listener.call(this, plain);
    return plain;
  }
  querySelector(selector) {
    return this.body.querySelector(selector);
  }
  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

function makeDom() {
  const document = new FakeDocument();
  return { document, window: {} };
}

function walk(element, visitor) {
  visitor(element);
  for (const child of element.children) {
    if (child.nodeType === 1) walk(child, visitor);
  }
}

function byText(root, text) {
  let found = null;
  walk(root, (element) => {
    if (!found && element.textContent === text) found = element;
  });
  return found;
}

module.exports = { FakeDocument, FakeElement, FakeText, byText, makeDom, walk };
