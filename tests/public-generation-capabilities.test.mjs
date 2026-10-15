import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPublicVideoParameters,
  buildPublicImageParameters,
  filterPublicVideoProviderParameters,
  filterPublicProviderParameters,
  findPublicImageCapability,
  findPublicVideoCapability,
  getPublicVideoControlOptions,
  getPublicImageControlOptions,
} from "../packages/studio/src/publicGenerationCapabilities.js";

test("public video controls and request parameters follow the server capability contract", () => {
  const model = {
    id: "seedance-2.0",
    generationCapabilities: [{
      taskType: "t2v",
      inputTypes: ["text"],
      outputTypes: ["video"],
      aspectRatios: ["16:9", "9:16"],
      resolutions: ["720p"],
      durations: [4, 5, 10, 15],
      qualities: ["standard", "high"],
    }],
  };
  const capability = findPublicVideoCapability(model);
  assert.deepEqual(getPublicVideoControlOptions(capability), {
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p"],
    durations: [4, 5, 10, 15],
    qualities: ["standard", "high"],
  });
  assert.deepEqual(buildPublicVideoParameters({
    capability,
    prompt: "  a motion graphic  ",
    aspectRatio: "9:16",
    resolution: "720p",
    duration: 10,
    quality: "high",
  }), {
    task_type: "t2v",
    prompt: "a motion graphic",
    aspect_ratio: "9:16",
    resolution: "720p",
    duration: 10,
    duration_seconds: 10,
    quality: "high",
  });
});

test("missing or stale capability settings are omitted instead of guessed", () => {
  const capability = {
    taskType: "t2v",
    inputTypes: ["text"],
    outputTypes: ["video"],
    aspectRatios: [],
    resolutions: [],
    durations: [],
    qualities: [],
  };
  assert.deepEqual(buildPublicVideoParameters({
    capability,
    prompt: "scene",
    aspectRatio: "16:9",
    resolution: "720p",
    duration: 6,
  }), { task_type: "t2v", prompt: "scene" });
  assert.equal(buildPublicVideoParameters({
    capability: { taskType: "i2v", inputTypes: ["image"], outputTypes: ["video"] },
    taskType: "i2v",
    prompt: "motion",
  }).task_type, "i2v");
  assert.equal(buildPublicVideoParameters({
    capability: { taskType: "v2v", inputTypes: ["video"], outputTypes: ["video"] },
    taskType: "v2v",
    prompt: "edit",
  }).task_type, "v2v");
  assert.equal(findPublicVideoCapability({ generationCapabilities: [
    { taskType: "t2v", inputTypes: ["image"], outputTypes: ["video"] },
  ] }), null);
});

test("supplemental parameters are retained only when the public route declares them", () => {
  const capability = {
    taskType: "i2v",
    inputTypes: ["image"],
    parameters: ["generate_audio", "motion_strength"],
  };
  assert.deepEqual(filterPublicVideoProviderParameters({
    generate_audio: true,
    motion_strength: 0.7,
    image_url: "https://asset.example/image.png",
    reference_images: ["https://asset.example/reference.png"],
    video_url: "https://asset.example/video.mp4",
  }, capability), {
    generate_audio: true,
    motion_strength: 0.7,
    image_url: "https://asset.example/image.png",
    reference_images: ["https://asset.example/reference.png"],
  });
  assert.deepEqual(filterPublicVideoProviderParameters({ generate_audio: true }, {
    taskType: "t2v", inputTypes: ["text"], parameters: [],
  }), {});
});

test("image Studio controls and T2I/I2I request parameters follow the server capability contract", () => {
  const model = {
    id: "seedream-5.0",
    generationCapabilities: [
      { taskType: "t2i", inputTypes: ["text"], outputTypes: ["image"], aspectRatios: ["1:1", "3:2"], resolutions: ["2K"], qualities: [], parameters: ["negative_prompt"] },
      { taskType: "i2i", inputTypes: ["image"], outputTypes: ["image"], aspectRatios: ["1:1"], resolutions: [], qualities: ["high"], parameters: ["swap_url"] },
    ],
  };
  const t2i = findPublicImageCapability(model, "t2i");
  assert.deepEqual(getPublicImageControlOptions(t2i, "resolution"), {
    aspectRatios: ["1:1", "3:2"],
    choices: ["2K"],
  });
  assert.deepEqual(buildPublicImageParameters({
    capability: t2i, taskType: "t2i", prompt: "  still life  ", aspectRatio: "3:2",
    qualityField: "resolution", qualityValue: "2K",
  }), { task_type: "t2i", prompt: "still life", aspect_ratio: "3:2", resolution: "2K" });

  const i2i = findPublicImageCapability(model, "i2i");
  assert.deepEqual(getPublicImageControlOptions(i2i, "quality"), {
    aspectRatios: ["1:1"],
    choices: ["high"],
  });
  assert.deepEqual(filterPublicProviderParameters({
    image_url: "https://asset.example/source.png",
    swap_url: "https://asset.example/swap.png",
    negative_prompt: "not declared here",
  }, i2i), {
    image_url: "https://asset.example/source.png",
    swap_url: "https://asset.example/swap.png",
  });
});
