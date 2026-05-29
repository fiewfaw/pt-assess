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

// Visit submit endpoint (Apps Script Web App — write-only, lands in private Drive/Sheet)
const VISIT_API_URL = 'https://script.google.com/macros/s/AKfycbznwuHG1U3ZJiQl6QyjgajGFDdNWfmCe3p-1J59XTcmYJ9C8wIBMS1CPaTA6WH6CX6z/exec';

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
    hads: {},        // Thai HADS — item(1-14) -> 0-3
    fesi: {},        // Thai FES-I — item(1-16) -> 1-4
    bodyChart: [],   // array of strokes [{tool, color, size, points: [[x,y],...]}]
    noteCanvas: [],  // handwriting notepad strokes (tab 1)
    balance: {}, bbs: '',
    mobility: {}, gait: '',
    bi: {},
    mfis: {},        // MFIS — item(1-21) -> 0-4
    bbsScale: {},    // Berg Balance — item(1-14) -> 0-4
    dgi: {},         // Dynamic Gait Index — item(1-8) -> 0-3
    timed: {},       // timed/functional tests
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
    submitting: false,
    submitMsg: '',
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
      sens: 'assess', hads: 'assess', fesi: 'assess', bal: 'assess', mob: 'assess', bi: 'assess', special: 'assess',
      timed: 'assess', bbsScale: 'assess', dgi: 'assess', mfis: 'assess',
      plan: 'plan',
    },
    open: { info: true, vs: true, cog: true, brun: true, mas: true,
            mmt: true, sens: true, hads: true, fesi: true, bodychart: true, bal: true, mob: true, bi: true,
            timed: true, bbsScale: true, dgi: true, mfis: true,
            special: true, plan: true },
    infoOpen: { brun: false, mas: false, mmt: false, mob: false, bi: false, hads: false, fesi: false, bbsScale: false, dgi: false, mfis: false },

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

    // Thai HADS (Nilchaikovit 1996) — odd=Anxiety, even=Depression. Options carry per-item scores.
    hads_items: [
      { key:'h1',  sub:'A', label:'1. ฉันรู้สึกตึงเครียด',
        opts:[{v:3,label:'เป็นส่วนใหญ่'},{v:2,label:'บ่อยครั้ง'},{v:1,label:'เป็นบางครั้ง'},{v:0,label:'ไม่เป็นเลย'}] },
      { key:'h2',  sub:'D', label:'2. ฉันรู้สึกเพลิดเพลินใจกับสิ่งที่เคยชอบได้',
        opts:[{v:0,label:'เหมือนเดิม'},{v:1,label:'ไม่มากเท่าก่อน'},{v:2,label:'เล็กน้อย'},{v:3,label:'เกือบไม่มี'}] },
      { key:'h3',  sub:'A', label:'3. ฉันรู้สึกกลัวเหมือนจะมีเรื่องไม่ดีเกิดขึ้น',
        opts:[{v:3,label:'มี+ค่อนข้างรุนแรง'},{v:2,label:'มีแต่ไม่มาก'},{v:1,label:'เล็กน้อย'},{v:0,label:'ไม่มีเลย'}] },
      { key:'h4',  sub:'D', label:'4. ฉันหัวเราะ/มีอารมณ์ขันได้',
        opts:[{v:0,label:'เหมือนเดิม'},{v:1,label:'ไม่มากนัก'},{v:2,label:'มีน้อย'},{v:3,label:'ไม่มีเลย'}] },
      { key:'h5',  sub:'A', label:'5. ฉันมีความคิดวิตกกังวล',
        opts:[{v:3,label:'เป็นส่วนใหญ่'},{v:2,label:'บ่อยครั้ง'},{v:1,label:'บางครั้งไม่บ่อย'},{v:0,label:'นานๆครั้ง'}] },
      { key:'h6',  sub:'D', label:'6. ฉันรู้สึกแจ่มใสเบิกบาน',
        opts:[{v:3,label:'ไม่มีเลย'},{v:2,label:'ไม่บ่อยนัก'},{v:1,label:'เป็นบางครั้ง'},{v:0,label:'เป็นส่วนใหญ่'}] },
      { key:'h7',  sub:'A', label:'7. ฉันทำตัวตามสบาย รู้สึกผ่อนคลายได้',
        opts:[{v:0,label:'ได้ดีมาก'},{v:1,label:'ได้ทั่วไป'},{v:2,label:'ไม่บ่อยนัก'},{v:3,label:'ไม่ได้เลย'}] },
      { key:'h8',  sub:'D', label:'8. ฉันคิด/ทำอะไรเชื่องช้าลงกว่าเดิม',
        opts:[{v:3,label:'เกือบตลอดเวลา'},{v:2,label:'บ่อยมาก'},{v:1,label:'เป็นบางครั้ง'},{v:0,label:'ไม่เป็นเลย'}] },
      { key:'h9',  sub:'A', label:'9. ฉันไม่สบายใจจนปั่นป่วนในท้อง',
        opts:[{v:0,label:'ไม่เป็นเลย'},{v:1,label:'เป็นบางครั้ง'},{v:2,label:'ค่อนข้างบ่อย'},{v:3,label:'บ่อยมาก'}] },
      { key:'h10', sub:'D', label:'10. ฉันปล่อยเนื้อปล่อยตัว ไม่สนใจตนเอง',
        opts:[{v:3,label:'ใช่'},{v:2,label:'ไม่ค่อยใส่ใจ'},{v:1,label:'ใส่ใจน้อยลง'},{v:0,label:'เหมือนเดิม'}] },
      { key:'h11', sub:'A', label:'11. ฉันกระสับกระส่าย อยู่นิ่งไม่ได้',
        opts:[{v:3,label:'มากทีเดียว'},{v:2,label:'ค่อนข้างมาก'},{v:1,label:'ไม่มากนัก'},{v:0,label:'ไม่เป็นเลย'}] },
      { key:'h12', sub:'D', label:'12. ฉันมองอนาคตด้วยความเบิกบานใจ',
        opts:[{v:0,label:'มากเท่าที่เคย'},{v:1,label:'ค่อนข้างน้อยลง'},{v:2,label:'น้อยกว่าเคย'},{v:3,label:'เกือบไม่มี'}] },
      { key:'h13', sub:'A', label:'13. ฉันผวา/ตกใจขึ้นมากระทันหัน',
        opts:[{v:3,label:'บ่อยมาก'},{v:2,label:'ค่อนข้างบ่อย'},{v:1,label:'ไม่บ่อยนัก'},{v:0,label:'ไม่มีเลย'}] },
      { key:'h14', sub:'D', label:'14. ฉันเพลิดเพลินกับอ่านหนังสือ/ฟังวิทยุ/ดูทีวี ฯลฯ',
        opts:[{v:0,label:'เป็นส่วนใหญ่'},{v:1,label:'เป็นบางครั้ง'},{v:2,label:'ไม่บ่อยนัก'},{v:3,label:'น้อยมาก'}] },
    ],

    // Thai FES-I (Thiamwong 2011) — 16 items, all 1-4 (ยิ่งมากยิ่งกลัวหกล้มมาก)
    fesi_opts: [
      {v:1,label:'1 ไม่กังวล'},{v:2,label:'2 กังวลน้อย'},{v:3,label:'3 ค่อนข้างกังวล'},{v:4,label:'4 กังวลมาก'},
    ],
    fesi_items: [
      { key:'f1',  label:'1. ทำความสะอาดบ้าน' },
      { key:'f2',  label:'2. ใส่/ถอดเสื้อผ้า' },
      { key:'f3',  label:'3. หุงข้าว ทำกับข้าวง่ายๆ' },
      { key:'f4',  label:'4. อาบน้ำ' },
      { key:'f5',  label:'5. ไปซื้อของ' },
      { key:'f6',  label:'6. ลุก-นั่งเก้าอี้' },
      { key:'f7',  label:'7. ขึ้น-ลงบันได' },
      { key:'f8',  label:'8. เดินนอกบ้าน/รอบบ้าน' },
      { key:'f9',  label:'9. เอื้อมหยิบของเหนือศีรษะ/ก้มเก็บของ' },
      { key:'f10', label:'10. รับโทรศัพท์' },
      { key:'f11', label:'11. เดินบนพื้นลื่น' },
      { key:'f12', label:'12. ไปเยี่ยมญาติ/เพื่อน' },
      { key:'f13', label:'13. ไปในที่คนแออัด เช่น ตลาดสด' },
      { key:'f14', label:'14. เดินบนพื้นไม่เรียบ' },
      { key:'f15', label:'15. เดินขึ้น-ลงทางลาดชัน' },
      { key:'f16', label:'16. ไปร่วมงานชุมชน เช่น ทำบุญที่วัด/มัสยิด' },
    ],

    // ---- MS battery ----
    // MFIS (Modified Fatigue Impact Scale) — 21 ข้อ 0-4 · sub: P=physical C=cognitive S=psychosocial
    mfis_opts: [
      {v:0,label:'0 ไม่เลย'},{v:1,label:'1 นานๆครั้ง'},{v:2,label:'2 บางครั้ง'},{v:3,label:'3 บ่อย'},{v:4,label:'4 บ่อยมาก'},
    ],
    mfis_items: [
      { key:'m1',  sub:'C', label:'1. ตื่นตัว/รู้สึกตัวน้อยลง' },
      { key:'m2',  sub:'C', label:'2. จดจ่อกับสิ่งใดนานๆ ได้ยาก' },
      { key:'m3',  sub:'C', label:'3. คิดไม่ปลอดโปร่ง' },
      { key:'m4',  sub:'P', label:'4. งุ่มง่าม การประสานงานแย่ลง' },
      { key:'m5',  sub:'C', label:'5. ขี้ลืม' },
      { key:'m6',  sub:'P', label:'6. ต้องค่อยๆ ทำกิจกรรมทางกาย' },
      { key:'m7',  sub:'P', label:'7. ไม่อยากทำสิ่งที่ต้องออกแรง' },
      { key:'m8',  sub:'S', label:'8. ไม่อยากเข้าสังคม' },
      { key:'m9',  sub:'S', label:'9. ทำกิจกรรมนอกบ้านได้จำกัด' },
      { key:'m10', sub:'P', label:'10. ออกแรงต่อเนื่องนานๆ ไม่ได้' },
      { key:'m11', sub:'C', label:'11. ตัดสินใจยากขึ้น' },
      { key:'m12', sub:'C', label:'12. ไม่อยากทำสิ่งที่ต้องใช้ความคิด' },
      { key:'m13', sub:'P', label:'13. กล้ามเนื้อรู้สึกอ่อนแรง' },
      { key:'m14', sub:'P', label:'14. รู้สึกไม่สบายตัว' },
      { key:'m15', sub:'C', label:'15. ทำงานที่ใช้ความคิดให้เสร็จได้ยาก' },
      { key:'m16', sub:'C', label:'16. จัดระเบียบความคิดได้ยาก' },
      { key:'m17', sub:'P', label:'17. ทำงานที่ต้องออกแรงให้เสร็จได้น้อยลง' },
      { key:'m18', sub:'C', label:'18. คิดช้าลง' },
      { key:'m19', sub:'C', label:'19. มีสมาธิยาก' },
      { key:'m20', sub:'P', label:'20. กิจกรรมทางกายถูกจำกัด' },
      { key:'m21', sub:'P', label:'21. ต้องพักบ่อยขึ้น/นานขึ้น' },
    ],

    // Berg Balance Scale — 14 ข้อ 0-4 (4=ดีสุด)
    bbs_opts: [0,1,2,3,4],
    bbs_items: [
      { key:'b1',  label:'1. ลุกจากนั่งเป็นยืน' },
      { key:'b2',  label:'2. ยืนไม่พยุง' },
      { key:'b3',  label:'3. นั่งไม่พยุง' },
      { key:'b4',  label:'4. ยืนเป็นนั่ง' },
      { key:'b5',  label:'5. ย้ายตัว (transfer)' },
      { key:'b6',  label:'6. ยืนหลับตา' },
      { key:'b7',  label:'7. ยืนเท้าชิด' },
      { key:'b8',  label:'8. เอื้อมไปข้างหน้า (แขนเหยียด)' },
      { key:'b9',  label:'9. ก้มเก็บของจากพื้น' },
      { key:'b10', label:'10. หันมองข้างหลัง' },
      { key:'b11', label:'11. หมุนตัว 360°' },
      { key:'b12', label:'12. วางเท้าสลับบนสตูล' },
      { key:'b13', label:'13. ยืนเท้าหน้า-หลัง (tandem)' },
      { key:'b14', label:'14. ยืนขาเดียว' },
    ],

    // Dynamic Gait Index — 8 ข้อ 0-3 (3=ดีสุด)
    dgi_opts: [0,1,2,3],
    dgi_items: [
      { key:'d1', label:'1. เดินพื้นราบ' },
      { key:'d2', label:'2. เปลี่ยนความเร็วเดิน' },
      { key:'d3', label:'3. เดินหันหน้าซ้าย-ขวา' },
      { key:'d4', label:'4. เดินเงย-ก้มหน้า' },
      { key:'d5', label:'5. เดินแล้วหมุนตัวหยุด' },
      { key:'d6', label:'6. ก้าวข้ามสิ่งกีดขวาง' },
      { key:'d7', label:'7. ก้าวอ้อมสิ่งกีดขวาง' },
      { key:'d8', label:'8. ขึ้น-ลงบันได' },
    ],

    // Timed / functional tests
    timed_fields: [
      { key:'sixmwt',   label:'6MWT',            unit:'m' },
      { key:'tenmwt_n', label:'10MWT ปกติ',      unit:'วิ/10m' },
      { key:'tenmwt_f', label:'10MWT เร็วสุด',   unit:'วิ/10m' },
      { key:'tug',      label:'TUG',             unit:'วิ' },
      { key:'sts5',     label:'5×Sit-to-Stand',  unit:'วิ' },
      { key:'tandemL',  label:'Tandem ซ้าย',     unit:'วิ' },
      { key:'tandemR',  label:'Tandem ขวา',      unit:'วิ' },
      { key:'romberg',  label:'Romberg หลับตา',  unit:'วิ' },
      { key:'steptest', label:'Step test 3 นาที', unit:'ครั้ง' },
    ],

    // Read-only EBP recommendation block shown in Plan tab (per template).
    // มี entry = แสดงบล็อกอ่านอย่างเดียว + ซ่อนช่องกรอก (treatment จริง → แท็บ 📝 จดโน๊ต)
    // ไม่มี entry = ใช้ช่องกรอก plan ปกติ
    planRecs: {
      stroke: { title:'💡 แนวทางรักษา Stroke (อ้างอิง EBP)', items:[
        'Task-specific training — ฝึกกิจกรรมจริง จำนวนครั้งสูง เน้นใช้ข้างอ่อนแรง',
        'Strength training — เพิ่มแรงข้างอ่อนแรง (ไม่เพิ่ม spasticity)',
        'Gait + balance — task-oriented · ลุกนั่ง/เดิน · treadmill ถ้าเหมาะ',
        'UE: CIMT/mCIMT ถ้าเข้าเกณฑ์ (มี active wrist/finger ext) · ฝึกใช้มือจริง',
        'Aerobic conditioning ตามที่ทนได้',
        'Spasticity: ยืด / จัดท่า / positioning',
        'Home program + สอนผู้ดูแล · ทำต่อเนื่อง',
      ]},
      complex: { title:'💡 แนวทาง เคสซับซ้อนหลายระบบ', items:[
        'ไล่ priority ทีละระบบ (หายใจ → mobility → balance → จิตใจ)',
        'Breathing / diaphragm + lateral costal expansion ถ้ามีปัญหาทรวงอก',
        'Soft tissue / scar / manual therapy ตามข้อจำกัด',
        'Balance training (รวม eyes-closed) ถ้ามี deficit',
        'จิตใจ/ความกังวล: therapeutic touch · graded · ไม่บังคับ',
        'Home program + ผู้ดูแล · ปรับตามวันที่ทนได้',
      ]},
      ms: { title:'💡 แนวทางรักษา MS (อ้างอิง EBP)', items:[
        'Spasticity: ยืด/จัดท่า ข้างที่เป็น',
        'Strength: resistance 2–3 เซ็ต×8–12 ครั้ง ×2/สัปดาห์',
        'Aerobic: เดิน/ปั่น 20–40 นาที ×3/สัปดาห์ (sub-max)',
        'Balance/gait: task-specific + dual-task',
        'Sit-to-stand training',
        'Fatigue: pacing + cooling (กันร้อน/Uhthoff)',
        'Home program + สอนผู้ดูแล',
      ]},
    },

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
        // Body chart carries forward from the previous visit (editable starting
        // point — like the other progress-note fields). Notepad handwriting
        // stays per-visit (notes don't carry forward).
        this.data.bodyChart = this.prevVisit?.data?.bodyChart
          ? JSON.parse(JSON.stringify(this.prevVisit.data.bodyChart))
          : [];
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

    get planRec() { return this.planRecs[this.template] || null; },

    get bi_total() {
      return Object.values(this.data.bi || {}).reduce((s,v) => s + (Number(v)||0), 0);
    },

    get prevBI() {
      if (!this.prevData?.bi) return null;
      return Object.values(this.prevData.bi).reduce((s,v) => s + (Number(v)||0), 0);
    },

    // ---- HADS / FES-I scoring ----
    _hadsSum(sub) {
      return this.hads_items
        .filter(it => it.sub === sub)
        .reduce((s, it) => s + (Number(this.data.hads?.[it.key]) || 0), 0);
    },
    get hadsAnxiety() { return this._hadsSum('A'); },
    get hadsDepression() { return this._hadsSum('D'); },
    hadsInterp(score) {
      if (score >= 11) return 'ผิดปกติ (case)';
      if (score >= 8) return 'ก้ำกึ่ง';
      return 'ปกติ';
    },
    get fesiTotal() {
      return this.fesi_items.reduce((s, it) => s + (Number(this.data.fesi?.[it.key]) || 0), 0);
    },
    get fesiInterp() {
      const t = this.fesiTotal;
      if (t === 0) return '';
      if (t >= 28) return 'กังวลหกล้มสูง';
      if (t >= 20) return 'กังวลปานกลาง';
      return 'กังวลต่ำ';
    },

    // ---- MS battery scoring ----
    _mfisSum(sub) {
      return this.mfis_items
        .filter(it => !sub || it.sub === sub)
        .reduce((s, it) => s + (Number(this.data.mfis?.[it.key]) || 0), 0);
    },
    get mfisTotal() { return this._mfisSum(null); },
    get mfisPhysical() { return this._mfisSum('P'); },
    get mfisCognitive() { return this._mfisSum('C'); },
    get mfisPsychosocial() { return this._mfisSum('S'); },
    get mfisInterp() {
      const t = this.mfisTotal;
      if (t === 0) return '';
      return t >= 38 ? 'ล้าสูง (≥38)' : 'ล้าไม่สูง';
    },
    get bbsTotal() {
      return this.bbs_items.reduce((s, it) => s + (Number(this.data.bbsScale?.[it.key]) || 0), 0);
    },
    get bbsAnswered() {
      return this.bbs_items.filter(it => this.data.bbsScale?.[it.key] !== undefined).length;
    },
    get bbsInterp() {
      if (this.bbsAnswered === 0) return '';
      const t = this.bbsTotal;
      const lv = t <= 20 ? 'wheelchair' : t <= 40 ? 'walk+assist' : 'independent';
      return t < 45 ? lv + ' · เสี่ยงล้ม(<45)' : lv;
    },
    get dgiTotal() {
      return this.dgi_items.reduce((s, it) => s + (Number(this.data.dgi?.[it.key]) || 0), 0);
    },
    get dgiAnswered() {
      return this.dgi_items.filter(it => this.data.dgi?.[it.key] !== undefined).length;
    },
    get dgiInterp() {
      if (this.dgiAnswered === 0) return '';
      return this.dgiTotal <= 19 ? 'เสี่ยงล้ม (≤19)' : 'ปกติ';
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

    // Send the full visit (+ patient contact) to the Apps Script cloud archive.
    // Fire-and-forget (no-cors) — works on the tablet without GitHub PAT.
    async submitToCloud() {
      this.submitting = true;
      this.submitMsg = '';
      try {
        if (!this.saved) await this._autoSave();
        const p = this.patient || {};
        const payload = {
          patient: {
            hn: this.hn,
            nickname: p.nickname || '',
            firstName: p.firstName || '',
            lastInitial: p.lastInitial || '',
            phone: p.phone || '',
            address: p.address || '',
            mapUrl: p.mapUrl || '',
            sex: p.sex || '',
            age: p.age || '',
            dx: p.dx || '',
            dominantSide: p.dominantSide || '',
            affectedSide: p.affectedSide || '',
            onsetDate: p.onsetDate || '',
            template: p.template || this.template,
          },
          visit: {
            hn: this.hn,
            visitId: this.visitId || '',
            visitDate: this.data.date,
            visitNumber: this.visitNumber,
            template: this.template,
            data: this.data,
            submittedAt: new Date().toISOString(),
          },
        };
        await fetch(VISIT_API_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
        });
        this.submitMsg = '✓ ส่งแล้ว';
      } catch (e) {
        console.error('submitToCloud failed', e);
        this.submitMsg = '✗ ส่งไม่สำเร็จ (ข้อมูลยังอยู่เครื่อง ลองใหม่ได้)';
      } finally {
        this.submitting = false;
        setTimeout(() => { this.submitMsg = ''; }, 5000);
      }
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
        if (canvas.width !== 1000) { canvas.width = 1000; canvas.height = 4200; }
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
        ctx.lineWidth = stroke.size * 2.5;
      }
      const pts = stroke.points;
      const W = canvas.width, H = canvas.height;
      if (pts.length === 1) {
        const p = pts[0];
        ctx.beginPath();
        ctx.arc(p[0] * W, p[1] * H,
                (stroke.tool === 'eraser' ? stroke.size * 3 : stroke.size * 1.25), 0, Math.PI * 2);
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
