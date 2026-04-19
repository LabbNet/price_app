const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const CONTRACTS_DIR = process.env.CONTRACTS_DIR
  || path.join(__dirname, '..', 'data', 'contracts');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Render a finalized contract to PDF and write it to disk.
 *
 *   contract: the contracts row (needs id, rendered_body, pricing_snapshot)
 *   clinic, client, bucket: loaded entities for the header
 *   clientSignature: { signer_name, signer_title, signer_email, signed_at, ip_address }
 *   labbSignature:   same shape
 *
 * Returns the absolute file path. On failure, throws.
 */
async function renderContractPdf({
  contract,
  clinic,
  client,
  bucket,
  clientSignature,
  labbSignature,
}) {
  ensureDir(CONTRACTS_DIR);
  const filePath = path.join(CONTRACTS_DIR, `${contract.id}.pdf`);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 56 });
      const stream = fs.createWriteStream(filePath);
      stream.on('finish', () => resolve(filePath));
      stream.on('error', reject);
      doc.pipe(stream);

      // Header
      doc.fontSize(18).font('Helvetica-Bold').text('Labb Pricing Agreement', { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor('#555');
      doc.text(`Contract ID: ${contract.id}`);
      if (bucket?.name) doc.text(`Bucket: ${bucket.name}`);
      doc.text(`Generated: ${new Date().toLocaleString()}`);
      doc.moveDown();

      // Parties
      doc.fillColor('black').fontSize(12).font('Helvetica-Bold').text('Parties');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Client: ${client?.legal_name || client?.name || ''}`);
      doc.text(`Clinic: ${clinic?.legal_name || clinic?.name || ''}`);
      if (clinic?.ein) doc.text(`Clinic EIN: ${clinic.ein}`);
      doc.moveDown();

      // Body — split paragraphs on double-newlines, handle the pricing table
      // block inline where it appears.
      const body = String(contract.rendered_body || '');
      const blocks = body.split(/\n{2,}/);
      for (const block of blocks) {
        if (/^\s*Product\s+/.test(block) && block.includes('$')) {
          // pre-rendered monospaced price table
          doc.font('Courier').fontSize(9).text(block, { lineGap: 1 });
          doc.font('Helvetica').fontSize(10);
        } else {
          doc.font('Helvetica').fontSize(10).text(block, { align: 'left' });
        }
        doc.moveDown(0.5);
      }

      // Pricing snapshot (always included, even if body also embedded it)
      const snap = Array.isArray(contract.pricing_snapshot) ? contract.pricing_snapshot : [];
      if (snap.length > 0) {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(14).text('Pricing Schedule');
        doc.moveDown(0.5);
        renderPriceTable(doc, snap);
      }

      // Signatures
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(14).text('Signatures');
      doc.moveDown(0.5);
      renderSignatureBlock(doc, 'Client', clientSignature);
      doc.moveDown();
      renderSignatureBlock(doc, 'Labb', labbSignature);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function renderSignatureBlock(doc, label, sig) {
  doc.font('Helvetica-Bold').fontSize(11).text(label);
  doc.font('Helvetica').fontSize(10);
  if (!sig) {
    doc.fillColor('#888').text('(not signed)').fillColor('black');
    return;
  }
  doc.text(`Name:   ${sig.signer_name}`);
  if (sig.signer_title) doc.text(`Title:  ${sig.signer_title}`);
  doc.text(`Email:  ${sig.signer_email}`);
  doc.text(`Date:   ${new Date(sig.signed_at).toLocaleString()}`);
  if (sig.ip_address) doc.text(`IP:     ${sig.ip_address}`, { continued: false });
}

function renderPriceTable(doc, rows) {
  const cols = [
    { key: 'product_name', label: 'Product', width: 220 },
    { key: 'unit_of_measure', label: 'UoM', width: 70 },
    { key: 'unit_price', label: 'Unit Price', width: 80, num: true },
    { key: 'total_price', label: 'Total', width: 80, num: true },
    { key: 'source', label: 'Source', width: 60 },
  ];
  const startX = doc.x;
  let y = doc.y;

  doc.font('Helvetica-Bold').fontSize(9);
  let x = startX;
  for (const c of cols) {
    doc.text(c.label, x, y, { width: c.width });
    x += c.width;
  }
  y += 14;
  doc.moveTo(startX, y - 3).lineTo(startX + cols.reduce((s, c) => s + c.width, 0), y - 3).stroke();

  doc.font('Helvetica').fontSize(9);
  for (const r of rows) {
    if (y > 720) { doc.addPage(); y = doc.y; }
    let cx = startX;
    for (const c of cols) {
      let v;
      if (c.key === 'unit_price') v = `$${Number(r.unit_price).toFixed(4)}`;
      else if (c.key === 'total_price') v = r.total_price != null ? `$${Number(r.total_price).toFixed(4)}` : '—';
      else v = String(r[c.key] ?? '');
      doc.text(v, cx, y, { width: c.width });
      cx += c.width;
    }
    y += 14;
  }
  doc.y = y + 6;
}

function pdfPathFor(contractId) {
  return path.join(CONTRACTS_DIR, `${contractId}.pdf`);
}

module.exports = { renderContractPdf, pdfPathFor, CONTRACTS_DIR };
