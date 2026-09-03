export async function compressImage(
  imageSource: string | File,
  maxWidth: number = 1080
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }

      // Calculate aspect ratio
      const ratio = Math.min(maxWidth / img.width, 1);
      const width = img.width * ratio;
      const height = img.height * ratio;

      canvas.width = width;
      canvas.height = height;

      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to WebP with 0.8 quality
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Blob conversion failed"));
        },
        "image/webp",
        0.8
      );
    };

    img.onerror = (err) => reject(err);

    // Handle File or Base64 (from react-webcam)
    if (typeof imageSource === "string") {
      img.src = imageSource;
    } else {
      img.src = URL.createObjectURL(imageSource);
    }
  });
}