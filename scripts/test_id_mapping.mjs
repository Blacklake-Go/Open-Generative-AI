import { imageModelPickerEntries, videoModelMenuEntries } from "../packages/studio/src/modelFamilies.js";
import { applyActiveModelDirectory, getModelPricing } from "../packages/studio/src/models.js";
import { priceForIds } from "../packages/studio/src/modelPrice.js";

async function main() {
  const res = await fetch("https://www.Supdance.com/api/models/active");
  const data = await res.json();
  console.log("Total active models from API:", data.models.length);

  applyActiveModelDirectory(data.models);

  let missingCount = 0;
  let foundCount = 0;

  for (const entry of imageModelPickerEntries) {
    const price = priceForIds(entry.variantIds);
    if (price.kind === 'missing') {
      missingCount++;
      if (missingCount <= 5) {
        console.log(`Image model missing price: "${entry.name}"`, [...entry.variantIds]);
      }
    } else {
      foundCount++;
    }
  }

  console.log(`Image picker entries: found=${foundCount}, missing=${missingCount}`);
}

main().catch(console.error);
