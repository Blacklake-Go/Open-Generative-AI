import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const STUDIO_COMPONENTS_DIR = path.resolve(ROOT_DIR, "packages/studio/src/components");

const STUDIO_FILES = [
  "VideoStudio.jsx",
  "CinemaStudio.jsx",
  "MotionControlStudio.jsx",
  "LipSyncStudio.jsx",
  "RecastStudio.jsx",
  "ClippingStudio.jsx",
  "VibeMotionStudio.jsx",
  "MarketingStudio.jsx",
];

const ALL_TARGET_FILES = [...STUDIO_FILES, "VideoRelayMenu.jsx"];
const REQUIRED_LOCALES = ["en", "zh-CN", "ja-JP", "ko-KR", "zh-TW", "es"];

test("Video Suite Integrity - All 8 Studios and VideoRelayMenu exist", () => {
  for (const fileName of ALL_TARGET_FILES) {
    const filePath = path.join(STUDIO_COMPONENTS_DIR, fileName);
    assert.ok(fs.existsSync(filePath), `File ${fileName} must exist`);
  }
});

test("Video Suite Integrity - Zero hardcoded hex colors in all 8 studios and VideoRelayMenu", () => {
  const hexPattern = /#[0-9a-fA-F]{3,6}\b/g;

  for (const fileName of ALL_TARGET_FILES) {
    const filePath = path.join(STUDIO_COMPONENTS_DIR, fileName);
    const content = fs.readFileSync(filePath, "utf-8");
    const matches = content.match(hexPattern) || [];

    assert.equal(
      matches.length,
      0,
      `File ${fileName} has hardcoded hex colors: ${JSON.stringify(matches)}`,
    );
  }
});

test("Video Suite Integrity - All 8 studios mount VideoRelayMenu and listen for supdance-relay-video", () => {
  for (const fileName of STUDIO_FILES) {
    const filePath = path.join(STUDIO_COMPONENTS_DIR, fileName);
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes('import VideoRelayMenu from "./VideoRelayMenu.jsx";'),
      `${fileName} must import VideoRelayMenu`,
    );
    assert.ok(
      content.includes("<VideoRelayMenu"),
      `${fileName} must mount <VideoRelayMenu`,
    );
    assert.ok(
      content.includes("supdance-relay-video"),
      `${fileName} must handle 'supdance-relay-video' event`,
    );
  }
});

test("Video Suite Integrity - All studios define 6-locale presets dictionary", () => {
  const otherLocales = ["zh-CN", "ja-JP", "ko-KR", "zh-TW", "es"];

  for (const fileName of STUDIO_FILES) {
    const filePath = path.join(STUDIO_COMPONENTS_DIR, fileName);
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes("COPY_EN") || content.includes('"en":') || content.includes("'en':"),
      `${fileName} must define English base dictionary`,
    );

    for (const loc of otherLocales) {
      assert.ok(
        content.includes(`"${loc}":`) || content.includes(`'${loc}':`),
        `${fileName} must define dictionary for locale ${loc}`,
      );
    }
  }
});

test("Video Suite Integrity - VideoRelayMenu supports all 8 targets and 6 locales", () => {
  const menuPath = path.join(STUDIO_COMPONENTS_DIR, "VideoRelayMenu.jsx");
  const content = fs.readFileSync(menuPath, "utf-8");

  const expectedTargets = [
    "video",
    "cinema",
    "motion-control",
    "lipsync",
    "body-swap",
    "clipping",
    "vibe-motion",
    "marketing",
  ];

  for (const target of expectedTargets) {
    assert.ok(
      content.includes(`id: "${target}"`),
      `VideoRelayMenu must define route target for ${target}`,
    );
  }

  assert.ok(
    content.includes("RELAY_COPY_EN"),
    "VideoRelayMenu must define English base copy",
  );

  const otherLocales = ["zh-CN", "ja-JP", "ko-KR", "zh-TW", "es"];
  for (const loc of otherLocales) {
    assert.ok(
      content.includes(`"${loc}":`),
      `VideoRelayMenu must support locale ${loc}`,
    );
  }
});

test("Video Suite Integrity - UI Design System compliance (capsule & card hierarchy)", () => {
  // Gallery cards in studios must use rounded-2xl
  for (const fileName of STUDIO_FILES) {
    const filePath = path.join(STUDIO_COMPONENTS_DIR, fileName);
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes("rounded-2xl"),
      `${fileName} must use rounded-2xl container/card styling`,
    );
  }

  // VideoRelayMenu popover must use rounded-xl while trigger pill uses rounded-full
  const menuContent = fs.readFileSync(
    path.join(STUDIO_COMPONENTS_DIR, "VideoRelayMenu.jsx"),
    "utf-8",
  );
  assert.ok(
    menuContent.includes("rounded-xl"),
    "VideoRelayMenu popover must use rounded-xl",
  );
  assert.ok(
    menuContent.includes("rounded-full"),
    "VideoRelayMenu trigger button must use rounded-full",
  );
});
