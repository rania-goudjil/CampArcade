"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { CAMP_ARCADE_GAMES } = require("../arcade-config.js");

const VERSION = 4;
const SIZE = 17 + VERSION * 4;
const DATA_CODEWORDS = 80;
const ECC_CODEWORDS = 20;
const MASK_PATTERN = 0;
const OUTPUT_DIR = path.join(__dirname, "..", "winning-qr-codes");

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function qrValueFor(game) {
  const publicSiteUrl = process.env.PUBLIC_SITE_URL;
  if (!publicSiteUrl) {
    return game.qrPath;
  }
  return new URL(game.qrPath, publicSiteUrl).toString();
}

function appendBits(bits, value, length) {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push((value >>> index) & 1);
  }
}

function makeDataCodewords(text) {
  const bytes = Array.from(Buffer.from(text, "utf8"));
  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  bytes.forEach((byte) => appendBits(bits, byte, 8));

  const capacityBits = DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));

  while (bits.length % 8) {
    bits.push(0);
  }

  const data = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset += 1) {
      byte = (byte << 1) | bits[index + offset];
    }
    data.push(byte);
  }

  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (data.length < DATA_CODEWORDS) {
    data.push(padBytes[padIndex % 2]);
    padIndex += 1;
  }

  if (data.length > DATA_CODEWORDS) {
    throw new Error(`QR value is too long for version ${VERSION}: ${text}`);
  }

  return data;
}

const EXP = new Array(512);
const LOG = new Array(256);
let gfValue = 1;
for (let index = 0; index < 255; index += 1) {
  EXP[index] = gfValue;
  LOG[gfValue] = index;
  gfValue <<= 1;
  if (gfValue & 0x100) {
    gfValue ^= 0x11d;
  }
}
for (let index = 255; index < 512; index += 1) {
  EXP[index] = EXP[index - 255];
}

function gfMultiply(left, right) {
  if (!left || !right) {
    return 0;
  }
  return EXP[LOG[left] + LOG[right]];
}

function polynomialMultiply(left, right) {
  const result = new Array(left.length + right.length - 1).fill(0);
  left.forEach((leftCoefficient, leftIndex) => {
    right.forEach((rightCoefficient, rightIndex) => {
      result[leftIndex + rightIndex] ^= gfMultiply(leftCoefficient, rightCoefficient);
    });
  });
  return result;
}

function reedSolomonGenerator(degree) {
  let generator = [1];
  for (let index = 0; index < degree; index += 1) {
    generator = polynomialMultiply(generator, [1, EXP[index]]);
  }
  return generator;
}

function reedSolomonRemainder(data, degree) {
  const generator = reedSolomonGenerator(degree);
  const result = data.concat(new Array(degree).fill(0));

  for (let index = 0; index < data.length; index += 1) {
    const coefficient = result[index];
    if (!coefficient) {
      continue;
    }

    generator.forEach((generatorCoefficient, generatorIndex) => {
      result[index + generatorIndex] ^= gfMultiply(generatorCoefficient, coefficient);
    });
  }

  return result.slice(data.length);
}

function setFunctionModule(matrix, reserved, x, y, dark) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
    return;
  }
  matrix[y][x] = Boolean(dark);
  reserved[y][x] = true;
}

function drawFinder(matrix, reserved, left, top) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const x = left + dx;
      const y = top + dy;
      const inFinder = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const dark =
        inFinder &&
        (dx === 0 ||
          dx === 6 ||
          dy === 0 ||
          dy === 6 ||
          (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setFunctionModule(matrix, reserved, x, y, dark);
    }
  }
}

function drawAlignment(matrix, reserved, centerX, centerY) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(matrix, reserved, centerX + dx, centerY + dy, distance !== 1);
    }
  }
}

