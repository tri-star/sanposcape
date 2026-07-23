/* @ds-bundle: {"format":3,"namespace":"SanpoDesignSystem_ea6ab0","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Avatar","sourcePath":"components/data/Avatar.jsx"},{"name":"Card","sourcePath":"components/data/Card.jsx"},{"name":"ProgressBar","sourcePath":"components/data/ProgressBar.jsx"},{"name":"StatBlock","sourcePath":"components/data/StatBlock.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"Tag","sourcePath":"components/feedback/Tag.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"MapPin","sourcePath":"components/map/MapPin.jsx"},{"name":"TabBar","sourcePath":"components/navigation/TabBar.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"BottomSheet","sourcePath":"components/overlays/BottomSheet.jsx"},{"name":"Dialog","sourcePath":"components/overlays/Dialog.jsx"}],"sourceHashes":{"components/core/Button.jsx":"018c148d381b","components/core/Icon.jsx":"eeffd08fda00","components/core/IconButton.jsx":"325c8c20a958","components/data/Avatar.jsx":"e376a295dffb","components/data/Card.jsx":"07a291d1ae83","components/data/ProgressBar.jsx":"2848480ec0ba","components/data/StatBlock.jsx":"a196e973257e","components/feedback/Badge.jsx":"cb9606fbe4b6","components/feedback/Tag.jsx":"3853afe44720","components/feedback/Toast.jsx":"33922dd02852","components/feedback/Tooltip.jsx":"9d9167b8f532","components/forms/Checkbox.jsx":"52d96d5ef9a4","components/forms/Input.jsx":"cc29eeb14a26","components/forms/Radio.jsx":"dc6132efda52","components/forms/Select.jsx":"fc0fd6492348","components/forms/Switch.jsx":"248b6cd0d94a","components/map/MapPin.jsx":"fdbcdc74e65e","components/navigation/TabBar.jsx":"27cc90ea6581","components/navigation/Tabs.jsx":"db8abf40d8df","components/overlays/BottomSheet.jsx":"ee4103b6c8d8","components/overlays/Dialog.jsx":"d0577589f17e","ui_kits/sanpo-app/App.jsx":"4ec86901f943","ui_kits/sanpo-app/ios-frame.jsx":"be3343be4b51","ui_kits/sanpo-app/screens/HomeScreen.jsx":"e28d0b35e627","ui_kits/sanpo-app/screens/NavScreen.jsx":"7451042d9a4b","ui_kits/sanpo-app/screens/ProfileScreen.jsx":"ce4c7ef01adc","ui_kits/sanpo-app/screens/RecordScreen.jsx":"513da2bddd58","ui_kits/sanpo-app/screens/SearchScreen.jsx":"21ec2b2e6081"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.SanpoDesignSystem_ea6ab0 = window.SanpoDesignSystem_ea6ab0 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Icon — thin wrapper around the Lucide icon set (loaded from CDN as
 * window.lucide). Renders a real inline <svg> so stroke color follows
 * `color`/currentColor and size is fully controllable.
 *
 * Requires <script src="https://unpkg.com/lucide@0.462.0/dist/umd/lucide.js">
 * to be loaded on the page (see readme's Iconography section).
 */
function Icon({
  name,
  size = 20,
  strokeWidth = 2,
  color,
  className,
  style,
  ...rest
}) {
  const hostRef = React.useRef(null);
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!window.lucide) {
      // Library not yet loaded — retry shortly (covers async <script> load order).
      const t = setTimeout(() => host && forceRender(), 60);
      return () => clearTimeout(t);
    }
    render();
    function forceRender() {
      render();
    }
    function render() {
      host.innerHTML = "";
      const i = document.createElement("i");
      i.setAttribute("data-lucide", name);
      host.appendChild(i);
      window.lucide.createIcons({
        nameAttr: "data-lucide"
      });
      const svg = host.querySelector("svg");
      if (svg) {
        svg.setAttribute("width", size);
        svg.setAttribute("height", size);
        svg.style.stroke = color || "currentColor";
        svg.style.strokeWidth = strokeWidth;
        svg.style.display = "block";
        svg.style.overflow = "visible";
      }
    }
  }, [name, size, strokeWidth, color]);
  return /*#__PURE__*/React.createElement("span", _extends({
    ref: hostRef,
    className: className,
    "aria-hidden": "true",
    style: {
      display: "inline-flex",
      flex: "0 0 auto",
      width: size,
      height: size,
      color: color || "inherit",
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const PADDING = {
  sm: "0 16px",
  md: "0 22px",
  lg: "0 28px"
};
const HEIGHT = {
  sm: "var(--control-sm)",
  md: "var(--control-md)",
  lg: "var(--control-lg)"
};
const FONT = {
  sm: "var(--text-sm)",
  md: "var(--text-md)",
  lg: "var(--text-lg)"
};
const ICON = {
  sm: 16,
  md: 18,
  lg: 20
};
const VARIANTS = {
  primary: {
    background: "var(--primary)",
    color: "var(--on-primary)",
    border: "1px solid transparent",
    hover: {
      background: "var(--primary-hover)"
    },
    active: {
      background: "var(--primary-press)"
    }
  },
  secondary: {
    background: "var(--primary-tint)",
    color: "var(--primary)",
    border: "1px solid transparent",
    hover: {
      background: "var(--blue-200)"
    },
    active: {
      background: "var(--blue-300)"
    }
  },
  outline: {
    background: "transparent",
    color: "var(--text-primary)",
    border: "1.5px solid var(--border-strong)",
    hover: {
      background: "var(--surface-sunken)"
    },
    active: {
      background: "var(--ink-100)"
    }
  },
  ghost: {
    background: "transparent",
    color: "var(--primary)",
    border: "1px solid transparent",
    hover: {
      background: "var(--primary-tint)"
    },
    active: {
      background: "var(--blue-200)"
    }
  },
  danger: {
    background: "var(--danger)",
    color: "#ffffff",
    border: "1px solid transparent",
    hover: {
      background: "var(--red-600)"
    },
    active: {
      background: "var(--red-600)"
    }
  }
};

/**
 * Button — the brand's primary call-to-action control. Pill-shaped by
 * default (matches the 一時停止 / 終了する controls in the reference app).
 */
function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  fullWidth = false,
  disabled = false,
  shape = "pill",
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const v = VARIANTS[variant] || VARIANTS.primary;
  const bg = disabled ? "var(--ink-200)" : active ? v.active.background : hover ? v.hover.background : v.background;
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setActive(false);
    },
    onMouseDown: () => setActive(true),
    onMouseUp: () => setActive(false),
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      flexDirection: iconPosition === "right" ? "row-reverse" : "row",
      width: fullWidth ? "100%" : "auto",
      height: HEIGHT[size],
      padding: PADDING[size],
      borderRadius: shape === "pill" ? "var(--radius-pill)" : "var(--radius-md)",
      border: v.border,
      background: bg,
      color: disabled ? "var(--text-disabled)" : v.color,
      fontFamily: "var(--font-label)",
      fontWeight: "var(--weight-bold)",
      fontSize: FONT[size],
      letterSpacing: "var(--tracking-normal)",
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)",
      transform: active && !disabled ? "scale(0.97)" : "scale(1)",
      boxShadow: variant === "primary" && !disabled ? "var(--shadow-sm)" : "none",
      ...style
    }
  }, rest), icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: ICON[size]
  }) : null, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: 32,
  md: 44,
  lg: 54
};
const ICON_SIZES = {
  sm: 16,
  md: 20,
  lg: 22
};
const VARIANTS = {
  filled: {
    background: "var(--primary)",
    color: "var(--on-primary)"
  },
  tinted: {
    background: "var(--primary-tint)",
    color: "var(--primary)"
  },
  surface: {
    background: "var(--surface-card)",
    color: "var(--text-primary)"
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)"
  }
};

