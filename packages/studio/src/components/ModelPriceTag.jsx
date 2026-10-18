import { useState, useEffect } from "react";
import { resolveCopy } from "../i18nUtils";
import { priceForIds, formatModelPrice } from "../modelPrice.js";
import { applyActiveModelDirectory } from "../models.js";
import en from "../messages/en/modelPrice.json";
import zh from "../messages/zh/modelPrice.json";
import ja from "../messages/ja-JP/modelPrice.json";
import ko from "../messages/ko-KR/modelPrice.json";
import zhTw from "../messages/zh-TW/modelPrice.json";
import es from "../messages/es-ES/modelPrice.json";

/**
 * Renders the published shelf price for one model id, or for every variant of a
 * picker family. Automatically subscribes to pricing updates and falls back to
 * fetching active models when the catalog is not yet populated.
 */
export default function ModelPriceTag({
  ids,
  multiplier = 1,
  prefix = "",
  locale = "en",
  className = "",
  showUnavailable = true,
  compact = false,
}) {
  const copy = resolveCopy(en, { "zh-CN": zh, "ja-JP": ja, "ko-KR": ko, "zh-TW": zhTw, "es-ES": es }, locale).price;
  const [, setVersion] = useState(0);
  const [liveQuote, setLiveQuote] = useState(null);

  useEffect(() => {
    const handleUpdate = () => setVersion((v) => v + 1);
    const handleQuote = (event) => {
      const detail = event?.detail;
      if (!detail || !detail.modelId || !Number.isFinite(Number(detail.credits))) return;
      const targetIds = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
      if (targetIds.length === 1 && targetIds[0] === detail.modelId) {
        setLiveQuote({ modelId: detail.modelId, credits: Number(detail.credits) });
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("supdance-model-pricing-updated", handleUpdate);
      window.addEventListener("supdance:quote", handleQuote);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("supdance-model-pricing-updated", handleUpdate);
        window.removeEventListener("supdance:quote", handleQuote);
      }
    };
  }, [ids]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const globalPricing = globalThis.__SUPDANCE_MODEL_PRICING_MAP__;
    if (!window.__SUPDANCE_PRICING_FETCHING__ && (!globalPricing || globalPricing.size === 0)) {
      window.__SUPDANCE_PRICING_FETCHING__ = true;
      fetch("/api/models/active")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (Array.isArray(data?.models)) {
            applyActiveModelDirectory(data.models);
          }
        })
        .catch(() => {})
        .finally(() => {
          window.__SUPDANCE_PRICING_FETCHING__ = false;
        });
    }
  }, []);

  const targetIds = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  const shelfPrice = priceForIds(ids);
  const rawPrice =
    targetIds.length === 1 && liveQuote?.modelId === targetIds[0]
      ? { kind: "exact", credits: liveQuote.credits }
      : shelfPrice;
  const factor = Number.isFinite(multiplier) && multiplier > 1 ? multiplier : 1;
  const price =
    rawPrice.credits != null && factor > 1
      ? { ...rawPrice, credits: rawPrice.credits * factor }
      : rawPrice;

  if (price.kind === "missing" && !showUnavailable) {
    return null;
  }

  const accessiblePrice = formatModelPrice(price, copy);
  const displayPrice = compact
    ? `${price.credits ?? accessiblePrice}${price.kind === "from" ? "+" : ""}`
    : accessiblePrice;

  return (
    <span
      className={`text-micro font-normal text-ink-subtle ${className}`}
      data-model-price={price.kind === "missing" ? "" : String(price.credits)}
      data-model-price-kind={price.kind}
      aria-label={compact ? accessiblePrice : undefined}
      title={compact ? accessiblePrice : undefined}
    >
      {prefix}{displayPrice}
    </span>
  );
}
