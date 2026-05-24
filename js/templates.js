/**
 * Disease templates — define which sections appear per condition.
 * V0: Stroke complete. Others stubbed for Phase 1, will expand.
 *
 * Each section ID maps to a renderable block in visit.html.
 */

const Templates = {
  stroke: {
    id: 'stroke',
    name: 'Stroke',
    icon: '🧠',
    description: 'CVA / hemiparesis / hemiplegia',
    sections: ['info', 'vs', 'cog', 'brun', 'mas', 'mmt', 'sens', 'bodychart', 'bal', 'mob', 'bi', 'special', 'plan'],
  },
  'knee-oa': {
    id: 'knee-oa',
    name: 'Knee OA / Post-op',
    icon: '🦵',
    description: 'Knee osteoarthritis, TKR, ACL',
    sections: ['info', 'vs', 'vas', 'rom-knee', 'mmt-knee', 'tug', 'sts30', 'plan'],
    stub: true,
  },
  lbp: {
    id: 'lbp',
    name: 'Low Back Pain',
    icon: '🔥',
    description: 'LBP, sciatica, lumbar disc',
    sections: ['info', 'vs', 'vas', 'rom-lumbar', 'mmt-trunk', 'neuro-screen', 'odi', 'plan'],
    stub: true,
  },
  shoulder: {
    id: 'shoulder',
    name: 'Shoulder / Frozen shoulder',
    icon: '💪',
    description: 'Adhesive capsulitis, RC tear',
    sections: ['info', 'vs', 'vas', 'rom-shoulder', 'mmt-shoulder', 'special-shoulder', 'spadi', 'plan'],
    stub: true,
  },
  sci: {
    id: 'sci',
    name: 'Spinal Cord Injury',
    icon: '🦴',
    description: 'Para/tetraplegia, ASIA',
    sections: ['info', 'vs', 'asia', 'mas', 'mmt', 'sens', 'mob', 'bi', 'plan'],
    stub: true,
  },
  complex: {
    id: 'complex',
    name: 'Multi-system / Complex',
    icon: '🎗️',
    description: 'เคสซับซ้อนหลายระบบ (เช่น post-cancer + จิตใจ + ทรงตัว) — กว้าง ปรับหน้างาน',
    sections: ['info', 'vs', 'bodychart', 'hads', 'fesi', 'bal', 'mob', 'special', 'plan'],
  },
  custom: {
    id: 'custom',
    name: 'Custom (pick sections)',
    icon: '🧩',
    description: 'เลือก section เอง',
    sections: [],
    custom: true,
  },
};

window.Templates = Templates;
