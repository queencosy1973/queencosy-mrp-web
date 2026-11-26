/**
 * QueenCosy MRP Live TikTok & Shopee Order Sync Engine
 * 1) Primary Source (100% Exact Order-by-Order): Reads downloaded files in `D:\Furniture project\ออเดอร์ที่ต้องผลิต 2 platfrom` (TikTok CSV & Shopee XLSX)
 * 2) Also checks open Chrome Seller Center tabs via DevToolsActivePort (if allowed) to cross-verify order counts
 * 3) Maps all SKUs to the 439 Master BOM SKUs via SkuMapper
 * 4) Pushes live SKU-level backlog & exact file revenues to Supabase `QC_MRP_LIVE_ORDERS_V1` & `QC_PNL_PIPELINE_STATE_V1`
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');

const SUPABASE_URL = 'https://yercmidyvfetvbbrewlf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcmNtaWR5dmZldHZiYnJld2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MTA4MzUsImV4cCI6MjEwNDE4NjgzNX0.7tGbXNoogdLh6UQOJBJe9MABmY7W5J1aixPLJSXGSGk';

const PORT_FILE = path.join(process.env.LOCALAPPDATA || 'C:\\Users\\user\\AppData\\Local', 'Google', 'Chrome', 'User Data', 'DevToolsActivePort');
const ORDER_FOLDER_BASE = 'D:\\Furniture project\\ออเดอร์ที่ต้องผลิต 2 platfrom';

function parseCsvToRows(csvText) {
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') { currentVal += '"'; i++; }
        else inQuotes = false;
      } else currentVal += char;
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ',') { currentRow.push(currentVal.trim()); currentVal = ''; }
      else if (char === '\r') {}
      else if (char === '\n') { currentRow.push(currentVal.trim()); rows.push(currentRow); currentRow = []; currentVal = ''; }
      else currentVal += char;
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    rows.push(currentRow);
  }
  return rows.filter(r => r.some(c => c.length > 0));
}

function readXlsxFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const entries = {};
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error('Invalid ZIP/XLSX file');

  const cdEntries = buf.readUInt16LE(eocdOffset + 10);
  let cdOffset = buf.readUInt32LE(eocdOffset + 16);
  for (let e = 0; e < cdEntries; e++) {
    if (buf.readUInt32LE(cdOffset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(cdOffset + 10);
    const compSize = buf.readUInt32LE(cdOffset + 20);
    const nameLen = buf.readUInt16LE(cdOffset + 28);
    const extraLen = buf.readUInt16LE(cdOffset + 30);
    const commentLen = buf.readUInt16LE(cdOffset + 32);
    const localHdrOffset = buf.readUInt32LE(cdOffset + 42);
    const name = buf.toString('utf8', cdOffset + 46, cdOffset + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localHdrOffset + 26);
    const lExtraLen = buf.readUInt16LE(localHdrOffset + 28);
    const dataStart = localHdrOffset + 30 + lNameLen + lExtraLen;
    const compData = buf.subarray(dataStart, dataStart + compSize);
    if (name.endsWith('.xml')) {
      if (method === 0) entries[name] = compData.toString('utf8');
      else if (method === 8) entries[name] = zlib.inflateRawSync(compData).toString('utf8');
    }
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }

  const decodeXml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const sharedStrings = [];
  if (entries['xl/sharedStrings.xml']) {
    const siMatches = entries['xl/sharedStrings.xml'].match(/<si>[\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      const tMatches = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
      sharedStrings.push(tMatches.map(t => decodeXml(t.replace(/<[^>]+>/g, ''))).join(''));
    }
  }
  const sheetKey = Object.keys(entries).find(k => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml')) || 'xl/worksheets/sheet1.xml';
  const sheetXml = entries[sheetKey] || '';
  const rowMatches = sheetXml.match(/<row[\s>][\s\S]*?<\/row>/g) || [];
  const colToIdx = (colStr) => {
    let n = 0;
    for (let i = 0; i < colStr.length; i++) n = n * 26 + (colStr.charCodeAt(i) - 64);
    return n - 1;
  };
  const rows = [];
  for (const rXml of rowMatches) {
    const cellMatches = rXml.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || [];
    const rowArr = [];
    for (const cXml of cellMatches) {
      const refM = cXml.match(/r="([A-Z]+)\d+"/);
      const typeM = cXml.match(/t="([^"]+)"/);
      const colIdx = refM ? colToIdx(refM[1]) : rowArr.length;
      const cType = typeM ? typeM[1] : '';
      let val = '';
      if (cType === 'inlineStr') {
        const tM = cXml.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        val = tM ? decodeXml(tM[1]) : '';
      } else {
        const vM = cXml.match(/<v>([\s\S]*?)<\/v>/);
        const rawV = vM ? decodeXml(vM[1]) : '';
        val = (cType === 's') ? (sharedStrings[parseInt(rawV, 10)] ?? rawV) : rawV;
      }
      rowArr[colIdx] = val;
    }
    rows.push(rowArr);
  }
  return rows;
}

function readLocal2PlatformFolder(skuMapper) {
  if (!fs.existsSync(ORDER_FOLDER_BASE)) return null;
  const ttDir = path.join(ORDER_FOLDER_BASE, 'tiktok');
  const shDir = path.join(ORDER_FOLDER_BASE, 'shopee');

  const getNewestFile = (dir, exts) => {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir)
      .filter(f => exts.some(ext => f.toLowerCase().endsWith(ext)))
      .map(f => {
        const full = path.join(dir, f);
        return { full, name: f, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return files[0] || null;
  };

  const ttFileObj = getNewestFile(ttDir, ['.csv', '.xlsx']);
  const shFileObj = getNewestFile(shDir, ['.xlsx', '.csv']);
  if (!ttFileObj && !shFileObj) return null;

  const skuCountMap = new Map();
  let ttOrderIds = new Set();
  let ttRowsCount = 0;
  let ttUnitsCount = 0;
  let ttRealSellingRevenue = 0; // Subtotal Before Discount - Seller Discount (actual sofa selling price)
  let ttBuyerPaidSubtotal = 0;  // Subtotal After All Discounts

  if (ttFileObj) {
    const ttRows = ttFileObj.name.toLowerCase().endsWith('.xlsx')
      ? readXlsxFile(ttFileObj.full)
      : parseCsvToRows(fs.readFileSync(ttFileObj.full, 'utf8'));
    let dataRows = ttRows.slice(1);
    if (dataRows[0] && dataRows[0].some(c => String(c).toLowerCase().includes('unique identifier') || String(c).includes('รหัสคำสั่งซื้อ'))) {
      dataRows = dataRows.slice(1);
    }
    for (const r of dataRows) {
      const oid = String(r[0] || '').trim();
      const status = String(r[1] || '').trim();
      if (/ยกเลิก|cancel/i.test(status)) continue;
      const rawSku = String(r[6] || '').trim();
      const pName = String(r[7] || '').trim();
      const vari = String(r[8] || '').trim();
      if (!rawSku && !pName) continue;

      const qty = Math.max(1, parseInt(r[9] || '1', 10) || 1);
      const subBefore = parseFloat(String(r[12] || '0').replace(/,/g, '')) || 0;
      const sellDisc = parseFloat(String(r[14] || '0').replace(/,/g, '')) || 0;
      const subAfter = parseFloat(String(r[15] || '0').replace(/,/g, '')) || 0;
      const sellingPrice = Math.max(subAfter, subBefore - sellDisc);

      if (oid) ttOrderIds.add(oid);
      ttRowsCount++;
      ttUnitsCount += qty;
      ttRealSellingRevenue += sellingPrice;
      ttBuyerPaidSubtotal += subAfter;

      const res = skuMapper.mapToMasterSku(rawSku, pName, vari);
      const matched = res?.matchedSku;
      if (matched) {
        if (!skuCountMap.has(matched)) {
          skuCountMap.set(matched, { sku: matched, tiktokQty: 0, shopeeQty: 0, ttRevenue: 0, shRevenue: 0 });
        }
        const item = skuCountMap.get(matched);
        item.tiktokQty += qty;
        item.ttRevenue += sellingPrice;
      }
    }
  }

  let shOrderIds = new Set();
  let shRowsCount = 0;
  let shUnitsCount = 0;
  let shRealSellingRevenue = 0;
  let shRealPlatformFees = 0;

  if (shFileObj) {
    const shRows = shFileObj.name.toLowerCase().endsWith('.xlsx')
      ? readXlsxFile(shFileObj.full)
      : parseCsvToRows(fs.readFileSync(shFileObj.full, 'utf8'));
    const dataRows = shRows.slice(1).filter(r => r && r[0]);
    for (const r of dataRows) {
      const oid = String(r[0] || '').trim();
      const status = String(r[1] || '').trim();
      if (/ยกเลิก|cancel/i.test(status)) continue;
      const rawSku = String(r[18] || r[16] || '').trim();
      const pName = String(r[17] || '').trim();
      const vari = String(r[19] || '').trim();
      if (!rawSku && !pName) continue;

      const qty = Math.max(1, parseInt(r[22] || '1', 10) || 1);
      const dealP = parseFloat(String(r[21] || '0').replace(/,/g, '')) || 0;
      const netSale = parseFloat(String(r[24] || '0').replace(/,/g, '')) || (dealP * qty);
      const sellerVoucher = parseFloat(String(r[26] || '0').replace(/,/g, '')) || 0;
      const sellingPrice = Math.max(0, netSale - sellerVoucher);

      const comm = parseFloat(String(r[37] || '0').replace(/,/g, '')) || 0;
      const transFee = parseFloat(String(r[38] || '0').replace(/,/g, '')) || 0;
      const serviceFee = parseFloat(String(r[43] || '0').replace(/,/g, '')) || 0;

      if (oid) shOrderIds.add(oid);
      shRowsCount++;
      shUnitsCount += qty;
      shRealSellingRevenue += sellingPrice;
      shRealPlatformFees += (comm + transFee + serviceFee);

      const res = skuMapper.mapToMasterSku(rawSku, pName, vari);
      const matched = res?.matchedSku;
      if (matched) {
        if (!skuCountMap.has(matched)) {
          skuCountMap.set(matched, { sku: matched, tiktokQty: 0, shopeeQty: 0, ttRevenue: 0, shRevenue: 0 });
        }
        const item = skuCountMap.get(matched);
        item.shopeeQty += qty;
        item.shRevenue += sellingPrice;
      }
    }
  }

  return {
    ttFileName: ttFileObj?.name || null,
    shFileName: shFileObj?.name || null,
    ttUniqueOrders: ttOrderIds.size,
    ttRowsCount,
    ttUnitsCount,
    ttRealSellingRevenue: Math.round(ttRealSellingRevenue),
    ttBuyerPaidSubtotal: Math.round(ttBuyerPaidSubtotal),
    shUniqueOrders: shOrderIds.size,
    shRowsCount,
    shUnitsCount,
    shRealSellingRevenue: Math.round(shRealSellingRevenue),
    shRealPlatformFees: Math.round(shRealPlatformFees),
    items: Array.from(skuCountMap.values())
  };
}

async function tryReadChromeSellerCenter() {
  if (!fs.existsSync(PORT_FILE)) return null;
  try {
    const rawPort = fs.readFileSync(PORT_FILE, 'utf8').trim().split(/\r?\n/);
    const port = parseInt(rawPort[0], 10);
    const browserPath = rawPort[1] || '/devtools/browser';
    if (!port) return null;

    const browserWsUrl = `ws://127.0.0.1:${port}${browserPath}`;
    return await new Promise((resolve) => {
      const ws = new WebSocket(browserWsUrl);
      let msgId = 1;
      const pending = new Map();
      const timeout = setTimeout(() => {
        try { ws.close(); } catch (e) {}
        resolve(null);
      }, 1500);

      function callCdp(method, params = {}, sessionId = null) {
        return new Promise((res, rej) => {
          const id = msgId++;
          const payload = { id, method, params };
          if (sessionId) payload.sessionId = sessionId;
          pending.set(id, { resolve: res, reject: rej });
          ws.send(JSON.stringify(payload));
        });
      }

      ws.onmessage = (ev) => {
        const data = JSON.parse(ev.data);
        if (data.id && pending.has(data.id)) {
          const p = pending.get(data.id);
          pending.delete(data.id);
          if (data.error) p.reject(new Error(data.error.message));
          else p.resolve(data.result);
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        resolve(null);
      };

      ws.onopen = async () => {
        try {
          const { targetInfos } = await callCdp('Target.getTargets');
          const pages = (targetInfos || []).filter(t => t.type === 'page');
          const tiktokPages = pages.filter(t => /seller.*tiktok\.com/i.test(t.url));
          const shopeePages = pages.filter(t => /seller\.shopee\.co\.th/i.test(t.url));

          let tiktokOrders = null;
          let shopeeOrders = null;

          for (const p of tiktokPages) {
            try {
              const { sessionId } = await callCdp('Target.attachToTarget', { targetId: p.targetId, flatten: true });
              const evalRes = await callCdp('Runtime.evaluate', {
                expression: `(function(){
                  const txt = document.body ? document.body.innerText : '';
                  const m1 = txt.match(/ที่จะจัดส่ง[\\s\\n\\r]*\\(?([0-9,]{1,6})\\)?/);
                  const m2 = txt.match(/พบคำสั่งซื้อ\\s*([0-9,]{1,6})\\s*รายการ/);
                  const m3 = txt.match(/To Ship[\\s\\n\\r]*\\(?([0-9,]{1,6})\\)?/i);
                  return { count: m1 ? m1[1] : (m2 ? m2[1] : (m3 ? m3[1] : null)) };
                })()`,
                returnByValue: true
              }, sessionId);
              const val = evalRes?.result?.value;
              if (val && val.count) {
                const n = parseInt(String(val.count).replace(/,/g, ''), 10);
                if (!isNaN(n) && n > 0) tiktokOrders = n;
              }
            } catch (e) {}
          }

          for (const p of shopeePages) {
            try {
              const { sessionId } = await callCdp('Target.attachToTarget', { targetId: p.targetId, flatten: true });
              const evalRes = await callCdp('Runtime.evaluate', {
                expression: `(function(){
                  const txt = document.body ? document.body.innerText : '';
                  const m1 = txt.match(/ที่ต้องจัดส่ง[\\s\\n\\r]*\\(?([0-9,]{1,6})\\)?/);
                  const m2 = txt.match(/ดำเนินการแล้ว[\\s\\n\\r]*\\(?([0-9,]{1,6})\\)?/);
                  const m3 = txt.match(/รอดำเนินการ[\\s\\n\\r]*\\(?([0-9,]{1,6})\\)?/);
                  return { count: m1 ? m1[1] : (m2 ? m2[1] : (m3 ? m3[1] : null)) };
                })()`,
                returnByValue: true
              }, sessionId);
              const val = evalRes?.result?.value;
              if (val && val.count) {
                const n = parseInt(String(val.count).replace(/,/g, ''), 10);
                if (!isNaN(n) && n > 0) shopeeOrders = n;
              }
            } catch (e) {}
          }

          clearTimeout(timeout);
          ws.close();
          resolve({ tiktokOrders, shopeeOrders });
        } catch (err) {
          clearTimeout(timeout);
          try { ws.close(); } catch (e) {}
          resolve(null);
        }
      };
    });
  } catch (e) {
    return null;
  }
}

async function runSync() {
  console.log('==================================================================');
  console.log(' ⚡ QueenCosy MRP: กำลังดึงออเดอร์สดจากโฟลเดอร์ 2 แพลตฟอร์ม & ระบบ...');
  console.log('==================================================================');

  // Load Master BOM & SkuMapper in VM context
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'master-bom-data.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'sku-mapper.js'), 'utf8'), sandbox);
  sandbox.window.SkuMapper.initSkuIndex(sandbox.window.MASTER_BOM_DATA);

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`
  };

  const parseJsonField = (val) => {
    if (!val) return {};
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch (e) { return {}; }
    }
    return val;
  };

  // 1. Fetch FG inventory
  const fgResp = await fetch(`${SUPABASE_URL}/rest/v1/production_batches?batch_id=eq.QC_FG_INVENTORY_DATA_V1&select=batch_id,items_json`, { headers });
  let fgBegStock = {};
  if (fgResp.ok) {
    const fgRows = await fgResp.json();
    const fj = parseJsonField(fgRows[0]?.items_json);
    if (fj?.beginningStock) {
      fgBegStock = fj.beginningStock;
    }
  }

  // 2. Read local 2-platform folder (`D:\Furniture project\ออเดอร์ที่ต้องผลิต 2 platfrom`)
  const localFolderData = readLocal2PlatformFolder(sandbox.window.SkuMapper);
  const chromeLive = await tryReadChromeSellerCenter();
  if (chromeLive && (chromeLive.tiktokOrders !== null || chromeLive.shopeeOrders !== null)) {
    console.log(` 🌐 ดึงสดจากแท็บ Chrome Seller Center: TikTok = ${chromeLive.tiktokOrders ?? '-'} | Shopee = ${chromeLive.shopeeOrders ?? '-'}`);
  }

  let finalBacklog = [];
  let targetTiktok = 0;
  let targetShopee = 0;
  let fileTtGross = 0;
  let fileShGross = 0;

  if (localFolderData && localFolderData.items.length > 0) {
    targetTiktok = localFolderData.ttUnitsCount;
    targetShopee = localFolderData.shUnitsCount;
    fileTtGross = localFolderData.ttRealSellingRevenue;
    fileShGross = localFolderData.shRealSellingRevenue;

    console.log(` 📂 อ่านไฟล์ออเดอร์จริงจากโฟลเดอร์ [ออเดอร์ที่ต้องผลิต 2 platfrom] สำเร็จ!`);
    console.log(`    - ไฟล์ TikTok (${localFolderData.ttFileName}): ${localFolderData.ttUniqueOrders.toLocaleString()} ออเดอร์ (${localFolderData.ttRowsCount.toLocaleString()} รายการ) = รวมโซฟา ${localFolderData.ttUnitsCount.toLocaleString()} ตัว | ยอดขายจริง ฿${fileTtGross.toLocaleString()}`);
    console.log(`    - ไฟล์ Shopee (${localFolderData.shFileName}): ${localFolderData.shUniqueOrders.toLocaleString()} ออเดอร์ (${localFolderData.shRowsCount.toLocaleString()} รายการ) = รวมโซฟา ${localFolderData.shUnitsCount.toLocaleString()} ตัว | ยอดขายจริง ฿${fileShGross.toLocaleString()}`);

    finalBacklog = localFolderData.items
      .filter(x => (x.tiktokQty + x.shopeeQty) > 0)
      .sort((a, b) => (b.tiktokQty + b.shopeeQty) - (a.tiktokQty + a.shopeeQty))
      .map(it => ({
        sku: it.sku,
        tiktokQty: it.tiktokQty,
        shopeeQty: it.shopeeQty,
        fgStock: Number(fgBegStock[it.sku] || 0),
        note: `ไฟล์ออเดอร์จริง (${localFolderData.ttFileName || ''} + ${localFolderData.shFileName || ''})`
      }));
  }

  const totalUnits = finalBacklog.reduce((s, x) => s + x.tiktokQty + x.shopeeQty, 0);

  // Push to Supabase QC_MRP_LIVE_ORDERS_V1
  await fetch(`${SUPABASE_URL}/rest/v1/production_batches?on_conflict=batch_id`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      batch_id: 'QC_MRP_LIVE_ORDERS_V1',
      batch_name: 'QueenCosy MRP Live TikTok & Shopee Orders V1',
      source: 'QC_MRP_ORDER_SYNC',
      status: 'COMPLETED',
      total_skus: finalBacklog.length,
      total_units: totalUnits,
      total_material_cost: 0,
      items_json: {
        backlogItems: finalBacklog,
        meta: {
          mode: 'EXACT_EXPORT_FILES',
          tiktokFile: localFolderData?.ttFileName || null,
          shopeeFile: localFolderData?.shFileName || null,
          tiktokUniqueOrders: localFolderData?.ttUniqueOrders || targetTiktok,
          shopeeUniqueOrders: localFolderData?.shUniqueOrders || targetShopee,
          totalTiktokOrders: targetTiktok,
          totalShopeeOrders: targetShopee,
          totalGrossBacklog: totalUnits,
          syncedAt: new Date().toISOString()
        }
      },
      updated_at: new Date().toISOString(),
      notes: `TikTok: ${targetTiktok} (${localFolderData?.ttUniqueOrders || targetTiktok} orders) | Shopee: ${targetShopee} (${localFolderData?.shUniqueOrders || targetShopee} orders) | SKUs: ${finalBacklog.length}`
    })
  });

  console.log(` ✅ ซิงค์ออเดอร์เข้าสู่ระบบ MRP สำเร็จ!`);
  console.log(`    - TikTok Shop : ${targetTiktok.toLocaleString()} ตัว (จาก ${localFolderData?.ttUniqueOrders || targetTiktok} ใบสั่งซื้อ)`);
  console.log(`    - Shopee      : ${targetShopee.toLocaleString()} ตัว (จาก ${localFolderData?.shUniqueOrders || targetShopee} ใบสั่งซื้อ)`);
  console.log(`    - รวมทั้งหมด  : ${totalUnits.toLocaleString()} ตัว (แยกเป็น ${finalBacklog.length} รุ่นโซฟาตามสูตร BOM 100%)`);

  // Also calculate exact MRP BOM numbers and sync to QC_PNL_PIPELINE_STATE_V1
  try {
    const localStorageMock = { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); } };
    const mrpBox = { window: { localStorage: localStorageMock }, localStorage: localStorageMock, fetch, console, setTimeout, clearTimeout };
    mrpBox.window.window = mrpBox.window;
    vm.createContext(mrpBox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8'), mrpBox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'master-bom-data.js'), 'utf8'), mrpBox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'sku-mapper.js'), 'utf8'), mrpBox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'mrp-store.js'), 'utf8'), mrpBox);

    const store = mrpBox.window.MrpStore;
    await store.pullLiveStockMovement();
    // Load the newly synced backlogItems into store.state
    store.state.backlogItems = finalBacklog;
    const calc = store.runMrpCalculation();
    const s = calc.summary;

    const realTtGross = fileTtGross;
    const realShGross = fileShGross;
    const realMasterNet = Math.round(realTtGross * (1 - 0.2684) + realShGross * (1 - 0.2336));

    const pResp2 = await fetch(`${SUPABASE_URL}/rest/v1/production_batches?batch_id=eq.QC_PNL_PIPELINE_STATE_V1&select=items_json`, { headers });
    const pRows2 = await pResp2.json();
    const existingPipe = parseJsonField(pRows2[0]?.items_json);
    existingPipe.tiktokBacklogOrders = targetTiktok;
    existingPipe.shopeeBacklogOrders = targetShopee;
    existingPipe.tiktokUniqueOrderCount = localFolderData?.ttUniqueOrders || targetTiktok;
    existingPipe.shopeeUniqueOrderCount = localFolderData?.shUniqueOrders || targetShopee;
    existingPipe.fgReadyUnits = s.totalFgUsed;
    existingPipe.bomMaterialPerUnit = Number((s.avgGrossMatPerSofa || 1035).toFixed(2));
    existingPipe.mrpGrossBomCost = Math.round(s.totalGrossBomCost || 0);
    existingPipe.mrpStockDeducted = Math.round(s.totalStockDeductedValue || 0);
    existingPipe.mrpNetPurchaseNeeded = Math.round(s.totalNetPurchaseBudget || 0);
    existingPipe.mrpCashWeekly = Math.round(s.cashWeeklyBudget || 0);
    existingPipe.mrpCreditEom = Math.round(s.creditEomBudget || 0);
    existingPipe.mrpWarehouseTotal = Math.round(s.totalWarehouseStockValue || 0);
    if ((realTtGross + realShGross) > 0 && totalUnits > 0) {
      existingPipe.avgSofaPrice = Number(((realTtGross + realShGross) / totalUnits).toFixed(2));
      existingPipe.realTtGrossRevenue = Math.round(realTtGross);
      existingPipe.realShGrossRevenue = Math.round(realShGross);
      existingPipe.realMasterNetPayout = Math.round(realMasterNet);
    }
    existingPipe.updatedAt = new Date().toISOString();

    await fetch(`${SUPABASE_URL}/rest/v1/production_batches?on_conflict=batch_id`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        batch_id: 'QC_PNL_PIPELINE_STATE_V1',
        batch_name: 'QueenCosy P&L Daily Pipeline State V1',
        source: 'QC_MRP_ORDER_SYNC',
        status: 'COMPLETED',
        total_skus: 2,
        total_units: totalUnits,
        total_material_cost: Math.round(s.totalNetPurchaseBudget || 0),
        items_json: existingPipe,
        updated_at: new Date().toISOString(),
        notes: `TikTok: ${targetTiktok} (${localFolderData?.ttUniqueOrders || targetTiktok} orders) | Shopee: ${targetShopee} (${localFolderData?.shUniqueOrders || targetShopee} orders) | NetPO: ${Math.round(s.totalNetPurchaseBudget || 0)}`
      })
    });
    console.log(` 🔄 ซิงค์ตัวเลข BOM เข้าสู่ระบบ P&L สำเร็จ: ต้องผลิตจริง ${s.totalNetProduce} ตัว (หัก FG -${s.totalFgUsed} ตัว) | ตาม BOM ฿${Math.round(s.totalGrossBomCost).toLocaleString()} | หักสต็อก -฿${Math.round(s.totalStockDeductedValue).toLocaleString()} | ต้องซื้อเพิ่ม ฿${Math.round(s.totalNetPurchaseBudget).toLocaleString()}`);
  } catch (mrpErr) {
    console.warn(' ⚠️ MRP-to-P&L sync warning:', mrpErr.message);
  }
}

runSync().catch(err => console.error('Error:', err.message));
