const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const AVATAR_SIZE = 512;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nao foi possivel abrir a foto."));
    image.src = source;
  });
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Nao foi possivel ler a foto."));
    reader.readAsDataURL(file);
  });
}

export async function prepareAvatar(file: File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Escolha uma foto JPG, PNG ou WebP.");
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("A foto original deve ter no maximo 8 MB.");
  }

  const source = await readFile(file);
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Seu navegador nao conseguiu preparar a foto.");
  }

  const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - cropSize) / 2;
  const sourceY = (image.naturalHeight - cropSize) / 2;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE
  );

  return canvas.toDataURL("image/jpeg", 0.82);
}
