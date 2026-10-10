/*
  Overlöd prototype runtime
  A small stand-in for the Claude Design runtime so the .dc.html screens run as
  plain static pages (GitHub Pages, any web host, or a local server).
  It supports: <helmet>, {{holes}}, <sc-for list as>, <sc-if value>,
  on* event bindings, data-props defaults (overridable with ?prop=value),
  class Component extends DCLogic with renderVals / forceUpdate /
  componentDidMount / componentWillUnmount.
*/
(function () {
  'use strict';

  // Hide the raw template until the first render.
  var pre = document.createElement('style');
  pre.textContent = 'x-dc{visibility:hidden}';
  document.head.appendChild(pre);

  var HOLE = /\{\{\s*([\w$.]+)\s*\}\}/g;
  var ONE = /^\{\{\s*([\w$.]+)\s*\}\}$/;

  function lookup(path, scopes) {
    var parts = path.split('.');
    var v;
    for (var i = scopes.length - 1; i >= 0; i--) {
      var sc = scopes[i];
      if (sc != null && Object.prototype.hasOwnProperty.call(sc, parts[0])) { v = sc[parts[0]]; break; }
    }
    for (var j = 1; j < parts.length; j++) { if (v == null) return undefined; v = v[parts[j]]; }
    return v;
  }
  function str(v) { return v == null ? '' : String(v); }
  function interp(s, scopes) { return s.replace(HOLE, function (_, p) { return str(lookup(p, scopes)); }); }

  function evName(attr, tag) {
    var n = attr.slice(2).toLowerCase();
    if (n === 'change' && (tag === 'input' || tag === 'textarea')) return 'input';
    if (n === 'doubleclick') return 'dblclick';
    return n;
  }

  // ---- template -> virtual nodes ----
  function build(node, scopes, out) {
    if (node.nodeType === 3) { out.push({t: interp(node.nodeValue, scopes)}); return; }
    if (node.nodeType !== 1) return;
    var tag = node.localName;
    if (tag === 'helmet' || tag === 'script') return;
    if (tag === 'sc-for') {
      var list = lookup((node.getAttribute('list') || '').replace(/[{}\s]/g, ''), scopes) || [];
      var as = node.getAttribute('as') || 'item';
      var idx = node.getAttribute('index');
      for (var i = 0; i < list.length; i++) {
        var sc = {}; sc[as] = list[i]; if (idx) sc[idx] = i;
        var next = scopes.concat([sc]);
        for (var c = node.firstChild; c; c = c.nextSibling) build(c, next, out);
      }
      return;
    }
    if (tag === 'sc-if') {
      var raw = node.getAttribute('value') || '';
      var m = raw.match(ONE);
      if (m ? lookup(m[1], scopes) : raw && raw !== 'false') {
        for (var k = node.firstChild; k; k = k.nextSibling) build(k, scopes, out);
      }
      return;
    }
    var v = {tag: tag, ns: node.namespaceURI, attrs: {}, on: {}, kids: []};
    for (var a = 0; a < node.attributes.length; a++) {
      var at = node.attributes[a], name = at.name, val = at.value;
      if (name.indexOf('hint-') === 0) continue;
      var one = val.match(ONE);
      if (/^on[a-z]/.test(name) && one) {
        var fn = lookup(one[1], scopes);
        if (typeof fn === 'function') v.on[evName(name, tag)] = fn;
        continue;
      }
      if (one) {
        var x = lookup(one[1], scopes);
        if (x == null) continue;
        v.attrs[name] = String(x);
      } else v.attrs[name] = interp(val, scopes);
    }
    for (var ch = node.firstChild; ch; ch = ch.nextSibling) build(ch, scopes, v.kids);
    out.push(v);
  }

  // ---- virtual nodes -> DOM (keeps elements alive so CSS transitions run) ----
  var HTML_NS = 'http://www.w3.org/1999/xhtml';
  function create(v) {
    if (v.t !== undefined) return document.createTextNode(v.t);
    var el = v.ns && v.ns !== HTML_NS ? document.createElementNS(v.ns, v.tag) : document.createElement(v.tag);
    update(el, v);
    return el;
  }
  function same(node, v) {
    if (!node) return false;
    if (v.t !== undefined) return node.nodeType === 3;
    return node.nodeType === 1 && node.localName === v.tag && node.namespaceURI === (v.ns || HTML_NS);
  }
  function update(el, v) {
    var old = el.attributes;
    for (var i = old.length - 1; i >= 0; i--) {
      var n = old[i].name;
      if (!(n in v.attrs)) el.removeAttribute(n);
    }
    for (var k in v.attrs) {
      var val = v.attrs[k];
      if ((k === 'value') && 'value' in el && el.localName !== 'button' && el.localName !== 'li') {
        if (el.value !== val) el.value = val;
        if (el.getAttribute('value') !== val) el.setAttribute('value', val);
        continue;
      }
      if (k === 'checked' && 'checked' in el) { el.checked = val !== 'false' && val !== ''; }
      if (el.getAttribute(k) !== val) {
        try { el.setAttribute(k, val); } catch (e) {}
      }
    }
    el.__h = v.on;
    var ls = el.__l || (el.__l = {});
    for (var t in v.on) {
      if (!ls[t]) {
        ls[t] = true;
        (function (type) {
          el.addEventListener(type, function (ev) {
            var h = el.__h && el.__h[type];
            if (h) { h(ev); schedule(); }
          });
        })(t);
      }
    }
    patch(el, v.kids);
  }
  function patch(parent, kids) {
    for (var i = 0; i < kids.length; i++) {
      var v = kids[i], cur = parent.childNodes[i];
      if (same(cur, v)) {
        if (v.t !== undefined) { if (cur.nodeValue !== v.t) cur.nodeValue = v.t; }
        else update(cur, v);
        continue;
      }
      // One-step lookahead: an element was removed, or one was inserted.
      var nxt = cur && cur.nextSibling;
      if (cur && same(nxt, v) && !(kids[i + 1] && same(cur, kids[i + 1]))) {
        parent.removeChild(cur); i--; continue;
      }
      var made = create(v);
      if (cur && kids[i + 1] && same(cur, kids[i + 1])) parent.insertBefore(made, cur);
      else if (cur) parent.replaceChild(made, cur);
      else parent.appendChild(made);
    }
    while (parent.childNodes.length > kids.length) parent.removeChild(parent.lastChild);
  }

  // ---- component plumbing ----
  var inst = null, host = null, tpl = null, pending = false, mounted = false;
  function schedule() {
    if (pending) return;
    pending = true;
    (window.queueMicrotask || function (f) { Promise.resolve().then(f); })(render);
  }
  function render() {
    pending = false;
    if (!inst) return;
    var vals;
    try { vals = inst.renderVals() || {}; } catch (e) { console.error(e); return; }
    var out = [];
    for (var c = tpl.firstChild; c; c = c.nextSibling) build(c, [vals], out);
    patch(host, out);
    if (!mounted) {
      mounted = true;
      pre.remove();
      if (inst.componentDidMount) try { inst.componentDidMount(); } catch (e) { console.error(e); }
    }
  }

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.forceUpdate = function () { schedule(); };
  DCLogic.prototype.setState = function (p) { Object.assign(this.state, typeof p === 'function' ? p(this.state) : p); schedule(); };
  window.DCLogic = DCLogic;

  function readProps(script) {
    var props = {}, spec = {};
    try { spec = JSON.parse(script.getAttribute('data-props') || '{}'); } catch (e) {}
    var q = new URLSearchParams(location.search);
    Object.keys(spec).forEach(function (k) {
      if (k.charAt(0) === '$') return;
      var s = spec[k] || {};
      var val = s['default'];
      if (q.has(k)) {
        var r = q.get(k);
        if (s.editor === 'boolean') val = r === '1' || r === 'true' || r === '';
        else if (s.editor === 'number') val = parseFloat(r);
        else if (s.editor === 'enum') { if ((s.options || []).indexOf(r) > -1) val = r; }
        else val = r;
      }
      props[k] = val;
    });
    return props;
  }

  function boot() {
    host = document.querySelector('x-dc');
    if (!host) return;
    // Move <helmet> contents (fonts, styles) into <head>.
    var helmet = host.querySelector('helmet');
    if (helmet) while (helmet.firstChild) {
      var n = helmet.firstChild;
      if (n.nodeType === 1) document.head.appendChild(n); else helmet.removeChild(n);
    }
    tpl = document.createElement('div');
    while (host.firstChild) tpl.appendChild(host.firstChild);
    if (helmet && helmet.parentNode) helmet.parentNode.removeChild(helmet);

    var script = document.querySelector('script[data-dc-script]');
    var Comp = null;
    if (script) {
      try { Comp = new Function('DCLogic', script.textContent + '\n;return typeof Component !== "undefined" ? Component : null;')(DCLogic); }
      catch (e) { console.error(e); }
    }
    var props = script ? readProps(script) : {};
    inst = Comp ? new Comp(props) : new DCLogic(props);
    inst.props = props;
    if (!inst.renderVals) inst.renderVals = function () { return {}; };
    render();
    window.addEventListener('pagehide', function () {
      if (inst && inst.componentWillUnmount) try { inst.componentWillUnmount(); } catch (e) {}
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