/**
 * IconButton — round icon-only control. Used for map controls (現在地,
 * ピン追加, ルート調整), the settings glyph, and compact toolbar actions.
 */
function IconButton({
  icon,
  label,
  variant = "surface",
  size = "md",
  active = false,
  disabled = false,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const v = VARIANTS[variant] || VARIANTS.surface;
  const bg = active ? "var(--primary)" : hover && !disabled ? "var(--surface-sunken)" : v.background;
  const fg = active ? "var(--on-primary)" : disabled ? "var(--text-disabled)" : v.color;
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": label,
    title: label,
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      width: SIZES[size],
      height: SIZES[size],
      borderRadius: "var(--radius-pill)",
      border: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: bg,
      color: fg,
      boxShadow: variant === "surface" ? "var(--shadow-sm)" : "none",
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "background var(--dur-fast) var(--ease-out)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: ICON_SIZES[size]
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/data/Avatar.jsx
try { (() => {
const SIZES = {
  sm: 32,
  md: 44,
  lg: 64
};

/** Avatar — circular user photo or initials, used on マイページ and social/ranking lists. */
function Avatar({
  src,
  name,
  size = "md",
  style
}) {
  const px = SIZES[size];
  const initial = name ? name.trim().slice(0, 1) : null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: px,
      height: px,
      borderRadius: "50%",
      background: src ? `center/cover no-repeat url(${src})` : "var(--primary-tint)",
      color: "var(--primary)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "var(--font-label)",
      fontWeight: "var(--weight-bold)",
      fontSize: px * 0.4,
      flex: "0 0 auto",
      overflow: "hidden",
      ...style
    }
  }, !src ? initial || /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "user",
    size: px * 0.5
  }) : null);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/data/Card.jsx
try { (() => {
/** Card — the base white surface: floating info panels, list rows, stat containers. */
function Card({
  children,
  padding = "var(--space-4)",
  elevated = true,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      borderRadius: "var(--radius-lg)",
      boxShadow: elevated ? "var(--shadow-sm)" : "none",
      border: elevated ? "none" : "1px solid var(--border-subtle)",
      padding,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Card.jsx", error: String((e && e.message) || e) }); }

// components/data/ProgressBar.jsx
try { (() => {
/** ProgressBar — linear progress, e.g. daily step-goal completion on 記録 (stats). */
function ProgressBar({
  value = 0,
  max = 100,
  tone = "primary",
  label,
  style
}) {
  const pct = Math.max(0, Math.min(100, value / max * 100));
  const color = tone === "accent" ? "var(--accent)" : tone === "success" ? "var(--success)" : "var(--primary)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      width: "100%",
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: "var(--text-xs)",
      color: "var(--text-secondary)"
    }
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("span", null, Math.round(pct), "%")) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 10,
      borderRadius: "var(--radius-pill)",
      background: "var(--ink-100)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${pct}%`,
      height: "100%",
      borderRadius: "var(--radius-pill)",
      background: color,
      transition: "width var(--dur-slow) var(--ease-out)"
    }
  })));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/data/StatBlock.jsx
try { (() => {
const SIZES = {
  md: "var(--text-4xl)",
  sm: "var(--text-2xl)"
};

/** StatBlock — big-numeral stat + unit + caption, e.g. 経過時間 / 歩行距離 / 歩数 trio in the nav footer. Use size="sm" when 3+ appear in a narrow row. */
function StatBlock({
  value,
  unit,
  label,
  align = "center",
  size = "md",
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: align === "center" ? "center" : "flex-start",
      minWidth: 0,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-data)",
      fontWeight: "var(--weight-heavy)",
      fontSize: SIZES[size] || SIZES.md,
      color: "var(--text-primary)",
      letterSpacing: "var(--tracking-tight)",
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap"
    }
  }, value), unit ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-data)",
      fontSize: "var(--text-sm)",
      color: "var(--text-secondary)",
      fontWeight: "var(--weight-medium)"
    }
  }, unit) : null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-xs)",
      color: "var(--text-tertiary)"
    }
  }, label));
}
Object.assign(__ds_scope, { StatBlock });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatBlock.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
const TONES = {
  info: {
    bg: "var(--info-tint)",
    fg: "var(--info)"
  },
  success: {
    bg: "var(--success-tint)",
    fg: "var(--success)"
  },
  warning: {
    bg: "var(--warning-tint)",
    fg: "var(--warning-hover, var(--warning))"
  },
  danger: {
    bg: "var(--danger-tint)",
    fg: "var(--danger)"
  },
  neutral: {
    bg: "var(--ink-100)",
    fg: "var(--text-secondary)"
  }
};

