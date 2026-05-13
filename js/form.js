/**
 * Visit form — Alpine component
 *
 * URL params:
 *   ?hn=12345&new=1       New visit (preload from latest)
 *   ?hn=12345&v=003       View/edit specific visit
 *
 * Behavior:
 *   - Preloads data from latest visit when creating new
 *   - Tracks which fields user has explicitly changed (changed set)
 *   - Saves new visit with diff log against previous
 */

function visitForm() {
  const blankData = () => ({
    date: new Date().toISOString().slice(0, 10),
    cc: '',
    bp: '', hr: '', rr: '', spo2: '',
    consciousness: '', cognitionNote: '',
    brunnstrom: { UE: null, Hand: null, LE: null },
    mas: {},
    mmt: {},
    sensation: {},
    balance: {}, bbs: '',
    mobility: {}, gait: '',
    bi: {},
    special: {},
    otherFindings: '',
    intervention: '', plan: '', notes: '',
  });

  return {
    hn: '',
    patient: null,
    visitId: null,
    visitNumber: '?',
    prevVisit: null,
    prevData: {},
    mode: 'new',
    saved: true,
    template: 'stroke',
    open: { info: true, vs: false, cog: false, brun: true, mas: true,
            mmt: true, sens: false, bal: true, mob: true, bi: false,
            special: false, plan: true },

    data: blankData(),
    blankData,

    // BI definition (same as before)
    bi_items: [
      { key: 'feeding',  label: 'Feeding',
        opts: [{v:0,label:'unable'},{v:5,label:'help'},{v:10,label:'indep'}] },
      { key: 'transfer', label: 'Bed/Chair transfer',
        opts: [{v:0,label:'unable'},{v:5,label:'major'},{v:10,label:'minor'},{v:15,label:'indep'}] },
      { key: 'grooming', label: 'Grooming',
        opts: [{v:0,label:'need help'},{v:5,label:'indep'}] },
      { key: 'toilet',   label: 'Toilet use',
        opts: [{v:0,label:'unable'},{v:5,label:'some help'},{v:10,label:'indep'}] },
      { key: 'bathing',  label: 'Bathing',
        opts: [{v:0,label:'need help'},{v:5,label:'indep'}] },
      { key: 'mobility', label: 'Mobility',
        opts: [{v:0,label:'immobile'},{v:5,label:'w/c indep'},{v:10,label:'walk help'},{v:15,label:'walk indep'}] },
      { key: 'stairs',   label: 'Stairs',
        opts: [{v:0,label:'unable'},{v:5,label:'help'},{v:10,label:'indep'}] },
      { key: 'dressing', label: 'Dressing',
        opts: [{v:0,label:'dependent'},{v:5,label:'help'},{v:10,label:'indep'}] },
      { key: 'bowels',   label: 'Bowels',
        opts: [{v:0,label:'incont'},{v:5,label:'occ acc'},{v:10,label:'cont'}] },
      { key: 'bladder',  label: 'Bladder',
        opts: [{v:0,label:'incont'},{v:5,label:'occ acc'},{v:10,label:'cont'}] },
    ],

    async init() {
      const params = new URLSearchParams(location.search);
      this.hn = params.get('hn');
      if (!this.hn) { location.href = 'index.html'; return; }

      const storage = window.Storage.get();
      this.patient = await storage.getPatient(this.hn);
      if (!this.patient) {
        alert('ไม่พบคนไข้ HN ' + this.hn);
        location.href = 'index.html';
        return;
      }
      this.template = this.patient.template || 'stroke';

      const isNew = params.get('new') === '1';
      const vId = params.get('v');

      if (isNew) {
        this.mode = 'new';
        this.prevVisit = await storage.getLatestVisit(this.hn);
        if (this.prevVisit) {
          // Deep merge previous data as starting point
          this.data = this._deepMerge(this.blankData(), this.prevVisit.data);
          this.data.date = new Date().toISOString().slice(0, 10);
          this.prevData = JSON.parse(JSON.stringify(this.prevVisit.data));
        }
        // Determine next visit number
        const visits = await storage.listVisits(this.hn);
        const nums = visits.map(v => parseInt(v.visitId, 10)).filter(n => !isNaN(n));
        this.visitNumber = (nums.length ? Math.max(...nums) : 0) + 1;
      } else if (vId) {
        this.mode = 'edit';
        const v = await storage.getVisit(this.hn, vId);
        if (!v) { alert('ไม่พบ visit'); location.href = `patient.html?hn=${this.hn}`; return; }
        this.visitId = v.visitId;
        this.visitNumber = parseInt(v.visitId, 10);
        this.data = this._deepMerge(this.blankData(), v.data);
        // Load previous for comparison
        const visits = await storage.listVisits(this.hn);
        const myIdx = visits.findIndex(x => x.visitId === v.visitId);
        const prev = visits[myIdx + 1]; // next in array = older
        if (prev) {
          this.prevVisit = prev;
          this.prevData = JSON.parse(JSON.stringify(prev.data));
        }
      }

      // Auto-save draft every 5s
      this.$watch('data', () => { this.saved = false; }, { deep: true });
      setInterval(() => {
        if (!this.saved) this.autoSave();
      }, 5000);
    },

    _deepMerge(target, source) {
      const out = JSON.parse(JSON.stringify(target));
      for (const k of Object.keys(source || {})) {
        const v = source[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && !Array.isArray(out[k])) {
          out[k] = this._deepMerge(out[k] || {}, v);
        } else if (v !== null && v !== undefined && v !== '') {
          out[k] = v;
        }
      }
      return out;
    },

    get sections() {
      const tpl = window.Templates[this.template] || window.Templates.stroke;
      return tpl.sections;
    },

    get templateInfo() {
      return window.Templates[this.template];
    },

    get bi_total() {
      return Object.values(this.data.bi || {}).reduce((s,v) => s + (Number(v)||0), 0);
    },

    get prevBI() {
      if (!this.prevData?.bi) return null;
      return Object.values(this.prevData.bi).reduce((s,v) => s + (Number(v)||0), 0);
    },

    get completion() {
      const fields = [
        this.data.cc, this.data.bp,
        this.data.brunnstrom.UE, this.data.brunnstrom.LE,
        Object.keys(this.data.mas).length > 0,
        Object.keys(this.data.mmt).length > 0,
        Object.keys(this.data.mobility).length > 0,
        this.data.intervention,
      ];
      return Math.round((fields.filter(f => !!f).length / fields.length) * 100);
    },

    get changedCount() {
      return window.Storage.visitDiff(this.prevData, this.data).length;
    },

    // ---- Helpers for highlighting ----
    prevValue(path) {
      const keys = Array.isArray(path) ? path : [path];
      let obj = this.prevData;
      for (const k of keys) {
        if (obj == null) return null;
        obj = obj[k];
      }
      if (obj === undefined || obj === null || obj === '') return null;
      return obj;
    },

    currValue(path) {
      const keys = Array.isArray(path) ? path : [path];
      let obj = this.data;
      for (const k of keys) {
        if (obj == null) return null;
        obj = obj[k];
      }
      return obj;
    },

    isChanged(path) {
      const prev = this.prevValue(path);
      const curr = this.currValue(path);
      if (prev === null && (curr === null || curr === '' || curr === undefined)) return false;
      return JSON.stringify(prev) !== JSON.stringify(curr);
    },

    changedClass(path) {
      return this.isChanged(path) ? 'ring-2 ring-amber-300' : '';
    },

    pillClass(path, value) {
      const curr = this.currValue(path);
      const isSelected = curr === value;
      const prev = this.prevValue(path);
      const wasPrev = prev === value && curr === value;
      if (isSelected && this.isChanged(path)) return 'pill-changed';
      if (isSelected) return 'pill-on';
      if (prev === value && curr === null) return 'pill-prev';
      return 'pill';
    },

    stageClass(part, n) {
      const curr = this.data.brunnstrom[part];
      const prev = this.prevValue(['brunnstrom', part]);
      if (curr === n && curr !== prev && prev !== null) return 'stage-changed';
      if (curr === n) return 'stage-on';
      if (prev === n && curr === null) return 'stage-prev';
      return 'stage';
    },

    toggle(k) { this.open[k] = !this.open[k]; },

    autoSave() {
      // Draft auto-save (overwrite-safe local draft)
      localStorage.setItem(`pt:draft:${this.hn}`, JSON.stringify({
        ...this.data, _savedAt: new Date().toISOString(),
      }));
      this.saved = true;
    },

    async saveVisit() {
      const storage = window.Storage.get();
      const changes = window.Storage.visitDiff(this.prevData, this.data);
      const visit = {
        hn: this.hn,
        visitId: this.visitId || undefined,
        visitDate: this.data.date,
        template: this.template,
        data: this.data,
        changes,
        prevVisitId: this.prevVisit?.visitId || null,
        createdAt: new Date().toISOString(),
      };
      const saved = await storage.saveVisit(this.hn, visit);
      // Clean draft
      localStorage.removeItem(`pt:draft:${this.hn}`);
      alert(`บันทึก Visit #${saved.visitId} (${changes.length} changes)`);
      location.href = `patient.html?hn=${this.hn}`;
    },

    exportJSON() {
      const snapshot = {
        patient: this.patient,
        visit: {
          visitId: this.visitId || `draft-${Date.now()}`,
          visitDate: this.data.date,
          template: this.template,
          data: this.data,
          changes: window.Storage.visitDiff(this.prevData, this.data),
        },
        _meta: { exportedAt: new Date().toISOString(), biTotal: this.bi_total },
      };
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const filename = `pt-${this.hn}-${this.data.date}.json`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    },

    voice(field) {
      if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        alert('Browser ไม่รองรับ voice'); return;
      }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR();
      rec.lang = 'th-TH';
      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        const cur = this.data[field] || '';
        this.data[field] = cur ? cur + ' ' + text : text;
      };
      rec.start();
    },
  };
}
