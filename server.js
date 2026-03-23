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
        number: '',
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
    await new Promise(r => setTimeout(r, 1200))

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

// ── Formatação de texto ──────────────────────────────────────────────────────
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

function logoOrText(logo, name, h = 44) {
  if (logo) return `<img src="${logo}" style="height:${h}px;object-fit:contain;max-width:220px" alt="Logo"/>`
  return `<span style="color:rgba(255,255,255,.6);font-family:'Inter',sans-serif;font-size:18px;font-weight:300;letter-spacing:.14em;text-transform:uppercase">${name || 'RÉGIA'}</span>`
}

// ── Template HTML completo ───────────────────────────────────────────────────
function buildHTML(data) {
  const { cover, sections, backCover } = data
  const bg    = cover.backgroundColor || '#0f1923'
  const bbg   = backCover.backgroundColor || bg
  const total = sections.length + 2
  const font  = 'http://localhost:3001/fonts'

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap');
    @font-face {
      font-family:'PP Talisman';
      src:url('${font}/PPTalisman-Regular.woff2') format('woff2'),
          url('${font}/PPTalisman-Regular.woff') format('woff');
    }
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;font-weight:300;background:#fff;
         -webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{width:210mm;min-height:297mm;position:relative;
          page-break-after:always;display:flex;flex-direction:column;overflow:hidden}

    /* CAPA */
    .cover{background:${bg};padding:56px 68px;justify-content:space-between}
    .c-eyebrow{font-size:10px;letter-spacing:.18em;text-transform:uppercase;
               color:rgba(255,255,255,.38);margin-bottom:22px}
    .c-title{font-family:'PP Talisman',Georgia,serif;font-size:62px;line-height:1.0;
             color:#fff;font-weight:normal;margin-bottom:20px}
    .c-subtitle{font-size:15px;color:rgba(255,255,255,.6);line-height:1.65;margin-bottom:8px}
    .c-divider{width:40px;height:1px;background:rgba(255,255,255,.2);margin:26px 0}
    .c-meta{font-size:11px;color:rgba(255,255,255,.35);letter-spacing:.05em;line-height:2.0}

    /* HEADER/FOOTER */
    .hdr{padding:22px 68px 0;display:flex;align-items:center;gap:18px;height:60px;flex-shrink:0}
    .hdr-logo{height:24px;object-fit:contain;flex-shrink:0}
    .hdr-line{flex:1;height:1px;background:#e8e8e5}
    .hdr-lbl{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#c0bfbc;flex-shrink:0}
    .ftr{height:44px;padding:0 68px;display:flex;align-items:center;
         justify-content:space-between;border-top:1px solid #f0f0ee;
         flex-shrink:0;margin-top:auto}
    .ftr span{font-size:9.5px;color:#d0cfc9;letter-spacing:.06em}

    /* CONTEÚDO */
    .content{background:#fff}
    .body{flex:1;padding:38px 68px 28px;overflow:hidden}
    .s-num{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#c5c3be;margin-bottom:14px}
    .s-title{font-family:'PP Talisman',Georgia,serif;font-size:40px;line-height:1.1;
             color:#0e1820;font-weight:normal;margin-bottom:6px}
    .s-sub{font-size:14px;color:#a0a09a;line-height:1.5;margin-bottom:20px;
           padding-bottom:18px;border-bottom:1px solid #f0f0ee}
    .s-text{font-size:13px;line-height:1.9;color:#282828;font-weight:300}
    .s-text p{margin-bottom:12px}
    .s-text ul{padding-left:18px;margin-bottom:12px}
    .s-text li{margin-bottom:5px}
    .s-img{width:100%;max-height:210px;object-fit:cover;border-radius:3px;margin-top:20px;display:block}
    .s-img.top{margin-top:0;margin-bottom:20px;max-height:170px}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:20px}
    .two-col-img{width:100%;max-height:340px;object-fit:cover;border-radius:3px}

    /* HIGHLIGHT (página de KPIs — fundo escuro igual à capa) */
    .hl-page{background:${bg};padding:52px 68px}
    .hl-hdr{display:flex;align-items:center;gap:18px;margin-bottom:48px}
    .hl-hdr-line{flex:1;height:1px;background:rgba(255,255,255,.12)}
    .hl-title{font-family:'PP Talisman',Georgia,serif;font-size:36px;
              color:#fff;font-weight:normal;margin-bottom:28px}
    .hl-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:3px}
    .hl-item{background:rgba(255,255,255,.05);padding:36px 30px;
             display:flex;flex-direction:column;justify-content:flex-end;min-height:140px}
    .hl-val{font-family:'PP Talisman',Georgia,serif;font-size:54px;
            color:#fff;font-weight:normal;line-height:1;margin-bottom:8px}
    .hl-lbl{font-size:11.5px;color:rgba(255,255,255,.5);line-height:1.55;font-weight:300}

    /* SUMÁRIO */
    .sum-page{background:#f7f7f5;padding:56px 68px}
    .sum-logo{height:26px;object-fit:contain;margin-bottom:40px;display:block}
    .sum-title{font-family:'PP Talisman',Georgia,serif;font-size:30px;
               color:#0e1820;font-weight:normal;margin-bottom:36px}
    .sum-item{display:flex;align-items:baseline;gap:10px;
              padding:13px 0;border-bottom:1px solid #e5e5e2}
    .sum-n{font-size:10px;color:#c0bfbc;width:22px;flex-shrink:0}
    .sum-name{font-size:13.5px;color:#282828;flex:1;font-weight:300}
    .sum-pg{font-size:11px;color:#c0bfbc}

    /* FULL IMAGE */
    .fi-page{position:relative;min-height:297mm}
    .fi-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .fi-overlay{position:absolute;bottom:0;left:0;right:0;
                background:linear-gradient(transparent,rgba(14,24,32,.88));padding:52px 68px}
    .fi-title{font-family:'PP Talisman',Georgia,serif;font-size:40px;color:#fff;font-weight:normal}
    .fi-caption{font-size:12.5px;color:rgba(255,255,255,.6);margin-top:8px;line-height:1.6}

    /* CONTRACAPA */
    .backcover{background:${bbg};padding:56px 68px;justify-content:space-between}
    .bc-title{font-family:'PP Talisman',Georgia,serif;font-size:34px;
              color:#fff;font-weight:normal;margin-bottom:14px;line-height:1.15}
    .bc-text{font-size:13px;color:rgba(255,255,255,.55);line-height:1.9}
    .bc-clabel{font-size:9px;letter-spacing:.16em;text-transform:uppercase;
               color:rgba(255,255,255,.28);margin-bottom:10px;margin-top:38px}
    .bc-cline{font-size:12.5px;color:rgba(255,255,255,.55);line-height:2.1}

    @media print{.page{page-break-after:always}}
  `

  // ── funções de página ────────────────────────────────────────────────────
  const hdr = (c, lbl) => `
    <div class="hdr">
      ${c.logo ? `<img src="${c.logo}" class="hdr-logo" alt=""/>` : ''}
      <div class="hdr-line"></div>
      ${lbl ? `<span class="hdr-lbl">${lbl}</span>` : ''}
    </div>`

  const ftr = (client, n, t) => `
    <div class="ftr">
      <span>${client || 'Régia Capital'}</span>
      <span>${n} / ${t}</span>
    </div>`

  const contentPage = (s, n) => {
    const twoCol = (s.layout === 'two-col' || s.type === 'two-col') && s.image
    return `
    <div class="page content">
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
      ${ftr(cover.client, n, total)}
    </div>`
  }

  const hlPage = (s) => `
    <div class="page hl-page">
      <div class="hl-hdr">
        ${cover.logo ? `<img src="${cover.logo}" style="height:24px;object-fit:contain" alt=""/>` : ''}
        <div class="hl-hdr-line"></div>
      </div>
      ${s.title ? `<div class="hl-title">${s.title}</div>` : ''}
      <div class="hl-grid">
        ${(s.highlights || []).map(h => `
          <div class="hl-item">
            <div class="hl-val">${h.value || ''}</div>
            <div class="hl-lbl">${h.label || ''}</div>
          </div>`).join('')}
      </div>
    </div>`

  const sumPage = (s) => `
    <div class="page sum-page" style="flex-direction:column">
      ${cover.logo ? `<img src="${cover.logo}" class="sum-logo" alt=""/>` : ''}
      <div class="sum-title">${s.title || 'Sumário'}</div>
      <div>
        ${(s.items || []).map((item, i) => `
          <div class="sum-item">
            <span class="sum-n">${String(i + 1).padStart(2, '0')}</span>
            <span class="sum-name">${item.name || ''}</span>
            <span class="sum-pg">${item.page || ''}</span>
          </div>`).join('')}
      </div>
    </div>`

  const fiPage = (s) => `
    <div class="page fi-page" style="page-break-after:always">
      ${s.image
        ? `<img src="${s.image}" class="fi-img" alt=""/>`
        : `<div style="position:absolute;inset:0;background:#e0e0dd"></div>`}
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
<head><meta charset="UTF-8"><style>${css}</style></head>
<body>

<!-- CAPA -->
<div class="page cover">
  <div>${logoOrText(cover.logo, cover.client, 44)}</div>
  <div style="flex:1"></div>
  <div>
    ${cover.eyebrow ? `<div class="c-eyebrow">${cover.eyebrow}</div>` : ''}
    <div class="c-title">${cover.title || 'Título do Relatório'}</div>
    ${cover.subtitle ? `<div class="c-subtitle">${cover.subtitle}</div>` : ''}
    <div class="c-divider"></div>
    <div class="c-meta">
      ${cover.client ? cover.client + '<br>' : ''}
      ${cover.date   ? cover.date : ''}
    </div>
  </div>
</div>

${sectionsHTML}

<!-- CONTRACAPA -->
<div class="page backcover" style="page-break-after:avoid">
  <div>${logoOrText(cover.logo, cover.client, 38)}</div>
  <div>
    ${backCover.title ? `<div class="bc-title">${backCover.title}</div>` : ''}
    ${backCover.text  ? `<div class="bc-text">${backCover.text}</div>`   : ''}
    <div class="bc-clabel">Contato</div>
    <div class="bc-cline">
      ${[backCover.address, backCover.website, backCover.email].filter(Boolean).join('<br>')}
    </div>
  </div>
</div>

</body></html>`
}

app.listen(3001, () => {
  console.log('✓ Servidor rodando → http://localhost:3001')
  console.log('✓ Editor disponível → http://localhost:5173')
})
