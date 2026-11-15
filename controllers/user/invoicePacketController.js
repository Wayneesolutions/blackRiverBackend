// Invoice packet: the invoice PDF followed by the trip's POD and border manifest, as ONE PDF.
//
// Accounts can't get paid with the invoice alone: the customer / factor also needs the proof of
// delivery and the border crossing manifest the driver uploaded at the end of the trip.
// The invoice PDF is drawn in the browser (same as the normal download) and posted here; the
// server adds the documents because it can read them from S3 directly (a browser fetch of S3
// files is blocked by CORS).

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import axios from "axios";
import { Invoice } from "../../models/hr/invoiceModel.js";
import Order from "../../models/orderModel.js";
import Trip from "../../models/tripModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

const POD_TYPES = ["pod", "proof_of_delivery"];
const MANIFEST_TYPES = ["manifest", "border_manifest", "stamped_manifest", "printed_manifest"];
const BOL_TYPES = ["bol"];

const baseUrl = (u) => String(u || "").split("?")[0];
const extOf = (s) => String(s || "").split("?")[0].split(".").pop().toLowerCase();

/** Reads a stored file (S3 URL or any http URL) into a Buffer. */
const readStoredFile = async (fileUrl) => {
  const clean = baseUrl(fileUrl);
  if (/amazonaws\.com/.test(clean)) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { s3 } = await import("../../config/awsConfig.js");
    const url = new URL(clean);
    let bucket = process.env.AWS_S3_BUCKET_NAME;
    let key = decodeURIComponent(url.pathname.substring(1));
    if (url.hostname.includes(".s3.") || url.hostname.endsWith(".s3.amazonaws.com")) {
      bucket = url.hostname.split(".s3")[0];
    } else if (url.hostname === "s3.amazonaws.com" || url.hostname.startsWith("s3.") || url.hostname.startsWith("s3-")) {
      const parts = url.pathname.split("/").filter(Boolean);
      bucket = parts[0];
      key = parts.slice(1).map((p) => decodeURIComponent(p)).join("/");
    }
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks = [];
    for await (const chunk of out.Body) chunks.push(chunk);
    return { buffer: Buffer.concat(chunks), contentType: out.ContentType || "" };
  }
  const res = await axios.get(clean, { responseType: "arraybuffer", timeout: 30000 });
  return { buffer: Buffer.from(res.data), contentType: res.headers["content-type"] || "" };
};

/** POD / manifest (and BOL) of the invoice's order and its trips, oldest first, no duplicates. */
export const collectTripDocuments = async (order) => {
  const docs = [];
  const seen = new Set();
  const add = (url, kind, name, uploadedAt) => {
    const key = baseUrl(url);
    if (!url || seen.has(key)) return;
    seen.add(key);
    docs.push({ url, kind, name: name || key.split("/").pop(), uploadedAt: uploadedAt ? new Date(uploadedAt) : null });
  };
  const kindOf = (type) => {
    const t = String(type || "").toLowerCase();
    if (POD_TYPES.includes(t)) return "POD";
    if (MANIFEST_TYPES.includes(t)) return "Manifest";
    if (BOL_TYPES.includes(t)) return "BOL";
    return null;
  };

  for (const a of order.attachments || []) {
    const kind = kindOf(a.type);
    if (kind) add(a.url, kind, a.name, a.uploadedAt);
  }
  const d = order.documents || {};
  add(d.pod, "POD");
  add(d.stampedManifest, "Manifest");
  add(d.printedManifest, "Manifest");
  add(d.bol, "BOL");

  // Documents attached to the trip(s) this order is on
  const trips = await Trip.find({ orders: order._id, status: { $ne: "cancelled" } }).select("documents").lean();
  for (const trip of trips) {
    for (const doc of trip.documents || []) {
      const kind = kindOf(doc.type);
      if (kind) add(doc.fileUrl, kind, doc.fileName, doc.uploadedAt);
    }
  }

  const order_ = { POD: 0, Manifest: 1, BOL: 2 };
  return docs.sort((a, b) => order_[a.kind] - order_[b.kind]);
};

