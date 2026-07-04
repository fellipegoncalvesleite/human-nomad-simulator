/**
 * Export helpers for the Architecture Map.
 *
 * - exportSvgToPng: rasterizes the current SVG view to a PNG download.
 * - downloadGraphJson: downloads the full architecture graph as JSON.
 *
 * PDF: browsers can "Save as PDF" from the print dialog, so the page exposes a
 * Print / PDF button that calls window.print() with a print stylesheet. A
 * heavier vector-PDF dependency (jsPDF + svg2pdf) is the recommended upgrade if
 * a true downloadable PDF file is required — see the report.
 */

const EXPORT_BACKGROUND = "#0a0e0d";

function triggerDownload(href: string, fileName: string): void {
  const link = document.createElement("a");

  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Rasterizes an SVG element to a PNG and triggers a download. Resolves once the
 * image has been drawn, or rejects if the browser cannot rasterize the SVG.
 */
export function exportSvgToPng(
  svg: SVGSVGElement,
  fileName: string,
  scale = 2,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bounds = svg.viewBox.baseVal;
    const width = bounds.width || svg.clientWidth || 1600;
    const height = bounds.height || svg.clientHeight || 1000;

    const clone = svg.cloneNode(true) as SVGSVGElement;

    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    const serialized = new XMLSerializer().serializeToString(clone);
    const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;

    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");

      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);

      const context = canvas.getContext("2d");

      if (context === null) {
        reject(new Error("Canvas 2D context unavailable for PNG export."));

        return;
      }

      context.fillStyle = EXPORT_BACKGROUND;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      triggerDownload(canvas.toDataURL("image/png"), fileName);
      resolve();
    };

    image.onerror = () => {
      reject(new Error("Failed to rasterize the architecture SVG for PNG export."));
    };

    image.src = source;
  });
}

/** Downloads the architecture graph data as a formatted JSON file. */
export function downloadGraphJson(graph: unknown, fileName: string): void {
  const json = JSON.stringify(graph, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  triggerDownload(url, fileName);
  URL.revokeObjectURL(url);
}
