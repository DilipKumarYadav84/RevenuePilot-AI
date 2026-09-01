import assert from "node:assert/strict";
import test from "node:test";

import {
  rankScoredProducts,
  scoreProduct,
  type ProductSearchInput,
} from "../../src/modules/products/product.service";
import type { Product } from "../../src/modules/products/product.model";

// Fixtures mirror the real TechNova catalog seed data (scripts/seed.ts)
// exactly, for the laptops relevant to the "AI development under
// Rs. 70,000" -> "battery matters more than GPU" two-turn scenario
// described in the pre-demo review. Kept minimal (only the fields
// scoreProduct reads) but numerically faithful to the seeded catalog.

const devBookAir14: Product = {
  name: "DevBook Air 14",
  slug: "devbook-air-14",
  category: "laptop",
  description:
    "A thin and efficient 14-inch laptop tuned for students, web development, note taking, and long battery life on campus or commute days.",
  shortDescription: "Portable student laptop for web development and all-day work.",
  price: 54999,
  originalPrice: 59999,
  stock: 42,
  image: "",
  images: [],
  brand: "TechNova",
  tags: ["web-development", "student", "portable", "battery", "productivity"],
  specifications: {
    processor: "Intel Core i5-13420H",
    ram: "16GB LPDDR5",
    storage: "512GB NVMe SSD",
    display: "14-inch FHD IPS, 300 nits",
    graphics: "Intel UHD integrated graphics",
    battery: "62Wh, up to 11 hours",
    weight: "1.28 kg",
    operatingSystem: "Windows 11 Home",
    connectivity: "Wi-Fi 6, Bluetooth 5.3, 2x USB-C, HDMI",
  },
  useCases: ["students", "web development", "portability", "battery life"],
  rating: 4.4,
  reviewCount: 214,
  featured: true,
  active: true,
};

const devBookPro14: Product = {
  name: "DevBook Pro 14",
  slug: "devbook-pro-14",
  category: "laptop",
  description:
    "A balanced professional coding machine with extra CPU headroom, a color-accurate screen, and battery life suitable for full-stack development.",
  shortDescription: "Professional 14-inch laptop for full-stack development.",
  price: 64999,
  originalPrice: 69999,
  stock: 35,
  image: "",
  images: [],
  brand: "TechNova",
  tags: ["full-stack", "web-development", "productivity", "battery", "performance"],
  specifications: {
    processor: "AMD Ryzen 7 7840U",
    ram: "16GB DDR5",
    storage: "1TB NVMe SSD",
    display: "14-inch 2.2K IPS, 100% sRGB",
    graphics: "AMD Radeon 780M integrated graphics",
    battery: "70Wh, up to 10 hours",
    weight: "1.36 kg",
    operatingSystem: "Windows 11 Pro",
    connectivity: "Wi-Fi 6E, Bluetooth 5.3, USB4, HDMI 2.1",
  },
  useCases: ["full-stack development", "professional coding", "productivity", "strong battery life"],
  rating: 4.6,
  reviewCount: 186,
  featured: true,
  active: true,
};

const neuralBookX15: Product = {
  name: "NeuralBook X15",
  slug: "neuralbook-x15",
  category: "laptop",
  description:
    "A performance-focused 15-inch laptop for Python notebooks, local model experiments, containers, and heavier development workloads.",
  shortDescription: "AI/ML-ready laptop with strong CPU and RTX acceleration.",
  price: 69999,
  originalPrice: 76999,
  stock: 27,
  image: "",
  images: [],
  brand: "TechNova",
  tags: ["ai-development", "machine-learning", "python", "performance", "full-stack"],
  specifications: {
    processor: "Intel Core i7-13620H",
    ram: "16GB DDR5, expandable to 32GB",
    storage: "1TB NVMe SSD",
    display: "15.6-inch FHD IPS, 144Hz",
    graphics: "NVIDIA GeForce RTX 4050 6GB",
    battery: "58Wh, up to 6.5 hours",
    weight: "1.95 kg",
    operatingSystem: "Windows 11 Home",
    connectivity: "Wi-Fi 6, Bluetooth 5.2, USB-C, HDMI 2.1, RJ45",
  },
  useCases: ["AI/ML development", "Python", "heavier development workloads", "performance"],
  rating: 4.5,
  reviewCount: 143,
  featured: true,
  active: true,
};

