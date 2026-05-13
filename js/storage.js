/**
 * Storage abstraction layer
 *
 * Two backends:
 *   - LocalStorageBackend: offline-first, single device
 *   - GitHubBackend: cloud-synced via Contents API
 *
 * GitHubBackend caches reads to localStorage and writes to both.
 * If GitHub fails, falls back to localStorage transparently.
 *
 * Data shape:
 *   Patient: { hn, firstName, lastInitial, sex, age, dx, dominantSide,
 *              affectedSide, onsetDate, template, createdAt, updatedAt }
 *   Visit:   { hn, visitId, visitDate, visitNumber, template,
 *              data: {...form fields}, notes, createdAt }
 */

// ---------- Backends ----------

class LocalStorageBackend {
  constructor() { this.name = 'local'; }

  // patients

  async listPatients() {
    const hns = this._getJSON('pt:patients', []);
    return hns.map(hn => this._getJSON(`pt:patient:${hn}`)).filter(Boolean);
  }

  async getPatient(hn) {
    return this._getJSON(`pt:patient:${hn}`);
  }

  async savePatient(patient) {
    patient.updatedAt = new Date().toISOString();
    if (!patient.createdAt) patient.createdAt = patient.updatedAt;
    this._setJSON(`pt:patient:${patient.hn}`, patient);
    const hns = this._getJSON('pt:patients', []);
    if (!hns.includes(patient.hn)) {
      hns.push(patient.hn);
      this._setJSON('pt:patients', hns);
    }
    return patient;
  }

  async deletePatient(hn) {
    const visits = await this.listVisits(hn);
    for (const v of visits) localStorage.removeItem(`pt:visit:${hn}:${v.visitId}`);
    localStorage.removeItem(`pt:visits:${hn}`);
    localStorage.removeItem(`pt:patient:${hn}`);
    const hns = this._getJSON('pt:patients', []).filter(x => x !== hn);
    this._setJSON('pt:patients', hns);
  }

  // visits

  async listVisits(hn) {
    const ids = this._getJSON(`pt:visits:${hn}`, []);
    return ids.map(id => this._getJSON(`pt:visit:${hn}:${id}`))
              .filter(Boolean)
              .sort((a, b) => b.visitDate.localeCompare(a.visitDate));
  }

  async getVisit(hn, visitId) {
    return this._getJSON(`pt:visit:${hn}:${visitId}`);
  }

  async getLatestVisit(hn) {
    const visits = await this.listVisits(hn);
    return visits[0] || null;
  }

  async saveVisit(hn, visit) {
    if (!visit.visitId) visit.visitId = this._nextVisitId(hn);
    if (!visit.createdAt) visit.createdAt = new Date().toISOString();
    if (!visit.visitDate) visit.visitDate = new Date().toISOString().slice(0, 10);
    this._setJSON(`pt:visit:${hn}:${visit.visitId}`, visit);
    const ids = this._getJSON(`pt:visits:${hn}`, []);
    if (!ids.includes(visit.visitId)) {
      ids.push(visit.visitId);
      this._setJSON(`pt:visits:${hn}`, ids);
    }
    return visit;
  }

  _nextVisitId(hn) {
    const ids = this._getJSON(`pt:visits:${hn}`, []);
    const nums = ids.map(id => parseInt(id, 10)).filter(n => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return String(next).padStart(3, '0');
  }

  _getJSON(key, def = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? def; }
    catch { return def; }
  }

  _setJSON(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }
}

// ---------- GitHub Backend ----------

class GitHubBackend {
  constructor({ pat, owner, repo, branch = 'main' }) {
    this.name = 'github';
    this.pat = pat;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.api = `https://api.github.com/repos/${owner}/${repo}/contents`;
    this.local = new LocalStorageBackend(); // cache layer
  }

