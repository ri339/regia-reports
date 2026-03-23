import { useState } from 'react'

const DARK = '#0f1923'

const defaultReport = {
  cover: {
    title: '',
    subtitle: '',
    eyebrow: '',
    client: 'Régia Capital',
    date: '',
    logo: null,
    backgroundColor: '#0f1923',
  },
  sections: [],
  backCover: {
    title: 'regiacapital.com.br',
    text: '',
    address: 'Rua Humaitá 275, 11º e 12º andares\nHumaitá, Rio de Janeiro — RJ\nCEP: 22261-005 — Brasil',
    website: 'www.regiacapital.com.br',
    email: 'compliance@regiacapital.com.br',
    backgroundColor: '#0f1923',
  },
}

const TYPES = [
  { value: 'content',     label: 'Conteúdo padrão' },
  { value: 'two-col',     label: 'Texto + Imagem' },
  { value: 'full-image',  label: 'Imagem full page' },
  { value: 'highlight',   label: 'Destaques / KPIs' },
  { value: 'summary',     label: 'Sumário' },
]

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

export default function App() {
  const [report, setReport]       = useState(defaultReport)
  const [tab, setTab]             = useState('cover')
  const [activeSec, setActiveSec] = useState(null)
  const [importing, setImporting] = useState(false)
  const [generating, setGen]      = useState(false)
  const [importMsg, setImportMsg] = useState('')

  const updCover = (k, v) => setReport(r => ({ ...r, cover:     { ...r.cover,     [k]: v } }))
  const updBack  = (k, v) => setReport(r => ({ ...r, backCover: { ...r.backCover, [k]: v } }))
  const updSec   = (id, k, v) =>
    setReport(r => ({ ...r, sections: r.sections.map(s => s.id === id ? { ...s, [k]: v } : s) }))

  const addSection = (type = 'content') => {
    const base = {
      id: uid(), type, title: '', subtitle: '', body: '',
      image: null, number: '', headerLabel: '',
      imagePosition: 'bottom', layout: type === 'two-col' ? 'two-col' : 'default'
    }
    const extras =
      type === 'highlight'  ? { highlights: Array(4).fill(null).map(() => ({ value: '', label: '' })) } :
      type === 'summary'    ? { items: [{ name: '', page: '' }] } :
      type === 'full-image' ? { caption: '' } : {}
    const s = { ...base, ...extras }
    setReport(r => ({ ...r, sections: [...r.sections, s] }))
    setActiveSec(s.id); setTab('sections')
  }

  const removeSection = id => {
    setReport(r => ({ ...r, sections: r.sections.filter(s => s.id !== id) }))
    if (activeSec === id) setActiveSec(null)
  }

  const moveSection = (id, dir) => {
    setReport(r => {
      const arr = [...r.sections]
      const i = arr.findIndex(s => s.id === id)
      const t = i + dir
      if (t < 0 || t >= arr.length) return r
      ;[arr[i], arr[t]] = [arr[t], arr[i]]
      return { ...r, sections: arr }
    })
  }

  const toBase64 = file => new Promise(res => {
    const reader = new FileReader()
    reader.onload = e => res(e.target.result)
    reader.readAsDataURL(file)
  })

  const handleImport = async e => {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true); setImportMsg('')
    const fd = new FormData(); fd.append('file', file)
    try {
      const res  = await fetch('/api/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.sections?.length) {
        setReport(r => ({ ...r, sections: data.sections }))
        setImportMsg(`✓ ${data.sections.length} seções importadas`)
        setActiveSec(data.sections[0]?.id); setTab('sections')
      } else {
        setImportMsg('Nenhuma seção detectada.')
      }
    } catch { setImportMsg('Erro. Servidor ativo?') }
    setImporting(false); e.target.value = ''
  }

  const handlePDF = async () => {
    setGen(true)
    try {
      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportData: report })
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `relatorio-regia-${Date.now()}.pdf`
      a.click(); URL.revokeObjectURL(url)
    } catch { alert('Erro ao gerar PDF. Verifique o servidor.') }
    setGen(false)
  }

  const activeSection = report.sections.find(s => s.id === activeSec)

  return (
    <div style={S.shell}>

      {/* ── SIDEBAR ── */}
      <aside style={S.sidebar}>
        <div style={S.brand}>
          <span style={S.brandName}>Régia</span>
          <span style={S.brandSub}>Gerador de Relatórios</span>
        </div>

        <div style={S.sideBlock}>
          <div style={S.sideLabel}>Importar Word</div>
          <label style={S.importBtn}>
            {importing ? 'Importando…' : '+ Importar .docx'}
            <input type="file" accept=".docx" onChange={handleImport} style={{ display: 'none' }} />
          </label>
          {importMsg && <div style={S.importMsg}>{importMsg}</div>}
        </div>

        <div style={{ ...S.sideBlock, flex: 1, overflowY: 'auto' }}>
          <div style={S.sideLabel}>Estrutura</div>

          <NavBtn active={tab === 'cover'} onClick={() => setTab('cover')}>Capa</NavBtn>

          {report.sections.map((s, i) => (
            <div key={s.id} style={S.secRow}>
              <button
                style={{ ...S.secBtn, ...(activeSec === s.id && tab === 'sections' ? S.secActive : {}) }}
                onClick={() => { setActiveSec(s.id); setTab('sections') }}
              >
                <span style={S.secI}>{i + 1}</span>
                <span style={S.secT} title={s.title}>{s.title ? s.title.slice(0, 24) : `Seção ${i + 1}`}</span>
                <span style={S.secK}>{TYPES.find(t => t.value === s.type)?.label.split(' ')[0]}</span>
              </button>
              <div style={S.secActs}>
                <IBtn onClick={() => moveSection(s.id, -1)}>↑</IBtn>
                <IBtn onClick={() => moveSection(s.id,  1)}>↓</IBtn>
                <IBtn red onClick={() => removeSection(s.id)}>✕</IBtn>
              </div>
            </div>
          ))}

          <NavBtn active={tab === 'backcover'} onClick={() => setTab('backcover')}>Contracapa</NavBtn>
        </div>

        <div style={S.sideBlock}>
          <div style={S.sideLabel}>Adicionar página</div>
          {TYPES.map(t => (
            <button key={t.value} style={S.addTypeBtn} onClick={() => addSection(t.value)}>
              + {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '14px 14px 24px' }}>
          <button
            style={{ ...S.pdfBtn, opacity: generating ? 0.6 : 1 }}
            onClick={handlePDF}
            disabled={generating}
          >
            {generating ? 'Gerando…' : 'Exportar PDF'}
          </button>
        </div>
      </aside>

      {/* ── EDITOR ── */}
      <main style={S.editor}>
        {tab === 'cover' && (
          <CoverEditor cover={report.cover} onChange={updCover} toBase64={toBase64} />
        )}
        {tab === 'sections' && activeSection && (
          <SectionEditor
            section={activeSection}
            onChange={(k, v) => updSec(activeSection.id, k, v)}
            toBase64={toBase64}
          />
        )}
        {tab === 'sections' && !activeSection && (
          <Empty onAdd={() => addSection()} />
        )}
        {tab === 'backcover' && (
          <BackCoverEditor bc={report.backCover} onChange={updBack} />
        )}
      </main>

      {/* ── PREVIEW ── */}
      <aside style={S.preview}>
        <div style={S.previewHdr}>Prévia</div>
        <MiniPreview report={report} tab={tab} activeSec={activeSec} />
      </aside>
    </div>
  )
}

// ── EDITORES ─────────────────────────────────────────────────────────────────

function CoverEditor({ cover, onChange, toBase64 }) {
  return (
    <Panel title="Capa">
      <Field label="Logo (PNG/SVG)">
        <ImgUpload value={cover.logo}
          onUpload={async f => onChange('logo', await toBase64(f))}
          onClear={() => onChange('logo', null)} />
      </Field>
      <Field label="Título principal">
        <Textarea value={cover.title} onChange={v => onChange('title', v)} rows={3}
          placeholder="Ex: Climate and Biodiversity Report 2024" />
      </Field>
      <Field label="Subtítulo / Período">
        <Input value={cover.subtitle} onChange={v => onChange('subtitle', v)}
          placeholder="Ex: February 2026" />
      </Field>
      <Field label="Eyebrow (texto acima do título)">
        <Input value={cover.eyebrow} onChange={v => onChange('eyebrow', v)}
          placeholder="Ex: ESG · Relatório Anual" />
      </Field>
      <Field label="Empresa / Cliente">
        <Input value={cover.client} onChange={v => onChange('client', v)}
          placeholder="Régia Capital" />
      </Field>
      <Field label="Data">
        <Input value={cover.date} onChange={v => onChange('date', v)}
          placeholder="Junho 2025" />
      </Field>
      <Field label="Cor de fundo">
        <ColorPick value={cover.backgroundColor} onChange={v => onChange('backgroundColor', v)} />
      </Field>
    </Panel>
  )
}

function SectionEditor({ section, onChange, toBase64 }) {
  const { type } = section
  const isContent = type === 'content' || type === 'two-col'
  const isHL      = type === 'highlight'
  const isSum     = type === 'summary'
  const isFI      = type === 'full-image'

  const updHL = (i, k, v) => {
    const a = [...(section.highlights || [])]; a[i] = { ...a[i], [k]: v }; onChange('highlights', a)
  }
  const updItem = (i, k, v) => {
    const a = [...(section.items || [])]; a[i] = { ...a[i], [k]: v }; onChange('items', a)
  }

  return (
    <Panel title="Editar Seção" tag={TYPES.find(t => t.value === type)?.label}>

      {!isSum && (
        <>
          <Field label="Numeração (opcional)">
            <Input value={section.number || ''} onChange={v => onChange('number', v)} placeholder="01 —" />
          </Field>
          <Field label="Título">
            <Input value={section.title || ''} onChange={v => onChange('title', v)} placeholder="Título da seção" />
          </Field>
        </>
      )}

      {isContent && (
        <>
          <Field label="Subtítulo">
            <Input value={section.subtitle || ''} onChange={v => onChange('subtitle', v)}
              placeholder="Descrição curta" />
          </Field>
          <Field label="Label no cabeçalho">
            <Input value={section.headerLabel || ''} onChange={v => onChange('headerLabel', v)}
              placeholder="Ex: Governança" />
          </Field>
          <Field label="Corpo do texto">
            <Textarea value={section.body || ''} onChange={v => onChange('body', v)} rows={14}
              placeholder={"Cada parágrafo em uma linha.\nListas com — no início:\n— Item 1\n— Item 2"} />
          </Field>
          <Field label="Imagem">
            <ImgUpload value={section.image}
              onUpload={async f => onChange('image', await toBase64(f))}
              onClear={() => onChange('image', null)} />
          </Field>
          {type !== 'two-col' && (
            <Field label="Posição da imagem">
              <select style={S.select}
                value={section.imagePosition || 'bottom'}
                onChange={e => onChange('imagePosition', e.target.value)}>
                <option value="bottom">Abaixo do texto</option>
                <option value="top">Acima do texto</option>
              </select>
            </Field>
          )}
        </>
      )}

      {isFI && (
        <>
          <Field label="Imagem de fundo">
            <ImgUpload value={section.image}
              onUpload={async f => onChange('image', await toBase64(f))}
              onClear={() => onChange('image', null)} />
          </Field>
          <Field label="Texto sobreposto">
            <Textarea value={section.caption || ''} onChange={v => onChange('caption', v)}
              rows={3} placeholder="Legenda sobre a imagem" />
          </Field>
        </>
      )}

      {isHL && (
        <Field label="KPIs / Destaques">
          {(section.highlights || []).map((h, i) => (
            <div key={i} style={S.hlRow}>
              <Input value={h.value} onChange={v => updHL(i, 'value', v)} placeholder="83%" />
              <Input value={h.label} onChange={v => updHL(i, 'label', v)} placeholder="Descrição do indicador" />
              <IBtn red onClick={() => {
                const a = [...(section.highlights || [])]; a.splice(i, 1); onChange('highlights', a)
              }}>✕</IBtn>
            </div>
          ))}
          <button style={S.addRowBtn}
            onClick={() => onChange('highlights', [...(section.highlights || []), { value: '', label: '' }])}>
            + Adicionar KPI
          </button>
        </Field>
      )}

      {isSum && (
        <>
          <Field label="Título do Sumário">
            <Input value={section.title || ''} onChange={v => onChange('title', v)} placeholder="Sumário" />
          </Field>
          <Field label="Itens">
            {(section.items || []).map((item, i) => (
              <div key={i} style={S.hlRow}>
                <Input value={item.name} onChange={v => updItem(i, 'name', v)} placeholder="Nome da seção" />
                <Input value={item.page} onChange={v => updItem(i, 'page', v)} placeholder="Pág." />
                <IBtn red onClick={() => {
                  const a = [...(section.items || [])]; a.splice(i, 1); onChange('items', a)
                }}>✕</IBtn>
              </div>
            ))}
            <button style={S.addRowBtn}
              onClick={() => onChange('items', [...(section.items || []), { name: '', page: '' }])}>
              + Adicionar item
            </button>
          </Field>
        </>
      )}
    </Panel>
  )
}

function BackCoverEditor({ bc, onChange }) {
  return (
    <Panel title="Contracapa">
      <Field label="Título">
        <Input value={bc.title} onChange={v => onChange('title', v)}
          placeholder="regiacapital.com.br" />
      </Field>
      <Field label="Texto de encerramento">
        <Textarea value={bc.text} onChange={v => onChange('text', v)} rows={5}
          placeholder="Texto opcional de encerramento do relatório" />
      </Field>
      <Field label="Endereço completo">
        <Textarea value={bc.address} onChange={v => onChange('address', v)} rows={3}
          placeholder="Rua Humaitá 275, 11º e 12º andares&#10;Rio de Janeiro — RJ" />
      </Field>
      <Field label="Site">
        <Input value={bc.website} onChange={v => onChange('website', v)}
          placeholder="www.regiacapital.com.br" />
      </Field>
      <Field label="Canal de ouvidoria (e-mail)">
        <Input value={bc.email} onChange={v => onChange('email', v)}
          placeholder="compliance@regiacapital.com.br" />
      </Field>
      <Field label="Cor de fundo">
        <ColorPick value={bc.backgroundColor} onChange={v => onChange('backgroundColor', v)} />
      </Field>
    </Panel>
  )
}

// ── MINI PREVIEW ──────────────────────────────────────────────────────────────
function MiniPreview({ report, tab, activeSec }) {
  const { cover, sections, backCover } = report
  const bg   = cover.backgroundColor || DARK
  const bbg  = backCover.backgroundColor || bg

  const pg = {
    width: '100%', aspectRatio: '1/1.414', borderRadius: 3,
    overflow: 'hidden', marginBottom: 8, border: '1px solid #dddbd8',
    position: 'relative', flexShrink: 0, background: '#fff'
  }
  const act = { border: '2px solid #0f1923' }

  return (
    <div style={S.previewScroll}>
      <div style={{ ...pg, background: bg, ...(tab === 'cover' ? act : {}) }}>
        <div style={{ padding: '12% 14%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>{cover.logo && <img src={cover.logo} style={{ height: 14, objectFit: 'contain' }} alt="" />}</div>
          <div>
            {cover.eyebrow && <div style={{ fontSize: 4, color: 'rgba(255,255,255,.38)', letterSpacing: 2, marginBottom: 5, textTransform: 'uppercase' }}>{cover.eyebrow}</div>}
            <div style={{ fontSize: 10, color: '#fff', lineHeight: 1.1 }}>{cover.title || 'Título'}</div>
            <div style={{ width: 14, height: 1, background: 'rgba(255,255,255,.2)', margin: '7px 0' }}></div>
            <div style={{ fontSize: 5, color: 'rgba(255,255,255,.35)' }}>{cover.client}</div>
          </div>
        </div>
      </div>

      {sections.map(s => {
        const sBg = s.type === 'highlight' ? bg : s.type === 'summary' ? '#f7f7f5' : '#fff'
        return (
          <div key={s.id} style={{ ...pg, background: sBg, ...(activeSec === s.id ? act : {}) }}>
            <div style={{ padding: '10% 12%', height: '100%', position: 'relative' }}>
              {s.type === 'full-image' && s.image && (
                <div style={{ position: 'absolute', inset: 0 }}>
                  <img src={s.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(14,24,32,.85))', padding: '10% 12%' }}>
                    {s.title && <div style={{ fontSize: 6, color: '#fff' }}>{s.title}</div>}
                  </div>
                </div>
              )}
              {s.type === 'highlight' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, height: '100%' }}>
                  {(s.highlights || []).slice(0, 4).map((h, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,.05)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 5 }}>
                      <div style={{ fontSize: 9, color: '#fff' }}>{h.value}</div>
                      <div style={{ fontSize: 4, color: 'rgba(255,255,255,.5)' }}>{h.label}</div>
                    </div>
                  ))}
                </div>
              )}
              {s.type === 'summary' && (
                <div>
                  <div style={{ fontSize: 8, color: '#0e1820', marginBottom: 5 }}>{s.title || 'Sumário'}</div>
                  {(s.items || []).slice(0, 10).map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e5e2', padding: '2.5px 0', fontSize: 4.5, color: '#555' }}>
                      <span>{item.name}</span>
                      <span style={{ color: '#bbb' }}>{item.page}</span>
                    </div>
                  ))}
                </div>
              )}
              {(s.type === 'content' || s.type === 'two-col') && (
                <>
                  <div style={{ height: 1, background: '#e8e8e5', marginBottom: 7 }}></div>
                  {s.title && <div style={{ fontSize: 7, color: '#0e1820', lineHeight: 1.2, marginBottom: 3 }}>{s.title.slice(0, 40)}</div>}
                  {s.body && <div style={{ fontSize: 4.5, color: '#666', lineHeight: 1.6 }}>{s.body.slice(0, 100)}</div>}
                  {s.image && <div style={{ width: '100%', height: 14, background: '#e8e8e5', borderRadius: 2, marginTop: 5 }}></div>}
                </>
              )}
            </div>
          </div>
        )
      })}

      <div style={{ ...pg, background: bbg, ...(tab === 'backcover' ? act : {}) }}>
        <div style={{ padding: '12% 14%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>{cover.logo && <img src={cover.logo} style={{ height: 12, objectFit: 'contain' }} alt="" />}</div>
          <div>
            {backCover.title && <div style={{ fontSize: 7, color: '#fff', marginBottom: 5 }}>{backCover.title.slice(0, 30)}</div>}
            <div style={{ fontSize: 4.5, color: 'rgba(255,255,255,.4)', lineHeight: 1.8 }}>
              {[backCover.address, backCover.website, backCover.email].filter(Boolean).join(' · ').slice(0, 80)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ÁTOMOS ────────────────────────────────────────────────────────────────────
function Panel({ title, tag, children }) {
  return (
    <div style={S.panel}>
      {tag && <span style={S.tag}>{tag}</span>}
      <h2 style={S.panelTitle}>{title}</h2>
      {children}
    </div>
  )
}
function Field({ label, children }) {
  return <div style={S.field}><label style={S.fieldLabel}>{label}</label>{children}</div>
}
function Input({ value, onChange, placeholder }) {
  return <input style={S.input} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder || ''} />
}
function Textarea({ value, onChange, rows = 4, placeholder }) {
  return <textarea style={{ ...S.input, resize: 'vertical', lineHeight: 1.75 }} value={value || ''} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder || ''} />
}
function ColorPick({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="color" value={value || '#0f1923'} onChange={e => onChange(e.target.value)}
        style={{ width: 38, height: 34, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0 }} />
      <input style={{ ...S.input, flex: 1, fontFamily: 'monospace', fontSize: 12 }}
        value={value || ''} onChange={e => onChange(e.target.value)} placeholder="#0f1923" />
    </div>
  )
}
function ImgUpload({ value, onUpload, onClear }) {
  return (
    <div>
      {value && (
        <div style={S.imgWrap}>
          <img src={value} alt="" style={S.imgPrev} />
          {onClear && <button style={S.imgClear} onClick={onClear}>Remover imagem</button>}
        </div>
      )}
      <label style={S.uploadBtn}>
        {value ? 'Trocar imagem' : 'Enviar imagem'}
        <input type="file" accept="image/*"
          onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = '' }}
          style={{ display: 'none' }} />
      </label>
    </div>
  )
}
function NavBtn({ active, onClick, children }) {
  return <button style={{ ...S.navBtn, ...(active ? S.navActive : {}) }} onClick={onClick}>{children}</button>
}
function IBtn({ onClick, red, children }) {
  return <button style={{ ...S.iconBtn, ...(red ? { color: '#e05' } : {}) }} onClick={onClick}>{children}</button>
}
function Empty({ onAdd }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14, color: '#aaa' }}>
      <div style={{ fontSize: 40 }}>📄</div>
      <div>Nenhuma seção selecionada</div>
      <button style={S.addRowBtn} onClick={onAdd}>+ Nova seção</button>
    </div>
  )
}

