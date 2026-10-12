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
}) {
  const copy = resolveCopy(en, { "zh-CN": zh, "ja-JP": ja, "ko-KR": ko, "zh-TW": zhTw, "es-ES": es }, locale).price;
  const [, setVersion] = useState(0);

  useEffect(() => {
    const handleUpdate = () => setVersion((v) => v + 1);
    if (typeof window !== "undefined") {
      window.addEventListener("koyosim-model-pricing-updated", handleUpdate);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("koyosim-model-pricing-updated", handleUpdate);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const globalPricing = globalThis.__KOYOSIM_MODEL_PRICING_MAP__;
    if (!window.__KOYOSIM_PRICING_FETCHING__ && (!globalPricing || globalPricing.size === 0)) {
      window.__KOYOSIM_PRICING_FETCHING__ = true;
      fetch("/api/models/active")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (Array.isArray(data?.models)) {
            applyActiveModelDirectory(data.models);
          }
        })
        .catch(() => {})
        .finally(() => {
          window.__KOYOSIM_PRICING_FETCHING__ = false;
        });
    }
  }, []);

  const rawPrice = priceForIds(ids);
  const factor = Number.isFinite(multiplier) && multiplier > 1 ? multiplier : 1;
  const price =
    rawPrice.credits != null && factor > 1
      ? { ...rawPrice, credits: rawPrice.credits * factor }
      : rawPrice;

  if (price.kind === "missing" && !showUnavailable) {
    return null;
  }

  return (
    <span
      className={`text-[10px] font-normal text-zinc-400 ${className}`}
      data-model-price={price.kind === "missing" ? "" : String(price.credits)}
      data-model-price-kind={price.kind}
    >
      {prefix}{formatModelPrice(price, copy)}
    </span>
  );
}