const loadInvoiceAndOrder = async (req) => {
  // Returns { invoice, order } or { error: [status, message] }
  const query = { _id: req.params.id };
  const companyId = getUserCompanyId(req.user);
  if (req.user?.role !== "superadmin" && companyId) query.company = companyId;
  const invoice = await Invoice.findOne(query).lean();
  if (!invoice) return { error: [404, "Invoice not found"] };
  if (!invoice.orderId) return { invoice, order: null };
  const order = await Order.findById(invoice.orderId).select("attachments documents orderNumber").lean();
  return { invoice, order };
};

// GET /hr/invoice/:id/documents — which POD / manifest / BOL files the packet will include
export const listInvoiceDocuments = async (req, res) => {
  try {
    const { error, order } = await loadInvoiceAndOrder(req);
    if (error) return res.status(error[0]).json({ success: false, message: error[1] });
    const docs = order ? await collectTripDocuments(order) : [];
    res.json({
      success: true,
      data: docs.map((d) => ({ kind: d.kind, name: d.name, uploadedAt: d.uploadedAt })),
      hasPod: docs.some((d) => d.kind === "POD"),
      hasManifest: docs.some((d) => d.kind === "Manifest"),
    });
  } catch (err) {
    console.error("List invoice documents error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/** Invoice PDF + the trip's documents -> { bytes, fileName, notes } */
const assemblePacket = async (invoicePdf, order, invoiceId) => {
    const packet = await PDFDocument.load(invoicePdf);
    const font = await packet.embedFont(StandardFonts.Helvetica);
    const bold = await packet.embedFont(StandardFonts.HelveticaBold);
    const skipped = [];
    const docs = order ? await collectTripDocuments(order) : [];

    for (const doc of docs) {
      try {
        const { buffer, contentType } = await readStoredFile(doc.url);
        const ext = extOf(doc.name) || extOf(doc.url);
        const isPdf = contentType.includes("pdf") || ext === "pdf" || buffer.slice(0, 4).toString() === "%PDF";
        if (isPdf) {
          const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
          const pages = await packet.copyPages(src, src.getPageIndices());
          pages.forEach((p) => packet.addPage(p));
          continue;
        }
        const isPng = contentType.includes("png") || ext === "png" || buffer.slice(1, 4).toString() === "PNG";
        const isJpg = contentType.includes("jpeg") || contentType.includes("jpg") || ["jpg", "jpeg"].includes(ext) ||
          (buffer[0] === 0xff && buffer[1] === 0xd8);
        if (!isPng && !isJpg) {
          skipped.push(`${doc.kind}: ${doc.name} (format not supported in the packet, ${contentType || ext})`);
          continue;
        }
        const img = isPng ? await packet.embedPng(buffer) : await packet.embedJpg(buffer);
        // Letter page, photo scaled to fit under a small label
        const page = packet.addPage([612, 792]);
        const margin = 30;
        const top = 792 - margin;
        page.drawText(`${doc.kind} - ${doc.name}`.slice(0, 90), { x: margin, y: top - 10, size: 10, font: bold, color: rgb(0.2, 0.2, 0.2) });
        const maxW = 612 - margin * 2;
        const maxH = 792 - margin * 2 - 24;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1.5);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, { x: (612 - w) / 2, y: top - 24 - h, width: w, height: h });
      } catch (fileErr) {
        console.error(`Invoice packet: could not add ${doc.url}:`, fileErr.message);
        skipped.push(`${doc.kind}: ${doc.name} (could not be read)`);
      }
    }

    // Say what is missing instead of silently sending an incomplete packet
    const missing = [];
    if (!docs.some((d) => d.kind === "POD")) missing.push("No POD (proof of delivery) uploaded for this trip.");
    if (!docs.some((d) => d.kind === "Manifest")) missing.push("No border manifest uploaded for this trip.");
    if (missing.length || skipped.length) {
      const page = packet.addPage([612, 792]);
      let y = 740;
      page.drawText("Supporting documents - notes", { x: 40, y, size: 14, font: bold });
      for (const line of [...missing, ...skipped]) {
        y -= 22;
        page.drawText(line.slice(0, 110), { x: 40, y, size: 10, font });
      }
    }

    const bytes = await packet.save();
    const fileName = `Invoice_${order?.orderNumber || String(invoiceId).slice(-8)}_with_POD_Manifest.pdf`;
    return { bytes, fileName, docsCount: docs.length, notes: [...missing, ...skipped] };
};

// POST /hr/invoice/:id/packet (multipart: invoicePdf) -> one PDF: invoice + POD + manifest (+ BOL)
export const buildInvoicePacket = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: "Invoice PDF missing" });
    }
    const { error, order } = await loadInvoiceAndOrder(req);
    if (error) return res.status(error[0]).json({ success: false, message: error[1] });
    const { bytes, fileName, docsCount, notes } = await assemblePacket(req.file.buffer, order, req.params.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("X-Packet-Documents", String(docsCount));
    res.setHeader("X-Packet-Missing", encodeURIComponent(notes.join(" | ")));
    res.setHeader("Access-Control-Expose-Headers", "X-Packet-Documents, X-Packet-Missing, Content-Disposition");
    res.send(Buffer.from(bytes));
  } catch (err) {
    console.error("Invoice packet error:", err);
    res.status(500).json({ success: false, message: err.message || "Could not build the invoice packet" });
  }
};

