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
    bodyChart: [],   // array of strokes [{tool, color, size, points: [[x,y],...]}]
    noteCanvas: [],  // handwriting notepad strokes (tab 1)
    balance: {}, bbs: '',
    mobility: {}, gait: '',
    bi: {},
    special: {},
    otherFindings: '',
    intervention: '', plan: '', notes: '',
    refNote: '',
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
    saving: false,
    lastSavedAt: null,
    _initialized: false,
    template: 'stroke',
    activeTab: 'note',
    tabs: [
      { id: 'note',   icon: '📝', label: 'จดโน๊ต' },
      { id: 'assess', icon: '📋', label: 'แบบประเมิน' },
      { id: 'plan',   icon: '🎯', label: 'Plan' },
    ],
    sectionTab: {
      info: 'note', bodychart: 'note',
      vs: 'assess', cog: 'assess', brun: 'assess', mas: 'assess', mmt: 'assess',
      sens: 'assess', bal: 'assess', mob: 'assess', bi: 'assess', special: 'assess',
      plan: 'plan',
    },
    open: { info: true, vs: true, cog: true, brun: true, mas: true,
            mmt: true, sens: true, bodychart: true, bal: true, mob: true, bi: true,
            special: true, plan: true },
    infoOpen: { brun: false, mas: false, mmt: false, mob: false, bi: false },

    // Body chart canvas state
    chartTool: 'pain',
    chartSize: 4,
    chartStrokes: [],
    _chartDrawing: false,
    _chartCurrent: null,
    chartTools: [
      { id: 'pain',      color: '#dc2626', label: 'Pain',      icon: '🔴' },
      { id: 'weakness',  color: '#2563eb', label: 'Weakness',  icon: '🔵' },
      { id: 'spastic',   color: '#ca8a04', label: 'Spastic',   icon: '🟡' },
      { id: 'sensation', color: '#16a34a', label: 'Sens loss', icon: '🟢' },
      { id: 'note',      color: '#0f172a', label: 'Note',      icon: '⚫' },
      { id: 'eraser',    color: null,      label: 'Eraser',    icon: '🧽' },
    ],

    // Notepad (handwriting) canvas state — tab 1
    notepadTool: 'pen',
    notepadColor: '#0f172a',
    notepadSize: 3,
    notepadStrokes: [],
    _notepadDrawing: false,
    _notepadCurrent: null,
    notepadColors: [
      { id: 'black', color: '#0f172a' },
      { id: 'blue',  color: '#2563eb' },
      { id: 'red',   color: '#dc2626' },
    ],

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
        // Body chart + notepad are per-visit (don't carry strokes forward)
        this.data.bodyChart = [];
        this.data.noteCanvas = [];
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

      // Sync body chart strokes from loaded data
      if (Array.isArray(this.data.bodyChart)) {
        this.chartStrokes = [...this.data.bodyChart];
      }
      if (Array.isArray(this.data.noteCanvas)) {
        this.notepadStrokes = [...this.data.noteCanvas];
      }

      // Mark initialized AFTER initial data load so the watch doesn't auto-save the preload
      await this.$nextTick();
      this._initialized = true;

      // Initial canvas render for the default (note) tab
      this.notepadSetupCanvas();

      // Auto-save: 3s after last change (debounced)
      this.$watch('data', () => {
        if (!this._initialized) return;
        this.saved = false;
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this._autoSave(), 3000);
      }, { deep: true });

      // Redraw body chart when section first opens
      this.$watch('open.bodychart', (val) => {
        if (val) this.chartSetupCanvas();
      });

      // Re-measure canvases when the note tab becomes active
      this.$watch('activeTab', (val) => {
        if (val === 'note') { this.chartSetupCanvas(); this.notepadSetupCanvas(); }
      });

      // Flush on tab close / navigate
      window.addEventListener('beforeunload', () => {
        if (!this.saved) this._autoSave();
      });
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

    switchTab(id) {
      this.activeTab = id;
      if (id === 'note') { this.chartSetupCanvas(); this.notepadSetupCanvas(); }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    inTab(sec) { return this.sectionTab[sec] === this.activeTab; },

    async _autoSave() {
      // Skip if new visit with no changes — don't pollute records
      const changeCount = window.Storage.visitDiff(this.prevData, this.data).length;
      if (this.mode === 'new' && !this.visitId && changeCount === 0) {
        this.saved = true;
        return;
      }
      this.saving = true;
      try {
        const storage = window.Storage.get();
        const visit = {
          hn: this.hn,
          visitId: this.visitId || undefined,
          visitDate: this.data.date,
          template: this.template,
          data: this.data,
          changes: window.Storage.visitDiff(this.prevData, this.data),
          prevVisitId: this.prevVisit?.visitId || null,
          createdAt: new Date().toISOString(),
        };
        const saved = await storage.saveVisit(this.hn, visit);
        this.visitId = saved.visitId;  // remember for subsequent updates
        this.saved = true;
        this.lastSavedAt = new Date();
      } catch (e) {
        console.error('autosave failed', e);
        this.saved = false;
      } finally {
        this.saving = false;
      }
    },

    async done() {
      clearTimeout(this._saveTimer);
      if (!this.saved) await this._autoSave();
      location.href = `patient.html?hn=${this.hn}`;
    },

    timeAgo(date) {
      if (!date) return '';
      const sec = Math.floor((Date.now() - date.getTime()) / 1000);
      if (sec < 5) return 'เมื่อกี้';
      if (sec < 60) return `${sec} วิ.`;
      if (sec < 3600) return `${Math.floor(sec/60)} นาที`;
      return `${Math.floor(sec/3600)} ชม.`;
    },

    // ---- Body chart canvas methods ----
    chartSetupCanvas() {
      this.$nextTick(() => {
        const canvas = this.$refs.chartCanvas;
        const img = this.$refs.chartImg;
        if (!canvas || !img || !img.naturalWidth) return;
        if (canvas.width !== img.naturalWidth) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }
        this.chartRedraw();
      });
    },

    _chartPoint(e) {
      const canvas = this.$refs.chartCanvas;
      const rect = canvas.getBoundingClientRect();
      return [
        Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
      ];
    },

    chartStart(e) {
      this.chartSetupCanvas();
      this._chartDrawing = true;
      try { e.target.setPointerCapture?.(e.pointerId); } catch {}
      const toolId = this._isEraserEvent(e) ? 'eraser' : this.chartTool;
      const tool = this.chartTools.find(t => t.id === toolId);
      const pt = this._chartPoint(e);
      this._chartCurrent = {
        tool: toolId,
        color: tool?.color,
        size: this.chartSize,
        points: [pt],
      };
      this._chartDrawStroke(this._chartCurrent);
    },

    chartMove(e) {
      if (!this._chartDrawing || !this._chartCurrent) return;
      const pt = this._chartPoint(e);
      this._chartCurrent.points.push(pt);
      this._chartDrawStroke(this._chartCurrent);
    },

    chartEnd() {
      if (this._chartCurrent && this._chartCurrent.points.length > 0) {
        this.chartStrokes.push(this._chartCurrent);
        this.data.bodyChart = [...this.chartStrokes];
      }
      this._chartDrawing = false;
      this._chartCurrent = null;
    },

    _chartDrawStroke(stroke) {
      const canvas = this.$refs.chartCanvas;
      if (!canvas || !canvas.width) return;
      const ctx = canvas.getContext('2d');
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const sizeFactor = stroke.tool === 'eraser' ? 4 : 1;
      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = '#000';
        ctx.fillStyle = '#000';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
      }
      ctx.lineWidth = stroke.size * sizeFactor;

      const pts = stroke.points;
      if (pts.length === 1) {
        const p = pts[0];
        ctx.beginPath();
        ctx.arc(p[0] * canvas.width, p[1] * canvas.height,
                stroke.size * sizeFactor / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * canvas.width, pts[0][1] * canvas.height);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0] * canvas.width, pts[i][1] * canvas.height);
      }
      ctx.stroke();
    },

    chartRedraw() {
      const canvas = this.$refs.chartCanvas;
      if (!canvas || !canvas.width) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of this.chartStrokes) this._chartDrawStroke(s);
    },

    chartUndo() {
      if (this.chartStrokes.length === 0) return;
      this.chartStrokes.pop();
      this.data.bodyChart = [...this.chartStrokes];
      this.chartRedraw();
    },

    chartClear() {
      if (this.chartStrokes.length === 0) return;
      if (!confirm('ลบ markers ทั้งหมด?')) return;
      this.chartStrokes = [];
      this.data.bodyChart = [];
      this.chartRedraw();
    },

    // S Pen barrel/side button (or eraser tip) → treat as eraser
    _isEraserEvent(e) {
      if (e.pointerType === 'eraser') return true;
      if (e.pointerType === 'pen') {
        if ((e.buttons & 32) || (e.buttons & 2)) return true;  // eraser bit / barrel bit held
        if (e.button === 5 || e.button === 2) return true;     // eraser / barrel on pointerdown
      }
      return false;
    },

    // ---- Notepad (handwriting) canvas methods ----
    notepadSetupCanvas() {
      this.$nextTick(() => {
        const canvas = this.$refs.notepadCanvas;
        if (!canvas) return;
        if (canvas.width !== 1000) { canvas.width = 1000; canvas.height = 1400; }
        this.notepadRedraw();
      });
    },

    _notepadPoint(e) {
      const canvas = this.$refs.notepadCanvas;
      const rect = canvas.getBoundingClientRect();
      return [
        Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
      ];
    },

    notepadStart(e) {
      this.notepadSetupCanvas();
      this._notepadDrawing = true;
      try { e.target.setPointerCapture?.(e.pointerId); } catch {}
      const erase = this._isEraserEvent(e) || this.notepadTool === 'eraser';
      this._notepadCurrent = {
        tool: erase ? 'eraser' : 'pen',
        color: this.notepadColor,
        size: this.notepadSize,
        points: [this._notepadPoint(e)],
      };
      this._notepadDrawStroke(this._notepadCurrent);
    },

    notepadMove(e) {
      if (!this._notepadDrawing || !this._notepadCurrent) return;
      this._notepadCurrent.points.push(this._notepadPoint(e));
      this._notepadDrawStroke(this._notepadCurrent);
    },

    notepadEnd() {
      if (this._notepadCurrent && this._notepadCurrent.points.length > 0) {
        this.notepadStrokes.push(this._notepadCurrent);
        this.data.noteCanvas = [...this.notepadStrokes];
      }
      this._notepadDrawing = false;
      this._notepadCurrent = null;
    },

    _notepadDrawStroke(stroke) {
      const canvas = this.$refs.notepadCanvas;
      if (!canvas || !canvas.width) return;
      const ctx = canvas.getContext('2d');
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = '#000';
        ctx.fillStyle = '#000';
        ctx.lineWidth = stroke.size * 6;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
        ctx.lineWidth = stroke.size;
      }
      const pts = stroke.points;
      const W = canvas.width, H = canvas.height;
      if (pts.length === 1) {
        const p = pts[0];
        ctx.beginPath();
        ctx.arc(p[0] * W, p[1] * H,
                (stroke.tool === 'eraser' ? stroke.size * 3 : stroke.size / 2), 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * W, pts[0][1] * H);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0] * W, pts[i][1] * H);
      }
      ctx.stroke();
    },

    notepadRedraw() {
      const canvas = this.$refs.notepadCanvas;
      if (!canvas || !canvas.width) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of this.notepadStrokes) this._notepadDrawStroke(s);
    },

    notepadUndo() {
      if (this.notepadStrokes.length === 0) return;
      this.notepadStrokes.pop();
      this.data.noteCanvas = [...this.notepadStrokes];
      this.notepadRedraw();
    },

    notepadClear() {
      if (this.notepadStrokes.length === 0) return;
      if (!confirm('ลบโน๊ตทั้งหมด?')) return;
      this.notepadStrokes = [];
      this.data.noteCanvas = [];
      this.notepadRedraw();
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
