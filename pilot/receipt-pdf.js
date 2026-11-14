async function createReceiptPDF(photos) {
  if (!photos.length) throw new Error('Add at least one receipt photo.');

  const parts = [];
  const offsets = [0];
  let position = 0;
  const encoder = new TextEncoder();

  function append(part) {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    parts.push(bytes);
    position += bytes.byteLength;
  }

  function startObject(number) {
    offsets[number] = position;
    append(number + ' 0 obj\n');
  }

  append('%PDF-1.4\n');
  startObject(1);
  append('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObject(2);
  const pageRefs = photos.map((_, index) => (3 + index * 3) + ' 0 R').join(' ');
  append(`<< /Type /Pages /Count ${photos.length} /Kids [${pageRefs}] >>\nendobj\n`);

  for (const [index, photo] of photos.entries()) {
    const { bytes, width, height } = await encodeReceiptPhoto(photo);
    const page = 3 + index * 3;
    const scale = 792 / Math.max(width, height);
    const pageWidth = (width * scale).toFixed(3);
    const pageHeight = (height * scale).toFixed(3);

    startObject(page);
    append(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Photo ${page + 1} 0 R >> >> /Contents ${page + 2} 0 R >>\nendobj\n`);
    startObject(page + 1);
    append(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.byteLength} >>\nstream\n`);
    append(bytes);
    append('\nendstream\nendobj\n');

    const commands = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Photo Do\nQ\n`;
    startObject(page + 2);
    append(`<< /Length ${commands.length} >>\nstream\n${commands}endstream\nendobj\n`);
  }

  const xref = position;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) {
    append(String(offset).padStart(10, '0') + ' 00000 n \n');
  }
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

async function encodeReceiptPhoto(photo) {
  const url = URL.createObjectURL(photo);
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.84));
    if (!jpeg || jpeg.type !== 'image/jpeg') throw new Error('Could not convert a receipt photo.');
    return { bytes: new Uint8Array(await jpeg.arrayBuffer()), width, height };
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}