/** Badge — small status pill, e.g. the "ナビゲーション中" indicator during an active walk. */
function Badge({
  children,
  tone = "info",
  dot = false,
  style
}) {
  const t = TONES[tone] || TONES.info;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "5px 12px",
      borderRadius: "var(--radius-pill)",
      background: t.bg,
      color: t.fg,
      fontFamily: "var(--font-label)",
      fontSize: "var(--text-xs)",
      fontWeight: "var(--weight-bold)",
      letterSpacing: "var(--tracking-wide)",
      ...style
    }
  }, dot ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: "currentColor",
      flex: "0 0 auto"
    }
  }) : null, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tag.jsx
try { (() => {
const CATEGORY_COLORS = {
  park: "var(--map-park)",
  cafe: "var(--map-cafe)",
  culture: "var(--map-culture)",
  station: "var(--map-station)",
  neutral: "var(--text-secondary)"
};

/** Tag — filter chip for spot categories (公園・カフェ・図書館…), selectable. */
function Tag({
  children,
  icon,
  category = "neutral",
  selected = false,
  onClick,
  style
}) {
  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.neutral;
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "8px 14px",
      borderRadius: "var(--radius-pill)",
      border: selected ? "1.5px solid transparent" : "1.5px solid var(--border-subtle)",
      background: selected ? color : "var(--surface-card)",
      color: selected ? "#ffffff" : "var(--text-primary)",
      fontFamily: "var(--font-label)",
      fontSize: "var(--text-sm)",
      fontWeight: "var(--weight-medium)",
      cursor: "pointer",
      transition: "background var(--dur-fast) var(--ease-out)",
      ...style
    }
  }, icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 14,
    color: selected ? "#fff" : color
  }) : null, children);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const TONES = {
  default: {
    bg: "var(--surface-inverse)",
    fg: "var(--surface-card)",
    icon: "info"
  },
  success: {
    bg: "var(--success)",
    fg: "#fff",
    icon: "check-circle-2"
  },
  danger: {
    bg: "var(--danger)",
    fg: "#fff",
    icon: "alert-circle"
  }
};

/** Toast — transient floating confirmation, e.g. "ルートを保存しました". */
function Toast({
  message,
  tone = "default",
  visible = true,
  style
}) {
  const t = TONES[tone] || TONES.default;
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 18px",
      borderRadius: "var(--radius-pill)",
      background: t.bg,
      color: t.fg,
      boxShadow: "var(--shadow-lg)",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      fontWeight: "var(--weight-medium)",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(8px)",
      transition: "opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out)",
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: t.icon,
    size: 17,
    color: t.fg
  }), message);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
/** Tooltip — small hover/tap label, e.g. explaining a map pin or icon-only control. */
function Tooltip({
  children,
  label,
  position = "top"
}) {
  const [show, setShow] = React.useState(false);
  const posStyle = position === "top" ? {
    bottom: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)"
  } : position === "bottom" ? {
    top: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)"
  } : position === "left" ? {
    right: "calc(100% + 8px)",
    top: "50%",
    transform: "translateY(-50%)"
  } : {
    left: "calc(100% + 8px)",
    top: "50%",
    transform: "translateY(-50%)"
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      display: "inline-flex"
    },
    onMouseEnter: () => setShow(true),
    onMouseLeave: () => setShow(false)
  }, children, /*#__PURE__*/React.createElement("span", {
    role: "tooltip",
    style: {
      position: "absolute",
      ...posStyle,
      whiteSpace: "nowrap",
      padding: "6px 10px",
      borderRadius: "var(--radius-sm)",
      background: "var(--surface-inverse)",
      color: "var(--surface-card)",
      fontSize: "var(--text-xs)",
      fontFamily: "var(--font-body)",
      fontWeight: "var(--weight-medium)",
      opacity: show ? 1 : 0,
      pointerEvents: "none",
      transition: "opacity var(--dur-fast) var(--ease-out)",
      zIndex: 20
    }
  }, label));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
/** Checkbox — rounded-square check control, brand blue when checked. */
function Checkbox({
  label,
  checked = false,
  onChange,
  disabled = false,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: onChange,
    style: {
      position: "absolute",
      width: 1,
      height: 1,
      opacity: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      borderRadius: "var(--radius-xs)",
      border: checked ? "none" : "1.5px solid var(--border-strong)",
      background: checked ? "var(--primary)" : "var(--surface-card)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background var(--dur-fast) var(--ease-out)",
      flex: "0 0 auto"
    }
  }, checked ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 14,
    color: "var(--on-primary)",
    strokeWidth: 3
  }) : null), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-md)",
      color: "var(--text-primary)"
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Input — single-line text field with label, helper/error text, and optional leading icon. */
function Input({
  label,
  placeholder,
  helper,
  error,
  icon,
  size = "md",
  disabled = false,
  style,
  id,
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  const inputId = id || React.useId();
  const height = size === "sm" ? "var(--control-sm)" : "var(--control-md)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      width: "100%",
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontFamily: "var(--font-label)",
      fontSize: "var(--text-sm)",
      fontWeight: "var(--weight-medium)",
      color: "var(--text-secondary)"
    }
  }, label) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      height,
      padding: "0 14px",
      borderRadius: "var(--radius-md)",
      background: disabled ? "var(--ink-100)" : "var(--surface-card)",
      border: `1.5px solid ${error ? "var(--danger)" : focused ? "var(--border-focus)" : "var(--border-subtle)"}`,
      boxShadow: focused ? "var(--ring-focus)" : "none",
      transition: "box-shadow var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)"
    }
  }, icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-tertiary)",
      display: "flex"
    }
  }, icon) : null, /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    placeholder: placeholder,
    disabled: disabled,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      flex: 1,
      border: "none",
      outline: "none",
      background: "transparent",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-md)",
      color: "var(--text-primary)"
    }
  }, rest))), helper || error ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-xs)",
      color: error ? "var(--danger)" : "var(--text-tertiary)"
    }
  }, error || helper) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