  async _fetch(path, opts = {}) {
    const res = await fetch(`${this.api}/${path}`, {
      ...opts,
      headers: {
        Authorization: `token ${this.pat}`,
        Accept: 'application/vnd.github+json',
        ...(opts.headers || {}),
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async _getFile(path) {
    const data = await this._fetch(path);
    if (!data) return null;
    // GitHub returns base64-encoded content
    const content = atob(data.content.replace(/\s/g, ''));
    return { content: JSON.parse(content), sha: data.sha };
  }

  async _putFile(path, json, message) {
    const existing = await this._fetch(path);
    const body = {
      message,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(json, null, 2)))),
      branch: this.branch,
    };
    if (existing) body.sha = existing.sha;
    return this._fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async _listDir(path) {
    const data = await this._fetch(path);
    if (!Array.isArray(data)) return [];
    return data;
  }

  // patients

  async listPatients() {
    try {
      const dirs = await this._listDir('patients');
      const patients = [];
      for (const dir of dirs.filter(d => d.type === 'dir')) {
        const meta = await this._getFile(`patients/${dir.name}/_meta.json`);
        if (meta) patients.push(meta.content);
      }
      // cache to local
      for (const p of patients) await this.local.savePatient(p);
      return patients;
    } catch (e) {
      console.warn('GitHub list failed, fallback local', e);
      return this.local.listPatients();
    }
  }

  async getPatient(hn) {
    try {
      const data = await this._getFile(`patients/${hn}/_meta.json`);
      if (!data) return null;
      await this.local.savePatient(data.content);
      return data.content;
    } catch (e) {
      console.warn('GitHub get failed, fallback local', e);
      return this.local.getPatient(hn);
    }
  }

  async savePatient(patient) {
    patient.updatedAt = new Date().toISOString();
    if (!patient.createdAt) patient.createdAt = patient.updatedAt;
    await this.local.savePatient(patient); // always cache local first
    try {
      await this._putFile(
        `patients/${patient.hn}/_meta.json`,
        patient,
        `patient ${patient.hn}: update meta`
      );
    } catch (e) {
      console.warn('GitHub save failed, kept local only', e);
    }
    return patient;
  }

  async deletePatient(hn) {
    // GitHub: archive instead of delete (safer for clinical data)
    const p = await this.getPatient(hn);
    if (p) await this.savePatient({ ...p, archived: true, archivedAt: new Date().toISOString() });
  }

  // visits

  async listVisits(hn) {
    try {
      const files = await this._listDir(`patients/${hn}`);
      const visits = [];
      for (const f of files.filter(x => x.name.startsWith('visit-'))) {
        const data = await this._getFile(`patients/${hn}/${f.name}`);
        if (data) visits.push(data.content);
      }
      for (const v of visits) await this.local.saveVisit(hn, v);
      return visits.sort((a, b) => b.visitDate.localeCompare(a.visitDate));
    } catch (e) {
      console.warn('GitHub list visits failed, fallback local', e);
      return this.local.listVisits(hn);
    }
  }

  async getVisit(hn, visitId) {
    try {
      const data = await this._getFile(`patients/${hn}/visit-${visitId}.json`);
      if (!data) return null;
      await this.local.saveVisit(hn, data.content);
      return data.content;
    } catch (e) {
      return this.local.getVisit(hn, visitId);
    }
  }

  async getLatestVisit(hn) {
    const visits = await this.listVisits(hn);
    return visits[0] || null;
  }

  async saveVisit(hn, visit) {
    if (!visit.visitId) {
      const existing = await this.listVisits(hn);
      const nums = existing.map(v => parseInt(v.visitId, 10)).filter(n => !isNaN(n));
      const next = (nums.length ? Math.max(...nums) : 0) + 1;
      visit.visitId = String(next).padStart(3, '0');
    }
    if (!visit.createdAt) visit.createdAt = new Date().toISOString();
    if (!visit.visitDate) visit.visitDate = new Date().toISOString().slice(0, 10);
    await this.local.saveVisit(hn, visit); // cache
    try {
      await this._putFile(
        `patients/${hn}/visit-${visit.visitId}.json`,
        visit,
        `patient ${hn}: visit ${visit.visitId} on ${visit.visitDate}`
      );
    } catch (e) {
      console.warn('GitHub saveVisit failed, kept local only', e);
    }
    return visit;
  }
}

// ---------- Factory + Settings ----------

const Settings = {
  get() { try { return JSON.parse(localStorage.getItem('pt:settings')) || {}; } catch { return {}; } },
  set(s) { localStorage.setItem('pt:settings', JSON.stringify(s)); },
  update(patch) { this.set({ ...this.get(), ...patch }); },
};

function getStorage() {
  const s = Settings.get();
  if (s.github?.pat && s.github?.owner && s.github?.repo) {
    return new GitHubBackend(s.github);
  }
  return new LocalStorageBackend();
}

// Compute diff between two visit data objects
function visitDiff(prev, curr) {
  if (!prev) return [];
  const changes = [];
  function walk(p, c, path = '') {
    const keys = new Set([...Object.keys(p || {}), ...Object.keys(c || {})]);
    for (const k of keys) {
      const pv = p?.[k], cv = c?.[k];
      const fullPath = path ? `${path}.${k}` : k;
      if (typeof pv === 'object' && pv !== null && !Array.isArray(pv) &&
          typeof cv === 'object' && cv !== null && !Array.isArray(cv)) {
        walk(pv, cv, fullPath);
      } else if (JSON.stringify(pv) !== JSON.stringify(cv)) {
        if (pv !== undefined || cv !== undefined) {
          changes.push({ field: fullPath, from: pv ?? null, to: cv ?? null });
        }
      }
    }
  }
  walk(prev, curr);
  return changes;
}

// Export to window for non-module scripts
window.Storage = { get: getStorage, Settings, visitDiff,
                   LocalStorageBackend, GitHubBackend };