const creatorCore16: Product = {
  name: "CreatorCore 16",
  slug: "creatorcore-16",
  category: "laptop",
  description:
    "A large-display creator laptop for multitasking, editing timelines, design tools, and development work that benefits from screen space.",
  shortDescription: "16-inch creator and development laptop with a large display.",
  price: 74999,
  originalPrice: 82999,
  stock: 22,
  image: "",
  images: [],
  brand: "TechNova",
  tags: ["creator", "productivity", "performance", "full-stack", "multitasking"],
  specifications: {
    processor: "AMD Ryzen 7 8845HS",
    ram: "32GB DDR5",
    storage: "1TB NVMe SSD",
    display: "16-inch 2.5K IPS, 100% sRGB",
    graphics: "NVIDIA GeForce RTX 3050 6GB",
    battery: "76Wh, up to 8 hours",
    weight: "1.82 kg",
    operatingSystem: "Windows 11 Pro",
    connectivity: "Wi-Fi 6E, Bluetooth 5.3, USB-C PD, HDMI, SD card reader",
  },
  useCases: ["content creation", "development", "large display", "multitasking"],
  rating: 4.7,
  reviewCount: 98,
  featured: true,
  active: true,
};

const catalog = [devBookAir14, devBookPro14, neuralBookX15, creatorCore16];

const rankFor = (input: ProductSearchInput) =>
  rankScoredProducts(catalog.map((product) => ({ ...product, ...scoreProduct(product, input) })));

// ---- Turn 1: "I need a laptop for AI development under Rs. 70,000" ----
// No priority preference yet — ranking is unchanged by FIX 6, NeuralBook
// X15 remains the top match exactly as in the already-verified demo flow.

test("turn 1 (no priority preference): NeuralBook X15 remains BEST MATCH, unchanged by FIX 6", () => {
  const turn1Input: ProductSearchInput = {
    category: "laptop",
    budget: 70000,
    useCases: ["AI development"],
    preferences: ["ai-development"],
  };

  const ranked = rankFor(turn1Input);

  assert.equal(ranked[0]!.name, "NeuralBook X15");
});

// ---- Turn 2: "I care more about battery life than GPU power." ----
// priorityPreferences=["battery"] (freshly restated this turn). A genuine
// battery-oriented, in-budget, in-category alternative (DevBook Pro 14 —
// "battery" tag + description + useCase, vs. NeuralBook X15 which has no
// battery-related catalog data at all) should now rank first.

test("turn 2 (priority preference = battery): a genuine battery-oriented product outranks NeuralBook X15", () => {
  const turn2Input: ProductSearchInput = {
    category: "laptop",
    budget: 70000,
    useCases: ["AI development"],
    preferences: ["ai-development", "battery"],
    priorityPreferences: ["battery"],
  };

  const ranked = rankFor(turn2Input);

  assert.equal(ranked[0]!.name, "DevBook Pro 14");
  assert.notEqual(ranked[0]!.name, "NeuralBook X15");
});

test("priority preference match is reflected in matchReasons for explainability", () => {
  const { matchReasons } = scoreProduct(devBookPro14, {
    category: "laptop",
    budget: 70000,
    priorityPreferences: ["battery"],
  });

  assert.ok(matchReasons.some((reason) => reason.includes("priority preference match")));
});

test("a priority preference cannot fabricate a match against catalog data that doesn't mention it", () => {
  // NeuralBook X15 has no "battery" word anywhere in its tags, description,
  // useCases, or spec values (only a numeric battery-life spec value with
  // no "battery" token) — the priority boost must not apply to it.
  const { matchScore: baseScore } = scoreProduct(neuralBookX15, {
    category: "laptop",
    budget: 70000,
    preferences: ["ai-development"],
  });
  const { matchScore: withPriorityScore, matchReasons } = scoreProduct(neuralBookX15, {
    category: "laptop",
    budget: 70000,
    preferences: ["ai-development"],
    priorityPreferences: ["battery"],
  });

  assert.equal(withPriorityScore, baseScore);
  assert.ok(!matchReasons.some((reason) => reason.includes("priority preference match")));
});

test("a priority preference does not override the hard budget/category query boundary", () => {
  // CreatorCore 16 is over the stated budget (Rs. 74,999 vs Rs. 70,000);
  // even with a strong priority-preference match on one of its tags, it
  // must not outrank an in-budget candidate on that basis alone — the
  // priority boost is additive, not an override of budget fit.
  const inBudget = scoreProduct(devBookPro14, {
    category: "laptop",
    budget: 70000,
    priorityPreferences: ["battery"],
  });
  const overBudget = scoreProduct(creatorCore16, {
    category: "laptop",
    budget: 70000,
    priorityPreferences: ["performance"], // CreatorCore 16 has a "performance" tag
  });

  assert.ok(inBudget.matchScore > overBudget.matchScore);
});

test("no priority preferences: behavior is identical to pre-FIX-6 scoring (no priority bonus applied)", () => {
  const withoutField = scoreProduct(devBookPro14, { category: "laptop", budget: 70000 });
  const withEmptyArray = scoreProduct(devBookPro14, {
    category: "laptop",
    budget: 70000,
    priorityPreferences: [],
  });

  assert.equal(withoutField.matchScore, withEmptyArray.matchScore);
  assert.ok(!withoutField.matchReasons.some((reason) => reason.includes("priority")));
});
