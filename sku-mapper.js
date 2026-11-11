/**
 * SKU Mapper Engine for BOM & Production Planner
 * Matches e-commerce order items (TikTok / Shopee) or template inputs to 1,064 Master SKUs
 */

(function (window) {
  'use strict';

  // Fast SKU Lookup Set & Map
  let skuLookupMap = new Map();
  let skuList = [];

  function initSkuIndex(masterBomData) {
    if (!masterBomData || !masterBomData.skus) return;
    skuLookupMap.clear();
    skuList = masterBomData.skus.map(s => s.sku);

    masterBomData.skus.forEach(item => {
      const clean = item.sku.trim().toLowerCase();
      skuLookupMap.set(clean, item.sku);
    });
  }

  // Helper: clean text
  function cleanStr(val) {
    return String(val || '').trim();
  }

  // Model & Fabric Code extraction matching Google Sheet MapSKU tab and e-commerce variants
  function extractModelAndCode(productName, variation, rawSku) {
    const p = cleanStr(productName);
    const v = cleanStr(variation);
    const s = cleanStr(rawSku);
    const combined = (p + ' ' + v + ' ' + s).toLowerCase();
    const vClean = (v + ' ' + s).replace(/\s+/g, '');

    // 1. Fabric Type & Code extraction
    let code = '';
    const isHolland = combined.includes('ฮอลแลนด์') || combined.includes('mj337') || combined.includes('337');
    const isPoly = combined.includes('โพลี') || combined.includes('mj350') || combined.includes('350');
    const isCorduroy = combined.includes('ลูกฟูก') || combined.includes('mj356') || combined.includes('356');
    const is736b = /736b/i.test(combined) || combined.includes('นาโน');

    // Check if explicit code pattern is inside s or combined (e.g. 736b-01, 736b-02, MJ350-13, 350-1, PQ002C-12, 337-31)
    const explicitPqMatch = combined.match(/pq002c-[0-9]+/i);
    const explicit337Match = combined.match(/337-[0-9]+/i);
    const explicit350Match = combined.match(/350-[0-9]+/i);
    const explicit356Match = combined.match(/356-[0-9a-z]+/i);
    const explicit736Match = combined.match(/736b-[0-9]+/i);

    // 2. Color extraction
    const colorMatch = vClean.match(/แดงมะเหมี่ยว|น้ำตาลอ่อน|น้ำตาลทอง|น้ำตาลเข้ม|ฟ้าเทา|ฟ้าเข้ม|เทาอ่อน|เทาเข้ม|โรสโกลด์|ครีมทอง|มอคค่า|น้ำตาล|เขียว|แดง|น้ำเงิน|ครีม|ขาว|เทา|ดำ|ดํา|ชา/);
    let color = colorMatch ? colorMatch[0] : '';
    if (color === 'ดํา') color = 'ดำ';

    // English color fallback
    if (!color) {
      if (/gray|grey/i.test(combined)) color = 'เทา';
      else if (/brown/i.test(combined)) color = 'น้ำตาล';
      else if (/blue/i.test(combined)) color = 'น้ำเงิน';
      else if (/green/i.test(combined)) color = 'เขียว';
      else if (/black|bk/i.test(combined)) color = 'ดำ';
      else if (/white/i.test(combined)) color = 'ขาว';
      else if (/cream/i.test(combined)) color = 'ครีม';
      else if (/red/i.test(combined)) color = 'แดง';
    }

    // Determine Fabric Code
    if (explicit736Match) {
      code = explicit736Match[0].toLowerCase();
    } else if (explicit356Match) {
      code = explicit356Match[0].toLowerCase();
    } else if (explicit350Match) {
      code = explicit350Match[0].toUpperCase();
    } else if (explicit337Match) {
      code = explicit337Match[0];
    } else if (explicitPqMatch) {
      code = explicitPqMatch[0].toUpperCase();
    } else if (isHolland) {
      if (color === 'น้ำตาล') code = '337-7';
      else if (color === 'เขียว') code = '337-14';
      else if (color === 'แดงมะเหมี่ยว' || color === 'แดง') code = '337-23';
      else if (color === 'เทา') code = '337-29';
      else if (color === 'น้ำเงิน') code = '337-31';
      else if (color === 'โรสโกลด์') code = '337-22';
    } else if (isPoly) {
      if (color === 'น้ำตาล') code = '350-13';
      else if (color === 'เขียว') code = '350-6';
      else if (color === 'ฟ้าเข้ม') code = '350-9';
      else if (color === 'ครีมทอง') code = '350-4';
      else if (color === 'เทาอ่อน') code = '350-18';
      else if (color === 'เทาเข้ม') code = '350-20';
      else if (color === 'ครีม') code = '350-1';
      else if (color === 'น้ำตาลอ่อน') code = '350-11';
      else if (color === 'น้ำตาลเข้ม') code = '350-14';
    } else if (isCorduroy) {
      if (color === 'ครีม') code = '356-1a';
      else if (color === 'เขียว') code = '356-2a';
      else if (color === 'เทา') code = '356-3a';
      else if (color === 'น้ำตาล') code = '356-4a';
    } else if (is736b) {
      if (color === 'น้ำตาลทอง') code = '736b-01';
      else if (color === 'ฟ้าเทา') code = '736b-04';
      else if (color === 'เทาเข้ม' || color === 'เทา') code = '736b-02';
    } else {
      // Default PVC Leather (PQ002C)
      if (color === 'ดำ') code = 'PQ002C-17';
      else if (color === 'ขาว') code = 'PQ002C-1';
      else if (color === 'เทา') code = 'PQ002C-46';
      else if (color === 'น้ำตาล') code = 'PQ002C-12';
      else if (color === 'ชา') code = 'PQ002C-19';
      else if (color === 'ครีม') code = 'PQ002C-6';
      else if (color === 'มอคค่า') code = 'PQ002C-48';
    }

    // 3. Side extraction (L / R) for L-shape
    let side = '';
    if (/แอลซ้าย|\(l\)|-l-|_l_|แอล.*ซ้าย/i.test(combined)) {
      side = '(L)';
    } else if (/แอลขวา|\(r\)|-r-|_r_|แอล.*ขวา/i.test(combined)) {
      side = '(R)';
    }

    // 4. Model extraction
    let rawModel = '';
    if (/แขนโซฟา/.test(p) || /แขนโซฟา/.test(s)) {
      rawModel = 'แขนโซฟา';
    } else if (/หมอน/.test(p) || /หมอน/.test(s)) {
      if (isCorduroy) rawModel = 'plcf';
      else if (isHolland) rawModel = 'plh';
      else if (is736b) rawModel = 'pln';
      else if (isPoly) rawModel = 'plpy';
      else rawModel = 'pl';
    } else if (/ตัวแอล|เข้ามุม|modino|mncf|mnpy|mnn|mnh|\bmn\b/i.test(combined)) {
      if (!side) side = '(R)'; // default L-shape orientation to R
      if (/mncf/i.test(combined) || isCorduroy) rawModel = 'mncf' + side;
      else if (/mnpy/i.test(combined) || isPoly) rawModel = 'mnpy' + side;
      else if (/mnn/i.test(combined) || is736b) rawModel = 'mnn' + side;
      else if (/mnh/i.test(combined) || isHolland) rawModel = 'mnh' + side;
      else rawModel = 'mn' + side;
    } else {
      const mMatch = combined.match(/\b(modular|ln[1-3]|lu[1-3]|rcw|rcl|rcs|rch|rcn|rc2|rcii|rc|rsw|rsh|rsn|rss|rs2|rsii|rs|cs[1-3]|box[1-3]|bs3s|bs[1-3]|st[1-3]|ch[1-3]|pr[1-3]|cu|cl|md|lz|lof|trii|tt)\b/i);
      if (mMatch) {
        rawModel = mMatch[0].toLowerCase();
      } else {
        const subMatch = combined.match(/modular|ln[1-3]|lu[1-3]|rcw|rcl|rcs|rch|rcn|rcii|rc|rsw|rsh|rsn|rss|rsii|rs|cs[1-3]|box[1-3]|bs3s|bs[1-3]|st[1-3]|ch[1-3]|pr[1-3]|cu|cl|md|lz|lof|trii|tt/i);
        if (subMatch) rawModel = subMatch[0].toLowerCase();
      }
    }

    let model = rawModel;
    if (rawModel === 'modino' && !side) model = 'md';
    if (rawModel === 'rc2') model = 'rcii';
    if (rawModel === 'rs2') model = 'rsii';

    return { model, color, code, side };
  }

  // Match an individual item to Master SKU
  function mapToMasterSku(rawSku, productName, variation) {
    const sRaw = cleanStr(rawSku).replace(/-+/g, '-');
    const sName = cleanStr(productName);
    const sVar = cleanStr(variation);

    // Normalize rawSku: e.g. "เข้ามุม", color prefixes
    const normalizedSku = sRaw.replace(/ตัวแอลเข้ามุมมินิมอล/g, 'ตัวแอลมินิมอล')
                              .replace(/-น้ำตาล-/g, '-สีน้ำตาล-')
                              .replace(/-ครีม-/g, '-สีครีม-')
                              .replace(/-เทาเข้ม-/g, '-สีเทาเข้ม-')
                              .replace(/-เทาอ่อน-/g, '-สีเทาอ่อน-');

    // 1. Direct match on rawSku or normalizedSku
    if (sRaw) {
      const lowerRaw = sRaw.toLowerCase();
      if (skuLookupMap.has(lowerRaw)) {
        return { matchedSku: skuLookupMap.get(lowerRaw), matchType: 'EXACT_RAW_SKU' };
      }
      const lowerNorm = normalizedSku.toLowerCase();
      if (skuLookupMap.has(lowerNorm)) {
        return { matchedSku: skuLookupMap.get(lowerNorm), matchType: 'NORMALIZED_EXACT_RAW_SKU' };
      }
      // Substring/exact match in master sku list
      for (const masterSku of skuList) {
        if (masterSku.toLowerCase() === lowerRaw || masterSku.toLowerCase() === lowerNorm) {
          return { matchedSku: masterSku, matchType: 'CASE_INSENSITIVE_RAW_SKU' };
        }
      }
    }

    // 2. Extraction using MapSKU rules
    const { model, color, code } = extractModelAndCode(sName, sVar, sRaw);
    if (model && code) {
      const codeRegex = new RegExp(`${code.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}($|-)`, 'i');
      const modelRegex = new RegExp(model.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');

      for (const masterSku of skuList) {
        if (modelRegex.test(masterSku) && codeRegex.test(masterSku)) {
          return {
            matchedSku: masterSku,
            matchType: 'RULE_EXTRACTED',
            extractedModel: model,
            extractedColor: color,
            extractedCode: code
          };
        }
      }
    }

    // 3. Fallback: match by code + partial model
    if (code) {
      const codeRegex = new RegExp(`${code.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}($|-)`, 'i');
      const pAll = (sName + ' ' + sRaw).toLowerCase();
      for (const masterSku of skuList) {
        if (codeRegex.test(masterSku)) {
          const mParts = masterSku.split('-');
          const mModel = mParts.length >= 3 ? mParts[2].toLowerCase() : '';
          if (mModel && pAll.includes(mModel)) {
            return {
              matchedSku: masterSku,
              matchType: 'FALLBACK_CODE_MODEL',
              extractedCode: code
            };
          }
        }
      }
    }

    return null;
  }

  // Helper to find column in row
  function findColVal(row, possibleHeaders) {
    for (const h of possibleHeaders) {
      if (row[h] !== undefined && row[h] !== null && String(row[h]).trim() !== '') {
        return String(row[h]).trim();
      }
      // Check lowercase / trimmed key
      for (const k of Object.keys(row)) {
        if (k.trim().toLowerCase() === h.trim().toLowerCase()) {
          if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
            return String(row[k]).trim();
          }
        }
      }
    }
    return '';
  }

  // Detect file type and parse rows
  function parseProductionOrOrderRows(dataRows) {
    if (!dataRows || dataRows.length === 0) {
      return { success: false, error: 'ไม่พบข้อมูลในไฟล์' };
    }

    const firstRow = dataRows[0];
    const keys = Object.keys(firstRow).map(k => k.trim().toLowerCase());

    const isOrderAll = keys.some(k => k.includes('order') || k.includes('คำสั่งซื้อ') || k.includes('seller sku') || k.includes('เลขอ้างอิง sku') || k.includes('สถานะการสั่งซื้อ'));
    const isTemplate = keys.some(k => k.includes('ชื่อรุ่น') || k.includes('sku') || k.includes('จำนวนที่ผลิต') || k.includes('จำนวน'));

    const itemsMap = new Map(); // key = SKU -> { sku, quantity, dates: Set, orderCount }
    const unmatched = [];
    let totalInputRows = 0;
    let cancelledCount = 0;

    let stoppedAtSummaryTable = false;
    dataRows.forEach((row, idx) => {
      if (stoppedAtSummaryTable) return;

      // Detect if a secondary summary table starts below the main table in the same sheet
      const allVals = Object.values(row).map(v => String(v || '').trim());
      if (allVals.some(v => v.includes('ผ้าม้วนที่ใช้รวมทั้งหมด') || v === 'หมวดหมู่วัสดุ' || v === 'รายการวัสดุที่ใช้' || v === 'สถานะการเบิก')) {
        stoppedAtSummaryTable = true;
        return;
      }

      // Check status if ecommerce order
      const status = findColVal(row, [
        'Order Status', 'สถานะคำสั่งซื้อ', 'สถานะการสั่งซื้อ', 'สถานะ', 'Status', 'สถานะการคืนเงินหรือคืนสินค้า'
      ]);
      if (/ยกเลิก|cancel/i.test(status)) {
        cancelledCount++;
        return; // Ignore cancelled
      }

      const rawSku = findColVal(row, [
        'เลขอ้างอิง SKU (SKU Reference No.)',
        'เลขอ้างอิง SKU',
        'เลขอ้างอิง Parent SKU',
        'SKU Reference No.',
        'ชื่อรุ่น (SKU)',
        'ชื่อรุ่น',
        'SKU',
        'Seller SKU',
        'รหัสสินค้า',
        'SKU จาก stock'
      ]);
      const pName = findColVal(row, ['Product Name', 'ชื่อสินค้า', 'สินค้า', 'ชื่อสินค้าหลัก']);
      const pVar = findColVal(row, ['ชื่อตัวเลือก', 'Variation', 'ตัวเลือกสินค้า', 'ตัวเลือก', 'สี']);

      // Skip blank rows or summary rows (e.g. ,,464, where SKU and Product Name are empty)
      if (!rawSku && !pName && !pVar) {
        return;
      }

      const dateVal = findColVal(row, ['วันที่ทำการสั่งซื้อ', 'เวลาการชำระสินค้า', 'วันที่', 'Date', 'Created Time', 'เวลาสร้าง']);
      const orderId = findColVal(row, ['Order ID', 'หมายเลขคำสั่งซื้อ', 'Order Number', 'เลขที่คำสั่งซื้อ', 'Order No.']);
      const trackingId = findColVal(row, ['*หมายเลขติดตามพัสดุ', 'หมายเลขติดตามพัสดุ', 'Tracking ID', 'เลขพัสดุ', 'Tracking Number', 'Tracking No']);

      let qtyStr = findColVal(row, ['จำนวนที่ผลิต', 'จำนวน', 'Quantity', 'Qty']);
      let qty;
      if (qtyStr !== '') {
        const parsed = parseFloat(String(qtyStr).replace(/,/g, ''));
        qty = (isNaN(parsed) || parsed < 0) ? 0 : Math.round(parsed);
      } else {
        qty = isOrderAll ? 1 : 0;
      }

      totalInputRows++;

      const matchRes = mapToMasterSku(rawSku, pName, pVar);
      if (matchRes && matchRes.matchedSku) {
        const skuKey = matchRes.matchedSku;
        if (!itemsMap.has(skuKey)) {
          itemsMap.set(skuKey, {
            sku: skuKey,
            quantity: 0,
            dates: new Set(),
            orderCount: 0,
            originalInputs: [],
            detailedOrders: []
          });
        }
        const cur = itemsMap.get(skuKey);
        cur.quantity += qty;
        if (qty > 0) {
          cur.orderCount += 1;
          if (dateVal) cur.dates.add(dateVal);
          cur.detailedOrders.push({
            sku: skuKey,
            rawSku,
            productName: pName,
            variation: pVar,
            qty,
            orderId: orderId || '',
            trackingId: trackingId || '',
            date: dateVal || ''
          });
        }
        if (cur.originalInputs.length < 5) {
          cur.originalInputs.push({ rawSku, pName, pVar, qty, orderId, trackingId });
        }
      } else {
        // Only report unmatched if qty > 0 or if it's an actual SKU name
        unmatched.push({
          rowNumber: idx + 2,
          rawSku,
          productName: pName,
          variation: pVar,
          quantity: qty,
          orderId: orderId || '',
          trackingId: trackingId || ''
        });
      }
    });

    const plannedItems = Array.from(itemsMap.values()).map(item => ({
      sku: item.sku,
      quantity: item.quantity,
      orderCount: item.orderCount,
      date: Array.from(item.dates).join(', ') || '-',
      detailedOrders: item.detailedOrders || []
    }));

    const activeSkusCount = plannedItems.filter(x => x.quantity > 0).length;
    const zeroQtySkusCount = plannedItems.filter(x => x.quantity <= 0).length;

    return {
      success: true,
      fileType: isOrderAll ? 'E-Commerce Order All' : 'Production Plan Template',
      totalInputRows,
      cancelledCount,
      plannedItems,
      totalUnits: plannedItems.reduce((sum, x) => sum + (Number(x.quantity) || 0), 0),
      matchedSkusCount: activeSkusCount,
      totalListedSkusCount: plannedItems.length,
      zeroQtySkusCount,
      unmatchedCount: unmatched.length,
      unmatched
    };
  }

  window.SkuMapper = {
    initSkuIndex,
    extractModelAndCode,
    mapToMasterSku,
    parseProductionOrOrderRows
  };

})(window);
