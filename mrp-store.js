/**
 * QueenCosy MRP & Order-to-BOM Planning Engine (mrp-store.js)
 * Connects:
 *  1) Order Backlog (TikTok / Shopee) & Finished Goods (FG) Stock Netting
 *  2) Master BOM (439 SKUs × 43 BOM Materials + Hardware/Consumable rules)
 *  3) Real-time Raw Material Stock from Stock Movement App (Supabase: QC_STOCK_MOVEMENT_DATA_V4)
 *  4) Master Supplier Mapping & Purchase Requisition (Cash Weekly vs Credit Month-End)
 *  5) Bidirectional Sync with QueenCosy P&L (QUEENCOSY_PNL_STATE_V1)
 */

(function (window) {
  'use strict';

  const SUPABASE_URL = 'https://yercmidyvfetvbbrewlf.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcmNtaWR5dmZldHZiYnJld2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MTA4MzUsImV4cCI6MjEwNDE4NjgzNX0.7tGbXNoogdLh6UQOJBJe9MABmY7W5J1aixPLJSXGSGk';

  const CLOUD_STOCK_MOVEMENT_ID = 'QC_STOCK_MOVEMENT_DATA_V4';
  const CLOUD_FABRIC_STATE_ID = 'QC_FABRIC_CUTTER_STATE_V1';
  const CLOUD_FG_INVENTORY_ID = 'QC_FG_INVENTORY_DATA_V1';
  const CLOUD_MRP_STATE_ID = 'QC_MRP_BOM_PLANNER_STATE_V1';
  const LOCAL_MRP_STATE_KEY = 'QUEENCOSY_MRP_STATE_V2';
  const LOCAL_STOCK_MOVEMENT_KEY = 'STOCK_APP_DATA_V4';
  const LOCAL_FG_INVENTORY_KEY = 'QC_FG_INVENTORY_DATA_V1';
  const LOCAL_PNL_STATE_KEY = 'QUEENCOSY_PNL_STATE_V1';

  // =========================================================================
  // 1. MASTER SUPPLIERS DIRECTORY (From queencosy-mrp-bom-planner SKILL.md)
  // =========================================================================
  const MASTER_SUPPLIERS = [
    // 1. WOOD
    { id: 'SUP-MJ-WOOD', name: 'MJ- ไม้', category: 'WOOD', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน (30 วัน)', icon: '🪵', note: 'ไม้ระแนง 1M, 1.5M, ไม้สะเดา' },
    { id: 'SUP-LUNNEE', name: 'ลุนนี (ไม้)', category: 'WOOD', termType: 'CASH_WEEKLY', termLabel: 'จ่ายรายสัปดาห์ / เงินสด', icon: '🪵', note: 'ไม้หน้า 3, 4 และไม้อัดใหญ่ (อยุธยา)' },
    { id: 'SUP-SOMKRAI', name: 'สมไกรค้าไม้ (ไม้หน้า 4/ไม้อัด)', category: 'WOOD', termType: 'CASH_WEEKLY', termLabel: 'จ่ายรายสัปดาห์', icon: '🪵', note: 'ไม้อัด 30-50 บ., ไม้หน้า 4' },
    { id: 'SUP-PREECHA', name: 'ปรีชาค้าไม้ / กานต์ค้าไม้', category: 'WOOD', termType: 'CASH_WEEKLY', termLabel: 'จ่ายรายสัปดาห์', icon: '🪵', note: 'ไม้หน้า 2, 3.5, 4' },
    { id: 'SUP-KULLANAT-WOOD', name: 'กุลนาถ (ไม้)', category: 'WOOD', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน', icon: '🪵', note: 'ไม้โครงโซฟา' },

    // 2. FOAM
    { id: 'SUP-PREMIUM-FOAM', name: 'บจก.พรีเมียม (ฟองน้ำ)', category: 'FOAM', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน', icon: '🧽', note: 'ฟองน้ำ PM7, PM103, PM214, ตัวแอล' },
    { id: 'SUP-DURAFOAM', name: 'ดูราโฟม (ฟองน้ำ)', category: 'FOAM', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน', icon: '🧽', note: 'ฟองน้ำเนื้อนั่ง/เนื้อพิง DF' },
    { id: 'SUP-CHOTANAN', name: 'ฟองน้ำโชติอนันต์ / จิตราวดี', category: 'FOAM', termType: 'CASH_WEEKLY', termLabel: 'จ่ายรายสัปดาห์', icon: '🧽', note: 'ฟองน้ำเสริม' },
    { id: 'SUP-SUNPOLY', name: 'ซันโพลี / ชลบุรี (ใยสังเคราะห์)', category: 'FOAM', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน', icon: '🧽', note: 'ใยนุ่นหมอน, ใยโพลี, ผ้าปิดตูด' },

    // 3. FABRIC
    { id: 'SUP-PDK-FABRIC', name: 'PDK-ผ้า', category: 'FABRIC', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน', icon: '🧵', note: 'ผ้าลูกฟูก CSF356, ฮอลแลนด์ HL337, นาโน PKD736B' },
    { id: 'SUP-MJ-RAW', name: 'MJ- วัตถุดิบ', category: 'FABRIC', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน', icon: '🧵', note: 'ผ้าโพลี MJ350, ฮอลแลนด์ MJ337, หนัง PQ002C (~58%) + ฮาร์ดแวร์/ขา/เกียร์/แม็ก (~42%)' },
    { id: 'SUP-TODA', name: 'โตด้า (ToDa - หนัง/ผ้า)', category: 'FABRIC', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน', icon: '🧵', note: 'หนัง PD130 ดำ, PD9006 มอคค่า, PQ002C' },
    { id: 'SUP-LT-GARMENT', name: 'แอลที การ์เม้นท์ (ผ้านอก)', category: 'FABRIC', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน', icon: '🧵', note: 'ผ้านำเข้าพิเศษ' },

    // 4. HARDWARE
    { id: 'SUP-VNINE', name: 'วี-ไนน (กาว & ฟิล์ม/เทป)', category: 'HARDWARE', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน', icon: '🔩', note: 'กาวพ่น, เทปใส, พลาสติกใส 54"' },
    { id: 'SUP-ASP-SCREW', name: 'เอ.เอส.พี / ไทยทวีภัณฑ์ (สกรู)', category: 'HARDWARE', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน', icon: '🔩', note: 'สกรู 2", สกรู 2.5", ปุ่มรองขา' },
    { id: 'SUP-KITTISAK', name: 'กิตติศักดิ์ (ลูกแม็ก) / ไพวัล (ด้าย)', category: 'HARDWARE', termType: 'CASH_WEEKLY', termLabel: 'จ่ายรายสัปดาห์ / เงินสด', icon: '🔩', note: 'ลูกแม็ก F40, 1008J, ด้ายเอ็นใส' },

    // 5. PACKAGING
    { id: 'SUP-THAISTAR', name: 'ไทยสตาร์ (ถุงแพ็ค/ซีลยืด)', category: 'PACKAGING', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน', icon: '📦', note: 'ซีลยืด ฟิล์มหด ถุงแพ็คโซฟา' },
    { id: 'SUP-KULLANAT-PKG', name: 'บจก.กุลนาถ (กระดาษลูกฟูก/บับเบิ้ล)', category: 'PACKAGING', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน', icon: '📦', note: 'กระดาษลูกฟูกม้วน/แผ่น, บับเบิ้ลกันกระแทก' },
    { id: 'SUP-FUTUREPACK', name: 'ฟิวเจอร์แพ็ค / พี.ซี.พลาส (บับเบิ้ล)', category: 'PACKAGING', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน', icon: '📦', note: 'บับเบิ้ลห่อโซฟา' },
    { id: 'SUP-SAMMOOK', name: 'บ.สามมุก (กระดาษลูกฟูก)', category: 'PACKAGING', termType: 'CREDIT_EOM', termLabel: 'เครดิตรอบสิ้นเดือน', icon: '📦', note: 'กระดาษลูกฟูกแผ่น/ม้วน' },

    // 6. OUTSOURCE
    { id: 'SUP-DONMUEANG', name: 'ตัดผ้าดอนเมือง (คุณฤทัยรัตน์)', category: 'OUTSOURCE', termType: 'CASH_WEEKLY', termLabel: 'จ่ายรายสัปดาห์ / รายงวด', icon: '✂️', note: 'จ้างเหมาตัดเย็บชุดผ้าโซฟาข้างนอก' }
  ];

  // =========================================================================
  // 2. DEFAULT MAPPING: 43 BOM MATERIALS -> REAL STOCK MOVEMENT PRODUCT IDs
  // =========================================================================
  // Links every BOM material to:
  // - stockProductIds: array of real product IDs in QC_STOCK_MOVEMENT_DATA_V4 (sums their on-hand qty)
  // - conversionFactor: how many BOM units equal 1 Stock Movement unit
  //   Example: BOM uses 'บับเบิ้ล (cm.)' (550 cm per sofa), while Stock Movement tracks 'ม้วน' (1 roll = 10,000 cm = 100 m).
  //   Or if conversionFactor = 1, 1 BOM unit = 1 Stock Movement unit.
  // - supplierName: default factory supplier from MASTER_SUPPLIERS
  // - defaultPricePerStockUnit: fallback unit price per Stock Movement unit
  const DEFAULT_BOM_TO_STOCK_MAPPING = {
    // --- 1. กลุ่มไม้ (WOOD) ---
    // หมายเหตุ: ในสูตร Master BOM ทั้ง 391 รุ่น บันทึกไม้ระแนง 1 เมตรไว้ที่ 'ไม้ 2 นิ้ว 1 เมตร (ท่อน)'
    // ดังนั้นจึงผูกรหัสกลุ่มไม้ 1M ทั้งหมด (PROD-001 ไม้ระแนง 100-140M, PROD-003 ไม้สะเดา 100-140M, PROD-010 ไม้ยาว 100M) เข้าด้วยกัน
    'ไม้ 1 นิ้ว 1 เมตร (ท่อน)': {
      stockProductIds: ['PROD-001', 'PROD-010'],
      stockUnit: 'แผ่น/ท่อน',
      bomPerStockUnit: 1,
      supplierName: 'MJ- ไม้',
      category: 'WOOD',
      fallbackStockPrice: 5.5,
      sharedPoolWith: 'ไม้ 2 นิ้ว 1 เมตร (ท่อน)'
    },
    'ไม้ 2 นิ้ว 1 เมตร (ท่อน)': {
      stockProductIds: ['PROD-001', 'PROD-003', 'PROD-010', 'PROD-110', 'PROD-115'],
      stockUnit: 'แผ่น/ท่อน',
      bomPerStockUnit: 1,
      supplierName: 'MJ- ไม้',
      category: 'WOOD',
      fallbackStockPrice: 6.0
    },
    'ไม้ 2 นิ้ว 1.5 เมตร (ท่อน)': {
      stockProductIds: ['PROD-002', 'PROD-011', 'PROD-012'],
      stockUnit: 'แผ่น/ท่อน',
      bomPerStockUnit: 1,
      supplierName: 'MJ- ไม้',
      category: 'WOOD',
      fallbackStockPrice: 12.5
    },
    'ไม้อัด (แผ่น)': {
      stockProductIds: ['PROD-009', 'PROD-006', 'PROD-007', 'PROD-066'],
      stockUnit: 'แผ่น',
      bomPerStockUnit: 1,
      supplierName: 'ลุนนี (ไม้)',
      category: 'WOOD',
      fallbackStockPrice: 50.0
    },
    'ไม้หน้า 4 (ท่อน)': {
      stockProductIds: ['PROD-005', 'PROD-004', 'PROD-008', 'PROD-070', 'PROD-114', 'PROD-116'],
      stockUnit: 'แผ่น/ท่อน',
      bomPerStockUnit: 1,
      supplierName: 'ลุนนี (ไม้)',
      category: 'WOOD',
      fallbackStockPrice: 22.0
    },

    // --- 2. กลุ่มฟองน้ำ (FOAM) ---
    'ฟองน้ำ 2 นิ้ว ที่นั่ง (PM7)': {
      stockProductIds: ['PROD-014', 'PROD-117', 'PROD-022'],
      stockUnit: 'แผ่น',
      bomPerStockUnit: 1,
      supplierName: 'บจก.พรีเมียม (ฟองน้ำ)',
      category: 'FOAM',
      fallbackStockPrice: 315.75
    },
    'ฟองน้ำ 2 นิ้ว แขน (PM7)': {
      stockProductIds: ['PROD-118', 'PROD-015'],
      stockUnit: 'แผ่น',
      bomPerStockUnit: 1,
      supplierName: 'บจก.พรีเมียม (ฟองน้ำ)',
      category: 'FOAM',
      fallbackStockPrice: 170.5
    },
    'ฟองน้ำ 1 นิ้ว เนื้อพิง': {
      stockProductIds: ['PROD-018', 'PROD-021', 'PROD-024'],
      stockUnit: 'แผ่น',
      bomPerStockUnit: 1,
      supplierName: 'ดูราโฟม (ฟองน้ำ)',
      category: 'FOAM',
      fallbackStockPrice: 133.65
    },
    'ฟองน้ำ 2 นิ้ว ตัวแอล': {
      stockProductIds: ['PROD-013'],
      stockUnit: 'แผ่น',
      bomPerStockUnit: 1,
      supplierName: 'บจก.พรีเมียม (ฟองน้ำ)',
      category: 'FOAM',
      fallbackStockPrice: 420.0
    },
    'ฟองน้ำ 2 นิ้ว หลังพิง (PM103)': {
      stockProductIds: ['PROD-016', 'PROD-019', 'PROD-023'],
      stockUnit: 'แผ่น',
      bomPerStockUnit: 1,
      supplierName: 'บจก.พรีเมียม (ฟองน้ำ)',
      category: 'FOAM',
      fallbackStockPrice: 364.0
    },

    // --- 3. กลุ่มผ้าและหนัง (FABRIC - หน่วย 'หลา' ตรงกับ Stock Movement 100%) ---
    'ดำ-PQ002C-17': {
      stockProductIds: ['PROD-106', 'PROD-101'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'โตด้า (ToDa - หนัง/ผ้า)',
      category: 'FABRIC',
      fallbackStockPrice: 32.0
    },
    'ขาว-PQ002C-1': {
      stockProductIds: ['PROD-109'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 32.0
    },
    'เทา-PQ002C-46': {
      stockProductIds: ['PROD-103', 'PROD-104'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 32.0
    },
    'น้ำตาล-PQ002C-12': {
      stockProductIds: ['PROD-107'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 32.0
    },
    'ชา-PQ002C-19': {
      stockProductIds: ['PROD-105'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 32.0
    },
    'ครีม-PQ002C-6': {
      stockProductIds: ['PROD-108'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 32.0
    },
    'มอคค่า-PQ002C-48': {
      stockProductIds: ['PROD-102', 'PROD-100'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 32.0
    },
    'สีน้ำตาล-MJ337-7': {
      stockProductIds: ['PROD-091', 'PROD-090', 'PROD-082'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 52.0
    },
    'สีเขียว-MJ337-14': {
      stockProductIds: ['PROD-089', 'PROD-081'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 52.0
    },
    'สีแดงมะเหมี่ยว-MJ337-23': {
      stockProductIds: ['PROD-087', 'PROD-079'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 52.0
    },
    'สีเทา-MJ337-29': {
      stockProductIds: ['PROD-085', 'PROD-086', 'PROD-084', 'PROD-078'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'PDK-ผ้า',
      category: 'FABRIC',
      fallbackStockPrice: 52.5
    },
    'สีน้ำเงิน-MJ337-31': {
      stockProductIds: ['PROD-083', 'PROD-077'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 52.0
    },
    'สีโรสโกลด์-MJ337-22': {
      stockProductIds: ['PROD-088', 'PROD-080'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 52.0
    },
    'สีน้ำตาล-MJ350-13': {
      stockProductIds: [],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 52.0
    },
    'สีเขียว-MJ350-6': {
      stockProductIds: [],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 52.0
    },
    'สีฟ้าเข้มMJ350-9': {
      stockProductIds: [],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 52.0
    },
    'สีครีมทอง-MJ350-4': {
      stockProductIds: [],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 52.0
    },
    'สีเทาอ่อน-MJ350-18': {
      stockProductIds: [],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 52.0
    },
    'สีเทาเข้ม-MJ350-20': {
      stockProductIds: [],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 52.0
    },
    'สีครีม-MJ350-1': {
      stockProductIds: [],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 52.0
    },
    'สีน้ำตาลอ่อน-MJ350-11': {
      stockProductIds: [],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 52.0
    },
    'น้ำตาลเข้ม-MJ350-14': {
      stockProductIds: [],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      category: 'FABRIC',
      fallbackStockPrice: 52.0
    },
    'สีครีม-MJ356-1a': {
      stockProductIds: ['PROD-099', 'PROD-095'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'PDK-ผ้า',
      category: 'FABRIC',
      fallbackStockPrice: 53.0
    },
    'สีเขียว-MJ356-2a': {
      stockProductIds: ['PROD-098', 'PROD-093'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'PDK-ผ้า',
      category: 'FABRIC',
      fallbackStockPrice: 53.0
    },
    'สีเทา-MJ356-3a': {
      stockProductIds: ['PROD-097', 'PROD-094'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'PDK-ผ้า',
      category: 'FABRIC',
      fallbackStockPrice: 53.0
    },
    'สีน้ำตาล-MJ356-4a': {
      stockProductIds: ['PROD-096', 'PROD-092', 'PROD-119'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'PDK-ผ้า',
      category: 'FABRIC',
      fallbackStockPrice: 53.0
    },
    'สีน้ำตาลทอง-736b-01': {
      stockProductIds: ['PROD-076', 'PROD-073'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'PDK-ผ้า',
      category: 'FABRIC',
      fallbackStockPrice: 53.5
    },
    'สีฟ้าเทา-736b-04': {
      stockProductIds: ['PROD-074', 'PROD-071'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'PDK-ผ้า',
      category: 'FABRIC',
      fallbackStockPrice: 53.0
    },
    'สีเทาเข้ม-736b-02': {
      stockProductIds: ['PROD-075', 'PROD-072'],
      stockUnit: 'หลา',
      bomPerStockUnit: 1,
      supplierName: 'PDK-ผ้า',
      category: 'FABRIC',
      fallbackStockPrice: 53.0
    },

    // --- 4. กลุ่มบรรจุภัณฑ์ (PACKAGING) ---
    'กระดาษลูกฟูกแผ่น (แผ่น)': {
      stockProductIds: ['PROD-029'],
      stockUnit: 'แผ่น',
      bomPerStockUnit: 1,
      supplierName: 'บจก.กุลนาถ (กระดาษลูกฟูก/บับเบิ้ล)',
      category: 'PACKAGING',
      fallbackStockPrice: 17.8
    },
    'กระดาษลูกฟูกม้วน (cm.)': {
      stockProductIds: ['PROD-028'],
      stockUnit: 'กก.',
      bomPerStockUnit: 250, // 1 กก. ~= 250 cm.
      supplierName: 'บจก.กุลนาถ (กระดาษลูกฟูก/บับเบิ้ล)',
      category: 'PACKAGING',
      fallbackStockPrice: 16.77
    },
    'บับเบิ้ล (cm.)': {
      stockProductIds: ['PROD-068', 'PROD-045', 'PROD-046'],
      stockUnit: 'ม้วน',
      bomPerStockUnit: 10000, // 1 ม้วน (100 เมตร) = 10,000 cm.
      supplierName: 'บจก.กุลนาถ (กระดาษลูกฟูก/บับเบิ้ล)',
      category: 'PACKAGING',
      fallbackStockPrice: 300.0
    },
    'ฟิล์มหด/ซีลพลาสติก (cm.)': {
      stockProductIds: ['PROD-116', 'PROD-038'],
      stockUnit: 'ม้วน',
      bomPerStockUnit: 30000, // 1 ม้วน = 30,000 cm.
      supplierName: 'ไทยสตาร์ (ถุงแพ็ค/ซีลยืด)',
      category: 'PACKAGING',
      fallbackStockPrice: 210.83
    }
  };

  // =========================================================================
  // 3. HARDWARE & AUXILIARY BOM RULES (Auto-calculated per Sofa Produced)
  // =========================================================================
  // Since Stock Movement also tracks Hardware (ขาพลาสติก, เกียร์ปรับนอน, สกรู, กาวพ่น, ผ้าปิดตูด, ลูกแม็ก),
  // we include standard auxiliary BOM usage rules per sofa so the MRP checks ALL 6 categories!
  const AUXILIARY_HARDWARE_BOM = [
    {
      name: 'ขาพลาสติก 2" (ขารองโซฟา)',
      unit: 'ตัว',
      category: 'HARDWARE',
      stockProductIds: ['PROD-033', 'PROD-034'],
      stockUnit: 'ตัว',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      fallbackStockPrice: 2.05,
      calcUsage: (sku, qty) => {
        const s = sku.toLowerCase();
        if (s.includes('หมอน') || s.includes('-pl') || s.includes('แขนโซฟา')) return 0;
        if (s.includes('สตูล') || s.includes('-cu') || s.includes('-cl')) return qty * 4;
        if (s.includes('ตัวแอล') || s.includes('-mn')) return qty * 8;
        return qty * 6; // โซฟา 2-3 ที่นั่ง / โซฟาเบด ใช้เฉลี่ย 6 ขา/ตัว
      }
    },
    {
      name: 'เกียร์ปรับสายรุ้ง (เฉพาะรุ่นปรับนอน rc/rs)',
      unit: 'คู่',
      category: 'HARDWARE',
      stockProductIds: ['PROD-039'],
      stockUnit: 'คู่',
      bomPerStockUnit: 1,
      supplierName: 'MJ- วัตถุดิบ',
      fallbackStockPrice: 90.0,
      calcUsage: (sku, qty) => {
        const s = sku.toLowerCase();
        if (s.includes('ปรับนอน') || s.includes('-rc') || s.includes('หัวกระดก') || s.includes('-rs')) {
          return qty * 1; // 1 คู่ต่อตัว
        }
        return 0;
      }
    },
    {
      name: 'ผ้าปิดตูด / ผ้าสปันบอนด์ใต้โซฟา',
      unit: 'Kg',
      category: 'HARDWARE',
      stockProductIds: ['PROD-052', 'PROD-053'],
      stockUnit: 'Kg',
      bomPerStockUnit: 1,
      supplierName: 'ซันโพลี / ชลบุรี (ใยสังเคราะห์)',
      fallbackStockPrice: 14.01,
      calcUsage: (sku, qty) => {
        const s = sku.toLowerCase();
        if (s.includes('หมอน') || s.includes('-pl') || s.includes('แขนโซฟา')) return 0;
        return +(qty * 0.25).toFixed(2); // 0.25 Kg ต่อตัว
      }
    },
    {
      name: 'กาวพ่นประกอบฟองน้ำ',
      unit: 'ปี๊บ',
      category: 'HARDWARE',
      stockProductIds: ['PROD-049', 'PROD-069'],
      stockUnit: 'ปี๊บ',
      bomPerStockUnit: 1,
      supplierName: 'วี-ไนน (กาว & ฟิล์ม/เทป)',
      fallbackStockPrice: 810.0,
      calcUsage: (sku, qty) => {
        const s = sku.toLowerCase();
        if (s.includes('หมอน') || s.includes('-pl')) return 0;
        return +(qty * 0.025).toFixed(3); // 1 ปี๊บ พ่นโซฟาได้ ~40 ตัว
      }
    },
    {
      name: 'สกรูยึดโครงไม้ 2.5"',
      unit: 'ตัว',
      category: 'HARDWARE',
      stockProductIds: ['PROD-051'],
      stockUnit: 'ตัว',
      bomPerStockUnit: 1,
      supplierName: 'เอ.เอส.พี / ไทยทวีภัณฑ์ (สกรู)',
      fallbackStockPrice: 0.36,
      calcUsage: (sku, qty) => {
        const s = sku.toLowerCase();
        if (s.includes('หมอน') || s.includes('-pl') || s.includes('แขนโซฟา')) return 0;
        return qty * 20; // 20 ตัวต่อโซฟา 1 ตัว
      }
    },
    {
      name: 'สกรู 2" (บรรจุถุง Kg)',
      unit: 'Kg',
      category: 'HARDWARE',
      stockProductIds: ['PROD-050'],
      stockUnit: 'Kg',
      bomPerStockUnit: 1,
      supplierName: 'เอ.เอส.พี / ไทยทวีภัณฑ์ (สกรู)',
      fallbackStockPrice: 75.0,
      calcUsage: (sku, qty) => {
        const s = sku.toLowerCase();
        if (s.includes('หมอน') || s.includes('-pl') || s.includes('แขนโซฟา')) return 0;
        return +(qty * 0.08).toFixed(2); // ~0.08 Kg ต่อโซฟา 1 ตัว
      }
    },
    {
      name: 'ลูกแม็กยิงโครงและหุ้มผ้า (F40 / 1008J)',
      unit: 'กล่อง',
      category: 'HARDWARE',
      stockProductIds: ['PROD-042', 'PROD-044', 'PROD-067'],
      stockUnit: 'กล่อง',
      bomPerStockUnit: 1,
      supplierName: 'กิตติศักดิ์ (ลูกแม็ก) / ไพวัล (ด้าย)',
      fallbackStockPrice: 45.0,
      calcUsage: (sku, qty) => {
        return +(qty * 0.12).toFixed(2); // 1 กล่องยิงได้ ~8.3 ตัว
      }
    }
  ];

  // =========================================================================
  // 4. DEFAULT REALISTIC BACKLOG SCENARIO (1,322 Units: TikTok 1,111 + Shopee 211)
  // =========================================================================
  function getDefaultBacklogOrders() {
    return [
      { sku: 'Qs-โซฟาเบดปรับนอน-rc-ดำ-PQ002C-17', tiktokQty: 145, shopeeQty: 28, fgStock: 12, note: 'รุ่นขายดีอันดับ 1 (หนัง PVC ดำ)' },
      { sku: 'Qs-โซฟาเบดปรับนอน-rc-น้ำตาล-PQ002C-12', tiktokQty: 95, shopeeQty: 18, fgStock: 8, note: 'รุ่นขายดี (หนัง PVC น้ำตาล)' },
      { sku: 'Qs-โซฟาเบดปรับนอน-rc-เทา-PQ002C-46', tiktokQty: 88, shopeeQty: 16, fgStock: 5, note: 'หนัง PVC เทา' },
      { sku: 'Qs-โซฟาเบดหัวกระดกพรีเมี่ยม-rsh-เทา-337-29', tiktokQty: 92, shopeeQty: 20, fgStock: 6, note: 'ผ้าฮอลแลนด์สีเทา' },
      { sku: 'Qs-โซฟาเบดปรับนอนพรีเมี่ยม-rch-น้ำเงิน-337-31', tiktokQty: 74, shopeeQty: 14, fgStock: 4, note: 'ผ้าฮอลแลนด์สีน้ำเงิน' },
      { sku: 'Qs-โซฟาตัวแอลมินิมอล-Mncf(R)-ครีม-MJ356-1a', tiktokQty: 86, shopeeQty: 19, fgStock: 5, note: 'โซฟาตัวแอล ผ้าลูกฟูกครีม' },
      { sku: 'Qs-โซฟาตัวแอลมินิมอล-Mncf(L)-เทา-MJ356-3a', tiktokQty: 68, shopeeQty: 15, fgStock: 3, note: 'โซฟาตัวแอล ผ้าลูกฟูกเทา' },
      { sku: 'Qs-โซฟา3ที่นั่งท้าวแขน-bs3-ดำ-PQ002C-17', tiktokQty: 82, shopeeQty: 16, fgStock: 10, note: 'โซฟา 3 ที่นั่งท้าวแขน ดำ' },
      { sku: 'Qs-โซฟา2ที่นั่งท้าวแขน-bs2-ครีม-PQ002C-6', tiktokQty: 65, shopeeQty: 12, fgStock: 7, note: 'โซฟา 2 ที่นั่งท้าวแขน ครีม' },
      { sku: 'Qs-โซฟา3ที่นั่งวางแก้ว-lu3-มอคค่า-PQ002C-48', tiktokQty: 58, shopeeQty: 11, fgStock: 4, note: 'วางแก้ว มอคค่า' },
      { sku: 'Qs-โซฟา3ที่นั่งกระดุมวางแก้ว-ln3-น้ำตาลทอง-736b-01', tiktokQty: 64, shopeeQty: 12, fgStock: 2, note: 'ผ้านาโน 736B น้ำตาลทอง' },
      { sku: 'Qs-โซฟา3ที่นั่งกระดุมวางแก้ว-ln3-สีเทาเข้ม-736b-02', tiktokQty: 54, shopeeQty: 10, fgStock: 3, note: 'ผ้านาโน 736B เทาเข้ม' },
      { sku: 'Qs-โซฟา2ที่นั่งเรียบเบาะใหญ่-cs2-ชา-PQ002C-19', tiktokQty: 60, shopeeQty: 10, fgStock: 6, note: 'โซฟา 2 ที่นั่ง ชา' },
      { sku: 'Qs-เก้าอี้สตูล-cu-ดำ-PQ002C-17', tiktokQty: 80, shopeeQty: 10, fgStock: 15, note: 'สตูลแถม/ขายแยก' }
    ];
  }

  // Default BOM Cloud / Fabric Cutter Roll stocks (in 'หลา') for MJ350 & fallback fabrics
  const DEFAULT_BOM_CLOUD_FABRIC_STOCK = {
    'ขาว-PQ002C-1': { stock: 400, price: 32 },
    'ชา-PQ002C-19': { stock: 300, price: 32 },
    'สีน้ำตาล-MJ350-13': { stock: 250, price: 52 },
    'สีเขียว-MJ350-6': { stock: 150, price: 52 },
    'สีฟ้าเข้มMJ350-9': { stock: 150, price: 52 },
    'สีครีมทอง-MJ350-4': { stock: 250, price: 52 },
    'สีเทาอ่อน-MJ350-18': { stock: 300, price: 52 },
    'สีเทาเข้ม-MJ350-20': { stock: 300, price: 52 },
    'สีครีม-MJ350-1': { stock: 250, price: 52 },
    'สีน้ำตาลอ่อน-MJ350-11': { stock: 200, price: 52 },
    'น้ำตาลเข้ม-MJ350-14': { stock: 200, price: 52 }
  };

  // =========================================================================
  // 4B. FINISHED GOODS (FG / สินค้าสำเร็จรูป) INVENTORY & IN-OUT SEED DATA
  // =========================================================================
  function classifySofaFamily(sku) {
    const s = String(sku || '').toLowerCase();
    if (s.includes('ตัวแอล') || s.includes('mncf') || s.includes('mnh')) {
      return { id: 'LSHAPE', label: 'โซฟาตัวแอล (L-Shape)', icon: '🛋️' };
    }
    if (s.includes('ปรับนอน') || s.includes('หัวกระดก') || s.includes('-rc') || s.includes('-rs')) {
      return { id: 'SOFABED', label: 'โซฟาเบดปรับนอน/หัวกระดก', icon: '🛏️' };
    }
    if (s.includes('3ที่นั่ง') || s.includes('bs3') || s.includes('lu3') || s.includes('ln3') || s.includes('cs3')) {
      return { id: 'SOFA3', label: 'โซฟา 3 ที่นั่ง', icon: '🛋️' };
    }
    if (s.includes('2ที่นั่ง') || s.includes('bs2') || s.includes('cs2') || s.includes('lu2') || s.includes('ln2')) {
      return { id: 'SOFA2', label: 'โซฟา 2 ที่นั่ง', icon: '🪑' };
    }
    return { id: 'STOOL_ACC', label: 'สตูล / หมอน / อะไหล่', icon: '📦' };
  }

  function getDefaultFgInventoryData() {
    // Net FG On-Hand across these 14 active SKUs = 90 units + extra ready-to-ship SKUs
    return {
      version: 1,
      updatedAt: '2026-11-11T09:00:00.000Z',
      beginningStock: {
        'Qs-โซฟาเบดปรับนอน-rc-ดำ-PQ002C-17': 10,
        'Qs-โซฟาเบดปรับนอน-rc-น้ำตาล-PQ002C-12': 6,
        'Qs-โซฟาเบดปรับนอน-rc-เทา-PQ002C-46': 5,
        'Qs-โซฟาเบดหัวกระดกพรีเมี่ยม-rsh-เทา-337-29': 4,
        'Qs-โซฟาเบดปรับนอนพรีเมี่ยม-rch-น้ำเงิน-337-31': 4,
        'Qs-โซฟาตัวแอลมินิมอล-Mncf(R)-ครีม-MJ356-1a': 3,
        'Qs-โซฟาตัวแอลมินิมอล-Mncf(L)-เทา-MJ356-3a': 3,
        'Qs-โซฟา3ที่นั่งท้าวแขน-bs3-ดำ-PQ002C-17': 8,
        'Qs-โซฟา2ที่นั่งท้าวแขน-bs2-ครีม-PQ002C-6': 7,
        'Qs-โซฟา3ที่นั่งวางแก้ว-lu3-มอคค่า-PQ002C-48': 4,
        'Qs-โซฟา3ที่นั่งกระดุมวางแก้ว-ln3-น้ำตาลทอง-736b-01': 2,
        'Qs-โซฟา3ที่นั่งกระดุมวางแก้ว-ln3-สีเทาเข้ม-736b-02': 3,
        'Qs-โซฟา2ที่นั่งเรียบเบาะใหญ่-cs2-ชา-PQ002C-19': 6,
        'Qs-เก้าอี้สตูล-cu-ดำ-PQ002C-17': 12
      },
      inbound: [
        { id: 'FG-IN-001', date: '2026-11-10', sku: 'Qs-โซฟาเบดปรับนอน-rc-ดำ-PQ002C-17', quantity: 8, team: 'ทีมหุ้ม A (ช่างเอก)', note: 'รับเข้าโซฟาผลิตเสร็จรอบเช้า' },
        { id: 'FG-IN-002', date: '2026-11-10', sku: 'Qs-โซฟาเบดปรับนอน-rc-น้ำตาล-PQ002C-12', quantity: 5, team: 'ทีมหุ้ม A (ช่างเอก)', note: 'รับเข้าโซฟาผลิตเสร็จ' },
        { id: 'FG-IN-003', date: '2026-11-10', sku: 'Qs-โซฟาเบดหัวกระดกพรีเมี่ยม-rsh-เทา-337-29', quantity: 4, team: 'ทีมหุ้ม B (ช่างนัท)', note: 'รับเข้าโซฟาเบดหัวกระดก' },
        { id: 'FG-IN-004', date: '2026-11-10', sku: 'Qs-โซฟาตัวแอลมินิมอล-Mncf(R)-ครีม-MJ356-1a', quantity: 5, team: 'ทีมหุ้ม C (ตัวแอล)', note: 'รับเข้าตัวแอลลูกฟูกครีม' },
        { id: 'FG-IN-005', date: '2026-11-11', sku: 'Qs-โซฟา3ที่นั่งท้าวแขน-bs3-ดำ-PQ002C-17', quantity: 6, team: 'ทีมหุ้ม B (ช่างนัท)', note: 'รับเข้า BS3 ดำ' },
        { id: 'FG-IN-006', date: '2026-11-11', sku: 'Qs-เก้าอี้สตูล-cu-ดำ-PQ002C-17', quantity: 10, team: 'ทีมสตูล', note: 'ผลิตเสร็จเข้าคลัง FG' }
      ],
      outbound: [
        { id: 'FG-OUT-001', date: '2026-11-10', sku: 'Qs-โซฟาเบดปรับนอน-rc-ดำ-PQ002C-17', quantity: 6, channel: 'TikTok Shop', note: 'แพ็คส่งขนส่ง Flash / J&T' },
        { id: 'FG-OUT-002', date: '2026-11-10', sku: 'Qs-โซฟาเบดปรับนอน-rc-น้ำตาล-PQ002C-12', quantity: 3, channel: 'TikTok Shop', note: 'แพ็คส่งลูกค้า' },
        { id: 'FG-OUT-003', date: '2026-11-10', sku: 'Qs-โซฟาเบดหัวกระดกพรีเมี่ยม-rsh-เทา-337-29', quantity: 2, channel: 'Shopee', note: 'แพ็คส่ง Shopee Bulky' },
        { id: 'FG-OUT-004', date: '2026-11-11', sku: 'Qs-โซฟาตัวแอลมินิมอล-Mncf(R)-ครีม-MJ356-1a', quantity: 3, channel: 'TikTok Shop', note: 'แพ็คส่งรอบเช้า' },
        { id: 'FG-OUT-005', date: '2026-11-11', sku: 'Qs-โซฟา3ที่นั่งท้าวแขน-bs3-ดำ-PQ002C-17', quantity: 4, channel: 'TikTok Shop', note: 'แพ็คส่งขนส่ง' },
        { id: 'FG-OUT-006', date: '2026-11-11', sku: 'Qs-เก้าอี้สตูล-cu-ดำ-PQ002C-17', quantity: 7, channel: 'TikTok Shop', note: 'แพ็คส่งพร้อมโซฟา' }
      ],
      adjustments: []
    };
  }

  // =========================================================================
  // 5. MAIN MRP STORE CLASS
  // =========================================================================
  class QueenCosyMrpStore {
    constructor() {
      this.masterSuppliers = MASTER_SUPPLIERS;
      const globalBom = (typeof MASTER_BOM_DATA !== 'undefined' ? MASTER_BOM_DATA : window.MASTER_BOM_DATA) || { materials: [], skus: [] };
      this.masterBom = JSON.parse(JSON.stringify(globalBom));
      this.stockMovementRaw = window.INITIAL_INVENTORY_DATA
        ? JSON.parse(JSON.stringify(window.INITIAL_INVENTORY_DATA))
        : { categories: [], products: [], inbound: [], outbound: [], adjustments: [] };

      this.fgInventoryRaw = getDefaultFgInventoryData();

      this.bomCloudStockMap = JSON.parse(JSON.stringify(DEFAULT_BOM_CLOUD_FABRIC_STOCK));
      this.cutterBalance = {
        'ดำ-PQ002C-17': { balanceYards: 15 },
        'เทา-PQ002C-46': { balanceYards: 20 }
      };

      this.state = {
        backlogItems: getDefaultBacklogOrders(), // [{ sku, tiktokQty, shopeeQty, fgStock, note }]
        bomMapping: JSON.parse(JSON.stringify(DEFAULT_BOM_TO_STOCK_MAPPING)),
        includeHardwareRules: true,
        outsourceSewingPerUnit: 65, // ค่าจ้างตัดเย็บนอก (ดอนเมือง) เฉลี่ยชุดละ 65 บาท
        includeOutsourceInPo: false,
        wastePercentByCategory: {
          WOOD: 0,
          FOAM: 0,
          FABRIC: 0,
          HARDWARE: 0,
          PACKAGING: 0
        },
        lastStockSyncAt: null
      };

      this.supabase = null;
      this.cloudStatus = 'connecting';
      this.cloudMessage = 'กำลังเชื่อมต่อ Supabase...';
      this.listeners = [];
      this.statusListeners = [];

      this.loadLocalState();
      this.syncBacklogFgFromWarehouse(false);
      this.initSupabase();
    }

    // Ensure stockMovementRaw always has the complete 119 products & Nov 1-10 transactions from seed.js
    ensureCompleteStockData(candidateData) {
      const seed = window.INITIAL_INVENTORY_DATA;
      if (!candidateData || !Array.isArray(candidateData.products) || candidateData.products.length === 0) {
        return seed ? JSON.parse(JSON.stringify(seed)) : { categories: [], products: [], inbound: [], outbound: [], adjustments: [] };
      }
      if (!seed || !Array.isArray(seed.inbound)) return candidateData;

      // If candidateData is an older snapshot (e.g. 358/367 inbound before the Nov 1-10 fabric & wood update),
      // restore the complete 427-inbound / 639-outbound seed dataset so fabric & wood stocks are never lost.
      const candInLen = Array.isArray(candidateData.inbound) ? candidateData.inbound.length : 0;
      const candOutLen = Array.isArray(candidateData.outbound) ? candidateData.outbound.length : 0;
      if (candInLen < seed.inbound.length || candOutLen < seed.outbound.length) {
        return JSON.parse(JSON.stringify(seed));
      }
      return candidateData;
    }

    loadLocalState() {
      try {
        const saved = localStorage.getItem(LOCAL_MRP_STATE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed.backlogItems) && parsed.backlogItems.length > 0) {
            this.state.backlogItems = parsed.backlogItems;
          }
          if (parsed.bomMapping) {
            this.state.bomMapping = {
              ...JSON.parse(JSON.stringify(DEFAULT_BOM_TO_STOCK_MAPPING)),
              ...parsed.bomMapping
            };
            // Ensure 1M wood pool includes PROD-001, PROD-003, PROD-010
            if (this.state.bomMapping['ไม้ 2 นิ้ว 1 เมตร (ท่อน)']) {
              const ids = new Set(this.state.bomMapping['ไม้ 2 นิ้ว 1 เมตร (ท่อน)'].stockProductIds || []);
              ['PROD-001', 'PROD-003', 'PROD-010', 'PROD-110', 'PROD-115'].forEach(id => ids.add(id));
              this.state.bomMapping['ไม้ 2 นิ้ว 1 เมตร (ท่อน)'].stockProductIds = Array.from(ids);
            }
          }
          if (parsed.includeHardwareRules !== undefined) {
            this.state.includeHardwareRules = parsed.includeHardwareRules;
          }
          if (parsed.wastePercentByCategory) {
            this.state.wastePercentByCategory = {
              ...this.state.wastePercentByCategory,
              ...parsed.wastePercentByCategory
            };
          }
        }

        // Also check if Custom BOM exists in localStorage from bom-planner-web
        const savedBom = localStorage.getItem('qc_master_bom_custom_v2');
        if (savedBom) {
          const parsedBom = JSON.parse(savedBom);
          if (parsedBom && Array.isArray(parsedBom.skus) && parsedBom.skus.length > 0) {
            this.masterBom = parsedBom;
          }
        }

        // Also check if Stock Movement data is in localStorage
        const savedStock = localStorage.getItem(LOCAL_STOCK_MOVEMENT_KEY);
        if (savedStock) {
          const parsedStock = JSON.parse(savedStock);
          if (parsedStock && Array.isArray(parsedStock.products) && parsedStock.products.length > 0) {
            this.stockMovementRaw = this.ensureCompleteStockData(parsedStock);
          }
        }

        // Also check if Finished Goods (FG) Inventory data is in localStorage
        const savedFg = localStorage.getItem(LOCAL_FG_INVENTORY_KEY);
        if (savedFg) {
          const parsedFg = JSON.parse(savedFg);
          if (parsedFg && parsedFg.beginningStock) {
            this.fgInventoryRaw = {
              ...getDefaultFgInventoryData(),
              ...parsedFg,
              inbound: Array.isArray(parsedFg.inbound) ? parsedFg.inbound : [],
              outbound: Array.isArray(parsedFg.outbound) ? parsedFg.outbound : [],
              adjustments: Array.isArray(parsedFg.adjustments) ? parsedFg.adjustments : []
            };
          }
        }
      } catch (e) {
        console.warn('[MrpStore] loadLocalState warning:', e);
      }
    }

    saveLocalState() {
      try {
        localStorage.setItem(LOCAL_MRP_STATE_KEY, JSON.stringify(this.state));
        localStorage.setItem(LOCAL_FG_INVENTORY_KEY, JSON.stringify(this.fgInventoryRaw));
        this.notify();
      } catch (e) {
        console.error('[MrpStore] saveLocalState error:', e);
      }
    }

    async pushFgInventoryToCloud() {
      try {
        this.fgInventoryRaw.updatedAt = new Date().toISOString();
        localStorage.setItem(LOCAL_FG_INVENTORY_KEY, JSON.stringify(this.fgInventoryRaw));

        const fgMap = this.getComputedFgStockMap();
        let totalFgUnits = 0;
        let activeSkus = 0;
        fgMap.forEach(entry => {
          if (entry.onHandQty > 0) {
            activeSkus++;
            totalFgUnits += entry.onHandQty;
          }
        });

        await fetch(`${SUPABASE_URL}/rest/v1/production_batches?on_conflict=batch_id`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify({
            batch_id: CLOUD_FG_INVENTORY_ID,
            batch_name: 'QueenCosy Finished Goods (FG) Stock Movement V1',
            source: 'QC_FG_WAREHOUSE',
            status: 'COMPLETED',
            total_skus: activeSkus,
            total_units: totalFgUnits,
            total_material_cost: 0,
            items_json: this.fgInventoryRaw,
            updated_at: new Date().toISOString(),
            notes: `FG On-Hand: ${totalFgUnits} units across ${activeSkus} SKUs`
          })
        });
      } catch (err) {
        console.warn('[MrpStore] pushFgInventoryToCloud warning:', err);
      }
    }

    subscribe(fn) {
      if (typeof fn === 'function') {
        this.listeners.push(fn);
      }
    }

    notify() {
      this.listeners.forEach(fn => {
        try { fn(this); } catch (e) { console.error(e); }
      });
    }

    onStatusChange(fn) {
      if (typeof fn === 'function') {
        this.statusListeners.push(fn);
        fn(this.cloudStatus, this.cloudMessage, this.state.lastStockSyncAt);
      }
    }

    setCloudStatus(status, message) {
      this.cloudStatus = status;
      this.cloudMessage = message;
      this.statusListeners.forEach(fn => {
        try { fn(status, message, this.state.lastStockSyncAt); } catch (e) {}
      });
    }

    async initSupabase() {
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        this.setCloudStatus('offline', 'ออฟไลน์ (ใช้ข้อมูลแคชล่าสุด)');
        return;
      }

      try {
        this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: false },
          realtime: { params: { eventsPerSecond: 10 } }
        });

        await this.pullLiveStockMovement();

        // Subscribe to realtime changes on QC_STOCK_MOVEMENT_DATA_V4, QC_FABRIC_CUTTER_STATE_V1 & QC_FG_INVENTORY_DATA_V1
        this.supabase
          .channel('qc-mrp-live-stock-sync')
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'production_batches'
          }, (payload) => {
            const rec = payload.new;
            if (!rec || !rec.batch_id) return;
            if (rec.batch_id === CLOUD_STOCK_MOVEMENT_ID && rec.items_json && Array.isArray(rec.items_json.products)) {
              this.stockMovementRaw = this.ensureCompleteStockData(rec.items_json);
              this.state.lastStockSyncAt = rec.updated_at || new Date().toISOString();
              localStorage.setItem(LOCAL_STOCK_MOVEMENT_KEY, JSON.stringify(this.stockMovementRaw));
              this.setCloudStatus('online', 'ซิงค์สด Stock Movement (Realtime)');
              this.notify();
            } else if (rec.batch_id === CLOUD_FABRIC_STATE_ID && rec.items_json && rec.items_json.cutterBalance) {
              this.cutterBalance = rec.items_json.cutterBalance;
              this.notify();
            } else if (rec.batch_id === CLOUD_FG_INVENTORY_ID && rec.items_json && rec.items_json.beginningStock) {
              this.fgInventoryRaw = rec.items_json;
              localStorage.setItem(LOCAL_FG_INVENTORY_KEY, JSON.stringify(this.fgInventoryRaw));
              this.syncBacklogFgFromWarehouse(false);
              this.setCloudStatus('online', 'ซิงค์สดคลัง FG & วัตถุดิบ 100%');
              this.notify();
            }
          })
          .subscribe();
      } catch (err) {
        console.warn('[MrpStore] Supabase init notice:', err);
        this.setCloudStatus('offline', 'ออฟไลน์ (ใช้ข้อมูลในเครื่อง)');
      }
    }

    async pullLiveStockMovement() {
      this.setCloudStatus('syncing', 'กำลังดึงสต็อกวัตถุดิบ & สินค้าสำเร็จรูป (FG) จาก Supabase...');
      try {
        const headers = {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        };

        const [batchesResp, pricesResp] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/production_batches?batch_id=in.(${CLOUD_STOCK_MOVEMENT_ID},${CLOUD_FABRIC_STATE_ID},${CLOUD_FG_INVENTORY_ID})&select=batch_id,updated_at,items_json`, { headers }),
          fetch(`${SUPABASE_URL}/rest/v1/bom_calc_material_prices?select=material_name,category,unit,unit_price,current_stock`, { headers })
        ]);

        if (pricesResp && pricesResp.ok) {
          const priceRows = await pricesResp.json();
          if (Array.isArray(priceRows)) {
            priceRows.forEach(r => {
              if (r.material_name && Number(r.current_stock) > 0) {
                this.bomCloudStockMap[r.material_name] = {
                  stock: Number(r.current_stock),
                  price: Number(r.unit_price || 52)
                };
              }
            });
          }
        }

        if (!batchesResp.ok) throw new Error(`HTTP ${batchesResp.status}`);
        const rows = await batchesResp.json();
        let foundStockBatch = false;
        let foundFgBatch = false;

        if (Array.isArray(rows)) {
          for (const row of rows) {
            if (row.batch_id === CLOUD_FABRIC_STATE_ID && row.items_json && row.items_json.cutterBalance) {
              this.cutterBalance = row.items_json.cutterBalance;
            }
            if (row.batch_id === CLOUD_FG_INVENTORY_ID && row.items_json && row.items_json.beginningStock) {
              this.fgInventoryRaw = row.items_json;
              localStorage.setItem(LOCAL_FG_INVENTORY_KEY, JSON.stringify(this.fgInventoryRaw));
              this.syncBacklogFgFromWarehouse(false);
              foundFgBatch = true;
            }
            if (row.batch_id === CLOUD_STOCK_MOVEMENT_ID && row.items_json && Array.isArray(row.items_json.products)) {
              const rawCloud = row.items_json;
              const seed = window.INITIAL_INVENTORY_DATA;
              const needsHeal = seed && Array.isArray(seed.inbound) &&
                ((rawCloud.inbound || []).length < seed.inbound.length || (rawCloud.outbound || []).length < seed.outbound.length);

              this.stockMovementRaw = this.ensureCompleteStockData(rawCloud);
              this.state.lastStockSyncAt = row.updated_at || new Date().toISOString();
              localStorage.setItem(LOCAL_STOCK_MOVEMENT_KEY, JSON.stringify(this.stockMovementRaw));
              foundStockBatch = true;

              // If cloud had an older truncated snapshot, heal it on Supabase automatically
              if (needsHeal) {
                fetch(`${SUPABASE_URL}/rest/v1/production_batches?on_conflict=batch_id`, {
                  method: 'POST',
                  headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
                  body: JSON.stringify({
                    batch_id: CLOUD_STOCK_MOVEMENT_ID,
                    batch_name: 'QueenCosy Stock Movement Master Data V4',
                    source: 'QC_STOCK_MOVEMENT',
                    status: 'COMPLETED',
                    total_skus: this.stockMovementRaw.products.length,
                    total_units: this.stockMovementRaw.inbound.length + this.stockMovementRaw.outbound.length,
                    total_material_cost: 0,
                    items_json: {
                      ...this.stockMovementRaw,
                      updatedByDevice: 'QC-MRP-AUTO-HEAL',
                      updatedAt: new Date().toISOString()
                    },
                    updated_at: new Date().toISOString(),
                    notes: 'Synced full 119 products, 427 inbound, 639 outbound'
                  })
                }).catch(() => {});
              }
            }
          }
        }

        // Seed FG Inventory to Supabase if it does not exist on cloud yet
        if (!foundFgBatch) {
          this.pushFgInventoryToCloud();
        }

        if (foundStockBatch) {
          this.setCloudStatus('online', `ซิงค์ครบ 100% (${this.stockMovementRaw.products.length} วัตถุดิบ + คลัง FG)`);
          this.notify();
          return true;
        }
        this.setCloudStatus('online', 'เชื่อมต่อสำเร็จ');
        return false;
      } catch (err) {
        console.warn('[MrpStore] pullLiveStockMovement error:', err);
        this.setCloudStatus('offline', 'ออฟไลน์ (ใช้ข้อมูลสำรอง)');
        return false;
      }
    }

    // =========================================================================
    // 6. COMPUTE REAL-TIME ON-HAND STOCK FROM STOCK MOVEMENT (EXACT FORMULA)
    // =========================================================================
    // Formula from SKILL.md & store.js:
    // onHandQty = beginningStock (initialStock) + sum(inbound.quantity) - sum(outbound.quantity) + sum(adjustments.quantity)
    getComputedStockProducts() {
      const d = this.stockMovementRaw || { products: [], inbound: [], outbound: [], adjustments: [] };
      const inMap = {};
      const inValueMap = {};
      const latestPriceMap = {};
      const latestSupplierMap = {};
      const outMap = {};
      const adjMap = {};

      (d.inbound || []).forEach(item => {
        const pid = item.productId || item.productName;
        const pname = item.productName;
        const qty = Number(item.quantity || 0);
        const price = Number(item.unitPrice !== undefined ? item.unitPrice : (item.pricePerUnit || 0));

        inMap[pid] = (inMap[pid] || 0) + qty;
        if (pname && pname !== pid) inMap[pname] = (inMap[pname] || 0) + qty;

        inValueMap[pid] = (inValueMap[pid] || 0) + (qty * price);
        if (pname && pname !== pid) inValueMap[pname] = (inValueMap[pname] || 0) + (qty * price);

        if (price > 0) {
          if (!latestPriceMap[pid]) latestPriceMap[pid] = price;
          if (pname && !latestPriceMap[pname]) latestPriceMap[pname] = price;
        }
        if (item.supplier) {
          latestSupplierMap[pid] = item.supplier;
          if (pname) latestSupplierMap[pname] = item.supplier;
        }
      });

      (d.outbound || []).forEach(item => {
        const pid = item.productId || item.productName;
        const pname = item.productName;
        const qty = Number(item.quantity || 0);
        outMap[pid] = (outMap[pid] || 0) + qty;
        if (pname && pname !== pid) outMap[pname] = (outMap[pname] || 0) + qty;
      });

      (d.adjustments || []).forEach(item => {
        const pid = item.productId || item.productName;
        const pname = item.productName;
        const qty = Number(item.quantity || 0);
        adjMap[pid] = (adjMap[pid] || 0) + qty;
        if (pname && pname !== pid) adjMap[pname] = (adjMap[pname] || 0) + qty;
      });

      return (d.products || []).map(p => {
        const pid = p.id;
        const pname = p.name;
        // Disambiguate PROD-116 which is shared by 'ซีลยืด (ไทยสตาร์)' and 'ไม้หน้า 4 นิ้ว x 220 cm.'
        const useNameKey = pid === 'PROD-116' && pname;
        const lookupKey = useNameKey ? pname : pid;

        const totalIn = inMap[lookupKey] !== undefined ? inMap[lookupKey] : (inMap[pname] || 0);
        const totalInVal = inValueMap[lookupKey] !== undefined ? inValueMap[lookupKey] : (inValueMap[pname] || 0);
        const totalOut = outMap[lookupKey] !== undefined ? outMap[lookupKey] : (outMap[pname] || 0);
        const totalAdj = adjMap[lookupKey] !== undefined ? adjMap[lookupKey] : (adjMap[pname] || 0);

        const begStock = Number(p.initialStock !== undefined ? p.initialStock : (p.beginningStock || 0));
        const basePrice = Number(p.unitPrice !== undefined ? p.unitPrice : (p.price || 0));

        const totalAvailable = begStock + totalIn;
        const totalAvailableVal = (begStock * basePrice) + totalInVal;
        const avgCost = totalAvailable > 0 ? (totalAvailableVal / totalAvailable) : basePrice;
        const effectivePrice = avgCost > 0 ? avgCost : (latestPriceMap[lookupKey] || latestPriceMap[pname] || basePrice);

        const onHandQty = begStock + totalIn - totalOut + totalAdj;
        const lastSupplier = latestSupplierMap[lookupKey] || latestSupplierMap[pname] || p.note || '';

        return {
          id: pid,
          name: pname,
          category: p.category || 'วัสดุทั่วไป',
          unit: p.unit || 'ชิ้น',
          minAlert: Number(p.minAlert || p.minStock || 100),
          begStock,
          totalIn: Math.round(totalIn * 100) / 100,
          totalOut: Math.round(totalOut * 100) / 100,
          totalAdj: Math.round(totalAdj * 100) / 100,
          onHandQty: Math.round(onHandQty * 100) / 100,
          basePrice,
          avgCost: Math.round(effectivePrice * 100) / 100,
          stockValue: Math.max(0, onHandQty) * effectivePrice,
          lastSupplier
        };
      });
    }

    // =========================================================================
    // 6B. COMPUTE FINISHED GOODS (FG / สินค้าสำเร็จรูป) ON-HAND ACROSS 439 SKUS
    // =========================================================================
    // Formula: fgOnHand = beginningStock[sku] + sum(fgInbound) - sum(fgOutbound) + sum(fgAdjustments)
    getComputedFgStockMap() {
      const fg = this.fgInventoryRaw || { beginningStock: {}, inbound: [], outbound: [], adjustments: [] };
      const begMap = fg.beginningStock || {};
      const inMap = {};
      const outMap = {};
      const adjMap = {};

      (fg.inbound || []).forEach(tx => {
        const key = String(tx.sku || '').trim();
        if (!key) return;
        inMap[key] = (inMap[key] || 0) + Number(tx.quantity || 0);
      });

      (fg.outbound || []).forEach(tx => {
        const key = String(tx.sku || '').trim();
        if (!key) return;
        outMap[key] = (outMap[key] || 0) + Number(tx.quantity || 0);
      });

      (fg.adjustments || []).forEach(tx => {
        const key = String(tx.sku || '').trim();
        if (!key) return;
        adjMap[key] = (adjMap[key] || 0) + Number(tx.quantity || 0);
      });

      const allSkuSet = new Set();
      (this.masterBom.skus || []).forEach(s => allSkuSet.add(s.sku.trim()));
      Object.keys(begMap).forEach(k => allSkuSet.add(k.trim()));
      Object.keys(inMap).forEach(k => allSkuSet.add(k.trim()));
      Object.keys(outMap).forEach(k => allSkuSet.add(k.trim()));
      Object.keys(adjMap).forEach(k => allSkuSet.add(k.trim()));
      (this.state.backlogItems || []).forEach(b => {
        if (b.sku) allSkuSet.add(b.sku.trim());
      });

      const resultMap = new Map();
      allSkuSet.forEach(sku => {
        if (!sku) return;
        const beg = Number(begMap[sku] || 0);
        const tIn = Number(inMap[sku] || 0);
        const tOut = Number(outMap[sku] || 0);
        const tAdj = Number(adjMap[sku] || 0);
        const onHand = Math.max(0, beg + tIn - tOut + tAdj);
        const fam = classifySofaFamily(sku);
        resultMap.set(sku.toLowerCase(), {
          sku,
          familyId: fam.id,
          familyLabel: fam.label,
          familyIcon: fam.icon,
          begStock: beg,
          totalIn: tIn,
          totalOut: tOut,
          totalAdj: tAdj,
          onHandQty: onHand
        });
      });

      return resultMap;
    }

    syncBacklogFgFromWarehouse(notifyAndSave = true) {
      const fgMap = this.getComputedFgStockMap();
      (this.state.backlogItems || []).forEach(item => {
        const key = String(item.sku || '').trim().toLowerCase();
        const fgEntry = fgMap.get(key);
        if (fgEntry) {
          item.fgStock = fgEntry.onHandQty;
        }
      });
      if (notifyAndSave) {
        this.saveLocalState();
      }
    }

    // =========================================================================
    // 7. FULL MRP & ORDER-TO-BOM EXPLOSION ENGINE
    // =========================================================================
    runMrpCalculation() {
      const computedStockList = this.getComputedStockProducts();
      const stockByIdMap = new Map();
      computedStockList.forEach(p => {
        // Handle duplicate IDs (like PROD-116) by accumulating or keeping array
        if (!stockByIdMap.has(p.id)) {
          stockByIdMap.set(p.id, []);
        }
        stockByIdMap.get(p.id).push(p);
      });

      // Build SKU -> BOM recipe lookup
      const skuRecipeMap = new Map();
      (this.masterBom.skus || []).forEach(s => {
        skuRecipeMap.set(s.sku.trim().toLowerCase(), s);
      });

      // Step 1: FG Netting (Order Backlog - FG Ready Stock = Net Production Needed)
      let totalTiktokOrders = 0;
      let totalShopeeOrders = 0;
      let totalGrossBacklog = 0;
      let totalFgReady = 0;
      let totalFgUsed = 0;
      let totalNetProduce = 0;

      const skuPlanResults = this.state.backlogItems.map((item, idx) => {
        const tt = Math.max(0, Number(item.tiktokQty || 0));
        const sh = Math.max(0, Number(item.shopeeQty || 0));
        const grossOrder = tt + sh;
        const fgReady = Math.max(0, Number(item.fgStock || 0));
        const fgUsed = Math.min(grossOrder, fgReady);
        const netToProduce = Math.max(0, grossOrder - fgReady);
        const fgRemaining = Math.max(0, fgReady - fgUsed);

        totalTiktokOrders += tt;
        totalShopeeOrders += sh;
        totalGrossBacklog += grossOrder;
        totalFgReady += fgReady;
        totalFgUsed += fgUsed;
        totalNetProduce += netToProduce;

        const recipeObj = skuRecipeMap.get(String(item.sku || '').trim().toLowerCase());
        const materials = recipeObj ? (recipeObj.materials || {}) : {};

        return {
          index: idx,
          sku: item.sku,
          tiktokQty: tt,
          shopeeQty: sh,
          grossOrder,
          fgStock: fgReady,
          fgUsed,
          fgRemaining,
          netToProduce,
          note: item.note || '',
          hasBom: !!recipeObj,
          materials
        };
      });

      // Step 2: BOM Explosion across all 43 BOM Materials + 7 Hardware Rules
      const materialRequirements = [];

      const resolveStockInfo = (bomMatName, mapCfg) => {
        const linkedIds = mapCfg.stockProductIds || [];
        const matchedProducts = [];
        const seenNames = new Set();

        linkedIds.forEach(pid => {
          const list = stockByIdMap.get(pid) || [];
          list.forEach(prod => {
            // Disambiguate PROD-116 (ซีลยืด vs ไม้หน้า 4)
            if (pid === 'PROD-116') {
              if (mapCfg.category === 'PACKAGING' && !prod.name.includes('ซีล')) return;
              if (mapCfg.category === 'WOOD' && !prod.name.includes('ไม้')) return;
            }
            const key = `${prod.id}:${prod.name}`;
            if (!seenNames.has(key)) {
              seenNames.add(key);
              matchedProducts.push(prod);
            }
          });
        });

        // Sum positive available onHandQty from linked Stock Movement products
        let rawOnHandStockUnits = 0;
        let totalWeightedPrice = 0;
        let priceCount = 0;

        matchedProducts.forEach(p => {
          rawOnHandStockUnits += Math.max(0, p.onHandQty);
          if (p.avgCost > 0) {
            totalWeightedPrice += p.avgCost;
            priceCount++;
          }
        });

        // For FABRIC: Also check Fabric Cutter remnant yards (QC_FABRIC_CUTTER_STATE_V1)
        // and BOM Cloud fabric stock (bom_calc_material_prices) for MJ350 or 0-balance fabrics
        if (mapCfg.category === 'FABRIC') {
          const cutterEntry = this.cutterBalance && this.cutterBalance[bomMatName];
          const cutterRemnantYards = cutterEntry ? Math.max(0, Number(cutterEntry.balanceYards || 0)) : 0;

          if (rawOnHandStockUnits <= 0 && this.bomCloudStockMap && this.bomCloudStockMap[bomMatName]) {
            const cloudFab = this.bomCloudStockMap[bomMatName];
            const cloudYards = Math.max(0, Number(cloudFab.stock || 0));
            if (cloudYards > 0) {
              rawOnHandStockUnits += cloudYards;
              matchedProducts.push({
                id: 'BOM-CLOUD',
                name: `${bomMatName} (คลังผ้าม้วน BOM)`,
                category: 'ผ้าม้วน',
                unit: 'หลา',
                onHandQty: cloudYards,
                avgCost: Number(mapCfg.fallbackStockPrice || cloudFab.price || 52)
              });
            }
          }

          if (cutterRemnantYards > 0) {
            rawOnHandStockUnits += cutterRemnantYards;
            matchedProducts.push({
              id: 'CUT-REM',
              name: `เศษผ้าสะสมที่ช่างตัด (${bomMatName})`,
              category: 'ผ้าม้วน',
              unit: 'หลา',
              onHandQty: cutterRemnantYards,
              avgCost: Number(mapCfg.fallbackStockPrice || 32)
            });
          }
        }

        const stockUnitPrice = priceCount > 0
          ? (totalWeightedPrice / priceCount)
          : Number(mapCfg.fallbackStockPrice || 0);

        return {
          matchedProducts,
          rawOnHandStockUnits: Math.round(rawOnHandStockUnits * 100) / 100,
          stockUnitPrice: Math.round(stockUnitPrice * 100) / 100
        };
      };

      // 2A. Process 43 Master BOM Materials
      (this.masterBom.materials || []).forEach(mat => {
        const matName = mat.name;
        const bomUnit = mat.unit;
        const mapCfg = this.state.bomMapping[matName] || {
          stockProductIds: [],
          stockUnit: bomUnit,
          bomPerStockUnit: 1,
          supplierName: 'MJ- วัตถุดิบ',
          category: (mat.category || 'other').toUpperCase(),
          fallbackStockPrice: 50
        };

        let grossBomQty = 0;
        const usedBySkus = [];

        skuPlanResults.forEach(plan => {
          if (plan.netToProduce <= 0) return;
          const usagePerSofa = Number(plan.materials[matName] || 0);
          if (usagePerSofa > 0) {
            const subQty = plan.netToProduce * usagePerSofa;
            grossBomQty += subQty;
            usedBySkus.push({
              sku: plan.sku,
              netUnits: plan.netToProduce,
              usagePerSofa,
              totalBomQty: Math.round(subQty * 100) / 100
            });
          }
        });

        const bomPerStock = Math.max(0.0001, Number(mapCfg.bomPerStockUnit || 1));
        const wastePct = Number(this.state.wastePercentByCategory[mapCfg.category] || 0);
        const grossBomWithWaste = grossBomQty * (1 + wastePct / 100);

        // Convert BOM Requirement into Stock Movement's Purchase/Stock Unit
        const requiredInStockUnit = Math.round((grossBomWithWaste / bomPerStock) * 100) / 100;
        const stockResolved = resolveStockInfo(matName, mapCfg);

        const onHandStockUnit = stockResolved.rawOnHandStockUnits;
        const usedFromStockUnit = Math.min(requiredInStockUnit, onHandStockUnit);
        const shortageStockUnit = Math.max(0, Math.round((requiredInStockUnit - onHandStockUnit) * 100) / 100);
        const remainingStockUnit = Math.max(0, Math.round((onHandStockUnit - requiredInStockUnit) * 100) / 100);

        // Order Qty rounded up for whole rolls/packs when appropriate
        const orderPurchaseQty = shortageStockUnit > 0 ? Math.ceil(shortageStockUnit * 100) / 100 : 0;
        const unitPrice = stockResolved.stockUnitPrice;

        const grossMaterialCost = Math.round(requiredInStockUnit * unitPrice * 100) / 100;
        const stockDeductedValue = Math.round(usedFromStockUnit * unitPrice * 100) / 100;
        const netPurchaseCost = Math.round(orderPurchaseQty * unitPrice * 100) / 100;

        let status = 'UNUSED';
        if (requiredInStockUnit > 0) {
          status = shortageStockUnit > 0 ? 'SHORTAGE' : 'ENOUGH';
        }

        materialRequirements.push({
          id: `BOM-${matName}`,
          bomName: matName,
          bomUnit,
          category: mapCfg.category,
          stockProductIds: mapCfg.stockProductIds || [],
          matchedProducts: stockResolved.matchedProducts,
          stockUnit: mapCfg.stockUnit || bomUnit,
          bomPerStockUnit: bomPerStock,
          supplierName: mapCfg.supplierName || 'MJ- วัตถุดิบ',
          grossBomQty: Math.round(grossBomQty * 100) / 100,
          requiredInStockUnit,
          onHandStockUnit,
          usedFromStockUnit,
          shortageStockUnit,
          remainingStockUnit,
          orderPurchaseQty,
          unitPrice,
          grossMaterialCost,
          stockDeductedValue,
          netPurchaseCost,
          status,
          usedBySkus,
          isHardwareRule: false
        });
      });

      // 2B. Process Auxiliary Hardware BOM Rules (if enabled)
      if (this.state.includeHardwareRules) {
        AUXILIARY_HARDWARE_BOM.forEach(rule => {
          const mapCfg = this.state.bomMapping[rule.name] || rule;
          let grossBomQty = 0;
          const usedBySkus = [];

          skuPlanResults.forEach(plan => {
            if (plan.netToProduce <= 0) return;
            const subQty = rule.calcUsage(plan.sku, plan.netToProduce);
            if (subQty > 0) {
              grossBomQty += subQty;
              usedBySkus.push({
                sku: plan.sku,
                netUnits: plan.netToProduce,
                usagePerSofa: +(subQty / plan.netToProduce).toFixed(2),
                totalBomQty: Math.round(subQty * 100) / 100
              });
            }
          });

          const bomPerStock = Math.max(0.0001, Number(mapCfg.bomPerStockUnit || 1));
          const requiredInStockUnit = Math.round((grossBomQty / bomPerStock) * 100) / 100;
          const stockResolved = resolveStockInfo(rule.name, mapCfg);

          const onHandStockUnit = stockResolved.rawOnHandStockUnits;
          const usedFromStockUnit = Math.min(requiredInStockUnit, onHandStockUnit);
          const shortageStockUnit = Math.max(0, Math.round((requiredInStockUnit - onHandStockUnit) * 100) / 100);
          const remainingStockUnit = Math.max(0, Math.round((onHandStockUnit - requiredInStockUnit) * 100) / 100);

          const orderPurchaseQty = shortageStockUnit > 0 ? Math.ceil(shortageStockUnit * 100) / 100 : 0;
          const unitPrice = stockResolved.stockUnitPrice;

          const grossMaterialCost = Math.round(requiredInStockUnit * unitPrice * 100) / 100;
          const stockDeductedValue = Math.round(usedFromStockUnit * unitPrice * 100) / 100;
          const netPurchaseCost = Math.round(orderPurchaseQty * unitPrice * 100) / 100;

          let status = 'UNUSED';
          if (requiredInStockUnit > 0) {
            status = shortageStockUnit > 0 ? 'SHORTAGE' : 'ENOUGH';
          }

          materialRequirements.push({
            id: `HW-${rule.name}`,
            bomName: rule.name,
            bomUnit: rule.unit,
            category: 'HARDWARE',
            stockProductIds: mapCfg.stockProductIds || [],
            matchedProducts: stockResolved.matchedProducts,
            stockUnit: mapCfg.stockUnit || rule.unit,
            bomPerStockUnit: bomPerStock,
            supplierName: mapCfg.supplierName || rule.supplierName,
            grossBomQty: Math.round(grossBomQty * 100) / 100,
            requiredInStockUnit,
            onHandStockUnit,
            usedFromStockUnit,
            shortageStockUnit,
            remainingStockUnit,
            orderPurchaseQty,
            unitPrice,
            grossMaterialCost,
            stockDeductedValue,
            netPurchaseCost,
            status,
            usedBySkus,
            isHardwareRule: true
          });
        });
      }

      // Step 3: Calculate Per-SKU BOM Unit Cost
      skuPlanResults.forEach(plan => {
        let unitBomCost = 0;
        materialRequirements.forEach(mat => {
          const found = mat.usedBySkus.find(u => u.sku === plan.sku);
          if (found && plan.netToProduce > 0) {
            const stockUnitsPerSofa = found.usagePerSofa / mat.bomPerStockUnit;
            unitBomCost += stockUnitsPerSofa * mat.unitPrice;
          }
        });
        plan.unitBomCost = Math.round(unitBomCost * 100) / 100;
        plan.totalBomCost = Math.round(unitBomCost * plan.netToProduce * 100) / 100;
      });

      // Step 4: Group by Category & Supplier for Purchase Orders
      const categoryBreakdown = {
        WOOD: { id: 'WOOD', name: 'หมวดไม้และโครงสร้าง', icon: '🪵', grossCost: 0, stockSaved: 0, netBuyCost: 0, itemCount: 0, shortageCount: 0 },
        FOAM: { id: 'FOAM', name: 'หมวดฟองน้ำและใยสังเคราะห์', icon: '🧽', grossCost: 0, stockSaved: 0, netBuyCost: 0, itemCount: 0, shortageCount: 0 },
        FABRIC: { id: 'FABRIC', name: 'หมวดผ้า หนัง และอุปกรณ์หุ้ม', icon: '🧵', grossCost: 0, stockSaved: 0, netBuyCost: 0, itemCount: 0, shortageCount: 0 },
        HARDWARE: { id: 'HARDWARE', name: 'หมวดฮาร์ดแวร์ สปริง สกรู กาว', icon: '🔩', grossCost: 0, stockSaved: 0, netBuyCost: 0, itemCount: 0, shortageCount: 0 },
        PACKAGING: { id: 'PACKAGING', name: 'หมวดบรรจุภัณฑ์และแพ็คเกจจิ้ง', icon: '📦', grossCost: 0, stockSaved: 0, netBuyCost: 0, itemCount: 0, shortageCount: 0 }
      };

      const supplierOrdersMap = new Map();
      MASTER_SUPPLIERS.forEach(sup => {
        supplierOrdersMap.set(sup.name, {
          ...sup,
          items: [],
          totalGrossCost: 0,
          totalStockSaved: 0,
          totalPurchaseCost: 0
        });
      });

      let totalGrossBomCost = 0;
      let totalStockDeductedValue = 0;
      let totalNetPurchaseBudget = 0;
      let activeMaterialsCount = 0;
      let enoughMaterialsCount = 0;
      let shortageMaterialsCount = 0;

      materialRequirements.forEach(mat => {
        const catObj = categoryBreakdown[mat.category] || categoryBreakdown.HARDWARE;
        if (mat.requiredInStockUnit > 0) {
          activeMaterialsCount++;
          catObj.itemCount++;
          catObj.grossCost += mat.grossMaterialCost;
          catObj.stockSaved += mat.stockDeductedValue;
          catObj.netBuyCost += mat.netPurchaseCost;

          totalGrossBomCost += mat.grossMaterialCost;
          totalStockDeductedValue += mat.stockDeductedValue;
          totalNetPurchaseBudget += mat.netPurchaseCost;

          if (mat.status === 'SHORTAGE') {
            shortageMaterialsCount++;
            catObj.shortageCount++;
          } else {
            enoughMaterialsCount++;
          }

          // Add to Supplier PO Map
          const supName = mat.supplierName || 'MJ- วัตถุดิบ';
          if (!supplierOrdersMap.has(supName)) {
            supplierOrdersMap.set(supName, {
              id: 'SUP-CUSTOM',
              name: supName,
              category: mat.category,
              termType: 'CREDIT_EOM',
              termLabel: 'เครดิตรอบสิ้นเดือน',
              icon: catObj.icon,
              note: 'ซัพพลายเออร์เพิ่มเติม',
              items: [],
              totalGrossCost: 0,
              totalStockSaved: 0,
              totalPurchaseCost: 0
            });
          }

          const supEntry = supplierOrdersMap.get(supName);
          supEntry.totalGrossCost += mat.grossMaterialCost;
          supEntry.totalStockSaved += mat.stockDeductedValue;
          if (mat.shortageStockUnit > 0) {
            supEntry.items.push(mat);
            supEntry.totalPurchaseCost += mat.netPurchaseCost;
          }
        }
      });

      const supplierPurchasePlans = Array.from(supplierOrdersMap.values())
        .filter(s => s.totalPurchaseCost > 0 || s.totalGrossCost > 0)
        .sort((a, b) => b.totalPurchaseCost - a.totalPurchaseCost);

      const cashWeeklyBudget = supplierPurchasePlans
        .filter(s => s.termType === 'CASH_WEEKLY')
        .reduce((sum, s) => sum + s.totalPurchaseCost, 0);

      const creditEomBudget = supplierPurchasePlans
        .filter(s => s.termType !== 'CASH_WEEKLY')
        .reduce((sum, s) => sum + s.totalPurchaseCost, 0);

      // Total Value of all 119 items currently in Stock Movement
      const totalWarehouseStockValue = computedStockList.reduce((sum, p) => sum + p.stockValue, 0);

      // Compute Warehouse Stock Overview (Wood 5 groups, Fabric, Foam, Hardware/Packaging)
      const woodProducts = computedStockList.filter(p => p.category === 'กลุ่มไม้' && !p.name.includes('ใบเลื่อย'));
      const totalWoodOnHand = woodProducts.reduce((s, p) => s + Math.max(0, p.onHandQty), 0);
      const woodGroups = [
        {
          label: 'ไม้ 1M รวม (MJ + อยุธยา)',
          items: woodProducts.filter(p => ['PROD-001', 'PROD-003', 'PROD-010', 'PROD-110', 'PROD-115'].includes(p.id))
        },
        {
          label: 'ไม้ 1.5M - 1.8M (MJ + อยุธยา)',
          items: woodProducts.filter(p => ['PROD-002', 'PROD-011', 'PROD-012'].includes(p.id))
        },
        {
          label: 'ไม้หน้า 3, 4 (อยุธยา/สมไกร)',
          items: woodProducts.filter(p => ['PROD-005', 'PROD-004', 'PROD-008', 'PROD-070', 'PROD-114'].includes(p.id) || (p.id === 'PROD-116' && p.name.includes('ไม้')))
        },
        {
          label: 'ไม้อัดรวม (อยุธยา/สมไกร)',
          items: woodProducts.filter(p => ['PROD-009', 'PROD-006', 'PROD-007', 'PROD-066'].includes(p.id))
        }
      ].map(g => ({
        label: g.label,
        qty: g.items.reduce((s, x) => s + Math.max(0, x.onHandQty), 0),
        val: g.items.reduce((s, x) => s + x.stockValue, 0),
        details: g.items.filter(x => x.onHandQty > 0).map(x => `${x.name} (${x.onHandQty.toLocaleString()} ${x.unit})`).join(', ') || '0 แผ่น'
      }));

      const fabricStockItems = computedStockList.filter(p => p.category === 'ผ้าม้วน' && p.onHandQty > 0);
      const totalFabricWarehouseYards = Math.round(fabricStockItems.reduce((s, p) => s + Math.max(0, p.onHandQty), 0) * 100) / 100;
      const totalBomFabricYards = Math.round(
        materialRequirements
          .filter(m => m.category === 'FABRIC')
          .reduce((s, m) => s + Math.max(0, m.onHandStockUnit), 0) * 100
      ) / 100;

      const foamStockItems = computedStockList.filter(p => p.category === 'กลุ่มฟองน้ำ' && p.onHandQty > 0);
      const totalFoamOnHand = foamStockItems.reduce((s, p) => s + Math.max(0, p.onHandQty), 0);

      // Compute FG Warehouse Inventory across all 439 SKUs with BOM Unit Costs
      const fgStockMap = this.getComputedFgStockMap();
      const matPriceByBomName = new Map();
      materialRequirements.forEach(m => {
        matPriceByBomName.set(m.bomName, {
          unitPrice: m.unitPrice,
          bomPerStockUnit: m.bomPerStockUnit || 1
        });
      });

      const backlogBySku = new Map();
      skuPlanResults.forEach(r => {
        backlogBySku.set(String(r.sku || '').trim().toLowerCase(), r);
      });

      const computeSkuBomUnitCost = (skuName) => {
        const recipe = skuRecipeMap.get(String(skuName || '').trim().toLowerCase());
        if (!recipe || !recipe.materials) return 1380;
        let cost = 0;
        Object.entries(recipe.materials).forEach(([mName, usage]) => {
          const mp = matPriceByBomName.get(mName);
          if (mp && Number(usage) > 0) {
            cost += (Number(usage) / mp.bomPerStockUnit) * mp.unitPrice;
          }
        });
        if (this.state.includeHardwareRules) {
          AUXILIARY_HARDWARE_BOM.forEach(rule => {
            const mp = matPriceByBomName.get(rule.name);
            const u = rule.calcUsage(skuName, 1);
            if (mp && u > 0) {
              cost += (u / mp.bomPerStockUnit) * mp.unitPrice;
            }
          });
        }
        return Math.round(cost * 100) / 100;
      };

      let totalFgWarehouseUnits = 0;
      let totalFgWarehouseIn = 0;
      let totalFgWarehouseOut = 0;
      let totalFgWarehouseValue = 0;
      let activeFgSkusCount = 0;
      let totalFgFreeAvailable = 0;

      const fgInventoryList = [];
      fgStockMap.forEach((fgEntry, lowerSku) => {
        const bPlan = backlogBySku.get(lowerSku);
        const unitCost = bPlan && bPlan.unitBomCost > 0 ? bPlan.unitBomCost : computeSkuBomUnitCost(fgEntry.sku);
        const orderQty = bPlan ? bPlan.grossOrder : 0;
        const allocatedQty = Math.min(orderQty, fgEntry.onHandQty);
        const freeQty = Math.max(0, fgEntry.onHandQty - allocatedQty);
        const netProd = Math.max(0, orderQty - fgEntry.onHandQty);
        const stockVal = Math.round(fgEntry.onHandQty * unitCost * 100) / 100;

        totalFgWarehouseUnits += fgEntry.onHandQty;
        totalFgWarehouseIn += fgEntry.totalIn;
        totalFgWarehouseOut += fgEntry.totalOut;
        totalFgWarehouseValue += stockVal;
        totalFgFreeAvailable += freeQty;
        if (fgEntry.onHandQty > 0) activeFgSkusCount++;

        fgInventoryList.push({
          ...fgEntry,
          orderQty,
          allocatedQty,
          freeQty,
          netProd,
          unitBomCost: unitCost,
          fgStockValue: stockVal,
          inBacklog: !!bPlan
        });
      });

      fgInventoryList.sort((a, b) => {
        if (b.onHandQty !== a.onHandQty) return b.onHandQty - a.onHandQty;
        if (b.orderQty !== a.orderQty) return b.orderQty - a.orderQty;
        return a.sku.localeCompare(b.sku, 'th');
      });

      const avgGrossMatPerSofa = totalNetProduce > 0 ? (totalGrossBomCost / totalNetProduce) : 0;
      const avgNetBuyPerSofa = totalNetProduce > 0 ? (totalNetPurchaseBudget / totalNetProduce) : 0;

      return {
        summary: {
          totalTiktokOrders,
          totalShopeeOrders,
          totalGrossBacklog,
          totalFgReady,
          totalFgUsed,
          totalNetProduce,
          activeMaterialsCount,
          enoughMaterialsCount,
          shortageMaterialsCount,
          totalGrossBomCost: Math.round(totalGrossBomCost * 100) / 100,
          totalStockDeductedValue: Math.round(totalStockDeductedValue * 100) / 100,
          totalNetPurchaseBudget: Math.round(totalNetPurchaseBudget * 100) / 100,
          cashWeeklyBudget: Math.round(cashWeeklyBudget * 100) / 100,
          creditEomBudget: Math.round(creditEomBudget * 100) / 100,
          totalWarehouseStockValue: Math.round(totalWarehouseStockValue * 100) / 100,
          totalWoodOnHand,
          totalFabricWarehouseYards,
          totalBomFabricYards,
          totalFoamOnHand,
          totalFgWarehouseUnits,
          totalFgWarehouseIn,
          totalFgWarehouseOut,
          totalFgWarehouseValue: Math.round(totalFgWarehouseValue * 100) / 100,
          activeFgSkusCount,
          totalFgFreeAvailable,
          avgGrossMatPerSofa: Math.round(avgGrossMatPerSofa * 100) / 100,
          avgNetBuyPerSofa: Math.round(avgNetBuyPerSofa * 100) / 100
        },
        warehouseOverview: {
          woodGroups,
          fabricStockItems,
          foamStockItems
        },
        fgInventoryList,
        skuPlanResults,
        materialRequirements,
        categoryBreakdown: Object.values(categoryBreakdown),
        supplierPurchasePlans,
        computedStockList
      };
    }

    // =========================================================================
    // 8. MUTATION HELPERS (Orders, FG Stock Warehouse, BOM Mapping, P&L Sync)
    // =========================================================================
    updateBacklogItem(index, field, value) {
      if (!this.state.backlogItems[index]) return;
      if (field === 'sku' || field === 'note') {
        this.state.backlogItems[index][field] = String(value || '');
      } else {
        const numVal = Math.max(0, Number(value || 0));
        this.state.backlogItems[index][field] = numVal;
        // Two-way sync: if fgStock is edited in Tab 2, update FG Warehouse on-hand & push to Supabase
        if (field === 'fgStock') {
          this.setFgPhysicalStock(this.state.backlogItems[index].sku, numVal, 'ปรับยอดจากตารางตัดสต็อก FG', false);
          return;
        }
      }
      this.saveLocalState();
    }

    addBacklogItem(sku, tiktokQty = 0, shopeeQty = 0, fgStock = null, note = '') {
      const cleanSku = String(sku || '').trim();
      if (!cleanSku) return false;
      const fgMap = this.getComputedFgStockMap();
      const warehouseFg = fgMap.get(cleanSku.toLowerCase());
      const effectiveFg = (fgStock !== null && fgStock !== undefined && Number(fgStock) > 0)
        ? Math.max(0, Number(fgStock))
        : (warehouseFg ? warehouseFg.onHandQty : 0);

      const existingIdx = this.state.backlogItems.findIndex(
        it => it.sku.trim().toLowerCase() === cleanSku.toLowerCase()
      );
      if (existingIdx >= 0) {
        this.state.backlogItems[existingIdx].tiktokQty += Math.max(0, Number(tiktokQty || 0));
        this.state.backlogItems[existingIdx].shopeeQty += Math.max(0, Number(shopeeQty || 0));
        this.state.backlogItems[existingIdx].fgStock = effectiveFg;
      } else {
        this.state.backlogItems.unshift({
          sku: cleanSku,
          tiktokQty: Math.max(0, Number(tiktokQty || 0)),
          shopeeQty: Math.max(0, Number(shopeeQty || 0)),
          fgStock: effectiveFg,
          note
        });
      }
      if (fgStock !== null && Number(fgStock) > 0 && (!warehouseFg || warehouseFg.onHandQty !== Number(fgStock))) {
        this.setFgPhysicalStock(cleanSku, Number(fgStock), 'อัปเดตพร้อมเพิ่มออเดอร์', false);
        return true;
      }
      this.saveLocalState();
      return true;
    }

    // --- FG WAREHOUSE TRANSACTION METHODS (Synced 100% with Supabase QC_FG_INVENTORY_DATA_V1) ---
    recordFgInbound({ sku, quantity, date, team = 'ฝ่ายผลิตโรงงาน', note = '' }) {
      const cleanSku = String(sku || '').trim();
      const qty = Math.max(0, Number(quantity || 0));
      if (!cleanSku || qty <= 0) return false;

      if (!Array.isArray(this.fgInventoryRaw.inbound)) this.fgInventoryRaw.inbound = [];
      const txId = `FG-IN-${Date.now().toString().slice(-6)}`;
      this.fgInventoryRaw.inbound.unshift({
        id: txId,
        date: date || new Date().toISOString().slice(0, 10),
        sku: cleanSku,
        quantity: qty,
        team: team || 'ฝ่ายผลิตโรงงาน',
        note: note || 'รับเข้าโซฟาผลิตเสร็จเข้าคลัง FG',
        createdAt: new Date().toISOString()
      });

      this.syncBacklogFgFromWarehouse(true);
      this.pushFgInventoryToCloud();
      return true;
    }

    recordFgOutbound({ sku, quantity, date, channel = 'TikTok / Shopee', note = '' }) {
      const cleanSku = String(sku || '').trim();
      const qty = Math.max(0, Number(quantity || 0));
      if (!cleanSku || qty <= 0) return false;

      if (!Array.isArray(this.fgInventoryRaw.outbound)) this.fgInventoryRaw.outbound = [];
      const txId = `FG-OUT-${Date.now().toString().slice(-6)}`;
      this.fgInventoryRaw.outbound.unshift({
        id: txId,
        date: date || new Date().toISOString().slice(0, 10),
        sku: cleanSku,
        quantity: qty,
        channel: channel || 'TikTok / Shopee',
        note: note || 'เบิกจ่ายแพ็คส่งลูกค้า',
        createdAt: new Date().toISOString()
      });

      this.syncBacklogFgFromWarehouse(true);
      this.pushFgInventoryToCloud();
      return true;
    }

    setFgPhysicalStock(sku, targetOnHandQty, reason = 'ปรับปรุงยอดตรวจนับสต็อก FG จริง', pushCloud = true) {
      const cleanSku = String(sku || '').trim();
      if (!cleanSku) return false;
      const target = Math.max(0, Number(targetOnHandQty || 0));
      const fgMap = this.getComputedFgStockMap();
      const currentEntry = fgMap.get(cleanSku.toLowerCase());
      const currentOnHand = currentEntry ? currentEntry.onHandQty : 0;
      const diff = target - currentOnHand;

      if (diff !== 0) {
        if (!Array.isArray(this.fgInventoryRaw.adjustments)) this.fgInventoryRaw.adjustments = [];
        this.fgInventoryRaw.adjustments.unshift({
          id: `FG-ADJ-${Date.now().toString().slice(-6)}`,
          date: new Date().toISOString().slice(0, 10),
          sku: currentEntry ? currentEntry.sku : cleanSku,
          quantity: diff,
          reason,
          createdAt: new Date().toISOString()
        });
      }

      this.syncBacklogFgFromWarehouse(true);
      if (pushCloud) {
        this.pushFgInventoryToCloud();
      } else {
        this.pushFgInventoryToCloud();
      }
      return true;
    }

    deleteFgTransaction(txType, txId) {
      if (txType === 'IN') {
        this.fgInventoryRaw.inbound = (this.fgInventoryRaw.inbound || []).filter(t => t.id !== txId);
      } else if (txType === 'OUT') {
        this.fgInventoryRaw.outbound = (this.fgInventoryRaw.outbound || []).filter(t => t.id !== txId);
      } else if (txType === 'ADJ') {
        this.fgInventoryRaw.adjustments = (this.fgInventoryRaw.adjustments || []).filter(t => t.id !== txId);
      }
      this.syncBacklogFgFromWarehouse(true);
      this.pushFgInventoryToCloud();
    }

    clearAllFgZero() {
      this.fgInventoryRaw = {
        version: 1,
        updatedAt: new Date().toISOString(),
        beginningStock: {},
        inbound: [],
        outbound: [],
        adjustments: []
      };
      this.state.backlogItems.forEach(it => { it.fgStock = 0; });
      this.saveLocalState();
      this.pushFgInventoryToCloud();
    }

    resetDefaultFgInventory() {
      this.fgInventoryRaw = getDefaultFgInventoryData();
      this.syncBacklogFgFromWarehouse(true);
      this.pushFgInventoryToCloud();
    }

    removeBacklogItem(index) {
      this.state.backlogItems.splice(index, 1);
      this.saveLocalState();
    }

    clearBacklog() {
      this.state.backlogItems = [];
      this.saveLocalState();
    }

    resetDefaultBacklog() {
      this.state.backlogItems = getDefaultBacklogOrders();
      this.saveLocalState();
    }

    updateBomMapping(bomMatName, patch) {
      if (!this.state.bomMapping[bomMatName]) {
        this.state.bomMapping[bomMatName] = {
          stockProductIds: [],
          stockUnit: 'ชิ้น',
          bomPerStockUnit: 1,
          supplierName: 'MJ- วัตถุดิบ',
          category: 'HARDWARE',
          fallbackStockPrice: 0
        };
      }
      this.state.bomMapping[bomMatName] = {
        ...this.state.bomMapping[bomMatName],
        ...patch
      };
      this.saveLocalState();
    }

    updateSkuBomFormula(skuName, newMaterialsMap) {
      const clean = String(skuName || '').trim();
      if (!clean) return false;
      const idx = (this.masterBom.skus || []).findIndex(s => s.sku.trim().toLowerCase() === clean.toLowerCase());
      if (idx >= 0) {
        this.masterBom.skus[idx].materials = { ...newMaterialsMap };
      } else {
        this.masterBom.skus.push({ sku: clean, materials: { ...newMaterialsMap } });
      }
      localStorage.setItem('qc_master_bom_custom_v2', JSON.stringify(this.masterBom));
      this.notify();
      return true;
    }

    // Sync calculated MRP numbers directly to QueenCosy P&L (localStorage QUEENCOSY_PNL_STATE_V1)
    syncToPnlSystem() {
      const calc = this.runMrpCalculation();
      const s = calc.summary;
      try {
        const rawPnl = localStorage.getItem(LOCAL_PNL_STATE_KEY);
        let pnlState = rawPnl ? JSON.parse(rawPnl) : { currentMonth: '2569-11', months: {} };
        const mKey = pnlState.currentMonth || '2569-11';
        if (!pnlState.months) pnlState.months = {};
        if (!pnlState.months[mKey]) pnlState.months[mKey] = {};
        if (!pnlState.months[mKey].platformPipeline) pnlState.months[mKey].platformPipeline = {};

        const pipe = pnlState.months[mKey].platformPipeline;
        pipe.tiktokBacklogOrders = s.totalTiktokOrders;
        pipe.shopeeBacklogOrders = s.totalShopeeOrders;
        pipe.fgReadyUnits = s.totalFgUsed;
        pipe.bomMaterialPerUnit = Math.round(s.avgGrossMatPerSofa || 1380);

        localStorage.setItem(LOCAL_PNL_STATE_KEY, JSON.stringify(pnlState));
        return {
          success: true,
          monthKey: mKey,
          summary: s
        };
      } catch (e) {
        console.error('[MrpStore] syncToPnlSystem error:', e);
        return { success: false, error: e.message };
      }
    }
  }

  window.MrpStore = new QueenCosyMrpStore();
})(window);
