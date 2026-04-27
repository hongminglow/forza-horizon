import * as THREE from "three";

export type JungleMaterials = {
  terrain: THREE.MeshStandardMaterial;
  road: THREE.MeshStandardMaterial;
  rut: THREE.MeshStandardMaterial;
  wetMud: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  log: THREE.MeshStandardMaterial;
  canopy: THREE.MeshStandardMaterial;
  canopyDark: THREE.MeshStandardMaterial;
  undergrowth: THREE.MeshStandardMaterial;
  fernBillboard: THREE.MeshStandardMaterial;
  grassBlade: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  finishDark: THREE.MeshStandardMaterial;
  finishLight: THREE.MeshStandardMaterial;
  post: THREE.MeshStandardMaterial;
};

type TextureOptions = {
  repeat?: [number, number];
  colorSpace?: THREE.ColorSpace;
  anisotropy?: number;
};

export function createJungleMaterials(): JungleMaterials {
  const terrainMap = createTerrainTexture();
  const roadMap = createRoadTexture();
  const barkMap = createBarkTexture();
  const leafMap = createLeafTexture("#245d34", "#102615", "#4b8d4b");
  const leafDarkMap = createLeafTexture("#173f25", "#091b10", "#326a37");
  const rockMap = createRockTexture();

  return {
    terrain: new THREE.MeshStandardMaterial({
      map: terrainMap,
      color: "#6c7a47",
      roughness: 0.96,
      metalness: 0,
    }),
    road: new THREE.MeshStandardMaterial({
      map: roadMap,
      bumpMap: roadMap,
      bumpScale: 0.085,
      color: "#c39a6f",
      roughness: 0.97,
      metalness: 0,
    }),
    rut: new THREE.MeshStandardMaterial({
      color: "#3c2718",
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    wetMud: new THREE.MeshStandardMaterial({
      color: "#24170f",
      roughness: 0.34,
      metalness: 0.02,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    bark: new THREE.MeshStandardMaterial({
      map: barkMap,
      bumpMap: barkMap,
      bumpScale: 0.09,
      color: "#5a3d27",
      roughness: 0.93,
      metalness: 0,
    }),
    log: new THREE.MeshStandardMaterial({
      map: barkMap,
      bumpMap: barkMap,
      bumpScale: 0.11,
      color: "#6b4528",
      roughness: 0.88,
      metalness: 0,
    }),
    canopy: new THREE.MeshStandardMaterial({
      map: leafMap,
      color: "#4f8a49",
      emissive: "#213b19",
      emissiveIntensity: 0.34,
      roughness: 0.86,
      metalness: 0,
    }),
    canopyDark: new THREE.MeshStandardMaterial({
      map: leafDarkMap,
      color: "#376c38",
      emissive: "#182b13",
      emissiveIntensity: 0.3,
      roughness: 0.9,
      metalness: 0,
    }),
    undergrowth: new THREE.MeshStandardMaterial({
      map: leafDarkMap,
      color: "#49733a",
      emissive: "#182511",
      emissiveIntensity: 0.22,
      roughness: 0.92,
      metalness: 0,
    }),
    fernBillboard: new THREE.MeshStandardMaterial({
      map: createFernTexture(),
      alphaTest: 0.33,
      color: "#5f8a45",
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    grassBlade: new THREE.MeshStandardMaterial({
      color: "#7d8c37",
      roughness: 0.94,
      metalness: 0,
    }),
    rock: new THREE.MeshStandardMaterial({
      map: rockMap,
      bumpMap: rockMap,
      bumpScale: 0.055,
      color: "#858a7b",
      roughness: 0.9,
      metalness: 0,
    }),
    water: new THREE.MeshStandardMaterial({
      map: createWaterTexture(),
      color: "#245d59",
      roughness: 0.18,
      metalness: 0.05,
      transparent: true,
      opacity: 0.74,
    }),
    finishDark: new THREE.MeshStandardMaterial({
      color: "#15120d",
      roughness: 0.68,
    }),
    finishLight: new THREE.MeshStandardMaterial({
      color: "#efe1ba",
      roughness: 0.72,
    }),
    post: new THREE.MeshStandardMaterial({
      map: barkMap,
      color: "#a98451",
      roughness: 0.78,
    }),
  };
}

function createTerrainTexture(): THREE.CanvasTexture {
  return createTexture("terrain", 512, (ctx, random) => {
    paintNoise(ctx, random, 512, ["#4e6430", "#5d7037", "#344c27", "#766744"]);
    for (let i = 0; i < 520; i += 1) {
      const x = random() * 512;
      const y = random() * 512;
      ctx.strokeStyle = withAlpha(random() > 0.45 ? "#9b9a5c" : "#233b1f", 0.22);
      ctx.lineWidth = 0.5 + random() * 2.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * 18, y - random() * 26);
      ctx.stroke();
    }
  }, { repeat: [22, 22] });
}

function createRoadTexture(): THREE.CanvasTexture {
  return createTexture("road", 512, (ctx, random) => {
    paintNoise(ctx, random, 512, ["#8d6240", "#7c5232", "#a47a52", "#4a3020"]);
    for (let i = 0; i < 760; i += 1) {
      ctx.fillStyle = withAlpha(random() > 0.6 ? "#2a1a12" : "#d1b083", 0.18);
      const radius = random() * 2.7 + 0.4;
      ctx.beginPath();
      ctx.ellipse(random() * 512, random() * 512, radius, radius * (0.55 + random()), random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let y = -32; y < 560; y += 18 + random() * 16) {
      ctx.strokeStyle = withAlpha("#3a2418", 0.14);
      ctx.lineWidth = 5 + random() * 7;
      ctx.beginPath();
      ctx.moveTo(92 + (random() - 0.5) * 28, y);
      ctx.bezierCurveTo(130, y + 20, 84, y + 48, 118, y + 82);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(392 + (random() - 0.5) * 28, y);
      ctx.bezierCurveTo(355, y + 16, 424, y + 46, 386, y + 80);
      ctx.stroke();
    }
  }, { repeat: [2, 38] });
}

function createBarkTexture(): THREE.CanvasTexture {
  return createTexture("bark", 256, (ctx, random) => {
    paintNoise(ctx, random, 256, ["#5d3a21", "#3d2517", "#75502f", "#2b1a12"]);
    for (let x = -12; x < 280; x += 8 + random() * 10) {
      ctx.strokeStyle = withAlpha(random() > 0.5 ? "#1d110b" : "#92673e", 0.42);
      ctx.lineWidth = 1 + random() * 3.5;
      ctx.beginPath();
      ctx.moveTo(x, -20);
      ctx.bezierCurveTo(x + random() * 22, 62, x - random() * 16, 150, x + random() * 18, 280);
      ctx.stroke();
    }
  }, { repeat: [2, 8] });
}

function createLeafTexture(
  base: string,
  dark: string,
  light: string,
): THREE.CanvasTexture {
  return createTexture("leaf", 256, (ctx, random) => {
    paintNoise(ctx, random, 256, [base, dark, light, "#1a321d"]);
    for (let i = 0; i < 160; i += 1) {
      ctx.fillStyle = withAlpha(random() > 0.5 ? light : dark, 0.2 + random() * 0.28);
      ctx.beginPath();
      ctx.ellipse(
        random() * 256,
        random() * 256,
        3 + random() * 15,
        1 + random() * 6,
        random() * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }, { repeat: [3, 3] });
}

function createFernTexture(): THREE.CanvasTexture {
  return createTexture("fern", 256, (ctx) => {
    ctx.clearRect(0, 0, 256, 256);
    ctx.translate(128, 236);
    ctx.strokeStyle = "#476c31";
    ctx.lineWidth = 4;
    for (let stem = -3; stem <= 3; stem += 1) {
      const angle = stem * 0.19;
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(stem * 3, -82, stem * 10, -190);
      ctx.stroke();
      for (let i = 0; i < 12; i += 1) {
        const y = -20 - i * 14;
        const width = 17 - i * 0.75;
        for (const side of [-1, 1]) {
          ctx.fillStyle = i % 2 === 0 ? "#6f994f" : "#537b3b";
          ctx.beginPath();
          ctx.ellipse(side * width * 0.55, y, width, 4.5, side * -0.52, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }, { repeat: [1, 1] });
}

function createRockTexture(): THREE.CanvasTexture {
  return createTexture("rock", 256, (ctx, random) => {
    paintNoise(ctx, random, 256, ["#73786d", "#8f9286", "#575c54", "#a2a191"]);
    for (let i = 0; i < 80; i += 1) {
      ctx.strokeStyle = withAlpha("#2f332f", 0.17);
      ctx.lineWidth = 1 + random() * 3;
      ctx.beginPath();
      ctx.moveTo(random() * 256, random() * 256);
      ctx.lineTo(random() * 256, random() * 256);
      ctx.stroke();
    }
  }, { repeat: [2, 2] });
}

function createWaterTexture(): THREE.CanvasTexture {
  return createTexture("water", 256, (ctx, random) => {
    paintNoise(ctx, random, 256, ["#1f5b59", "#2f7771", "#163f42", "#4a8f86"]);
    for (let y = 10; y < 256; y += 17) {
      ctx.strokeStyle = withAlpha("#c8ded4", 0.14);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y + random() * 5);
      ctx.bezierCurveTo(72, y - 8, 144, y + 8, 256, y + random() * 5);
      ctx.stroke();
    }
  }, { repeat: [4, 4] });
}

function createTexture(
  name: string,
  size: number,
  paint: (ctx: CanvasRenderingContext2D, random: () => number) => void,
  options: TextureOptions = {},
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error(`Unable to create ${name} texture canvas`);
  }

  paint(ctx, createRandom(hashString(name)));
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `${name}-generated`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...(options.repeat ?? [1, 1]));
  texture.colorSpace = options.colorSpace ?? THREE.SRGBColorSpace;
  texture.anisotropy = options.anisotropy ?? 4;
  texture.needsUpdate = true;
  return texture;
}

function paintNoise(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  size: number,
  palette: string[],
): void {
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const color = new THREE.Color(palette[Math.floor(random() * palette.length)]);
    const shade = 0.74 + random() * 0.38;
    data[i] = Math.min(255, color.r * 255 * shade);
    data[i + 1] = Math.min(255, color.g * 255 * shade);
    data[i + 2] = Math.min(255, color.b * 255 * shade);
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

function withAlpha(hex: string, alpha: number): string {
  const color = new THREE.Color(hex);
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
