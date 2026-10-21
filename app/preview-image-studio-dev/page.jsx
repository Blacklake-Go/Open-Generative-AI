"use client";

import ImageStudio from "studio/ImageStudio";

const now = Date.now();
const img = (name) => `/uploads/generated/2026/10/16/${name}`;

const historyItems = [
  {
    id: "preview-single-1",
    batchId: "preview-single",
    url: img("f69ba8c4-b6d5-4924-8e57-0abebc33c40d.webp"),
    prompt: "一只橘猫在窗边打盹，午后阳光，写实摄影，柔和景深，温暖色调",
    model: "bytedance-seedream-v4.5",
    aspect_ratio: "1:1",
    quality: "standard",
    negativePrompt: "模糊、低质量",
    requestedCount: 1,
    timestamp: new Date(now).toISOString(),
  },
  {
    id: "preview-batch-1",
    batchId: "preview-batch",
    url: img("830a9d7e-562d-4470-9c87-055d9f7cfb9b.webp"),
    prompt: "霓虹灯下的未来城市街道，雨夜反射，电影感构图",
    model: "bytedance-seedream-v4.5",
    aspect_ratio: "16:9",
    quality: "high",
    negativePrompt: "水印、文字",
    requestedCount: 4,
    timestamp: new Date(now - 60000).toISOString(),
  },
  {
    id: "preview-batch-2",
    batchId: "preview-batch",
    url: img("55c21f61-a007-4a99-82bd-6f0c18ce6adf.webp"),
    prompt: "霓虹灯下的未来城市街道，雨夜反射，电影感构图",
    model: "bytedance-seedream-v4.5",
    aspect_ratio: "16:9",
    quality: "high",
    negativePrompt: "水印、文字",
    requestedCount: 4,
    timestamp: new Date(now - 60000).toISOString(),
  },
  {
    id: "preview-batch-3",
    batchId: "preview-batch",
    url: img("f69ba8c4-b6d5-4924-8e57-0abebc33c40d.webp"),
    prompt: "霓虹灯下的未来城市街道，雨夜反射，电影感构图",
    model: "bytedance-seedream-v4.5",
    aspect_ratio: "16:9",
    quality: "high",
    negativePrompt: "水印、文字",
    requestedCount: 4,
    timestamp: new Date(now - 60000).toISOString(),
  },
  {
    id: "preview-batch-4",
    batchId: "preview-batch",
    url: img("830a9d7e-562d-4470-9c87-055d9f7cfb9b.webp"),
    prompt: "霓虹灯下的未来城市街道，雨夜反射，电影感构图",
    model: "bytedance-seedream-v4.5",
    aspect_ratio: "16:9",
    quality: "high",
    negativePrompt: "水印、文字",
    requestedCount: 4,
    timestamp: new Date(now - 60000).toISOString(),
  },
];

export default function PreviewImageStudioPage() {
  return (
    <div className="h-screen w-full bg-base">
      <ImageStudio apiKey="preview" locale="zh-CN" historyItems={historyItems} />
    </div>
  );
}
