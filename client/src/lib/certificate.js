import api from './api';
import logoLight from '../assets/atp-logo-light.png';

// Brand guide: https://authorstranquilitypress.com/docs#branding
const BRAND = {
  navy: '#0F1B2D',
  navyDark: '#07111D',
  gold: '#C9A84C',
  cream: '#F8F5EF',
  charcoal: '#2D3748',
  white: '#FFFFFF',
};

const PAGE_WIDTH = 210; // A4 mm
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const HEADER_HEIGHT = 30;
const FOOTER_HEIGHT = 16;
const CONTENT_TOP = HEADER_HEIGHT + 12;
const CONTENT_BOTTOM = PAGE_HEIGHT - FOOTER_HEIGHT - 6;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawHeader(doc, logoImg) {
  doc.setFillColor(BRAND.navy);
  doc.rect(0, 0, PAGE_WIDTH, HEADER_HEIGHT, 'F');
  doc.setDrawColor(BRAND.gold);
  doc.setLineWidth(0.8);
  doc.line(0, HEADER_HEIGHT, PAGE_WIDTH, HEADER_HEIGHT);

  if (logoImg) {
    const logoH = 11;
    const logoW = (logoImg.width / logoImg.height) * logoH;
    doc.addImage(logoImg, 'PNG', MARGIN, (HEADER_HEIGHT - logoH) / 2, logoW, logoH);
  }

  doc.setTextColor(BRAND.cream);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('APPROVAL CERTIFICATE', PAGE_WIDTH - MARGIN, HEADER_HEIGHT / 2 + 1.5, { align: 'right' });
}

function drawFooter(doc, pageNum, pageCount) {
  const y = PAGE_HEIGHT - FOOTER_HEIGHT;
  doc.setDrawColor(BRAND.gold);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(BRAND.charcoal);
  doc.text("Author's Tranquility Press", MARGIN, y + 6);
  doc.setTextColor('#8A93A0');
  doc.text('authorstranquilitypress.com', MARGIN, y + 10.5);

  doc.setTextColor(BRAND.charcoal);
  doc.text(`Page ${pageNum} of ${pageCount}`, PAGE_WIDTH - MARGIN, y + 8, { align: 'right' });
}

export async function exportCertificate(projectId) {
  const [{ data }, { jsPDF }, logoImg] = await Promise.all([
    api.get(`/projects/${projectId}/certificate`),
    import('jspdf'),
    loadImage(logoLight).catch(() => null),
  ]);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  doc.setFont('helvetica', 'normal');

  let y = CONTENT_TOP;

  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(BRAND.navy);
  doc.text('Approval Certificate', MARGIN, y);
  y += 9;

  doc.setDrawColor(BRAND.gold);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, MARGIN + 40, y);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(BRAND.charcoal);
  const meta = [
    ['Title', data.project.title],
    ['Author', data.project.authorName || '—'],
    ['Department', data.project.publisher || '—'],
    ['Generated', new Date(data.generatedAt).toLocaleString()],
  ];
  meta.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), MARGIN + 30, y);
    y += 6.5;
  });
  y += 5;

  const cols = [
    { label: 'Asset', x: MARGIN, w: 62 },
    { label: 'Version', x: MARGIN + 62, w: 20 },
    { label: 'Decision', x: MARGIN + 82, w: 34 },
    { label: 'Decided by', x: MARGIN + 116, w: 34 },
    { label: 'Date', x: MARGIN + 150, w: 32 },
  ];

  function drawTableHeader() {
    doc.setFillColor(BRAND.cream);
    doc.rect(MARGIN, y - 5, PAGE_WIDTH - MARGIN * 2, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(BRAND.navy);
    cols.forEach((c) => doc.text(c.label, c.x, y));
    doc.setFont('helvetica', 'normal');
    y += 7;
  }

  drawTableHeader();

  doc.setFontSize(9.5);
  for (const row of data.rows) {
    if (y > CONTENT_BOTTOM) {
      doc.addPage();
      y = CONTENT_TOP;
      drawTableHeader();
    }
    doc.setTextColor(BRAND.charcoal);
    doc.text(row.assetTitle.slice(0, 34), cols[0].x, y);
    doc.text(row.versionNumber ? `v${row.versionNumber}` : '—', cols[1].x, y);
    doc.text(row.decision.replace('_', ' '), cols[2].x, y);
    doc.text(row.decidedBy || '—', cols[3].x, y);
    doc.text(row.decidedAt ? new Date(row.decidedAt).toLocaleDateString() : '—', cols[4].x, y);
    y += 7.5;
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawHeader(doc, logoImg);
    drawFooter(doc, p, pageCount);
  }

  doc.save(`${data.project.title.replace(/[^a-z0-9]+/gi, '_')}_approval_certificate.pdf`);
}
