import type { Incident, HLCase } from "../types";

function pad(n: number) { return String(n).padStart(2, "0"); }

function formatDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function cleanText(text: string, maxLen = 1000): string {
  return text.replace(/[^\x20-\x7E\n\r]/g, "").slice(0, maxLen);
}

function drawPage(ctx: CanvasRenderingContext2D, lines: string[], startY: number, pageH: number, margin: number, lineH: number): { y: number; pages: ImageData[] } {
  const pages: ImageData[] = [];
  let y = startY;

  for (const line of lines) {
    if (y + lineH > pageH - margin) {
      pages.push(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      y = margin;
    }
    if (line.startsWith("##BOLD##")) {
      ctx.font = "bold 16px Arial";
      ctx.fillStyle = "#000000";
      ctx.fillText(line.replace("##BOLD##", ""), margin, y);
      ctx.font = "14px Arial";
    } else if (line.startsWith("##H1##")) {
      ctx.font = "bold 22px Arial";
      ctx.fillStyle = "#d9711f";
      ctx.fillText(line.replace("##H1##", ""), margin, y);
      ctx.font = "14px Arial";
      ctx.fillStyle = "#000000";
    } else if (line.startsWith("##GRAY##")) {
      ctx.fillStyle = "#666666";
      ctx.fillText(line.replace("##GRAY##", ""), margin, y);
      ctx.fillStyle = "#000000";
    } else if (line === "##HR##") {
      ctx.strokeStyle = "#cccccc";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin, y - lineH / 2);
      ctx.lineTo(ctx.canvas.width - margin, y - lineH / 2);
      ctx.stroke();
    } else {
      ctx.fillText(line, margin, y);
    }
    y += lineH;
  }

  return { y, pages };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split("\n");
  const wrapped: string[] = [];
  for (const para of paragraphs) {
    if (!para.trim()) { wrapped.push(""); continue; }
    const words = para.split(" ");
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        wrapped.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) wrapped.push(current);
  }
  return wrapped;
}

export async function exportIncidentPDF(incident: Incident) {
  const { default: jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 60;
  const pageW = 612;
  const pageH = 792;
  const maxW = pageW - margin * 2;
  let y = margin;

  function addLine(text: string, opts?: { bold?: boolean; color?: string; size?: number; skip?: number }) {
    const size = opts?.size ?? 11;
    doc.setFontSize(size);
    if (opts?.bold) doc.setFont("helvetica", "bold");
    else doc.setFont("helvetica", "normal");
    if (opts?.color) doc.setTextColor(opts.color);
    else doc.setTextColor("#111111");

    const lines = doc.splitTextToSize(text, maxW);
    for (const line of lines) {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += size * 1.5;
    }
    y += opts?.skip ?? 0;
  }

  function hr() {
    if (y > pageH - margin) { doc.addPage(); y = margin; }
    doc.setDrawColor("#cccccc");
    doc.line(margin, y, pageW - margin, y);
    y += 12;
  }

  doc.setTextColor("#d9711f");
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("HyperLaw", margin, y);
  y += 14;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#666666");
  doc.text("Incident Report", margin, y);
  y += 6;
  doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, margin, y);
  y += 20;
  hr();

  addLine(cleanText(incident.title), { bold: true, size: 18, color: "#000000", skip: 4 });

  const meta: string[] = [];
  if (incident.category) meta.push(`Category: ${incident.category}`);
  if (incident.dateOfEvent) meta.push(`Date: ${incident.dateOfEvent}`);
  if (incident.location) meta.push(`Location: ${incident.location}`);
  meta.push(`Recorded: ${formatDate(incident.createdAt)}`);
  addLine(meta.join("   ·   "), { color: "#666666", size: 10, skip: 12 });
  hr();

  addLine("DESCRIPTION", { bold: true, size: 10, color: "#d9711f", skip: 4 });
  addLine(cleanText(incident.description, 8000), { size: 11, skip: 0 });

  doc.save(`hyperlaw-incident-${incident.id.slice(0, 8)}.pdf`);
}

export async function exportCasePDF(hlCase: HLCase, incidents: Incident[]) {
  const { default: jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 60;
  const pageW = 612;
  const pageH = 792;
  const maxW = pageW - margin * 2;
  let y = margin;

  function addLine(text: string, opts?: { bold?: boolean; color?: string; size?: number; skip?: number; indent?: number }) {
    const size = opts?.size ?? 11;
    const x = margin + (opts?.indent ?? 0);
    doc.setFontSize(size);
    if (opts?.bold) doc.setFont("helvetica", "bold");
    else doc.setFont("helvetica", "normal");
    if (opts?.color) doc.setTextColor(opts.color);
    else doc.setTextColor("#111111");

    const lines = doc.splitTextToSize(text, maxW - (opts?.indent ?? 0));
    for (const line of lines) {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(line, x, y);
      y += size * 1.5;
    }
    y += opts?.skip ?? 0;
  }

  function hr() {
    if (y > pageH - margin) { doc.addPage(); y = margin; }
    doc.setDrawColor("#cccccc");
    doc.line(margin, y, pageW - margin, y);
    y += 12;
  }

  doc.setTextColor("#d9711f");
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("HyperLaw", margin, y);
  y += 14;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#666666");
  doc.text("Case Report", margin, y);
  y += 6;
  doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, margin, y);
  y += 20;
  hr();

  addLine(cleanText(hlCase.title), { bold: true, size: 18, color: "#000000", skip: 4 });
  addLine(`Status: ${hlCase.status}   ·   Incidents: ${hlCase.incidentIds.length}   ·   Created: ${formatDate(hlCase.createdAt)}`, { color: "#666666", size: 10, skip: 12 });
  hr();

  if (hlCase.notes?.trim()) {
    addLine("CASE NOTES", { bold: true, size: 10, color: "#d9711f", skip: 4 });
    addLine(cleanText(hlCase.notes, 4000), { size: 11, skip: 16 });
    hr();
  }

  const caseIncidents = incidents.filter(i => hlCase.incidentIds.includes(i.id));
  if (caseIncidents.length > 0) {
    addLine("INCIDENTS", { bold: true, size: 10, color: "#d9711f", skip: 8 });
    for (let idx = 0; idx < caseIncidents.length; idx++) {
      const inc = caseIncidents[idx];
      addLine(`${idx + 1}. ${cleanText(inc.title)}`, { bold: true, size: 12, skip: 2 });
      const meta: string[] = [];
      if (inc.category) meta.push(inc.category);
      if (inc.dateOfEvent) meta.push(inc.dateOfEvent);
      if (inc.location) meta.push(inc.location);
      if (meta.length) addLine(meta.join("   ·   "), { color: "#666666", size: 10, skip: 4, indent: 16 });
      addLine(cleanText(inc.description, 2000), { size: 11, skip: 12, indent: 16 });
      if (idx < caseIncidents.length - 1) hr();
    }
  }

  doc.save(`hyperlaw-case-${hlCase.id.slice(0, 8)}.pdf`);
}
