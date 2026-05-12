function assessForm() {
  return {
    saved: true,
    open: { info: true, vs: false, cog: false, brun: false, mas: false,
            mmt: false, sens: false, bal: false, mob: false, bi: false,
            special: false, plan: false },

    data: {
      // Patient info
      hn: '', name: '', date: new Date().toISOString().slice(0,10),
      age: '', sex: '', dominant: '', dx: '', affectedSide: '', onsetDays: '',
      cc: '',
      // Vital
      bp: '', hr: '', rr: '', spo2: '',
      // Cog
      consciousness: '', orient: { person: false, place: false, time: false },
      cognitionNote: '',
      // Motor
      brunnstrom: { UE: null, Hand: null, LE: null },
      mas: {},
      mmt: {},
      // Sensation
      sensation: {}, proprioception: '', stereognosis: '',
      // Balance
      balance: {}, bbs: '',
      // Mobility
      mobility: {}, gait: '',
      // BI
      bi: {},
      // Special
      special: {}, otherFindings: '',
      // Plan
      stg: '', ltg: '', plan: '',
    },

    // Barthel Index definition
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

    get bi_total() {
      return Object.values(this.data.bi).reduce((s,v) => s + (Number(v)||0), 0);
    },

    get completion() {
      const fields = [
        this.data.hn, this.data.name, this.data.dx, this.data.affectedSide,
        this.data.bp, this.data.consciousness,
        this.data.brunnstrom.UE, this.data.brunnstrom.LE,
        Object.keys(this.data.mas).length > 0,
        Object.keys(this.data.mmt).length > 0,
        Object.keys(this.data.sensation).length > 0,
        Object.keys(this.data.balance).length > 0,
        Object.keys(this.data.mobility).length > 0,
        this.bi_total > 0,
        this.data.plan,
      ];
      const filled = fields.filter(f => !!f).length;
      return Math.round((filled / fields.length) * 100);
    },

    init() {
      // Auto-load draft if same day + same HN later
      const draft = localStorage.getItem('pt-assess-draft');
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (confirm(`พบ draft จาก ${parsed._savedAt || 'ก่อนหน้านี้'} โหลดต่อไหม?`)) {
            Object.assign(this.data, parsed);
          } else {
            localStorage.removeItem('pt-assess-draft');
          }
        } catch(e) { console.warn('draft parse failed', e); }
      }

      // Watch all data changes → mark unsaved + auto-save every 5s
      this.$watch('data', () => { this.saved = false; }, { deep: true });
      setInterval(() => {
        if (!this.saved) this.autoSave();
      }, 5000);
    },

    toggle(key) {
      this.open[key] = !this.open[key];
    },

    autoSave() {
      const snapshot = { ...this.data, _savedAt: new Date().toISOString() };
      localStorage.setItem('pt-assess-draft', JSON.stringify(snapshot));
      this.saved = true;
    },

    save() {
      this.autoSave();
      // Also save as named record
      const key = `pt-assess-${this.data.hn || 'no-hn'}-${this.data.date || 'no-date'}`;
      const snapshot = { ...this.data, _savedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(snapshot));
      alert(`บันทึกแล้ว: ${key}`);
    },

    exportJSON() {
      const snapshot = {
        ...this.data,
        _meta: {
          template: 'stroke-v0',
          exportedAt: new Date().toISOString(),
          biTotal: this.bi_total,
          completion: this.completion,
        }
      };
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const filename = `pt-${this.data.hn || 'no-hn'}-${this.data.date || 'no-date'}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },

    reset() {
      if (!confirm('ล้างฟอร์มทั้งหมด? (draft จะถูกลบด้วย)')) return;
      localStorage.removeItem('pt-assess-draft');
      location.reload();
    },

    // Voice input via Web Speech API
    voice(field) {
      if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        alert('Browser นี้ไม่รองรับ voice input');
        return;
      }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR();
      rec.lang = 'th-TH';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        const current = this.data[field] || '';
        this.data[field] = current ? (current + ' ' + text) : text;
      };
      rec.onerror = (e) => console.warn('voice error', e);
      rec.start();
    },
  };
}
