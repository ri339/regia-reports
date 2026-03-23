// ── Substitua todo o conteúdo de server.js por este ─────────────────────────
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import mammoth from 'mammoth'
import puppeteer from 'puppeteer'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

app.use(cors())
app.use(express.json({ limit: '150mb' }))
app.use('/fonts', express.static(path.join(__dirname, 'public/fonts')))
app.use(express.static(path.join(__dirname, 'dist')))

// ── Importar .docx ──────────────────────────────────────────────────────────
app.post('/api/import', upload.single('file'), async (req, res) => {
  try {
    const raw = await mammoth.extractRawText({ buffer: req.file.buffer })
    const lines = raw.value.split('\n').map(l => l.trim()).filter(Boolean)

    const sections = []
    let current = null

    for (const line of lines) {
      const isTitle =
        line.length < 120 &&
        (/
^
[A-ZÁÉÍÓÚÀÃÕÊÔÇ\s\d]{4,}
$
/.test(line) ||
         /
^
\d+[\.$|]\s/.test(line) ||
         (line.endsWith(':') && line.length < 60))

      if (isTitle && line.length > 2) {
        if (current) sections.push(current)
        current = { title: line.replace(/
^
\d+[\.$|]\s*/, ''), subtitle: '', body: '' }
      } else if (current) {
        if (!current.subtitle && current.body === '' && line.length < 140) {
          current.subtitle = line
        } else {
          current.body += (current.body ? '\n' : '') + line
        }
      } else {
        current = { title: '', subtitle: '', body: line }
      }
    }
    if (current) sections.push(current)

    const result = sections
      .filter(s => s.title || s.body)
      .map((s, i) => ({
        id: `${Date.now()}-${i}`,
        type: 'content',
        title: s.title || '',
        subtitle: s.subtitle || '',
        body: s.body || '',
        image: null,
        number: String(i + 1).padStart(2, '0'),
        headerLabel: '',
        imagePosition: 'bottom',
        layout: 'default'
      }))

    res.json({ sections: result })
  } catch (err) {
    res.status(500).json({ error: 'Erro ao processar: ' + err.message })
  }
})

// ── Gerar PDF ────────────────────────────────────────────────────────────────
app.post('/api/generate-pdf', async (req, res) => {
  const { reportData } = req.body
  const html = buildHTML(reportData)
  let browser

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 })
    await new Promise(r => setTimeout(r, 1500))

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    })

    await browser.close()
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-regia-${Date.now()}.pdf"`)
    res.send(pdf)
  } catch (err) {
    if (browser) await browser.close()
    res.status(500).json({ error: 'Erro ao gerar PDF: ' + err.message })
  }
})

// ── Utilitários ──────────────────────────────────────────────────────────────
function fmt(text) {
  if (!text) return ''
  const lines = text.split('\n').map(l => l.trim()).filter(l => l)
  let html = '', inList = false
  for (const line of lines) {
    if (/
^
[—\-•]\s/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true }
      html += `<li>${line.replace(/
^
[—\-•]\s*/, '')}</li>`
    } else {
      if (inList) { html += '</ul>'; inList = false }
      html += `<p>${line}</p>`
    }
  }
  if (inList) html += '</ul>'
  return html
}

function logo(src, name, h = 44) {
  if (src) return `<img src="${src}" style="height:${h}px;object-fit:contain;max-width:200px" alt="Logo"/>`
  return `<span style="color:rgba(255,255,255,.65);font-family:'Inter',sans-serif;font-size:16px;font-weight:300;letter-spacing:.16em;text-transform:uppercase">${name || 'RÉGIA'}</span>`
}