// POST /hr/invoice/:id/email-packet (multipart: invoicePdf, optional "to")
// Emails the invoice with the POD and border manifest attached (one PDF).
export const emailInvoicePacket = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: "Invoice PDF missing" });
    }
    const { error, invoice, order } = await loadInvoiceAndOrder(req);
    if (error) return res.status(error[0]).json({ success: false, message: error[1] });
    const to = String(req.body?.to || invoice.clientEmail || "").trim();
    if (!to) {
      return res.status(400).json({ success: false, message: "This invoice has no customer email. Add one or enter an address." });
    }
    const { bytes, fileName, notes } = await assemblePacket(req.file.buffer, order, req.params.id);
    const { sendInvoiceEmail } = await import("../../services/emailService.js");
    const { CompanySettings } = await import("../../models/driver/companysettingsModel.js");
    const companyData = invoice.company ? await CompanySettings.findById(invoice.company).lean() : null;
    const result = await sendInvoiceEmail({
      customerEmail: to,
      customerName: invoice.clientName,
      invoiceId: String(invoice._id),
      invoiceNumber: order?.orderNumber || String(invoice._id).slice(-8).toUpperCase(),
      amount: invoice.amount,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      paymentTerms: invoice.paymentTerms,
      invoiceUrl: invoice.invoiceUrl,
      companyData,
      pdfBase64: Buffer.from(bytes).toString("base64"),
      pdfFileName: fileName,
    });
    if (!result?.success) {
      return res.status(502).json({ success: false, message: result?.message || result?.error || "Email could not be sent" });
    }
    res.json({
      success: true,
      message: `Invoice with POD & Manifest emailed to ${to}`,
      notes,
    });
  } catch (err) {
    console.error("Email invoice packet error:", err);
    res.status(500).json({ success: false, message: err.message || "Could not email the invoice" });
  }
};

// GET / PUT /hr/invoice-settings — default notes printed on every invoice without its own notes
// (e.g. the factoring company's Notice of Assignment)
export const getInvoiceSettings = async (req, res) => {
  try {
    const { CompanySettings } = await import("../../models/driver/companysettingsModel.js");
    const companyId = getUserCompanyId(req.user);
    if (!companyId) return res.json({ success: true, data: { invoiceNotes: "" } });
    const company = await CompanySettings.findById(companyId).select("invoiceNotes").lean();
    res.json({ success: true, data: { invoiceNotes: company?.invoiceNotes || "" } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateInvoiceSettings = async (req, res) => {
  try {
    const { CompanySettings } = await import("../../models/driver/companysettingsModel.js");
    const companyId = getUserCompanyId(req.user);
    if (!companyId) return res.status(400).json({ success: false, message: "Please complete company settings first." });
    const invoiceNotes = String(req.body?.invoiceNotes ?? "").slice(0, 2000);
    const company = await CompanySettings.findByIdAndUpdate(companyId, { $set: { invoiceNotes } }, { new: true }).select("invoiceNotes").lean();
    if (!company) return res.status(404).json({ success: false, message: "Company settings not found" });
    res.json({ success: true, message: "Default invoice notes saved", data: { invoiceNotes: company.invoiceNotes } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
