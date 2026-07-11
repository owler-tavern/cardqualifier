const DEFAULT = { accent: "#dfa04f", bright: "#f0bd77" };

export function accentFromPixels(pixels) {
  let weight = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const { h, s, l } = rgbToHsl(pixels[index], pixels[index + 1], pixels[index + 2]);
    if (s <= 0.15 || l < 0.12 || l > 0.9) continue;
    const w = s * s;
    weight += w;
    x += Math.cos(h * Math.PI / 180) * w;
    y += Math.sin(h * Math.PI / 180) * w;
  }
  if (weight <= 2) return DEFAULT;
  const hue = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return { accent: contrastSafe(hue, 58, 62), bright: `hsl(${Math.round(hue)} 65% 74%)` };
}

export function accentFromImage(image) {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, 32, 32);
  return accentFromPixels(context.getImageData(0, 0, 32, 32).data);
}

function contrastSafe(hue, saturation, lightness) {
  while (lightness < 90 && contrast(`hsl(${hue} ${saturation}% ${lightness}%)`, [26, 21, 17]) < 4.5) lightness += 1;
  return `hsl(${Math.round(hue)} ${saturation}% ${lightness}%)`;
}

function contrast(value, background) {
  const match = value.match(/hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)/);
  const [r, g, b] = hslToRgb(Number(match[1]), Number(match[2]) / 100, Number(match[3]) / 100);
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
  const a = lum([r, g, b]), bLum = lum(background);
  return (Math.max(a, bLum) + .05) / (Math.min(a, bLum) + .05);
}

function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min; let h = 0; if (d) h = ((max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360; return { h, s: max === min ? 0 : d / (1 - Math.abs(2 * ((max + min) / 2) - 1)), l: (max + min) / 2 }; }
function hslToRgb(h, s, l) { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; }
