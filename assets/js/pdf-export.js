/*
  Client-side PDF export (ATS-friendly)
  ------------------------------------------------------------
  Primary strategy: browser-native Print to PDF in an offscreen iframe.
  Why:
  - Produces text-based PDF (selectable text) with clickable links
  - Works on static hosting (GitHub Pages) without a build step
  - Uses `assets/pdf-export.css` for print/PDF formatting
*/

(() => {
  const DEFAULT_FILENAME = 'Denis_Shvetsov_Systems_Architect_Resume.pdf';
  const PDF_STYLESHEET_HREF = '/assets/pdf-export.css';
  const EXPORT_BUTTON_ID = 'pdf-export-btn';
  const EXPORT_STATUS_ID = 'pdf-export-status';

  function safeText(el) {
    return (el?.textContent || '').trim();
  }

  function normalizeUrl(href) {
    if (!href) return '';
    // Support scheme-relative URLs from the theme build (e.g. //compstak.com)
    if (href.startsWith('//')) return `https:${href}`;
    return href;
  }

  function dispatchStatus(status, detail = {}) {
    window.dispatchEvent(
      new CustomEvent('pdf-export:status', {
        detail: { status, ...detail },
      }),
    );
  }

  function extractHeaderInfoFromPage() {
    const header = document.querySelector('.header-container');
    const name = safeText(header?.querySelector('.header-left h1')) || safeText(document.querySelector('h1'));
    const title = safeText(header?.querySelector('.header-left h2')) || '';

    const emailHref = header?.querySelector('a[href^="mailto:"]')?.getAttribute('href') || '';
    const email = emailHref.replace(/^mailto:/, '') || safeText(header?.querySelector('a[href^="mailto:"]'));

    const websiteAnchor =
      header?.querySelector('.header-right a[href^="http"]') || document.querySelector('a[href^="http"]');
    const website = normalizeUrl(websiteAnchor?.getAttribute('href') || '');

    const github = normalizeUrl(header?.querySelector('a[href*="github.com/"]')?.getAttribute('href') || '');
    const linkedin = normalizeUrl(header?.querySelector('a[href*="linkedin.com/"]')?.getAttribute('href') || '');

    return { name, title, email, website, github, linkedin };
  }

  function findSectionContainerByHeading(headingText) {
    const h3s = Array.from(document.querySelectorAll('.wrapper .container h3'));
    const h3 = h3s.find((n) => safeText(n) === headingText);
    return h3 ? h3.closest('.container') : null;
  }

  function htmlEscape(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function buildContactBlock(info) {
    const lines = [];
    if (info.email) lines.push(`Email: ${htmlEscape(info.email)}`);
    if (info.website) lines.push(`Website: <a href="${htmlEscape(info.website)}">${htmlEscape(info.website)}</a>`);
    if (info.linkedin)
      lines.push(`LinkedIn: <a href="${htmlEscape(info.linkedin)}">${htmlEscape(info.linkedin)}</a>`);
    if (info.github) lines.push(`GitHub: <a href="${htmlEscape(info.github)}">${htmlEscape(info.github)}</a>`);

    return `
      <header class="pdf-header">
        <h1>${htmlEscape(info.name || '')}</h1>
        ${info.title ? `<p><strong>${htmlEscape(info.title)}</strong></p>` : ''}
        ${lines.length ? `<p>${lines.join('<br>')}</p>` : ''}
      </header>
    `;
  }

  function buildAboutSection() {
    const container = findSectionContainerByHeading('About Me');
    if (!container) return '';

    // Prefer the main text column (exclude the profile image).
    const contentCol =
      container.querySelector('.col-print-12') ||
      container.querySelector('.col-xs-12.col-sm-8.col-md-9') ||
      container;

    // Remove <mark> to keep ATS-friendly plain text.
    const html = (contentCol.innerHTML || '').replaceAll('<mark>', '').replaceAll('</mark>', '');

    return `
      <h2>About Me</h2>
      <div class="pdf-about">
        ${html}
      </div>
    `;
  }

  function pickCaptionText(detailsEl) {
    const ps = Array.from(detailsEl.querySelectorAll('p')).filter((p) => !p.classList.contains('no-print'));
    const captionP = ps.find((p) => !p.querySelector('b')) || null;
    return safeText(captionP);
  }

  function buildListSection(sectionTitle) {
    const container = findSectionContainerByHeading(sectionTitle);
    if (!container) return '';

    const items = Array.from(container.querySelectorAll('.row.layout')).map((row) => {
      const details = row.querySelector('.details');
      const content = row.querySelector('.content');

      const org = safeText(details?.querySelector('h4'));
      const role = safeText(details?.querySelector('p b'));
      const caption = details ? pickCaptionText(details) : '';

      const linkEl = details?.querySelector('a.link');
      const link = normalizeUrl(linkEl?.getAttribute('href') || '');

      const descriptionHtml = content?.innerHTML || '';

      const headerBits = [];
      if (org) headerBits.push(`<strong>${htmlEscape(org)}</strong>`);
      if (role) headerBits.push(htmlEscape(role));

      return `
        <div class="pdf-item">
          <p>
            ${headerBits.join(' — ')}
            ${caption ? `<br>${htmlEscape(caption)}` : ''}
            ${link ? `<br>Link: <a href="${htmlEscape(link)}">${htmlEscape(link)}</a>` : ''}
          </p>
          ${descriptionHtml ? `<div class="pdf-item-description">${descriptionHtml}</div>` : ''}
        </div>
      `;
    });

    return `
      <h2>${htmlEscape(sectionTitle)}</h2>
      <div class="pdf-list">
        ${items.join('\n')}
      </div>
    `;
  }

  function buildTextSection(sectionTitle) {
    const container = findSectionContainerByHeading(sectionTitle);
    if (!container) return '';

    const body = container.querySelector('.col-md-12') || container;
    const html = body.innerHTML || '';

    return `
      <h2>${htmlEscape(sectionTitle)}</h2>
      <div class="pdf-text">
        ${html}
      </div>
    `;
  }

  function inferGithubUsernameFromUrl(url) {
    const m = String(url || '').match(/^https?:\/\/github\.com\/([^/]+)(?:\/|$)/i);
    return m ? m[1] : '';
  }

  function skillCardsToCommaLine(container) {
    if (!container) return '';
    const cards = Array.from(container.querySelectorAll('.skill-card'));
    const titles = cards.map((c) => safeText(c.querySelector('.skill-title'))).filter(Boolean);
    if (titles.length === 0) return '';
    return `<p>${titles.map(htmlEscape).join(', ')}</p>`;
  }

  function skillCardsToList(container) {
    if (!container) return '';
    const cards = Array.from(container.querySelectorAll('.skill-card'));
    if (cards.length === 0) return '';

    const items = cards.map((card) => {
      const title = safeText(card.querySelector('.skill-title'));
      const set = safeText(card.querySelector('.skill-description strong'));
      const desc =
        safeText(card.querySelector('.skill-description .skill-text')) || safeText(card.querySelector('.skill-text'));

      const parts = [];
      if (title) parts.push(`<strong>${htmlEscape(title)}</strong>`);
      if (set) parts.push(`(${htmlEscape(set)})`);
      if (desc) parts.push(`— ${htmlEscape(desc)}`);

      return `<li>${parts.join(' ')}</li>`;
    });

    return `
      <ul class="pdf-simple-list">
        ${items.join('\n')}
      </ul>
    `;
  }

  function buildSkillsSection(headerInfo) {
    const container = findSectionContainerByHeading('Skills');
    const noteHtml = container?.querySelector('.section-description')?.innerHTML || '';
    const listHtml = skillCardsToCommaLine(container);

    return `
      <h2>Skills</h2>
      ${noteHtml ? `<div class="pdf-section-note">${noteHtml}</div>` : ''}
      ${listHtml}
    `;
  }

  function buildToolsSection() {
    const container = findSectionContainerByHeading('Tools');
    if (!container) return '';

    return `
      <h2>Tools</h2>
      ${skillCardsToCommaLine(container)}
    `;
  }

  function buildPdfHtmlDocument({ filename }) {
    const headerInfo = extractHeaderInfoFromPage();
    const titleNoExt = (filename || DEFAULT_FILENAME).replace(/\.pdf$/i, '');

    // Section order required by the task
    const about = buildAboutSection();
    const experience = buildListSection('Experience');
    const education = buildListSection('Education');
    const skills = buildSkillsSection(headerInfo);
    const tools = buildToolsSection();
    const proof = buildTextSection('Proof of Skill');

    const bodyHtml = `
      <div class="pdf-resume">
        ${buildContactBlock(headerInfo)}
        ${about}
        ${experience}
        ${education}
        ${skills}
        ${tools}
        ${proof}
      </div>
    `;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${htmlEscape(titleNoExt)}</title>
          <link rel="stylesheet" href="${htmlEscape(PDF_STYLESHEET_HREF)}">
        </head>
        <body>
          ${bodyHtml}
        </body>
      </html>
    `;
  }

  function createOffscreenIframe() {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'PDF Export Frame');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.zIndex = '-1';
    return iframe;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function generatePDF(options = {}) {
    const filename = options.filename || DEFAULT_FILENAME;
    dispatchStatus('start', { filename });

    let iframe;
    try {
      iframe = createOffscreenIframe();
      document.body.appendChild(iframe);

      const html = buildPdfHtmlDocument({ filename });
      const doc = iframe.contentDocument;
      if (!doc) throw new Error('Unable to access iframe document');

      doc.open();
      doc.write(html);
      doc.close();

      // Best-effort: some browsers use document title as suggested filename.
      try {
        iframe.contentDocument.title = filename.replace(/\.pdf$/i, '');
      } catch {
        // ignore
      }

      dispatchStatus('rendered');

      // Give layout a moment before invoking print.
      await wait(50);

      const win = iframe.contentWindow;
      if (!win) throw new Error('Unable to access iframe window');

      dispatchStatus('printing');

      await new Promise((resolve) => {
        const done = () => {
          win.removeEventListener('afterprint', done);
          resolve();
        };
        win.addEventListener('afterprint', done, { once: true });
        win.focus();
        win.print();
      });

      dispatchStatus('done');
    } catch (err) {
      console.error('PDF export failed:', err);
      dispatchStatus('error', { error: String(err && err.message ? err.message : err) });

      // User-friendly, UI-agnostic error surface.
      window.alert(
        'PDF export failed in this browser session.\n\n' +
          'Fallback: use the browser Print dialog and "Save as PDF".\n' +
          'Tip: ensure you are using a modern browser (Chrome/Firefox/Safari).',
      );
      throw err;
    } finally {
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }
  }

  function setButtonLoadingState(btn, isLoading) {
    if (!btn) return;
    btn.disabled = Boolean(isLoading);
    btn.setAttribute('aria-disabled', String(Boolean(isLoading)));
    btn.setAttribute('aria-busy', String(Boolean(isLoading)));

    const label = btn.querySelector('.hidden-xs');
    if (label) label.textContent = isLoading ? 'Generating…' : 'Download PDF';
  }

  function setStatusMessage(msg) {
    const el = document.getElementById(EXPORT_STATUS_ID);
    if (!el) return;
    el.textContent = msg || '';
  }

  function initPdfExportButton() {
    const btn = document.getElementById(EXPORT_BUTTON_ID);
    if (!btn) return;

    btn.addEventListener('click', async (e) => {
      // If the control is now a direct-download <a>, don't hijack it.
      if (btn.tagName === 'A') return;

      e.preventDefault();
      if (btn.disabled) return;

      setStatusMessage('');
      setButtonLoadingState(btn, true);

      try {
        await generatePDF({ filename: DEFAULT_FILENAME });
        setStatusMessage('Opened print dialog for PDF export.');
      } catch {
        setStatusMessage('Export failed. Use Print → Save as PDF as a fallback.');
      } finally {
        setButtonLoadingState(btn, false);
      }
    });
  }

  // Expose a stable API for Task 4 (button wiring) without imposing UI here.
  window.PDFExport = {
    generate: generatePDF,
    DEFAULT_FILENAME,
  };
  window.generatePDF = generatePDF;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPdfExportButton);
  } else {
    initPdfExportButton();
  }
})();

