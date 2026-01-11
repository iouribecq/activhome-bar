// Activhome Bar - v0.1.6 (Modifié)
// Type: custom:activhome-bar
//
// CHANGELOG v0.1.6:
// - OPTION: single_row (1 seule ligne) : adapte automatiquement le nombre de colonnes au nombre d’items visibles.
// - PERF: émission config-changed dé-bouncée dans l’éditeur (réduit la latence).
// - CSS: tiles shrinkables (min-width:0) + labels ellipsis robustes.
//
// CHANGELOG v0.1.5:
// - FIX UI: champ Thème "Aucun" (plus de chevauchement), valeur sentinelle __none__.
// - UI: "Barre (global)" repliable + libellés plus pédagogiques.
//
// CHANGELOG v0.1.4:
// - REMPLACEMENT: Édition de la visibilité via l'UI native HA (ha-card-conditions-editor)
//   au lieu du JSON manuel.
//
// ADD v0.1.3:
// - show_icons (global) + show_icon (per item override)
// - visibility (Lovelace-like) per item: state / and / or / not
// - dock=top default top=56 if top not explicitly set
// - Editor labels + help text blocks (UI more user-friendly)

(() => {
  const DEFAULTS = {
    style: "transparent",
    theme: "",
    accent_color: "",
    fixed: true,

    dock: "bottom",
    top: 0,

    bottom: 0,
    left: 12,
    right: 12,
    z_index: 3,

    columns: 11,
    gap: 6,

    // Layout
    single_row: false,
    icon_size: 32,
    label_size: 20,
    tile_height: 56,
    padding: 2,

    show_icons: true,

    items: [],
  };

  function fireEvent(node, type, detail = {}, options = {}) {
    const event = new CustomEvent(type, {
      bubbles: options.bubbles ?? true,
      composed: options.composed ?? true,
      cancelable: options.cancelable ?? false,
      detail,
    });
    node.dispatchEvent(event);
    return event;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeNum(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function isDefined(v) {
    return v !== undefined && v !== null;
  }

  // Ensure a stable, human-friendly key order when Home Assistant serializes YAML.
  // (HA preserves insertion order; emitting a normalized object keeps `type:` at the top.)
  function normalizeConfigOrder(cfg) {
    const c = cfg || {};
    const out = {};

    // Required Lovelace key first
    if (c.type) out.type = c.type;

    // Global options (roughly in the order a user reads the YAML)
    const orderedKeys = [
      "style",
      "theme",
      "accent_color",
      "fixed",
      "dock",
      "top",
      "bottom",
      "left",
      "right",
      "z_index",
      "columns",
      "gap",
      "single_row",
      "show_icons",
      "icon_size",
      "label_size",
      "tile_height",
      "padding",
      "items",
    ];

    orderedKeys.forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(c, k) && c[k] !== undefined) out[k] = c[k];
    });

    // Keep any extra keys (future-proof) at the end, without losing them.
    Object.keys(c).forEach((k) => {
      if (k === "type") return;
      if (orderedKeys.includes(k)) return;
      if (c[k] !== undefined) out[k] = c[k];
    });

    return out;
  }

  // Try to scroll the Lovelace edit dialog to a given element.
  // `scrollIntoView()` can be insufficient with nested shadow roots; this helper
  // searches for a real scrollable ancestor (dialog content) and adjusts scrollTop.
  function _findHaDialogScroller() {
  // Try to locate the Lovelace "Edit card" dialog scroll container (shadow DOM aware).
  const haRoot = document.querySelector("body > home-assistant");
  const editCard = haRoot?.shadowRoot?.querySelector("hui-dialog-edit-card");
  const editDash = haRoot?.shadowRoot?.querySelector("hui-dialog-edit-dashboard");
  const host = editCard || editDash;
  const haDialog = host?.shadowRoot?.querySelector("ha-dialog");
  const mwc = haDialog?.shadowRoot?.querySelector("mwc-dialog");
  const scroller =
    mwc?.shadowRoot?.querySelector(".mdc-dialog__content") ||
    mwc?.shadowRoot?.querySelector(".mdc-dialog__surface") ||
    haDialog;
  return scroller || null;
}

function scrollToInEditor(el, { topOffset = 24, behavior = "smooth" } = {}) {
  if (!el) return;

  // 1) If a known HA edit dialog scroller exists, scroll it directly (most reliable).
  const tryScrollEditDialog = () => {
    try {
      const ha = document.querySelector("body > home-assistant");
      const haRoot = ha && ha.shadowRoot;
      const dlg = haRoot && haRoot.querySelector("hui-dialog-edit-card");
      const dlgRoot = dlg && dlg.shadowRoot;
      const haDialog = dlgRoot && dlgRoot.querySelector("ha-dialog");
      const haDialogRoot = haDialog && haDialog.shadowRoot;
      const scroller =
        (haDialogRoot && haDialogRoot.querySelector(".mdc-dialog__content")) ||
        (dlgRoot && dlgRoot.querySelector(".content")) ||
        null;

      if (scroller && scroller.scrollHeight > scroller.clientHeight + 4) {
        const rEl = el.getBoundingClientRect();
        const rSc = scroller.getBoundingClientRect();
        scroller.scrollTop = Math.max(0, scroller.scrollTop + (rEl.top - rSc.top - topOffset));
        return true;
      }
    } catch (e) {
      // ignore
    }
    return false;
  };

  if (tryScrollEditDialog()) return;

  // 2) Walk up through regular DOM + shadow hosts to find a scroll container.
  const isScrollable = (node) => {
    if (!(node instanceof HTMLElement)) return false;
    const cs = getComputedStyle(node);
    const oy = cs.overflowY;
    const ox = cs.overflowX;
    return (
      (oy === "auto" || oy === "scroll" || ox === "auto" || ox === "scroll") &&
      node.scrollHeight > node.clientHeight + 4
    );
  };

  let n = el;
  for (let i = 0; i < 80 && n; i++) {
    if (n instanceof HTMLElement && isScrollable(n)) break;
    const root = n.getRootNode && n.getRootNode();
    n = n.parentNode || (root && root.host) || null;
  }

  if (n instanceof HTMLElement && isScrollable(n)) {
    const rEl = el.getBoundingClientRect();
    const rSc = n.getBoundingClientRect();
    n.scrollTop = Math.max(0, n.scrollTop + (rEl.top - rSc.top - topOffset));
    return;
  }

  // 3) Last resort: native scrollIntoView (works sometimes, but not always inside HA dialogs).
  try {
    el.scrollIntoView({ behavior, block: "start", inline: "nearest" });
  } catch (e) {
    el.scrollIntoView();
  }
}
  // --- Optional Home Assistant theme support -------------------------------
  function _getThemeVars(hass, themeName) {
    const themes = hass?.themes?.themes;
    if (!themes || !themeName) return null;
    const theme = themes[themeName];
    if (!theme) return null;

    if (theme.modes && (theme.modes.light || theme.modes.dark)) {
      const modeKey = hass.themes?.darkMode ? "dark" : "light";
      return theme.modes[modeKey] || theme.modes.light || theme.modes.dark || null;
    }
    return theme;
  }

  function _clearTheme(el, prevVars) {
    if (!el || !prevVars) return;
    Object.keys(prevVars).forEach((k) => {
      const cssVar = k.startsWith("--") ? k : `--${k}`;
      el.style.removeProperty(cssVar);
    });
  }

  function _applyTheme(el, hass, themeName, prevVars) {
    const vars = _getThemeVars(hass, themeName);
    if (!vars) return null;

    _clearTheme(el, prevVars);
    Object.entries(vars).forEach(([key, val]) => {
      const cssVar = key.startsWith("--") ? key : `--${key}`;
      el.style.setProperty(cssVar, String(val));
    });
    return vars;
  }
  // -------------------------------------------------------------------------

  function stylePresetCss(styleName) {
    const s = (styleName || "transparent").toLowerCase();
    switch (s) {
      case "activhome":
        return `
          ha-card {
            background-color: rgba(0,0,0,0.40);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 16px;
            box-shadow: none;
          }`;
      case "glass":
        return `
          ha-card{
            background: rgba(255,255,255,0.10);
            border-radius: 16px;
            box-shadow: none;
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
          }`;
      case "dark_glass":
        return `
          ha-card{
            border-radius: 16px;
            background: rgba(15, 15, 15, 0.55);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.12);
          }`;
      case "minimal_matte":
        return `
          ha-card{
            border-radius: 0px;

            /* Fallback (si color-mix indispo) */
            background: rgba(15, 15, 15, 0.55);

            /* Fond basé sur l'accent, transparence EXACTE = 0.55 */
            background: color-mix(in srgb, var(--ah-accent-color, rgb(15,15,15)) 55%, transparent);

            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.45);
            padding: 2px 4px !important;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: none;
          }`;
      case "solid":
        return `
          ha-card{
            background: var(--card-background-color, rgba(0,0,0,0.2));
            border-radius: 16px;
            box-shadow: none;
          }`;
      case "neon_pulse":
        return `
          ha-card {
            border-radius: 16px;
            background: rgba(10, 10, 10, 0.45);
            border: 1px solid rgba(255, 0, 180, 0.4);
            box-shadow:
              0 0 12px rgba(255, 0, 180, 0.5),
              0 0 24px rgba(255, 0, 180, 0.3),
              0 8px 20px rgba(0, 0, 0, 0.4);
            animation: ah_neon_pulse 12s linear infinite;
            transition: box-shadow 0.4s ease, border-color 0.4s ease, background 0.4s ease;
            will-change: box-shadow, border-color;
          }
          @keyframes ah_neon_pulse {
            0% { border-color: rgba(255, 0, 180, 0.5); box-shadow: 0 0 12px rgba(255, 0, 180, 0.6), 0 0 24px rgba(255, 0, 180, 0.35), 0 8px 20px rgba(0, 0, 0, 0.4); }
            25% { border-color: rgba(0, 180, 255, 0.5); box-shadow: 0 0 12px rgba(0, 180, 255, 0.6), 0 0 24px rgba(0, 180, 255, 0.35), 0 8px 20px rgba(0, 0, 0, 0.4); }
            50% { border-color: rgba(0, 255, 120, 0.5); box-shadow: 0 0 12px rgba(0, 255, 120, 0.6), 0 0 24px rgba(0, 255, 120, 0.35), 0 8px 20px rgba(0, 0, 0, 0.4); }
            75% { border-color: rgba(255, 140, 0, 0.5); box-shadow: 0 0 12px rgba(255, 140, 0, 0.6), 0 0 24px rgba(255, 140, 0, 0.35), 0 8px 20px rgba(0, 0, 0, 0.4); }
            100% { border-color: rgba(255, 0, 180, 0.5); box-shadow: 0 0 12px rgba(255, 0, 180, 0.6), 0 0 24px rgba(255, 0, 180, 0.35), 0 8px 20px rgba(0,  0, 0, 0.4); }
          }`;
      case "neon_glow":
        return `
          ha-card{
            --ah-accent: var(--ah-accent-color, var(--primary-color, #00ffff));
            border-radius: 16px;
            background: rgba(10, 10, 10, 0.45);
            border: 1px solid color-mix(in oklab, var(--ah-accent) 55%, transparent);
            box-shadow: 0 0 10px color-mix(in oklab, var(--ah-accent) 55%, transparent), 0 0 20px color-mix(in oklab, var(--ah-accent) 35%, transparent), 0 8px 20px rgba(0, 0, 0, 0.4);
            transition: box-shadow 0.3s ease;
          }
          ha-card:hover{
            box-shadow: 0 0 14px color-mix(in oklab, var(--ah-accent) 70%, transparent), 0 0 26px color-mix(in oklab, var(--ah-accent) 45%, transparent), 0 10px 24px rgba(0, 0, 0, 0.45);
          }`;
      case "primary_breathe":
        return `
          ha-card{
            --ah-accent: var(--ah-accent-color, var(--primary-color));
            border-radius: 16px;
            background: linear-gradient(120deg, color-mix(in oklab, var(--ah-accent) 20%, rgba(12,12,12,0.55)), rgba(12,12,12,0.55));
            border: 1px solid color-mix(in oklab, var(--ah-accent) 60%, transparent);
            box-shadow: 0 0 10px color-mix(in oklab, var(--ah-accent) 40%, transparent), 0 8px 20px rgba(0, 0, 0, 0.40);
            transition: box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease;
            animation: ah_breathe 5.5s ease-in-out infinite;
            will-change: transform, box-shadow;
            transform: translateZ(0);
          }
          @keyframes ah_breathe {
            0% { transform: translateZ(0) scale(1.00); }
            50% { transform: translateZ(0) scale(1.01); }
            100% { transform: translateZ(0) scale(1.00); }
          }`;
      case "primary_tint":
        return `
          ha-card{
            --ah-accent: var(--ah-accent-color, var(--primary-color));
            border-radius: 16px;
            background: linear-gradient(120deg, color-mix(in oklab, var(--ah-accent) 18%, rgba(12,12,12,0.55)), rgba(12,12,12,0.55));
            border: 1px solid color-mix(in oklab, var(--ah-accent) 65%, transparent);
            box-shadow: 0 0 12px color-mix(in oklab, var(--ah-accent) 45%, transparent), 0 8px 20px rgba(0, 0, 0, 0.40);
            transition: box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease;
          }
          ha-card:hover{
            box-shadow: 0 0 16px color-mix(in oklab, var(--ah-accent) 60%, transparent), 0 10px 24px rgba(0, 0, 0, 0.42);
            border-color: color-mix(in oklab, var(--ah-accent) 80%, transparent);
          }`;
      case "transparent":
      default:
        return `
          ha-card{
            background: rgba(0,0,0,0);
            border: none;
            box-shadow: none;
          }`;
    }
  }

  function detectEditMode(hostEl) {
    if (document?.body?.classList?.contains("edit-mode")) return true;
    const haRoot = document.querySelector("body > home-assistant");
    const inEditDashboardMode = hostEl?.parentElement?.closest("hui-card-edit-mode") != null;
    const inEditCardMode = !!haRoot?.shadowRoot
      ?.querySelector("hui-dialog-edit-card")
      ?.shadowRoot?.querySelector("ha-dialog");
    const inPreviewMode = hostEl?.parentElement?.closest(".card > .preview") != null;
    return !!(inEditDashboardMode || inEditCardMode || inPreviewMode);
  }

  // ---------------- Visibility Logic ----------------
  function evalVisibilityRule(hass, rule) {
    if (!rule) return true;
    const cond = String(rule.condition || "").toLowerCase();

    if (cond === "state") {
      const ent = rule.entity;
      if (!ent) return false;
      const st = hass?.states?.[ent]?.state;
      if (Array.isArray(rule.state)) return rule.state.includes(st);
      if (typeof rule.state === "string") return st === rule.state;
      return false;
    }

    if (cond === "numeric_state") {
      const ent = rule.entity;
      if (!ent) return false;
      const stObj = hass?.states?.[ent];
      if (!stObj) return false;
      const val = parseFloat(stObj.state);
      if (isNaN(val)) return false;

      if (rule.above !== undefined && val <= rule.above) return false;
      if (rule.below !== undefined && val >= rule.below) return false;
      return true;
    }

    if (cond === "user") {
      const users = rule.users;
      const curr = hass?.user?.id;
      if (!users || !curr) return false;
      return users.includes(curr);
    }

    if (cond === "screen") {
      const media = rule.media_query;
      if (!media) return true;
      return window.matchMedia(media).matches;
    }

    if (cond === "and") {
      const list = Array.isArray(rule.conditions) ? rule.conditions : [];
      return list.every((r) => evalVisibilityRule(hass, r));
    }
    if (cond === "or") {
      const list = Array.isArray(rule.conditions) ? rule.conditions : [];
      return list.some((r) => evalVisibilityRule(hass, r));
    }
    if (cond === "not") {
      const list = Array.isArray(rule.conditions) ? rule.conditions : [];
      return !list.some((r) => evalVisibilityRule(hass, r));
    }

    return true;
  }

  function evalItemVisible(hass, item) {
    const vis = item?.visibility;
    if (!vis) return true;
    if (Array.isArray(vis)) return vis.every((r) => evalVisibilityRule(hass, r));
    if (typeof vis === "object") return evalVisibilityRule(hass, vis);
    return true;
  }
  // ------------------------------------------------------------

  class ActivhomeBar extends HTMLElement {
    set hass(hass) {
      this._hass = hass;
      this._render();
    }

    setConfig(config) {
      this._config = { ...DEFAULTS, ...(config || {}) };
      if (!Array.isArray(this._config.items)) this._config.items = [];
      this._render();
    }

    getCardSize() { return 1; }

    connectedCallback() {
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      this._render();
    }

    _doAction(item) {
      const hass = this._hass;
      if (!hass || !item) return;

      const tap = item.tap_action;

      if (tap && typeof tap === "object") {
        const act = { ...tap };

        const fallbackEntity = item.entity || act.entity || act.entity_id;
        if (fallbackEntity && !act.entity && !act.entity_id && !act.target) {
          act.entity = fallbackEntity;
        }

        try {
          if (typeof hass.callAction === "function") {
            hass.callAction(act);
            return;
          }
        } catch (e) {}

        const a = String(act.action || "more-info").toLowerCase();

        if (a === "navigate") {
          const path = String(act.navigation_path || act.navigationPath || "").trim();
          if (!path) return;
          history.pushState(null, "", path);
          window.dispatchEvent(new Event("location-changed"));
          return;
        }

        if (a === "more-info") {
          const ent = act.entity || act.entity_id || item.entity;
          if (!ent) return;
          fireEvent(this, "hass-more-info", { entityId: ent });
          return;
        }

        if (a === "toggle") {
          const ent = act.entity || act.entity_id || item.entity;
          if (!ent) return;
          hass.callService("homeassistant", "toggle", { entity_id: ent });
          return;
        }

        if (a === "call-service" || a === "perform-action") {
          const svc = String(act.service || act.perform_action || "").trim();
          if (!svc.includes(".")) return;
          const [domain, service] = svc.split(".");
          const sd = (act.service_data && typeof act.service_data === "object") ? act.service_data : {};
          const target = act.target && typeof act.target === "object" ? act.target : {};
          const payload = { ...sd, ...target };
          hass.callService(domain, service, payload);
          return;
        }

        try {
          fireEvent(this, "hass-action", { config: act });
          return;
        } catch (e) {
          return;
        }
      }

      const action = String(tap || "more-info").toLowerCase();

      if (action === "navigate") {
        const path = String(item.navigation_path || "").trim();
        if (!path) return;
        history.pushState(null, "", path);
        window.dispatchEvent(new Event("location-changed"));
        return;
      }
      if (action === "more-info") {
        if (!item.entity) return;
        fireEvent(this, "hass-more-info", { entityId: item.entity });
        return;
      }
      if (action === "call-service") {
        const svc = String(item.service || "").trim();
        if (!svc.includes(".")) return;
        const [domain, service] = svc.split(".");
        hass.callService(domain, service, item.service_data || {});
        return;
      }
      if (action === "toggle") {
        if (!item.entity) return;
        hass.callService("homeassistant", "toggle", { entity_id: item.entity });
        return;
      }
      if (item.entity) fireEvent(this, "hass-more-info", { entityId: item.entity });
    }

    _render() {
      if (!this.shadowRoot || !this._config) return;
      const hass = this._hass;
      const cfg = this._config;
      const editMode = detectEditMode(this);
      const fixed = !!cfg.fixed && !editMode;
      const dock = String(cfg.dock || "bottom").toLowerCase() === "top" ? "top" : "bottom";
      const themeName = String(cfg.theme || "").trim();
      const presetCss = stylePresetCss(cfg.style);

      // Filter visible items (MUST be before single_row columns computation)
      const renderedItems = (cfg.items || []).filter((it) => evalItemVisible(hass, it));

      const columnsCfg = Math.max(1, Math.floor(safeNum(cfg.columns, 11)));
      // single_row: garantit 1 seule ligne en adaptant automatiquement le nombre de colonnes
      // au nombre d’items visibles (comme ton ancien grid mod-card).
      const columns = cfg.single_row ? Math.max(1, renderedItems.length) : columnsCfg;

      const gap = Math.max(0, safeNum(cfg.gap, 6));
      const iconSize = Math.max(16, safeNum(cfg.icon_size, 32));
      const labelSize = Math.max(10, safeNum(cfg.label_size, 20));
      const tileHeight = Math.max(40, safeNum(cfg.tile_height, 56));
      const padding = Math.max(0, safeNum(cfg.padding, 2));

      const left = Math.max(0, safeNum(cfg.left, 12));
      const right = Math.max(0, safeNum(cfg.right, 12));

      const topExplicit = Object.prototype.hasOwnProperty.call(cfg, "top");
      const top = Math.max(0, safeNum(cfg.top, dock === "top" && !topExplicit ? 56 : 0));
      const bottom = Math.max(0, safeNum(cfg.bottom, 0));
      const zIndex = Math.max(0, safeNum(cfg.z_index, 3));
      const showIconsGlobal = cfg.show_icons !== false;

      this.shadowRoot.innerHTML = `
        <style>
          :host{ display:block; }
          .wrap.fixed{
            position: fixed;
            left: ${left}px;
            right: ${right}px;
            ${dock === "top" ? `top: ${top}px;` : `bottom: ${bottom}px;`}
            z-index: ${zIndex};
            pointer-events: none;
          }
          .wrap.fixed > ha-card{ pointer-events: auto; }
          .wrap.edit{ position: relative; pointer-events: auto; }

          ha-card{
            padding: ${padding}px !important;
            border: none;
            box-shadow: none;
            color: var(--primary-text-color);
          }
          ${presetCss}

          .grid{
            display:grid;
            grid-template-columns: repeat(${columns}, minmax(0, 1fr));
            gap: ${gap}px;
            align-items: center;
          }
          .tile{
            height: ${tileHeight}px;
            display:flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            background: transparent;
            border: none;
            padding: 2px 4px;
            margin: 0;
            border-radius: 12px;
            cursor: pointer;
            min-width: 0;
            color: var(--primary-text-color);
            -webkit-tap-highlight-color: transparent;
          }
          .tile:hover{ background: rgba(255,255,255,0.10); }
          .tile:active{ background: rgba(255,255,255,0.16); }

          .ico{ --mdc-icon-size: ${iconSize}px; }
          .lbl{
            font-size: ${labelSize}px;
            font-weight: var(--ha-font-weight-normal, var(--paper-font-body1_-_font-weight, 500));
            line-height: 1.1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            min-width: 0;
            max-width: 100%;
          }
          .tile.noIcon{ gap: 2px; }
        </style>

        <div class="wrap ${fixed ? "fixed" : "edit"}">
          <ha-card>
            <div class="grid">
              ${renderedItems
                .map((it, idx) => {
                  const name = escapeHtml(it.name || "");
                  const icon = String(it.icon || "").trim();
                  const iconColor = String(it.icon_color || "").trim();
                  const showIconItem = isDefined(it.show_icon) ? !!it.show_icon : showIconsGlobal;
                  const hasIcon = showIconItem && !!icon;
                  const iconStyle = iconColor ? ` style="color:${escapeHtml(iconColor)};"` : "";
                  return `
                    <button class="tile ${hasIcon ? "" : "noIcon"}" data-idx="${idx}" aria-label="${name}">
                      ${hasIcon ? `<ha-icon class="ico" icon="${escapeHtml(icon)}"${iconStyle}></ha-icon>` : ``}
                      <div class="lbl">${name}</div>
                    </button>
                  `;
                })
                .join("")}
            </div>
          </ha-card>
        </div>
      `;

      const cardEl = this.shadowRoot.querySelector("ha-card");
      if (cardEl) {
        if (themeName) {
          this._appliedThemeVars = _applyTheme(cardEl, hass, themeName, this._appliedThemeVars);
        } else if (this._appliedThemeVars) {
          _clearTheme(cardEl, this._appliedThemeVars);
          this._appliedThemeVars = null;
        }
        const acc = String(cfg.accent_color || "").trim();
        if (acc) cardEl.style.setProperty("--ah-accent-color", acc);
        else cardEl.style.removeProperty("--ah-accent-color");
      }

      const btns = this.shadowRoot.querySelectorAll(".tile");
      btns.forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const idx = Number(btn.getAttribute("data-idx"));
          const item = renderedItems[idx];
          this._doAction(item);
        });
      });
    }

    static getConfigElement() {
      return document.createElement("activhome-bar-editor");
    }

    static getStubConfig() {
      return {
        type: "custom:activhome-bar",
        style: "transparent",
        items: [
          { name: "Accueil", icon: "mdi:home", tap_action: "navigate", navigation_path: "/" },
          { name: "Exemple", icon: "mdi:star", entity: "light.example", tap_action: "more-info" },
        ],
      };
    }
  }

  // -------------------------- Editor (full UI) ----------------------------
  class ActivhomeBarEditor extends HTMLElement {
    set hass(hass) {
      this._hass = hass;
      if (this._globalFieldsEl) this._buildGlobalFields();
      const condEditors = this.shadowRoot ? this.shadowRoot.querySelectorAll("ha-card-conditions-editor") : [];
      condEditors.forEach(ed => ed.hass = hass);
    }

    
setConfig(config) {
  this._config = { ...DEFAULTS, ...(config || {}) };
  if (!Array.isArray(this._config.items)) this._config.items = [];

  this._ensureRendered();

  // HA calls setConfig very often (every tiny change). Rebuilding the whole editor
  // each time creates latency and also collapses <details>.
  //
  // Strategy:
  // - First time: full sync (build global fields + render items).
  // - Next times: DO NOT rebuild unless the items structure changed (add/remove/reorder)
  //   and we're not currently typing in a text field.
  const items = this._config.items || [];
  const fingerprint = items.length + "|" + items.map((it) => (it && typeof it === "object" ? (it.name || "") : "")).join("");

  if (!this._didInitialSync) {
    this._didInitialSync = true;
    this._lastItemsFingerprint = fingerprint;
    this._syncAll();
    return;
  }

  // While typing, never re-render. We'll refresh when focus leaves.
  if (this._isTyping) {
    this._pendingSync = true;
    this._lastItemsFingerprint = fingerprint;
    return;
  }

  // Re-render ONLY if structure likely changed.
  if (fingerprint !== this._lastItemsFingerprint) {
    this._lastItemsFingerprint = fingerprint;
    this._renderItems();
  }
}

    connectedCallback() {
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      this._ensureRendered();
      this._syncAll();
    }

    _emitConfigChanged() {
      // Dé-bounce : HA déclenche beaucoup d'événements en rafale.
      // Ici on regroupe les changements sur un court délai, ce qui réduit
      // fortement la sensation de "lag" (surtout sur les champs number +/-).
      if (this._emitTimer) window.clearTimeout(this._emitTimer);
      this._emitTimer = window.setTimeout(() => {
        this._emitTimer = null;
        fireEvent(this, "config-changed", {
          config: normalizeConfigOrder(this._config),
        });
      }, 60);
    }

    _ensureRendered() {
      if (this._rendered) return;
      this._rendered = true;

      this.shadowRoot.innerHTML = `
        <style>
          .wrap{ display:grid; gap: 12px; }
          .box{
            padding: 10px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.10);
            background: rgba(0,0,0,0.02);
          }
          .row{
            display:flex;
            align-items:center;
            justify-content: space-between;
            gap: 10px;
          }
          .title{ font-weight: 600; }
          .hint{ opacity:.85; font-size: 12px; line-height:1.35; }
          button{
            padding: 6px 10px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.18);
            background: rgba(0,0,0,0.10);
            cursor: pointer;
            min-width: 0;
          }
          button:hover{ background: rgba(255,255,255,0.08); }
          .danger{ border-color: rgba(255,0,0,0.30); }
          .items{ display:grid; gap: 10px; }
          .mini{ font-size: 12px; opacity: .8; }
          
          ha-card-conditions-editor {
            display: block;
            margin-top: 8px;
          }

          details > summary { list-style: none; }
          details > summary::-webkit-details-marker { display: none; }
          details.box { padding: 10px; }
          details.box[open] > summary { margin-bottom: 6px; }

          summary.row{ display:flex; }
          summary.row .title{ min-width:0; }
          summary.row .mini{ white-space:nowrap; }

          .wrap{ max-width:100%; min-width:0; }
          .box{ max-width:100%; min-width:0; }

          .fields{ display:grid; gap: 10px; }
          .field{ display:grid; gap: 4px; min-width:0; }
          .field-label{ font-size: 13px; opacity: .95; }
          .field-help{ font-size: 12px; opacity: .75; line-height: 1.35; }
          ha-selector, ha-textfield{ width:100%; min-width:0; }
        </style>

        <div class="wrap">

          <details class="box">
            <summary class="row" style="cursor:pointer;">
              <div class="title">Barre (global)</div>
              <div class="mini"><span id="barToggleLabel">Fermer</span></div>
            </summary>

            <div style="margin-top:10px;">
              <div id="globalFields" class="fields"></div>

              <div class="hint" style="margin-top:10px;">
                <div><b>Fixer la barre</b> : barre “collée à l’écran” (position fixe). Désactivée automatiquement quand tu édites le dashboard.</div>
                <div><b>Dock</b> : place la barre en haut ou en bas.</div>
                <div><b>Marges</b> : distance aux bords de l’écran (gauche/droite/haut/bas).</div>
                <div><b>Priorité</b> : z-index = au-dessus / en dessous des autres éléments.</div>
              </div>
            </div>
          </details>

          <div class="box">
            <div class="row">
              <div class="title">Items</div>
              <button id="addBtn">+ Ajouter</button>
            </div>
            <div id="items" class="items" style="margin-top:10px;"></div>
          </div>
        </div>
      `;

      this._globalFieldsEl = this.shadowRoot.getElementById("globalFields");

      const barDetails = this.shadowRoot.querySelector('details.box');
      const barToggleLabel = this.shadowRoot.getElementById("barToggleLabel");
      const syncBarToggleLabel = () => {
        if (!barToggleLabel || !barDetails) return;
        barToggleLabel.textContent = barDetails.open ? "Fermer" : "Ouvrir";
      };
      if (barDetails) {
        barDetails.addEventListener("toggle", syncBarToggleLabel);
        syncBarToggleLabel();
      }

      this._isTyping = false;
      this._pendingSync = false;

      this.shadowRoot.addEventListener("focusin", (ev) => {
        const el = ev.target;
        if (!el) return;
        const tf = (el.tagName === "HA-TEXTFIELD") ? el : (el.closest ? el.closest("ha-textfield") : null);
        if (tf) this._isTyping = true;
      }, true);

      this.shadowRoot.addEventListener("focusout", (ev) => {
        const el = ev.target;
        if (!el) return;
        const tf = (el.tagName === "HA-TEXTFIELD") ? el : (el.closest ? el.closest("ha-textfield") : null);
        if (!tf) return;

        setTimeout(() => {
          const active = this.shadowRoot && this.shadowRoot.activeElement;
          const stillInTextField = active && (active.tagName === "HA-TEXTFIELD" || (active.closest && active.closest("ha-textfield")));
          if (!stillInTextField) {
            this._isTyping = false;
            if (this._pendingSync) {
              this._pendingSync = false;
              this._syncAll();
            }
          }
        }, 0);
      }, true);

      this._buildGlobalFields();

      this.shadowRoot.getElementById("addBtn").addEventListener("click", () => {
        const items = Array.isArray(this._config.items) ? [...this._config.items] : [];
        items.push({ name: "Nouveau", icon: "", tap_action: "more-info", entity: "" });

        const newIndex = items.length - 1;
        this._openIndex = newIndex;
        // On délègue le scroll au rendu (plus fiable dans le dialogue HA)
        this._pendingScrollIndex = newIndex;
        this._config = { ...this._config, items };
        this._renderItems();
        this._emitConfigChanged();
      });
    }

    _getThemeOptions() {
      const themeNames = Object.keys(this._hass?.themes?.themes || {}).sort((a, b) => a.localeCompare(b));
      return [{ label: "Aucun", value: "__none__" }].concat(themeNames.map((t) => ({ label: t, value: t })));
    }

    _buildGlobalFields() {
      if (!this._globalFieldsEl) return;
      if (!this._config) return;

      this._globalFieldsEl.innerHTML = "";

      const defs = [
        {
          key: "style",
          label: "Style visuel",
          selector: {
            select: {
              options: [
                { label: "Transparent", value: "transparent" },
                { label: "Activhome", value: "activhome" },
                { label: "Glass", value: "glass" },
                { label: "Dark glass", value: "dark_glass" },
                { label: "Minimal Matte", value: "minimal_matte" },
                { label: "Solid", value: "solid" },
                { label: "Neon Pulse", value: "neon_pulse" },
                { label: "Neon Glow", value: "neon_glow" },
                { label: "Primary + Breathe", value: "primary_breathe" },
                { label: "Primary Tint", value: "primary_tint" },
              ],
              mode: "dropdown",
            },
          },
          help: "Habillage visuel de la barre (fond, bordure, effet glass, etc.).",
          get: () => this._config.style ?? "transparent",
          set: (v) => ({ style: v || "transparent" }),
        },
        {
          key: "theme",
          label: "Thème (optionnel)",
          selector: { select: { options: this._getThemeOptions(), mode: "dropdown" } },
          help: "Applique un thème Home Assistant au composant (variables CSS du thème).",
          get: () => (this._config.theme ? this._config.theme : "__none__"),
          set: (v) => (v === "__none__" || v === "" ? ({ theme: undefined }) : ({ theme: v })),
        },
        {
          key: "accent_color",
          label: "Couleur d’accent (optionnel)",
          selector: { text: {} },
          help: "Couleur principale utilisée par certains styles (ex: Minimal Matte). Ex: orange, #FF9800.",
          get: () => this._config.accent_color ?? "",
          set: (v) => ({ accent_color: (v || "").trim() || undefined }),
        },
        {
          key: "dock",
          label: "Position (haut / bas)",
          selector: { select: { mode: "dropdown", options: [{ label: "Bas", value: "bottom" }, { label: "Haut", value: "top" }] } },
          help: "Place la barre en bas ou en haut de l’écran.",
          get: () => this._config.dock ?? "bottom",
          set: (v) => ({ dock: v === "top" ? "top" : "bottom" }),
        },
        {
          key: "fixed",
          label: "Fixer la barre à l’écran",
          selector: { boolean: {} },
          help: "Si activé : la barre reste visible (position fixe). En mode édition Lovelace, elle est désactivée automatiquement pour ne pas gêner.",
          get: () => this._config.fixed ?? true,
          set: (v) => ({ fixed: !!v }),
        },
        {
          key: "columns",
          label: "Nombre de tuiles (colonnes)",
          selector: { number: { min: 1, max: 20, mode: "box" } },
          help: "Largeur de la grille : plus le nombre est grand, plus tu peux afficher d’items sur une ligne.",
          get: () => this._config.columns ?? 11,
          set: (v) => ({ columns: safeNum(v, 11) }),
        },
        {
          key: "single_row",
          label: "Forcer une seule ligne (auto)",
          selector: { boolean: {} },
          help: "Si activé, la barre adapte automatiquement le nombre de colonnes au nombre d’items visibles pour rester sur une seule ligne.",
          get: () => !!this._config.single_row,
          set: (v) => ({ single_row: !!v }),
        },
        {
          key: "gap",
          label: "Espace entre tuiles (px)",
          selector: { number: { min: 0, max: 24, mode: "box" } },
          help: "Distance entre chaque tuile.",
          get: () => this._config.gap ?? 6,
          set: (v) => ({ gap: safeNum(v, 6) }),
        },
        {
          key: "left",
          label: "Marge gauche (px)",
          selector: { number: { min: 0, max: 80, mode: "box" } },
          help: "Décale la barre depuis le bord gauche de l’écran.",
          get: () => this._config.left ?? 12,
          set: (v) => ({ left: safeNum(v, 12) }),
        },
        {
          key: "right",
          label: "Marge droite (px)",
          selector: { number: { min: 0, max: 80, mode: "box" } },
          help: "Décale la barre depuis le bord droit de l’écran.",
          get: () => this._config.right ?? 12,
          set: (v) => ({ right: safeNum(v, 12) }),
        },
        {
          key: "top",
          label: "Marge haut (px)",
          selector: { number: { min: 0, max: 120, mode: "box" } },
          help: "Décale la barre depuis le haut (utile surtout si dock=haut).",
          get: () => this._config.top ?? 0,
          set: (v) => ({ top: safeNum(v, 0) }),
        },
        {
          key: "bottom",
          label: "Marge bas (px)",
          selector: { number: { min: 0, max: 120, mode: "box" } },
          help: "Décale la barre depuis le bas (utile si tu as une barre iOS/Android ou un safe-area).",
          get: () => this._config.bottom ?? 0,
          set: (v) => ({ bottom: safeNum(v, 0) }),
        },
        {
          key: "z_index",
          label: "Priorité d’affichage (z-index)",
          selector: { number: { min: 0, max: 999, mode: "box" } },
          help: "Plus c’est haut, plus la barre passe au-dessus des autres cartes.",
          get: () => this._config.z_index ?? 3,
          set: (v) => ({ z_index: safeNum(v, 3) }),
        },
        {
          key: "show_icons",
          label: "Afficher les icônes (global)",
          selector: { boolean: {} },
          help: "Active/désactive l’affichage des icônes (sauf override par item).",
          get: () => this._config.show_icons !== false,
          set: (v) => ({ show_icons: !!v }),
        },
        {
          key: "icon_size",
          label: "Taille des icônes (px)",
          selector: { number: { min: 16, max: 64, mode: "box" } },
          help: "Taille des icônes à l’intérieur des tuiles.",
          get: () => this._config.icon_size ?? 32,
          set: (v) => ({ icon_size: safeNum(v, 32) }),
        },
        {
          key: "label_size",
          label: "Taille du texte (px)",
          selector: { number: { min: 10, max: 28, mode: "box" } },
          help: "Taille du label sous l’icône.",
          get: () => this._config.label_size ?? 20,
          set: (v) => ({ label_size: safeNum(v, 20) }),
        },
        {
          key: "tile_height",
          label: "Hauteur des tuiles (px)",
          selector: { number: { min: 40, max: 90, mode: "box" } },
          help: "Hauteur totale de chaque tuile.",
          get: () => this._config.tile_height ?? 56,
          set: (v) => ({ tile_height: safeNum(v, 56) }),
        },
        {
          key: "padding",
          label: "Marge interne (padding) (px)",
          selector: { number: { min: 0, max: 20, mode: "box" } },
          help: "Padding interne de la carte (la ‘respiration’ du bloc).",
          get: () => this._config.padding ?? 2,
          set: (v) => ({ padding: safeNum(v, 2) }),
        },
      ];

      const updateConfig = (patch) => {
        const next = { ...this._config, ...patch };
        if (!next.theme) delete next.theme;
        if (!next.accent_color) delete next.accent_color;
        if (next.dock !== "top") next.dock = "bottom";
        this._config = next;
        this._emitConfigChanged();
      };

      defs.forEach((d) => {
        const field = document.createElement("div");
        field.className = "field";

        const label = document.createElement("div");
        label.className = "field-label";
        label.textContent = d.label;
        field.appendChild(label);

        const sel = document.createElement("ha-selector");
        sel.hass = this._hass;
        sel.selector = d.selector;
        sel.value = d.get();
        sel.addEventListener("value-changed", (ev) => {
          const val = ev.detail?.value;
          updateConfig(d.set(val));
        });
        field.appendChild(sel);

        if (d.help) {
          const help = document.createElement("div");
          help.className = "field-help";
          help.textContent = d.help;
          field.appendChild(help);
        }

        this._globalFieldsEl.appendChild(field);
      });
    }

    _syncAll() {
      if (!this._config) return;
      this._buildGlobalFields();
      this._renderItems();
    }

    _renderItems() {
      const wrap = this.shadowRoot.getElementById("items");
      if (!wrap) return;

      const getItems = () => (Array.isArray(this._config.items) ? this._config.items : []);
      const items = getItems();
      wrap.innerHTML = "";

      const emit = () => {
        this._emitConfigChanged();
      };

      const commit = (nextItems, { rerender = true } = {}) => {
        this._config = { ...this._config, items: nextItems };
        emit();
        if (rerender) this._renderItems();
      };

      items.forEach((item, idx) => {
        const box = document.createElement("details");
        box.className = "box";
        if (this._openIndex === idx) box.open = true;

box.addEventListener("toggle", () => {
  if (box.open) {
    this._openIndex = idx;
  } else if (this._openIndex === idx) {
    this._openIndex = null;
  }
});

        const header = document.createElement("summary");
        header.className = "row";
        header.style.cursor = "pointer";
        header.innerHTML = `
          <div>
            <div><b>#${idx + 1}</b> — <span class="itemTitle">${escapeHtml(item.name || "Item")}</span></div>
            <div class="mini">${escapeHtml(typeof item.tap_action === "string" ? item.tap_action : (item.tap_action?.action || "action"))}${item.entity ? " • " + escapeHtml(item.entity) : ""}</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="upBtn" type="button">↑</button>
            <button class="downBtn" type="button">↓</button>
            <button class="delBtn danger" type="button">Suppr</button>
          </div>
        `;

        const upBtn = header.querySelector(".upBtn");
        const downBtn = header.querySelector(".downBtn");
        const delBtn = header.querySelector(".delBtn");

        upBtn.disabled = idx === 0;
        downBtn.disabled = idx === items.length - 1;

        [upBtn, downBtn, delBtn].forEach((b) => {
          b.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
          });
        });

        upBtn.addEventListener("click", () => {
          if (idx === 0) return;
          const next = [...getItems()];
          const tmp = next[idx - 1];
          next[idx - 1] = next[idx];
          next[idx] = tmp;
          // Preserve which item is open
          if (this._openIndex === idx) this._openIndex = idx - 1;
          else if (this._openIndex === idx - 1) this._openIndex = idx;
          commit(next);
        });

        downBtn.addEventListener("click", () => {
          const cur = getItems();
          if (idx >= cur.length - 1) return;
          const next = [...cur];
          const tmp = next[idx + 1];
          next[idx + 1] = next[idx];
          next[idx] = tmp;
          // Preserve which item is open
          if (this._openIndex === idx) this._openIndex = idx + 1;
          else if (this._openIndex === idx + 1) this._openIndex = idx;
          commit(next);
        });

        delBtn.addEventListener("click", () => {
          const next = [...getItems()];
          next.splice(idx, 1);
          // Preserve which item is open
          if (this._openIndex === idx) this._openIndex = null;
          else if (this._openIndex != null && this._openIndex > idx) this._openIndex = this._openIndex - 1;
          commit(next);
        });

        box.appendChild(header);

        const content = document.createElement("div");
        content.className = "content";
        content.style.marginTop = "10px";

        const nameField = document.createElement("ha-textfield");
        nameField.label = "Nom";
        nameField.value = item.name || "";
        nameField.style.width = "100%";
        nameField.addEventListener("input", (ev) => {
          const v = ev.target?.value ?? "";
          const next = [...getItems()];
          next[idx] = { ...(next[idx] || {}), name: v };
          this._config = { ...this._config, items: next };
          const t = header.querySelector(".itemTitle");
          if (t) t.textContent = v || "Item";
          emit();
        });
        content.appendChild(nameField);

        const iconLabel = document.createElement("div");
        iconLabel.className = "mini";
        iconLabel.style.marginTop = "10px";
        iconLabel.style.fontWeight = "bold";
        iconLabel.textContent = "Icône (optionnel)";
        content.appendChild(iconLabel);

        const iconSelector = document.createElement("ha-selector");
        iconSelector.hass = this._hass;
        iconSelector.selector = { icon: {} };
        iconSelector.value = item.icon || "";
        iconSelector.addEventListener("value-changed", (ev) => {
          const v = ev.detail?.value ?? "";
          const next = [...getItems()];
          next[idx] = { ...(next[idx] || {}), icon: v };
          this._config = { ...this._config, items: next };
          emit();
        });
        content.appendChild(iconSelector);

        const colorLabel = document.createElement("div");
        colorLabel.className = "mini";
        colorLabel.style.marginTop = "10px";
        colorLabel.textContent = "Couleur de l’icône (optionnel — sinon couleur par défaut)";
        content.appendChild(colorLabel);

        const colorSelector = document.createElement("ha-selector");
        colorSelector.hass = this._hass;
        colorSelector.selector = {
          select: {
            mode: "dropdown",
            options: [
              { label: "Par défaut", value: "" },
              { label: "Blanc", value: "white" },
              { label: "Orange", value: "orange" },
              { label: "Rouge", value: "red" },
              { label: "Jaune", value: "yellow" },
              { label: "Vert", value: "lime" },
              { label: "Bleu", value: "deepskyblue" },
            ],
          },
        };
        colorSelector.value = item.icon_color || "";
        colorSelector.addEventListener("value-changed", (ev) => {
          const v = ev.detail?.value ?? "";
          const next = [...getItems()];
          const patch = { ...(next[idx] || {}) };
          if (v) patch.icon_color = v;
          else delete patch.icon_color;
          next[idx] = patch;
          this._config = { ...this._config, items: next };
          emit();
        });
        content.appendChild(colorSelector);

        const entLabel = document.createElement("div");
        entLabel.className = "mini";
        entLabel.style.marginTop = "10px";
        entLabel.textContent = "Entité (optionnel — utilisée aussi comme fallback pour certaines actions)";
        content.appendChild(entLabel);

        const entityPicker = document.createElement("ha-entity-picker");
        entityPicker.hass = this._hass;
        entityPicker.value = item.entity || "";
        entityPicker.allowCustomEntity = true;
        entityPicker.style.width = "100%";
        entityPicker.addEventListener("value-changed", (ev) => {
          const v = ev.detail?.value || "";
          const next = [...getItems()];
          next[idx] = { ...(next[idx] || {}), entity: v };
          this._config = { ...this._config, items: next };
          emit();
          const mini = header.querySelector(".mini");
          if (mini) {
            const ta = typeof next[idx].tap_action === "string" ? next[idx].tap_action : (next[idx].tap_action?.action || "action");
            mini.textContent = `${ta}${v ? " • " + v : ""}`;
          }
        });
        content.appendChild(entityPicker);

        const actionLabel = document.createElement("div");
        actionLabel.className = "mini";
        actionLabel.style.marginTop = "10px";
        actionLabel.style.fontWeight = "bold";
        actionLabel.textContent = "Action au clic (éditeur natif Home Assistant)";
        content.appendChild(actionLabel);

        const selector = document.createElement("ha-selector");
        selector.hass = this._hass;
        selector.selector = { ui_action: {} };
        selector.value = item.tap_action && typeof item.tap_action === "object"
          ? item.tap_action
          : { action: (item.tap_action || "more-info") };

        selector.addEventListener("value-changed", (ev) => {
          // IMPORTANT: In some HA frontend versions, the ui_action selector doesn't
          // immediately reveal its sub-fields (e.g. navigation_path) after switching
          // the action type, unless the value object reference changes and the
          // component is forced to refresh. Toggling "code editor" in HA causes a
          // full re-render, which is why the field appears then.
          //
          // To fix this without changing anything else in the card/editor logic:
          // - clone the value to guarantee a new reference
          // - re-assign selector.value (controlled-style)
          // - request a refresh on the selector component
          const raw = ev.detail?.value || { action: "more-info" };
          const v = (raw && typeof raw === "object") ? { ...raw } : raw;

          // Force the selector to refresh immediately (fixes "navigate" sub-menu not opening)
          selector.value = v;
          if (typeof selector.requestUpdate === "function") selector.requestUpdate();
          else selector.dispatchEvent(new CustomEvent("_force-refresh"));
          const next = [...getItems()];
          next[idx] = { ...(next[idx] || {}), tap_action: v };
          this._config = { ...this._config, items: next };
          emit();

          const mini = header.querySelector(".mini");
          if (mini) {
            const ta = typeof v === "string" ? v : (v.action || "action");
            mini.textContent = `${ta}${next[idx].entity ? " • " + next[idx].entity : ""}`;
          }
        });

        content.appendChild(selector);

        const visDetails = document.createElement("details");
        visDetails.className = "box";
        visDetails.style.marginTop = "12px";
        visDetails.open = false;

        const visSummary = document.createElement("summary");
        visSummary.className = "row";
        visSummary.style.cursor = "pointer";
        visSummary.innerHTML = `
          <div class="title" style="font-weight:600;">Visibilité</div>
          <div class="mini">Ouvrir / fermer</div>
        `;
        visDetails.appendChild(visSummary);

        const cond = document.createElement("ha-card-conditions-editor");
        cond.hass = this._hass;
        cond.conditions = item.visibility || [];
        cond.addEventListener("value-changed", (ev) => {
          const v = ev.detail?.value || [];
          const next = [...getItems()];
          next[idx] = { ...(next[idx] || {}), visibility: v };
          this._config = { ...this._config, items: next };
          emit();
        });

        const visBody = document.createElement("div");
        visBody.style.marginTop = "10px";
        visBody.appendChild(cond);
        visDetails.appendChild(visBody);
        content.appendChild(visDetails);

        box.appendChild(content);
        wrap.appendChild(box);
      });

      // --- Post-render UX: scroll/focus newly added item -----------------
      // Home Assistant's card editor is displayed inside a dialog with its own scroller.
      // A simple element.scrollIntoView() is often ignored; we use scrollToInEditor().
      if (this._pendingScrollIndex !== undefined && this._pendingScrollIndex !== null) {
        const targetIndex = Number(this._pendingScrollIndex);
        this._pendingScrollIndex = null;

        const detailsList = wrap.querySelectorAll("details.box");
        const det = detailsList && detailsList[targetIndex] ? detailsList[targetIndex] : null;
        if (det) {
          det.open = true;

          // Wait for the <details> to expand, then scroll in the dialog (2 frames = stable layout).
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const focusTarget = det.querySelector("ha-textfield") || det;
              scrollToInEditor(focusTarget, { behavior: "smooth", block: "start" });
              setTimeout(() => {
                const tf = det.querySelector("ha-textfield");
                if (tf && typeof tf.focus === "function") tf.focus();
              }, 60);
            });
          });
        }
      }
    }
  }

  if (!customElements.get("activhome-bar")) {
    customElements.define("activhome-bar", ActivhomeBar);
  }
  if (!customElements.get("activhome-bar-editor")) {
    customElements.define("activhome-bar-editor", ActivhomeBarEditor);
  }

  window.customCards = window.customCards || [];
  if (!window.customCards.find((c) => c.type === "activhome-bar")) {
    window.customCards.push({
      type: "activhome-bar",
      name: "Activhome Bar (Top/Bottom)",
      description: "Barre dockable avec gestion native de la visibilité.",
    });
  }
})();