function getFormatBits() {
  const errorCorrectionLevelL = 1;
  const data = (errorCorrectionLevelL << 3) | MASK_PATTERN;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function getBit(value, index) {
  return ((value >>> index) & 1) !== 0;
}

function drawFormatBits(matrix, reserved) {
  const bits = getFormatBits();

  for (let index = 0; index <= 5; index += 1) {
    setFunctionModule(matrix, reserved, 8, index, getBit(bits, index));
  }
  setFunctionModule(matrix, reserved, 8, 7, getBit(bits, 6));
  setFunctionModule(matrix, reserved, 8, 8, getBit(bits, 7));
  setFunctionModule(matrix, reserved, 7, 8, getBit(bits, 8));

  for (let index = 9; index < 15; index += 1) {
    setFunctionModule(matrix, reserved, 14 - index, 8, getBit(bits, index));
  }

  for (let index = 0; index < 8; index += 1) {
    setFunctionModule(matrix, reserved, SIZE - 1 - index, 8, getBit(bits, index));
  }

  for (let index = 8; index < 15; index += 1) {
    setFunctionModule(matrix, reserved, 8, SIZE - 15 + index, getBit(bits, index));
  }

  setFunctionModule(matrix, reserved, 8, SIZE - 8, true);
}

function mask(x, y) {
  return (x + y) % 2 === 0;
}

function makeQrMatrix(text) {
  const matrix = Array.from({ length: SIZE }, () => new Array(SIZE).fill(false));
  const reserved = Array.from({ length: SIZE }, () => new Array(SIZE).fill(false));

  drawFinder(matrix, reserved, 0, 0);
  drawFinder(matrix, reserved, SIZE - 7, 0);
  drawFinder(matrix, reserved, 0, SIZE - 7);
  drawAlignment(matrix, reserved, 26, 26);

  for (let index = 8; index < SIZE - 8; index += 1) {
    const dark = index % 2 === 0;
    setFunctionModule(matrix, reserved, 6, index, dark);
    setFunctionModule(matrix, reserved, index, 6, dark);
  }

  drawFormatBits(matrix, reserved);

  const data = makeDataCodewords(text);
  const codewords = data.concat(reedSolomonRemainder(data, ECC_CODEWORDS));
  const bits = [];
  codewords.forEach((codeword) => appendBits(bits, codeword, 8));

  let bitIndex = 0;
  let upward = true;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right -= 1;
    }

    for (let vertical = 0; vertical < SIZE; vertical += 1) {
      const y = upward ? SIZE - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (reserved[y][x]) {
          continue;
        }

        let dark = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
        bitIndex += 1;
        if (mask(x, y)) {
          dark = !dark;
        }
        matrix[y][x] = dark;
      }
    }
    upward = !upward;
  }

  return matrix;
}

function matrixToSvg(matrix, label, qrValue) {
  const quietZone = 4;
  const moduleSize = 10;
  const qrSize = (SIZE + quietZone * 2) * moduleSize;
  const labelHeight = 74;
  const darkPaths = [];

  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) {
        const rectX = (x + quietZone) * moduleSize;
        const rectY = (y + quietZone) * moduleSize;
        darkPaths.push(`M${rectX} ${rectY}h${moduleSize}v${moduleSize}h-${moduleSize}z`);
      }
    });
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${qrSize}" height="${
    qrSize + labelHeight
  }" viewBox="0 0 ${qrSize} ${qrSize + labelHeight}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(label)} winning QR code</title>
  <desc id="desc">${escapeXml(qrValue)}</desc>
  <rect width="${qrSize}" height="${qrSize + labelHeight}" fill="#fff4dc"/>
  <rect x="0" y="0" width="${qrSize}" height="${qrSize}" fill="#ffffff"/>
  <path d="${darkPaths.join(" ")}" fill="#1b1b1b"/>
  <text x="${qrSize / 2}" y="${qrSize + 28}" text-anchor="middle" font-family="monospace" font-size="18" font-weight="700" fill="#1b1b1b">${escapeXml(
    label
  )}</text>
  <text x="${qrSize / 2}" y="${qrSize + 54}" text-anchor="middle" font-family="monospace" font-size="12" fill="#1b1b1b">${escapeXml(
    qrValue
  )}</text>
</svg>
`;
}

function makeReadme(rows) {
  return `# Winning QR Codes

These files are generated from \`arcade-config.js\`.

For local development the QR payloads use root-relative paths. Before printing production QR codes, regenerate them with:

\`\`\`bash
PUBLIC_SITE_URL=https://your-vercel-domain.vercel.app npm run generate:qr
\`\`\`

| File | Game ID | Game Name | QR Payload |
| --- | --- | --- | --- |
${rows
  .map((row) => `| ${row.fileName} | ${row.gameId} | ${row.name} | \`${row.qrValue}\` |`)
  .join("\n")}

Repeated scans of the same winning QR code are allowed. The website validates that only the 15 game IDs listed here count as wins.
`;
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const rows = CAMP_ARCADE_GAMES.map((game) => {
  const qrValue = qrValueFor(game);
  const fileName = `${game.id}.svg`;
  const svg = matrixToSvg(makeQrMatrix(qrValue), game.name, qrValue);
  fs.writeFileSync(path.join(OUTPUT_DIR, fileName), svg);
  return {
    fileName,
    gameId: game.id,
    name: game.name,
    qrValue,
  };
});

fs.writeFileSync(path.join(OUTPUT_DIR, "README.md"), makeReadme(rows));
console.log(`Generated ${rows.length} QR codes in ${path.relative(process.cwd(), OUTPUT_DIR)}`);