// ── ESTILOS ───────────────────────────────────────────────────────────────────
const S = {
  shell:       { display: 'flex', height: '100vh', overflow: 'hidden' },
  sidebar:     { width: 255, background: '#0e1820', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' },
  brand:       { padding: '18px 18px 14px', borderBottom: '1px solid rgba(255,255,255,.07)' },
  brandName:   { display: 'block', color: '#fff', fontSize: 15, fontWeight: 300, letterSpacing: '.12em', textTransform: 'uppercase' },
  brandSub:    { display: 'block', color: 'rgba(255,255,255,.28)', fontSize: 9.5, letterSpacing: '.06em', marginTop: 3 },
  sideBlock:   { padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,.06)' },
  sideLabel:   { fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.22)', marginBottom: 7 },
  navBtn:      { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'rgba(255,255,255,.5)', fontSize: 12.5, padding: '7px 10px', borderRadius: 4, marginBottom: 2, cursor: 'pointer' },
  navActive:   { background: 'rgba(255,255,255,.09)', color: '#fff' },
  secRow:      { marginBottom: 2 },
  secBtn:      { display: 'flex', alignItems: 'center', gap: 5, width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,.5)', fontSize: 11.5, padding: '5px 10px', borderRadius: 4, textAlign: 'left', cursor: 'pointer' },
  secActive:   { background: 'rgba(255,255,255,.09)', color: '#fff' },
  secI:        { color: 'rgba(255,255,255,.2)', fontSize: 9.5, width: 14, flexShrink: 0 },
  secT:        { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  secK:        { fontSize: 8.5, color: 'rgba(255,255,255,.18)', flexShrink: 0 },
  secActs:     { display: 'flex', gap: 2, paddingLeft: 28 },
  iconBtn:     { background: 'none', border: 'none', color: 'rgba(255,255,255,.22)', fontSize: 10, cursor: 'pointer', padding: '1px 4px' },
  importBtn:   { display: 'block', width: '100%', textAlign: 'center', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.11)', color: 'rgba(255,255,255,.65)', fontSize: 12, padding: '8px', borderRadius: 4, cursor: 'pointer' },
  importMsg:   { marginTop: 7, fontSize: 10.5, color: 'rgba(255,255,255,.38)', lineHeight: 1.45 },
  addTypeBtn:  { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'rgba(255,255,255,.38)', fontSize: 11, padding: '5px 10px', borderRadius: 4, cursor: 'pointer', marginBottom: 1 },
  pdfBtn:      { width: '100%', padding: '11px', background: '#fff', border: 'none', borderRadius: 5, color: '#0e1820', fontSize: 13, fontWeight: 400, letterSpacing: '.03em', cursor: 'pointer' },
  editor:      { flex: 1, overflowY: 'auto', background: '#f2f2f0' },
  panel:       { maxWidth: 620, margin: '0 auto', padding: '36px 28px 60px' },
  panelTitle:  { fontSize: 21, fontWeight: 300, color: '#0e1820', marginBottom: 24, letterSpacing: '-.01em' },
  tag:         { display: 'inline-block', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#aaa', background: '#e8e7e4', padding: '3px 9px', borderRadius: 3, marginBottom: 9 },
  field:       { marginBottom: 20 },
  fieldLabel:  { display: 'block', fontSize: 10.5, color: '#999', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 },
  input:       { display: 'block', width: '100%', padding: '9px 11px', border: '1px solid #dddbd8', borderRadius: 4, fontSize: 13.5, color: '#1a1a1a', background: '#fff', outline: 'none', fontWeight: 300 },
  select:      { display: 'block', width: '100%', padding: '9px 11px', border: '1px solid #dddbd8', borderRadius: 4, fontSize: 13.5, color: '#1a1a1a', background: '#fff', outline: 'none' },
  hlRow:       { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 },
  addRowBtn:   { fontSize: 11.5, color: '#888', background: 'none', border: '1px solid #dddbd8', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', marginTop: 4 },
  imgWrap:     { marginBottom: 10, position: 'relative', display: 'inline-block', maxWidth: '100%' },
  imgPrev:     { maxWidth: '100%', maxHeight: 160, borderRadius: 4, display: 'block', objectFit: 'contain', background: '#eae9e6' },
  imgClear:    { display: 'block', marginTop: 6, fontSize: 11, color: '#e05', background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  uploadBtn:   { display: 'inline-block', fontSize: 12, color: '#666', background: '#eae9e6', border: 'none', borderRadius: 4, padding: '7px 14px', cursor: 'pointer', marginTop: 4 },
  preview:     { width: 220, background: '#eae9e6', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' },
  previewHdr