// ── HTML completo ────────────────────────────────────────────────────────────
function buildHTML(data) {
  const { cover, sections, backCover } = data
  const bg   = cover.backgroundColor || '#0f1923'
  const bbg  = backCover.backgroundColor || bg
  const total = sections.length + 2
  const docTitle = cover.title || 'Relatório Régia Capital'
  const font = 'http://localhost:3001/fonts'

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap');

    @font-face {
      font-family: 'PP Talisman';
      src: url('${font}/PPTalisman-Regular.woff2') format('woff2'),
           url('${font}/PPTalisman-Regular.woff') format('woff');
    }

    *, *::before, *::after { margin:0; padding:0; box-sizing:border-box }

    body {
      font-family: 'Inter', sans-serif;
      font-weight: 300;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── ESTRUTURA BASE ── */
    .page {
      width: 210mm;
      min-height: 297mm;
      position: relative;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ── CAPA ──
       Referência: ambos os relatórios
       Logo no topo, título grande em PP Talisman,
       subtítulo, linha divisória, metadados no rodapé
    ── */
    .cover {
      background: ${bg};
      padding: 52px 68px 52px;
      justify-content: space-between;
    }
    .cover-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .cover-top-right {
      font-family: 'Inter', sans-serif;
      font-weight: 300;
      font-size: 10px;
      color: rgba(255,255,255,.35);
      letter-spacing: .12em;
      text-transform: uppercase;
      text-align: right;
      line-height: 1.8;
    }
    .cover-mid { padding: 0 0 32px; }
    .cover-eyebrow {
      font-size: 10px;
      letter-spacing: .2em;
      text-transform: uppercase;
      color: rgba(255,255,255,.38);
      margin-bottom: 22px;
      font-weight: 300;
    }
    .cover-title {
      font-family: 'PP Talisman', Georgia, serif;
      font-size: 64px;
      line-height: .98;
      color: #fff;
      font-weight: normal;
      margin-bottom: 28px;
      letter-spacing: -.01em;
    }
    .cover-subtitle {
      font-size: 15px;
      color: rgba(255,255,255,.55);
      line-height: 1.65;
      font-weight: 300;
    }
    .cover-rule {
      width: 40px;
      height: 1px;
      background: rgba(255,255,255,.2);
      margin: 26px 0;
    }
    .cover-meta {
      font-size: 11px;
      color: rgba(255,255,255,.32);
      letter-spacing: .06em;
      line-height: 2.1;
      text-transform: uppercase;
    }

    /* ── CABEÇALHO DE PÁGINA ──
       Referência: todas as páginas internas
       Logo + linha horizontal + label da seção
    ── */
    .hdr {
      padding: 22px 68px 0;
      display: flex;
      align-items: center;
      gap: 18px;
      height: 60px;
      flex-shrink: 0;
    }
    .hdr-logo { height: 23px; object-fit: contain; flex-shrink: 0; }
    .hdr-line { flex: 1; height: 1px; background: #e8e8e5; }
    .hdr-label {
      font-size: 9px;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: #c2c0bb;
      flex-shrink: 0;
    }

    /* ── RODAPÉ DE PÁGINA ──
       Referência: "Política Antidesmatamento 4" / "Climate and Biodiversity Report 2024 6"
       Nome do documento à esquerda, número à direita
    ── */
    .ftr {
      height: 42px;
      padding: 0 68px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid #f0f0ee;
      flex-shrink: 0;
      margin-top: auto;
    }
    .ftr span {
      font-size: 9px;
      color: #ccc;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    /* ── CONTEÚDO PADRÃO ── */
    .content-page { background: #fff; }
    .body { flex: 1; padding: 38px 68px 24px; overflow: hidden; }
    .s-num {
      font-size: 10px;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: #c8c5bf;
      margin-bottom: 16px;
      font-weight: 300;
    }
    .s-title {
      font-family: 'PP Talisman', Georgia, serif;
      font-size: 42px;
      line-height: 1.08;
      color: #0e1820;
      font-weight: normal;
      margin-bottom: 8px;
    }
    .s-sub {
      font-size: 14px;
      color: #a5a39d;
      line-height: 1.55;
      margin-bottom: 22px;
      padding-bottom: 18px;
      border-bottom: 1px solid #f0f0ee;
      font-weight: 300;
    }
    .s-text {
      font-size: 13px;
      line-height: 1.92;
      color: #282828;
      font-weight: 300;
    }
    .s-text p { margin-bottom: 13px; }
    .s-text ul { padding-left: 18px; margin-bottom: 13px; }
    .s-text li { margin-bottom: 6px; }
    .s-img {
      width: 100%;
      max-height: 210px;
      object-fit: cover;
      border-radius: 3px;
      margin-top: 22px;
      display: block;
    }
    .s-img.top { margin-top: 0; margin-bottom: 22px; max-height: 165px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 22px; }
    .two-col-img { width: 100%; max-height: 340px; object-fit: cover; border-radius: 3px; }

    /* ── DESTAQUES / KPIs ──
       Referência: páginas 8–9 do Climate and Biodiversity Report
       Fundo escuro, grade 2x2, valor grande em PP Talisman + label
    ── */
    .hl-page {
      background: ${bg};
      padding: 48px 68px 52px;
      flex-direction: column;
    }
    .hl-header {
      display: flex;
      align-items: center;
      gap: 18px;
      margin-bottom: 44px;
    }
    .hl-header-line { flex: 1; height: 1px; background: rgba(255,255,255,.12); }
    .hl-doc-label {
      font-size: 9px;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: rgba(255,255,255,.28);
    }
    .hl-section-title {
      font-family: 'PP Talisman', Georgia, serif;
      font-size: 36px;
      color: #fff;
      font-weight: normal;
      margin-bottom: 32px;
      line-height: 1.05;
    }
    .hl-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 3px;
      flex: 1;
    }
    .hl-item {
      background: rgba(255,255,255,.05);
      padding: 32px 28px 28px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      min-height: 130px;
    }
    .hl-value {
      font-family: 'PP Talisman', Georgia, serif;
      font-size: 56px;
      color: #fff;
      font-weight: normal;
      line-height: .95;
      margin-bottom: 10px;
      letter-spacing: -.02em;
    }
    .hl-label {
      font-size: 11.5px;
      color: rgba(255,255,255,.48);
      line-height: 1.6;
      font-weight: 300;
    }

    /* ── SUMÁRIO ──
       Referência: página 2 de ambos os relatórios
       Grid 2 colunas, itens numerados, linha separadora
    ── */
    .sum-page {
      background: #f7f7f5;
      padding: 52px 68px;
      flex-direction: column;
    }
    .sum-logo { height: 26px; object-fit: contain; margin-bottom: 40px; display: block; }
    .sum-title {
      font-family: 'PP Talisman', Georgia, serif;
      font-size: 28px;
      color: #0e1820;
      font-weight: normal;
      margin-bottom: 36px;
      letter-spacing: -.01em;
    }
    .sum-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 48px;
    }
    .sum-item {
      display: flex;
      align-items: baseline;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #e5e4e0;
    }
    .sum-n {
      font-size: 10px;
      color: #c0bfbb;
      width: 22px;
      flex-shrink: 0;
      letter-spacing: .04em;
    }
    .sum-name {
      font-size: 13px;
      color: #282828;
      flex: 1;
      font-weight: 300;
      line-height: 1.4;
    }
    .sum-pg {
      font-size: 10.5px;
      color: #c0bfbb;
      flex-shrink: 0;
    }

    /* ── IMAGEM FULL PAGE ── */
    .fi-page { position: relative; min-height: 297mm; }
    .fi-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .fi-overlay {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      background: linear-gradient(transparent, rgba(14,24,32,.9));
      padding: 52px 68px;
    }
    .fi-title {
      font-family: 'PP Talisman', Georgia, serif;
      font-size: 42px;
      color: #fff;
      font-weight: normal;
      line-height: 1.08;
    }
    .fi-caption {
      font-size: 12.5px;
      color: rgba(255,255,255,.6);
      margin-top: 10px;
      line-height: 1.65;
      font-weight: 300;
    }

    /* ── CONTRACAPA ──
       Referência: última página de ambos os relatórios
       Fundo escuro, logo, endereço, canal de ouvidoria
    ── */
    .backcover {
      background: ${bbg};
      padding: 52px 68px;
      justify-content: space-between;
    }
    .bc-title {
      font-family: 'PP Talisman', Georgia, serif;
      font-size: 32px;
      color: #fff;
      font-weight: normal;
      margin-bottom: 16px;
      line-height: 1.15;
    }
    .bc-text {
      font-size: 13px;
      color: rgba(255,255,255,.5);
      line-height: 1.9;
      font-weight: 300;
    }
    .bc-contact-label {
      font-size: 9px;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: rgba(255,255,255,.25);
      margin-bottom: 12px;
      margin-top: 40px;
    }
    .bc-contact-line {
      font-size: 12.5px;
      color: rgba(255,255,255,.52);
      line-height: 2.1;
      font-weight: 300;
    }

    @media print { .page { page-break-after: always; } }
  `

  // ── Blocos de página ────────────────────────────────────────────────────
  const hdr = (c, label) => `
    <div class="hdr">
      ${c.logo ? `<img src="${c.logo}" class="hdr-logo" alt=""/>` : ''}
      <div class="hdr-line"></div>
      ${label ? `<span class="hdr-label">${label}</span>` : ''}
    </div>`

  const ftr = (docTitle, n, t) => `
    <div class="ftr">
      <span>${docTitle}</span>
      <span>${n} / ${t}</span>
    </div>`

  const contentPage = (s, n) => {
    const twoCol = (s.layout === 'two-col' || s.type === 'two-col') && s.image
    return `
    <div class="page content-page">
      ${hdr(cover, s.headerLabel)}
      <div class="body">
        ${s.number ? `<div class="s-num">${s.number}</div>` : ''}
        ${s.imagePosition === 'top' && s.image && !twoCol
          ? `<img src="${s.image}" class="s-img top" alt=""/>` : ''}
        ${s.title   ? `<h1 class="s-title">${s.title}</h1>` : ''}
        ${s.subtitle ? `<h2 class="s-sub">${s.subtitle}</h2>` : ''}
        ${twoCol ? `
          <div class="two-col">
            <div class="s-text">${fmt(s.body)}</div>
            <img src="${s.image}" class="two-col-img" alt=""/>
          </div>` : `
          ${s.body ? `<div class="s-text">${fmt(s.body)}</div>` : ''}
          ${s.imagePosition !== 'top' && s.image
            ? `<img src="${s.image}" class="s-img" alt=""/>` : ''}
        `}
      </div>
      ${ftr(docTitle, n, total)}
    </div>`
  }

  const hlPage = (s) => `
    <div class="page hl-page">
      <div class="hl-header">
        ${cover.logo ? `<img src="${cover.logo}" style="height:23px;object-fit:contain" alt=""/>` : ''}
        <div class="hl-header-line"></div>
        <span class="hl-doc-label">${docTitle}</span>
      </div>
      ${s.title ? `<div class="hl-section-title">${s.title}</div>` : ''}
      <div class="hl-grid">
        ${(s.highlights || []).map(h => `
          <div class="hl-item">
            <div class="hl-value">${h.value || ''}</div>
            <div class="hl-label">${h.label || ''}</div>
          </div>`).join('')}
      </div>
    </div>`

  const sumPage = (s) => {
    const items = s.items || []
    const left  = items.filter((_, i) => i % 2 === 0)
    const right = items.filter((_, i) => i % 2 !== 0)
    const paired = left.map((item, i) => [item, right[i]])

    return `
    <div class="page sum-page">
      ${cover.logo ? `<img src="${cover.logo}" class="sum-logo" alt=""/>` : ''}
      <div class="sum-title">${s.title || 'Sumário'}</div>
      <div class="sum-grid">
        <div>
          ${left.map((item, i) => `
            <div class="sum-item">
              <span class="sum-n">${String(i * 2 + 1).padStart(2, '0')}</span>
              <span class="sum-name">${item.name || ''}</span>
              <span class="sum-pg">${item.page || ''}</span>
            </div>`).join('')}
        </div>
        <div>
          ${right.map((item, i) => `
            <div class="sum-item">
              <span class="sum-n">${String(i * 2 + 2).padStart(2, '0')}</span>
              <span class="sum-name">${item.name || ''}</span>
              <span class="sum-pg">${item.page || ''}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`
  }

  const fiPage = (s) => `
    <div class="page fi-page" style="page-break-after:always">
      ${s.image
        ? `<img src="${s.image}" class="fi-img" alt=""/>`
        : `<div style="position:absolute;inset:0;background:#e0e0dc"></div>`}
      <div class="fi-overlay">
        ${s.title   ? `<div class="fi-title">${s.title}</div>` : ''}
        ${s.caption ? `<div class="fi-caption">${s.caption}</div>` : ''}
      </div>
    </div>`

  const sectionsHTML = sections.map((s, i) => {
    const n = i + 2
    if (s.type === 'highlight')  return hlPage(s)
    if (s.type === 'summary')    return sumPage(s)
    if (s.type === 'full-image') return fiPage(s)
    return contentPage(s, n)
  }).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>${css}</style>
</head>
<body>

<!-- ── CAPA ── -->
<div class="page cover">
  <div class="cover-top">
    <div>${logo(cover.logo, cover.client, 44)}</div>
    <div class="cover-top-right">
      ${cover.date ? cover.date + '<br>' : ''}
      ${cover.client ? cover.client : ''}
    </div>
  </div>
  <div style="flex:1"></div>
  <div class="cover-mid">
    ${cover.eyebrow ? `<div class="cover-eyebrow">${cover.eyebrow}</div>` : ''}
    <div class="cover-title">${cover.title || 'Título do Relatório'}</div>
    ${cover.subtitle ? `<div class="cover-subtitle">${cover.subtitle}</div>` : ''}
    <div class="cover-rule"></div>
    <div class="cover-meta">
      ${[cover.client, cover.date].filter(Boolean).join('  ·  ')}
    </div>
  </div>
</div>

${sectionsHTML}

<!-- ── CONTRACAPA ── -->
<div class="page backcover" style="page-break-after:avoid">
  <div>${logo(cover.logo, cover.client, 40)}</div>
  <div>
    ${backCover.title ? `<div class="bc-title">${backCover.title}</div>` : ''}
    ${backCover.text  ? `<div class="bc-text">${backCover.text}</div>` : ''}
    <div class="bc-contact-label">Canal de ouvidoria</div>
    <div class="bc-contact-line">
      ${[backCover.address, backCover.website, backCover.email]
        .filter(Boolean).join('<br>')}
    </div>
  </div>
</div>

</body>
</html>`
}

app.listen(3001, () => {
  console.log('✓ Servidor Régia → http://localhost:3001')
  console.log('✓ Editor → http://localhost:5173')
})