/** Radio — single-select round control, brand blue dot when selected. */
function Radio({
  label,
  checked = false,
  onChange,
  name,
  disabled = false,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: name,
    checked: checked,
    disabled: disabled,
    onChange: onChange,
    style: {
      position: "absolute",
      width: 1,
      height: 1,
      opacity: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      borderRadius: "50%",
      border: checked ? "6px solid var(--primary)" : "1.5px solid var(--border-strong)",
      background: "var(--surface-card)",
      boxSizing: "border-box",
      flex: "0 0 auto",
      transition: "border var(--dur-fast) var(--ease-out)"
    }
  }), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-md)",
      color: "var(--text-primary)"
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
/** Select — native-backed dropdown styled to match Input, with a chevron affordance. */
function Select({
  label,
  options = [],
  value,
  onChange,
  disabled = false,
  style
}) {
  const id = React.useId();
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      width: "100%",
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("label", {
    htmlFor: id,
    style: {
      fontFamily: "var(--font-label)",
      fontSize: "var(--text-sm)",
      fontWeight: "var(--weight-medium)",
      color: "var(--text-secondary)"
    }
  }, label) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("select", {
    id: id,
    value: value,
    onChange: onChange,
    disabled: disabled,
    style: {
      width: "100%",
      height: "var(--control-md)",
      padding: "0 40px 0 14px",
      borderRadius: "var(--radius-md)",
      border: "1.5px solid var(--border-subtle)",
      background: disabled ? "var(--ink-100)" : "var(--surface-card)",
      color: "var(--text-primary)",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-md)",
      appearance: "none",
      cursor: disabled ? "not-allowed" : "pointer"
    }
  }, options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      right: 14,
      top: "50%",
      transform: "translateY(-50%)",
      color: "var(--text-tertiary)",
      pointerEvents: "none"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 16
  }))));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
/** Switch — toggle control; also used for the app's Light/Dark mode setting. */
function Switch({
  checked = false,
  onChange,
  label,
  disabled = false,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-md)",
      color: "var(--text-primary)"
    }
  }, label) : null, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: onChange,
    style: {
      position: "absolute",
      width: 1,
      height: 1,
      opacity: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 44,
      height: 26,
      borderRadius: "var(--radius-pill)",
      background: checked ? "var(--primary)" : "var(--ink-200)",
      position: "relative",
      transition: "background var(--dur-base) var(--ease-out)",
      flex: "0 0 auto"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 3,
      left: checked ? 21 : 3,
      width: 20,
      height: 20,
      borderRadius: "50%",
      background: "#ffffff",
      boxShadow: "var(--shadow-xs)",
      transition: "left var(--dur-base) var(--ease-spring)"
    }
  })));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/map/MapPin.jsx
try { (() => {
const CATEGORY = {
  park: {
    color: "var(--map-park)",
    icon: "tree-pine"
  },
  cafe: {
    color: "var(--map-cafe)",
    icon: "coffee"
  },
  culture: {
    color: "var(--map-culture)",
    icon: "book-open"
  },
  station: {
    color: "var(--map-station)",
    icon: "train-front"
  },
  goal: {
    color: "var(--map-station)",
    icon: "flag"
  },
  current: {
    color: "var(--map-route)",
    icon: "navigation"
  }
};

/**
 * MapPin — teardrop map marker, colored & iconed by spot category. Reproduces
 * the 緑町公園 / ブックカフェ / 中央図書館 / 川辺駅 pins from the reference map.
 */
function MapPin({
  category = "cafe",
  label,
  icon,
  size = 40,
  style
}) {
  const cat = CATEGORY[category] || CATEGORY.cafe;
  const glyph = icon || cat.icon;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: "50% 50% 50% 0",
      background: cat.color,
      transform: "rotate(-45deg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "var(--shadow-pin)",
      border: "2.5px solid var(--surface-card)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      transform: "rotate(45deg)",
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: glyph,
    size: size * 0.42,
    color: "#ffffff",
    strokeWidth: 2.4
  }))), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 4,
      padding: "3px 8px",
      borderRadius: "var(--radius-sm)",
      background: "var(--surface-card)",
      color: cat.color,
      fontSize: "var(--text-2xs)",
      fontWeight: "var(--weight-bold)",
      fontFamily: "var(--font-label)",
      boxShadow: "var(--shadow-xs)",
      whiteSpace: "nowrap"
    }
  }, label) : null);
}
Object.assign(__ds_scope, { MapPin });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/MapPin.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TabBar.jsx
try { (() => {
/**
 * TabBar — the 5-item bottom navigation bar (ホーム / スポット検索 / ナビ / 記録 / マイページ).
 * The active item renders as a filled circle, matching the reference app.
 */
function TabBar({
  items,
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-around",
      height: "var(--tabbar-height)",
      background: "var(--surface-card)",
      borderTop: "1px solid var(--border-subtle)",
      boxShadow: "var(--shadow-sheet)",
      ...style
    }
  }, items.map(item => {
    const active = item.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: item.value,
      onClick: () => onChange && onChange(item.value),
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        flex: 1,
        height: "100%",
        color: active ? "var(--primary)" : "var(--text-tertiary)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 40,
        height: 40,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? "var(--primary)" : "transparent",
        transition: "background var(--dur-base) var(--ease-spring)"
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: item.icon,
      size: 20,
      color: active ? "var(--on-primary)" : "var(--text-tertiary)"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-label)",
        fontSize: "var(--text-2xs)",
        fontWeight: "var(--weight-bold)"
      }
    }, item.label));
  }));
}
Object.assign(__ds_scope, { TabBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TabBar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/** Tabs — segmented control for switching between small sets of views (route options, ranking periods). */
function Tabs({
  items = [],
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      padding: 4,
      borderRadius: "var(--radius-pill)",
      background: "var(--surface-sunken)",
      gap: 2,
      ...style
    }
  }, items.map(item => {
    const active = item.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: item.value,
      onClick: () => onChange && onChange(item.value),
      style: {
        padding: "8px 18px",
        borderRadius: "var(--radius-pill)",
        border: "none",
        background: active ? "var(--surface-card)" : "transparent",
        color: active ? "var(--primary)" : "var(--text-secondary)",
        fontFamily: "var(--font-label)",
        fontWeight: "var(--weight-bold)",
        fontSize: "var(--text-sm)",
        boxShadow: active ? "var(--shadow-sm)" : "none",
        cursor: "pointer",
        transition: "all var(--dur-fast) var(--ease-out)"
      }
    }, item.label);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/overlays/BottomSheet.jsx
try { (() => {
/** BottomSheet — slide-up panel anchored to the bottom, e.g. the ピン一覧 (pin list) panel. */
function BottomSheet({
  open,
  title,
  children,
  onClose,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      transform: open ? "translateY(0)" : "translateY(100%)",
      transition: "transform var(--dur-slow) var(--ease-spring)",
      background: "var(--surface-card)",
      borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
      boxShadow: "var(--shadow-sheet)",
      padding: "10px 20px 24px",
      zIndex: 40,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      width: 36,
      height: 5,
      borderRadius: "var(--radius-pill)",
      background: "var(--ink-200)",
      margin: "0 auto 14px",
      cursor: "pointer"
    }
  }), title ? /*#__PURE__*/React.createElement("h4", {
    style: {
      fontSize: "var(--text-lg)",
      fontFamily: "var(--font-heading)",
      color: "var(--text-primary)",
      marginBottom: 12
    }
  }, title) : null, children);
}
Object.assign(__ds_scope, { BottomSheet });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlays/BottomSheet.jsx", error: String((e && e.message) || e) }); }

// components/overlays/Dialog.jsx
try { (() => {
/** Dialog — centered modal for confirmations (e.g. 散歩を終了しますか？). */
function Dialog({
  open,
  title,
  children,
  onClose,
  actions,
  style
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "rgba(27,36,48,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 50
    },
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: 320,
      maxWidth: "88%",
      background: "var(--surface-card)",
      borderRadius: "var(--radius-xl)",
      boxShadow: "var(--shadow-lg)",
      padding: 24,
      display: "flex",
      flexDirection: "column",
      gap: 14,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "var(--text-xl)",
      fontFamily: "var(--font-heading)",
      color: "var(--text-primary)"
    }
  }, title), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "\u9589\u3058\u308B",
    style: {
      border: "none",
      background: "transparent",
      color: "var(--text-tertiary)",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 20
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-md)",
      color: "var(--text-secondary)",
      lineHeight: "var(--leading-normal)"
    }
  }, children), actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 6
    }
  }, actions) : null));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlays/Dialog.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sanpo-app/App.jsx
try { (() => {
const {
  TabBar
} = window.SanpoDesignSystem_ea6ab0;
function SanpoApp() {
  const [tab, setTab] = React.useState("nav");
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  const Screen = {
    home: window.HomeScreen,
    search: window.SearchScreen,
    nav: window.NavScreen,
    stats: window.RecordScreen,
    profile: window.ProfileScreen
  }[tab];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement(Screen, {
    dark: dark,
    onToggleDark: () => setDark(d => !d)
  })), /*#__PURE__*/React.createElement(TabBar, {
    value: tab,
    onChange: setTab,
    items: [{
      label: "ホーム",
      value: "home",
      icon: "home"
    }, {
      label: "スポット検索",
      value: "search",
      icon: "search"
    }, {
      label: "ナビ",
      value: "nav",
      icon: "footprints"
    }, {
      label: "記録",
      value: "stats",
      icon: "bar-chart-2"
    }, {
      label: "マイページ",
      value: "profile",
      icon: "user"
    }]
  }));
}
function Root() {
  const [dark, setDark] = React.useState(false);
  // Keep the phone bezel's own chrome (status bar / home indicator) in sync too.
  React.useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.dataset.theme === "dark"));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
    return () => obs.disconnect();
  }, []);
  return /*#__PURE__*/React.createElement(window.IOSDevice, {
    dark: dark,
    width: 402,
    height: 874
  }, /*#__PURE__*/React.createElement(SanpoApp, null));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(Root, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sanpo-app/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sanpo-app/ios-frame.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports (to window): IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard
//
// Usage — wrap your screen content in <IOSDevice> to get the bezel, status bar
// and home indicator (props: title, dark, keyboard):
//
//   <IOSDevice title="Settings">
//     ...your screen content...
//   </IOSDevice>
//   <IOSDevice dark title="Search" keyboard>…</IOSDevice>
/* END USAGE */

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sanpo-app/ios-frame.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sanpo-app/screens/HomeScreen.jsx
try { (() => {
const {
  Button,
  Card,
  Icon,
  Tag,
  ProgressBar,
  Badge
} = window.SanpoDesignSystem_ea6ab0;
function RouteCard({
  title,
  time,
  dist,
  tags
}) {
  return /*#__PURE__*/React.createElement(Card, {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-heading)",
      fontWeight: 700,
      fontSize: "var(--text-lg)",
      color: "var(--text-primary)"
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--text-secondary)",
      marginTop: 2
    }
  }, "\u5F80\u5FA9 ", time, "\u5206\u30FB\u7D04", dist, "km")), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 20,
    color: "var(--text-tertiary)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, tags.map(t => /*#__PURE__*/React.createElement(Badge, {
    key: t,
    tone: "neutral"
  }, t))));
}
function HomeScreen({
  dark
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-app)",
      minHeight: "100%",
      padding: "20px 16px 32px",
      display: "flex",
      flexDirection: "column",
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      color: "var(--text-secondary)"
    }
  }, "\u304A\u306F\u3088\u3046\u3054\u3056\u3044\u307E\u3059"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-heading)",
      fontSize: "var(--text-2xl)",
      fontWeight: 700,
      color: "var(--text-primary)"
    }
  }, "\u7530\u4E2D\u3055\u3093\u3001\u4ECA\u65E5\u3082\u6B69\u304D\u307E\u3057\u3087\u3046")), /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: "var(--radius-xl)",
      background: dark ? "var(--primary-tint)" : "var(--ill-sky)",
      padding: "20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      overflow: "hidden",
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
      zIndex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-heading)",
      fontWeight: 800,
      fontSize: "var(--text-xl)",
      color: "var(--primary)"
    }
  }, "\u8FD1\u6240\u3092\u6563\u6B69\u3059\u308B"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    icon: "footprints",
    style: {
      width: "fit-content"
    }
  }, "\u6563\u6B69\u3092\u59CB\u3081\u308B")), !dark ? /*#__PURE__*/React.createElement("img", {
    src: "../../assets/illustrations/walker-preview.png",
    alt: "",
    style: {
      height: 92,
      width: "auto",
      flex: "0 0 auto",
      borderRadius: 12
    }
  }) : /*#__PURE__*/React.createElement(Icon, {
    name: "footprints",
    size: 56,
    color: "var(--primary)"
  })), /*#__PURE__*/React.createElement(Card, {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    value: 7200,
    max: 10000,
    label: "\u4ECA\u65E5\u306E\u6B69\u6570\u76EE\u6A19"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: "var(--text-xs)",
      color: "var(--text-tertiary)"
    }
  }, /*#__PURE__*/React.createElement("span", null, "7,200\u6B69"), /*#__PURE__*/React.createElement("span", null, "\u76EE\u6A19 10,000\u6B69"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-label)",
      fontWeight: 700,
      fontSize: "var(--text-md)",
      color: "var(--text-primary)",
      marginBottom: 10
    }
  }, "\u30AB\u30C6\u30B4\u30EA\u304B\u3089\u63A2\u3059"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement(Tag, {
    icon: "tree-pine",
    category: "park"
  }, "\u516C\u5712"), /*#__PURE__*/React.createElement(Tag, {
    icon: "coffee",
    category: "cafe"
  }, "\u30AB\u30D5\u30A7"), /*#__PURE__*/React.createElement(Tag, {
    icon: "book-open",
    category: "culture"
  }, "\u56F3\u66F8\u9928"), /*#__PURE__*/React.createElement(Tag, {
    icon: "train-front",
    category: "station"
  }, "\u99C5"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-label)",
      fontWeight: 700,
      fontSize: "var(--text-md)",
      color: "var(--text-primary)",
      marginBottom: 10
    }
  }, "\u304A\u3059\u3059\u3081\u30EB\u30FC\u30C8"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(RouteCard, {
    title: "\u5DDD\u8FBA\u99C5\u307E\u3067\u306E\u3093\u3073\u308A\u30B3\u30FC\u30B9",
    time: 60,
    dist: 4.0,
    tags: ["公園", "カフェ"]
  }), /*#__PURE__*/React.createElement(RouteCard, {
    title: "\u4E2D\u592E\u56F3\u66F8\u9928\u3050\u308B\u308A\u30B3\u30FC\u30B9",
    time: 35,
    dist: 2.4,
    tags: ["図書館"]
  }))));
}
Object.assign(window, {
  HomeScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sanpo-app/screens/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sanpo-app/screens/NavScreen.jsx
try { (() => {
const {
  Card,
  IconButton,
  Button,
  Badge,
  StatBlock,
  MapPin
} = window.SanpoDesignSystem_ea6ab0;
const PINS = [{
  cat: "park",
  label: "緑町公園",
  x: 14,
  y: 12
}, {
  cat: "station",
  label: "さくら駅",
  x: 68,
  y: 16,
  icon: "train-front"
}, {
  cat: "culture",
  label: "中央図書館",
  x: 57,
  y: 33
}, {
  cat: "cafe",
  label: "ブックカフェ",
  x: 15,
  y: 32
}, {
  cat: "cafe",
  label: "ベーカリー ハーモニー",
  x: 68,
  y: 52
}, {
  cat: "park",
  label: "川沿い公園",
  x: 14,
  y: 64
}, {
  cat: "cafe",
  label: "カフェ ソライロ",
  x: 36,
  y: 78
}, {
  cat: "goal",
  label: "川辺駅",
  x: 68,
  y: 93,
  icon: "flag"
}];
const ROUTE = "M50,62 L36,79 L14,66 L14,21 L37,15 L58,19 L68,16 L62,35 L57,52 L64,93";
function MapArea() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      height: 330,
      background: "var(--map-canvas)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      backgroundImage: "linear-gradient(var(--map-road) 2px, transparent 2px), linear-gradient(90deg, var(--map-road) 2px, transparent 2px)",
      backgroundSize: "13% 16%"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: "0%",
      top: "0%",
      width: "34%",
      height: "40%",
      background: "var(--map-greenspace)",
      borderRadius: "0 0 60% 0"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: "-6%",
      bottom: "-10%",
      width: "40%",
      height: "55%",
      background: "var(--map-water)",
      borderRadius: "50%"
    }
  }), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 100 100",
    preserveAspectRatio: "none",
    style: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%"
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: ROUTE,
    fill: "none",
    stroke: "var(--map-route)",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    vectorEffect: "non-scaling-stroke"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: "50%",
      top: "62%",
      transform: "translate(-50%,-50%)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: "50%",
      background: "rgba(21,133,254,0.25)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 14,
      height: 14,
      borderRadius: "50%",
      background: "var(--primary)",
      border: "2.5px solid #fff",
      boxShadow: "var(--shadow-pin)"
    }
  }))), PINS.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.label,
    style: {
      position: "absolute",
      left: `${p.x}%`,
      top: `${p.y}%`,
      transform: "translate(-50%,-100%)"
    }
  }, /*#__PURE__*/React.createElement(MapPin, {
    category: p.cat,
    label: p.label,
    icon: p.icon,
    size: 32
  }))), /*#__PURE__*/React.createElement(Card, {
    elevated: true,
    padding: "6px",
    style: {
      position: "absolute",
      right: 12,
      top: 12,
      display: "flex",
      flexDirection: "column",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "crosshair",
    label: "\u73FE\u5728\u5730",
    variant: "ghost",
    size: "sm"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "map-pin",
    label: "\u30D4\u30F3\u8FFD\u52A0",
    variant: "ghost",
    size: "sm"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "route",
    label: "\u30EB\u30FC\u30C8\u8ABF\u6574",
    variant: "ghost",
    size: "sm"
  })));
}
function NavScreen({
  dark
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-app)",
      minHeight: "100%",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "16px"
    }
  }, !dark ? /*#__PURE__*/React.createElement("img", {
    src: "../../assets/illustrations/walker-preview.png",
    alt: "",
    style: {
      width: 96,
      height: 52,
      objectFit: "cover",
      borderRadius: "var(--radius-md)"
    }
  }) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-xs)",
      color: "var(--text-tertiary)"
    }
  }, "\u5F80\u5FA9\u306E\u76EE\u5B89"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-data)",
      fontWeight: 800,
      fontSize: "var(--text-3xl)",
      color: "var(--primary)"
    }
  }, "60"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-sm)",
      color: "var(--text-secondary)"
    }
  }, "\u5206\uFF08\u7D044.0km\uFF09")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-heading)",
      fontWeight: 700,
      fontSize: "var(--text-md)",
      color: "var(--text-primary)",
      marginTop: 2
    }
  }, "\u30B4\u30FC\u30EB\uFF1A\u5DDD\u8FBA\u99C5")), /*#__PURE__*/React.createElement(IconButton, {
    icon: "settings-2",
    label: "\u8A2D\u5B9A",
    variant: "tinted"
  })), /*#__PURE__*/React.createElement(MapArea, null), /*#__PURE__*/React.createElement(Card, {
    elevated: true,
    style: {
      margin: 12,
      borderRadius: "var(--radius-xl)",
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "info",
    dot: true
  }, "\u30CA\u30D3\u30B2\u30FC\u30B7\u30E7\u30F3\u4E2D"), /*#__PURE__*/React.createElement(Badge, {
    tone: "success"
  }, "GPS\u826F\u597D")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(StatBlock, {
    size: "sm",
    value: "00:28:34",
    label: "\u7D4C\u904E\u6642\u9593"
  }), /*#__PURE__*/React.createElement(StatBlock, {
    size: "sm",
    value: "2.1",
    unit: "km",
    label: "\u6B69\u884C\u8DDD\u96E2"
  }), /*#__PURE__*/React.createElement(StatBlock, {
    size: "sm",
    value: "3,240",
    unit: "\u6B69",
    label: "\u6B69\u6570"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "pause",
    style: {
      flex: 1
    }
  }, "\u4E00\u6642\u505C\u6B62"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    icon: "square",
    style: {
      flex: 1.4
    }
  }, "\u7D42\u4E86\u3059\u308B"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    icon: "list",
    style: {
      flex: 1
    }
  }, "\u30D4\u30F3\u4E00\u89A7"))));
}
Object.assign(window, {
  NavScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sanpo-app/screens/NavScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sanpo-app/screens/ProfileScreen.jsx
try { (() => {
const {
  Avatar,
  Card,
  Icon,
  Switch,
  Badge
} = window.SanpoDesignSystem_ea6ab0;
function SettingRow({
  icon,
  label,
  right,
  onClick
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 4px",
      borderBottom: "1px solid var(--border-subtle)",
      cursor: onClick ? "pointer" : "default"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 19,
    color: "var(--text-secondary)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-md)",
      color: "var(--text-primary)"
    }
  }, label), right || /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 17,
    color: "var(--text-tertiary)"
  }));
}
function ProfileScreen({
  dark,
  onToggleDark
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-app)",
      minHeight: "100%",
      padding: "20px 16px 32px",
      display: "flex",
      flexDirection: "column",
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "\u7530\u4E2D",
    size: "lg"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-heading)",
      fontWeight: 700,
      fontSize: "var(--text-xl)",
      color: "var(--text-primary)"
    }
  }, "\u7530\u4E2D \u84EE"), /*#__PURE__*/React.createElement(Badge, {
    tone: "info",
    dot: true,
    style: {
      marginTop: 4
    }
  }, "12\u65E5\u9023\u7D9A"))), /*#__PURE__*/React.createElement(Card, {
    style: {
      display: "flex",
      flexDirection: "column",
      padding: "4px 14px"
    }
  }, /*#__PURE__*/React.createElement(SettingRow, {
    icon: "moon",
    label: "\u30C0\u30FC\u30AF\u30E2\u30FC\u30C9",
    right: /*#__PURE__*/React.createElement(Switch, {
      checked: dark,
      onChange: onToggleDark
    })
  }), /*#__PURE__*/React.createElement(SettingRow, {
    icon: "bell",
    label: "\u901A\u77E5\u8A2D\u5B9A"
  }), /*#__PURE__*/React.createElement(SettingRow, {
    icon: "target",
    label: "\u76EE\u6A19\u8A2D\u5B9A"
  }), /*#__PURE__*/React.createElement(SettingRow, {
    icon: "map",
    label: "\u3088\u304F\u4F7F\u3046\u30EB\u30FC\u30C8"
  }), /*#__PURE__*/React.createElement(SettingRow, {
    icon: "circle-help",
    label: "\u30D8\u30EB\u30D7\u30FB\u304A\u554F\u3044\u5408\u308F\u305B"
  }), /*#__PURE__*/React.createElement(SettingRow, {
    icon: "log-out",
    label: "\u30ED\u30B0\u30A2\u30A6\u30C8",
    onClick: () => {}
  })));
}
Object.assign(window, {
  ProfileScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sanpo-app/screens/ProfileScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sanpo-app/screens/RecordScreen.jsx
try { (() => {
const {
  Card,
  StatBlock,
  ProgressBar,
  Icon,
  Tabs
} = window.SanpoDesignSystem_ea6ab0;
const HISTORY = [{
  date: "6月30日(火)",
  time: "28分",
  dist: "2.1km",
  steps: "3,240歩"
}, {
  date: "6月29日(月)",
  time: "42分",
  dist: "3.0km",
  steps: "4,510歩"
}, {
  date: "6月27日(土)",
  time: "65分",
  dist: "4.4km",
  steps: "6,120歩"
}];
function HistoryRow({
  item
}) {
  return /*#__PURE__*/React.createElement(Card, {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: "var(--radius-md)",
      background: "var(--primary-tint)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flex: "0 0 auto"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "footprints",
    size: 18,
    color: "var(--primary)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-heading)",
      fontWeight: 700,
      fontSize: "var(--text-sm)",
      color: "var(--text-primary)"
    }
  }, item.date), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-xs)",
      color: "var(--text-tertiary)"
    }
  }, item.time, "\u30FB", item.dist)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-data)",
      fontWeight: 700,
      fontSize: "var(--text-sm)",
      color: "var(--text-secondary)"
    }
  }, item.steps));
}
function RecordScreen() {
  const [range, setRange] = React.useState("week");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-app)",
      minHeight: "100%",
      padding: "20px 16px 32px",
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-heading)",
      fontWeight: 700,
      fontSize: "var(--text-2xl)",
      color: "var(--text-primary)"
    }
  }, "\u8A18\u9332"), /*#__PURE__*/React.createElement(Tabs, {
    value: range,
    onChange: setRange,
    items: [{
      label: "今週",
      value: "week"
    }, {
      label: "今月",
      value: "month"
    }, {
      label: "全期間",
      value: "all"
    }]
  }), /*#__PURE__*/React.createElement(Card, {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(StatBlock, {
    size: "sm",
    value: "9.5",
    unit: "km",
    label: "\u5408\u8A08\u8DDD\u96E2"
  }), /*#__PURE__*/React.createElement(StatBlock, {
    size: "sm",
    value: "2:15",
    label: "\u5408\u8A08\u6642\u9593"
  }), /*#__PURE__*/React.createElement(StatBlock, {
    size: "sm",
    value: "13,870",
    unit: "\u6B69",
    label: "\u5408\u8A08\u6B69\u6570"
  })), /*#__PURE__*/React.createElement(ProgressBar, {
    value: 68,
    max: 100,
    tone: "accent",
    label: "\u9031\u9593\u76EE\u6A19\u9054\u6210\u7387"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-label)",
      fontWeight: 700,
      fontSize: "var(--text-md)",
      color: "var(--text-primary)",
      marginBottom: 10
    }
  }, "\u6700\u8FD1\u306E\u6563\u6B69"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, HISTORY.map(h => /*#__PURE__*/React.createElement(HistoryRow, {
    key: h.date,
    item: h
  })))));
}
Object.assign(window, {
  RecordScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sanpo-app/screens/RecordScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sanpo-app/screens/SearchScreen.jsx
try { (() => {
const {
  Input,
  Tag,
  Card,
  Icon,
  Badge
} = window.SanpoDesignSystem_ea6ab0;
const SPOTS = [{
  name: "緑町公園",
  cat: "park",
  icon: "tree-pine",
  dist: "0.4km",
  note: "桜並木が人気"
}, {
  name: "ブックカフェ リーブス",
  cat: "cafe",
  icon: "coffee",
  dist: "0.6km",
  note: "電源席あり"
}, {
  name: "中央図書館",
  cat: "culture",
  icon: "book-open",
  dist: "0.9km",
  note: "自習スペース有"
}, {
  name: "カフェ ソライロ",
  cat: "cafe",
  icon: "coffee",
  dist: "1.1km",
  note: "テラス席"
}, {
  name: "さくら駅",
  cat: "station",
  icon: "train-front",
  dist: "1.8km",
  note: "急行停車"
}];
const CAT_COLOR = {
  park: "var(--map-park)",
  cafe: "var(--map-cafe)",
  culture: "var(--map-culture)",
  station: "var(--map-station)"
};
function SpotRow({
  spot
}) {
  return /*#__PURE__*/React.createElement(Card, {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: "var(--radius-md)",
      background: CAT_COLOR[spot.cat],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flex: "0 0 auto"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: spot.icon,
    size: 20,
    color: "#fff"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-heading)",
      fontWeight: 700,
      fontSize: "var(--text-md)",
      color: "var(--text-primary)"
    }
  }, spot.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-xs)",
      color: "var(--text-tertiary)"
    }
  }, spot.note)), /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, spot.dist));
}
function SearchScreen() {
  const [cat, setCat] = React.useState("all");
  const filtered = cat === "all" ? SPOTS : SPOTS.filter(s => s.cat === cat);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-app)",
      minHeight: "100%",
      padding: "20px 16px 32px",
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-heading)",
      fontWeight: 700,
      fontSize: "var(--text-2xl)",
      color: "var(--text-primary)"
    }
  }, "\u30B9\u30DD\u30C3\u30C8\u691C\u7D22"), /*#__PURE__*/React.createElement(Input, {
    placeholder: "\u30B9\u30DD\u30C3\u30C8\u3084\u30A8\u30EA\u30A2\u3092\u691C\u7D22",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "search",
      size: 16
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      overflowX: "auto"
    }
  }, /*#__PURE__*/React.createElement(Tag, {
    category: "neutral",
    selected: cat === "all",
    onClick: () => setCat("all")
  }, "\u3059\u3079\u3066"), /*#__PURE__*/React.createElement(Tag, {
    icon: "tree-pine",
    category: "park",
    selected: cat === "park",
    onClick: () => setCat("park")
  }, "\u516C\u5712"), /*#__PURE__*/React.createElement(Tag, {
    icon: "coffee",
    category: "cafe",
    selected: cat === "cafe",
    onClick: () => setCat("cafe")
  }, "\u30AB\u30D5\u30A7"), /*#__PURE__*/React.createElement(Tag, {
    icon: "book-open",
    category: "culture",
    selected: cat === "culture",
    onClick: () => setCat("culture")
  }, "\u56F3\u66F8\u9928"), /*#__PURE__*/React.createElement(Tag, {
    icon: "train-front",
    category: "station",
    selected: cat === "station",
    onClick: () => setCat("station")
  }, "\u99C5")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, filtered.map(s => /*#__PURE__*/React.createElement(SpotRow, {
    key: s.name,
    spot: s
  }))));
}
Object.assign(window, {
  SearchScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sanpo-app/screens/SearchScreen.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.StatBlock = __ds_scope.StatBlock;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.MapPin = __ds_scope.MapPin;

__ds_ns.TabBar = __ds_scope.TabBar;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.BottomSheet = __ds_scope.BottomSheet;

__ds_ns.Dialog = __ds_scope.Dialog;

})();

