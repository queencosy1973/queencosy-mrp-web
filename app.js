/**
 * Main UI Controller for QueenCosy MRP & Order-to-BOM Planning System (app.js)
 */

(function () {
  'use strict';

  const store = window.MrpStore;
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  let activeTab = 'tab-dashboard';
  let shortageCategoryFilter = 'ALL';
  let bomMapCategoryFilter = 'ALL';
  let bomMapSearchQuery = '';
  let skuRecipeSearchQuery = '';
  let backlogSearchQuery = '';
  let shortageSearchQuery = '';
  let poTermFilter = 'ALL';
  let fgTxMode = 'IN';
  let fgFamilyFilter = 'ALL';
  let fgTableSearchQuery = '';
  let categoryChartInstance = null;

  function fmt(num, dec = 0) {
    const n = Number(num || 0);
    return n.toLocaleString('th-TH', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });
  }

  function switchMrpTab(tabId) {
    activeTab = tabId;
    $$('.mrp-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    $$('.mrp-tab-pane').forEach(pane => {
      if (pane.id === tabId) {
        pane.classList.remove('hidden');
      } else {
        pane.classList.add('hidden');
      }
    });
    if (tabId === 'tab-dashboard' && categoryChartInstance) {
      setTimeout(() => categoryChartInstance.resize(), 80);
    }
    if (window.lucide) window.lucide.createIcons();
  }
  window.switchMrpTab = switchMrpTab;

  function init() {
    if (window.location.protocol === 'file:') {
      const linkSm = $('linkStockMovement');
      if (linkSm) linkSm.href = '../stock-movement-app/index.html';
      const linkPnl = $('linkPnlApp');
      if (linkPnl) linkPnl.href = '../queencosy-pnl/index.html';
    }

    if (window.SkuMapper && store.masterBom) {
      window.SkuMapper.initSkuIndex(store.masterBom);
    }

    setupEventListeners();
    renderAll();

    store.subscribe(() => {
      renderAll();
    });

    store.onStatusChange((status, message, lastSync) => {
      const badge = $('cloudStatusBadge');
      const dot = $('cloudStatusDot');
      const text = $('cloudStatusText');
      if (badge && dot && text) {
        text.textContent = message;
        if (status === 'online') {
          badge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-950/90 text-emerald-300 border border-emerald-700/60';
          dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
        } else if (status === 'syncing') {
          badge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-950/90 text-indigo-300 border border-indigo-700/60';
          dot.className = 'w-2 h-2 rounded-full bg-indigo-400 animate-ping';
        } else {
          badge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-950/90 text-amber-300 border border-amber-700/60';
          dot.className = 'w-2 h-2 rounded-full bg-amber-400';
        }
      }
      const tsEl = $('footerSyncTimestamp');
      if (tsEl && lastSync) {
        try {
          const d = new Date(lastSync);
          tsEl.textContent = `ซิงค์ข้อมูลจาก Supabase (QC_STOCK_MOVEMENT_DATA_V4) ล่าสุด: ${d.toLocaleString('th-TH')}`;
        } catch (e) {}
      }
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function jumpToShortageCategory(cat) {
    shortageCategoryFilter = cat || 'ALL';
    $$('.shortage-cat-btn').forEach(b => {
      if (b.getAttribute('data-shortage-cat') === shortageCategoryFilter) {
        b.className = 'shortage-cat-btn px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white cursor-pointer';
      } else {
        b.className = 'shortage-cat-btn px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer';
      }
    });
    const calc = store.runMrpCalculation();
    renderShortageTab(calc);
    switchMrpTab('tab-shortage');
  }
  window.jumpToShortageCategory = jumpToShortageCategory;

  function renderAll() {
    const calc = store.runMrpCalculation();
    renderTopPipelineRibbon(calc);
    renderDashboardTab(calc);
    renderBacklogTab(calc);
    renderFgWarehouseTab(calc);
    renderBomBuilderTab(calc);
    renderShortageTab(calc);
    renderSupplierPoTab(calc);
    if (window.lucide) window.lucide.createIcons();
  }

  // =========================================================================
  // 1. RENDER TOP 6-STEP PIPELINE RIBBON
  // =========================================================================
  function renderTopPipelineRibbon(calc) {
    const s = calc.summary;
    $('kpiPlatformSplit').textContent = `TT ${fmt(s.totalTiktokOrders)} | SP ${fmt(s.totalShopeeOrders)}`;
    $('kpiTotalBacklog').textContent = fmt(s.totalGrossBacklog);
    $('kpiFgDeducted').textContent = `-${fmt(s.totalFgUsed)}`;
    $('kpiFgTotalSub').textContent = `คลัง FG พร้อมส่งรวม ${fmt(s.totalFgWarehouseUnits || s.totalFgReady)} ตัว (${fmt(s.activeFgSkusCount || 0)} รุ่น)`;
    $('kpiNetProduce').textContent = fmt(s.totalNetProduce);
    $('kpiAvgMatPerSofa').textContent = `วัสดุตาม BOM เฉลี่ย ฿${fmt(s.avgGrossMatPerSofa, 0)}/ตัว`;

    $('kpiActiveMatCount').textContent = `ใช้ ${s.activeMaterialsCount} ชนิดวัสดุ`;
    $('kpiGrossBomCost').textContent = `฿${fmt(s.totalGrossBomCost, 0)}`;

    $('kpiEnoughCountBadge').textContent = `🟢 พอผลิต ${s.enoughMaterialsCount} รายการ`;
    $('kpiStockSavedValue').textContent = `-฿${fmt(s.totalStockDeductedValue, 0)}`;
    $('kpiWarehouseTotalSub').textContent = `มูลค่าคลังทั้งหมด ฿${fmt(s.totalWarehouseStockValue, 0)}`;

    $('kpiShortageBadge').textContent = `🔴 ขาด ${s.shortageMaterialsCount} รายการ`;
    $('kpiNetPurchaseBudget').textContent = `฿${fmt(s.totalNetPurchaseBudget, 0)}`;
    $('kpiPaymentTermSplit').textContent = `จ่ายสด ฿${fmt(s.cashWeeklyBudget, 0)} | เครดิต ฿${fmt(s.creditEomBudget, 0)}`;

    // Tab Badges
    $('badgeBacklogCount').textContent = `${fmt(s.totalNetProduce)} ตัว`;
    if ($('badgeFgStockCount')) {
      $('badgeFgStockCount').textContent = `${fmt(s.totalFgWarehouseUnits || s.totalFgReady)} ตัว`;
    }
    $('badgeBomCount').textContent = (store.masterBom.skus || []).length;
    $('badgeShortageCount').textContent = s.shortageMaterialsCount;
    const activePoSuppliers = calc.supplierPurchasePlans.filter(sp => sp.totalPurchaseCost > 0).length;
    $('badgeSupplierPoCount').textContent = `${activePoSuppliers} เจ้า`;
  }

  // =========================================================================
  // 2. RENDER TAB 1: EXECUTIVE MRP DASHBOARD
  // =========================================================================
  function renderDashboardTab(calc) {
    const s = calc.summary;

    // 2.1 Category Grid (5 Cards)
    const catGrid = $('dashboardCategoryGrid');
    if (catGrid) {
      catGrid.innerHTML = calc.categoryBreakdown.map(cat => {
        const hasShortage = cat.shortageCount > 0;
        return `
          <div onclick="jumpToShortageCategory('${cat.id}')" class="bg-white/10 hover:bg-white/15 cursor-pointer transition border border-white/15 rounded-xl p-3.5 flex flex-col justify-between" title="คลิกเพื่อดูตารางเช็กสต็อก${cat.name}">
            <div>
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>${cat.icon}</span>
                  <span>${cat.name.replace('หมวด', '')}</span>
                </span>
                <span class="px-1.5 py-0.5 text-[10px] rounded font-semibold ${hasShortage ? 'bg-rose-500/30 text-rose-200 border border-rose-400/30' : 'bg-emerald-500/30 text-emerald-200'}">
                  ${hasShortage ? `ขาด ${cat.shortageCount} รายการ` : 'พอผลิต'}
                </span>
              </div>
              <div class="mt-2.5">
                <div class="text-[11px] text-slate-300">ต้องสั่งซื้อเพิ่มสุทธิ:</div>
                <div class="text-lg font-black font-mono ${cat.netBuyCost > 0 ? 'text-amber-300' : 'text-emerald-300'}">
                  ฿${fmt(cat.netBuyCost, 0)}
                </div>
              </div>
            </div>
            <div class="mt-2.5 pt-2 border-t border-white/10 text-[10px] text-slate-300 space-y-0.5 font-mono">
              <div class="flex justify-between"><span>ตาม BOM:</span><span>฿${fmt(cat.grossCost, 0)}</span></div>
              <div class="flex justify-between text-emerald-300"><span>หักสต็อกที่มี:</span><span>-฿${fmt(cat.stockSaved, 0)}</span></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // 2.1B Live Warehouse Stock Overview (Wood, Fabric, Foam)
    const whEl = $('dashboardWarehouseOverview');
    if (whEl && calc.warehouseOverview) {
      const wo = calc.warehouseOverview;
      const woodRowsHtml = (wo.woodGroups || []).map(g => `
        <div class="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-none text-xs">
          <div>
            <div class="font-semibold text-slate-800">${g.label}</div>
            <div class="text-[10px] text-slate-400">${g.details}</div>
          </div>
          <div class="text-right font-mono shrink-0 ml-2">
            <span class="font-bold text-emerald-700">${fmt(g.qty)} แผ่น/ท่อน</span>
            <div class="text-[10px] text-slate-400">฿${fmt(g.val, 0)}</div>
          </div>
        </div>
      `).join('');

      const topFabricsHtml = (wo.fabricStockItems || [])
        .sort((a, b) => b.onHandQty - a.onHandQty)
        .slice(0, 8)
        .map(f => `
          <span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px]">
            <b class="text-slate-700">${f.name}</b>:
            <span class="font-mono font-bold text-teal-700">${fmt(f.onHandQty, 1)} หลา</span>
          </span>
        `).join('');

      const foamRowsHtml = (wo.foamStockItems || []).map(f => `
        <div class="flex items-center justify-between py-1 border-b border-slate-100 last:border-none text-xs">
          <span class="font-medium text-slate-700">${f.id}: ${f.name}</span>
          <span class="font-mono font-bold text-indigo-700">${fmt(f.onHandQty)} ${f.unit}</span>
        </div>
      `).join('');

      whEl.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
          <div>
            <h3 class="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <span>📦 ยอดสต็อกคงเหลือจริงในคลังที่ดึงมาคำนวณสด (Live Stock Movement + คลังผ้าม้วน BOM)</span>
              <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800">ดึงครบ 119 รหัสคลัง + 29 สีผ้า</span>
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">คลิกที่แต่ละหมวดเพื่อเปิดดูรายละเอียดการตัดสต็อกรายตัวในแท็บ <b>"3. แตกสูตร BOM & เช็กสต็อกวัตถุดิบ"</b></p>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button onclick="switchMrpTab('tab-fg-warehouse')" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shadow-xs">📦 คลังโซฟา FG (${fmt(s.totalFgWarehouseUnits || s.totalFgReady)} ตัว)</button>
            <button onclick="jumpToShortageCategory('WOOD')" class="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold cursor-pointer">🪵 ดูสต็อกไม้ทั้งหมด</button>
            <button onclick="jumpToShortageCategory('FABRIC')" class="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 text-xs font-bold cursor-pointer">🧵 ดูสต็อกผ้าทั้ง 29 สี</button>
            <button onclick="jumpToShortageCategory('FOAM')" class="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold cursor-pointer">🧽 ดูสต็อกฟองน้ำ</button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
          <!-- Wood Stock Card -->
          <div class="lg:col-span-4 rounded-xl border border-amber-200 bg-amber-50/30 p-3.5">
            <div class="flex items-center justify-between pb-2 border-b border-amber-200/70">
              <span class="text-xs font-bold text-amber-950 flex items-center gap-1.5">🪵 สต็อกกลุ่มไม้คงเหลือจริง</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-black font-mono bg-amber-200/70 text-amber-950">${fmt(s.totalWoodOnHand)} แผ่น/ท่อน</span>
            </div>
            <div class="mt-2 divide-y divide-amber-100/70">
              ${woodRowsHtml}
            </div>
          </div>

          <!-- Fabric Stock Card -->
          <div class="lg:col-span-5 rounded-xl border border-teal-200 bg-teal-50/30 p-3.5 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between pb-2 border-b border-teal-200/70">
                <span class="text-xs font-bold text-teal-950 flex items-center gap-1.5">🧵 สต็อกผ้าและหนังคงเหลือจริง (หน่วย: หลา)</span>
                <span class="px-2 py-0.5 rounded-full text-xs font-black font-mono bg-teal-200/70 text-teal-950">รวม ${fmt(s.totalBomFabricYards, 1)} หลา</span>
              </div>
              <div class="mt-2 text-[11px] text-slate-600">
                ดึงจาก <b>Stock Movement (${wo.fabricStockItems.length} รหัสมีของ = ${fmt(s.totalFabricWarehouseYards, 1)} หลา)</b> + <b>คลังผ้าโพลี MJ350 & เศษผ้าช่างตัด (+${fmt(s.totalBomFabricYards - s.totalFabricWarehouseYards, 1)} หลา)</b>:
              </div>
              <div class="mt-2 flex flex-wrap gap-1.5">
                ${topFabricsHtml}
              </div>
            </div>
            <div class="mt-2.5 pt-2 border-t border-teal-200/60 flex items-center justify-between text-[11px]">
              <span class="text-teal-800 font-medium">🟢 พอผลิตทันที 9 สีผ้า • 🔴 ต้องสั่งเพิ่ม 4 สีผ้า</span>
              <button onclick="jumpToShortageCategory('FABRIC')" class="text-teal-700 hover:underline font-bold cursor-pointer">ดูครบทั้ง 29 สี ➔</button>
            </div>
          </div>

          <!-- Foam & Hardware Stock Card -->
          <div class="lg:col-span-3 rounded-xl border border-indigo-200 bg-indigo-50/30 p-3.5 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between pb-2 border-b border-indigo-200/70">
                <span class="text-xs font-bold text-indigo-950 flex items-center gap-1.5">🧽 สต็อกฟองน้ำคงเหลือจริง</span>
                <span class="px-2 py-0.5 rounded-full text-xs font-black font-mono bg-indigo-200/70 text-indigo-950">${fmt(s.totalFoamOnHand)} แผ่น</span>
              </div>
              <div class="mt-2">
                ${foamRowsHtml}
              </div>
            </div>
            <div class="mt-2.5 pt-2 border-t border-indigo-200/60 text-[11px] text-slate-600">
              <div>📦 <b>บรรจุภัณฑ์/ฮาร์ดแวร์:</b> ขาพลาสติก 6,000 ตัว • สกรู 2.5" 6,480 ตัว • เทปใส 1,296 ม้วน • ลูกฟูกม้วน 1,075 กก. • ซีลยืด 65 ม้วน • บับเบิ้ล 45 ม้วน</div>
            </div>
          </div>
        </div>
      `;
    }

    // 2.2 Supplier Summary Table
    const supTbody = $('dashboardSupplierTableBody');
    if (supTbody) {
      const activeSuppliers = calc.supplierPurchasePlans;
      if (activeSuppliers.length === 0) {
        supTbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">ไม่มีรายการต้องสั่งซื้อเพิ่ม</td></tr>`;
      } else {
        supTbody.innerHTML = activeSuppliers.map(sup => {
          const isCash = sup.termType === 'CASH_WEEKLY';
          const termBadge = isCash
            ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">⚡ จ่ายรายสัปดาห์/สด</span>`
            : `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">🗓️ เครดิตสิ้นเดือน</span>`;

          return `
            <tr class="hover:bg-slate-50 transition cursor-pointer" onclick="switchMrpTab('tab-supplier-po')">
              <td class="py-3 px-4">
                <div class="font-bold text-slate-900 flex items-center gap-1.5">
                  <span>${sup.icon}</span>
                  <span>${sup.name}</span>
                </div>
                <div class="text-[11px] text-slate-400">${sup.note || ''}</div>
              </td>
              <td class="py-3 px-3 text-slate-600 font-medium">${sup.category}</td>
              <td class="py-3 px-3">${termBadge}</td>
              <td class="py-3 px-3 text-center">
                ${sup.items.length > 0
                  ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">${sup.items.length} รายการ</span>`
                  : `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">🟢 พอผลิต</span>`
                }
              </td>
              <td class="py-3 px-4 text-right font-mono font-bold ${sup.totalPurchaseCost > 0 ? 'text-rose-700 text-sm' : 'text-emerald-600'}">
                ฿${fmt(sup.totalPurchaseCost, 2)}
              </td>
            </tr>
          `;
        }).join('');
      }
      $('dashSupFootItems').textContent = `${s.shortageMaterialsCount} รายการ`;
      $('dashSupFootCost').textContent = `฿${fmt(s.totalNetPurchaseBudget, 2)}`;
    }

    // 2.3 Cash vs Credit & Chart
    $('dashCashWeeklyAmount').textContent = `฿${fmt(s.cashWeeklyBudget, 0)}`;
    $('dashCreditEomAmount').textContent = `฿${fmt(s.creditEomBudget, 0)}`;

    const ctx = $('mrpCategoryChart');
    if (ctx && typeof Chart !== 'undefined') {
      if (categoryChartInstance) categoryChartInstance.destroy();
      const cats = calc.categoryBreakdown;
      categoryChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: cats.map(c => c.name.replace('หมวด', '')),
          datasets: [
            {
              label: 'หักสต็อกที่มีอยู่ (฿)',
              data: cats.map(c => Math.round(c.stockSaved)),
              backgroundColor: '#10b981',
              borderRadius: 5
            },
            {
              label: 'ต้องสั่งซื้อเพิ่ม (฿)',
              data: cats.map(c => Math.round(c.netBuyCost)),
              backgroundColor: '#f43f5e',
              borderRadius: 5
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { font: { family: 'Prompt', size: 11 }, boxWidth: 12 }
            }
          },
          scales: {
            x: { stacked: true, ticks: { font: { family: 'Prompt', size: 10 } }, grid: { display: false } },
            y: {
              stacked: true,
              ticks: {
                font: { family: 'Inter', size: 10 },
                callback: v => '฿' + (v / 1000).toLocaleString() + 'k'
              }
            }
          }
        }
      });
    }

    // 2.4 Top 5 Shortages List
    const topShortagesEl = $('dashTopShortagesList');
    if (topShortagesEl) {
      const top5 = [...calc.materialRequirements]
        .filter(m => m.shortageStockUnit > 0)
        .sort((a, b) => b.netPurchaseCost - a.netPurchaseCost)
        .slice(0, 5);

      if (top5.length === 0) {
        topShortagesEl.innerHTML = `<div class="p-3 bg-emerald-50 text-emerald-700 rounded-xl text-center font-semibold">✅ วัตถุดิบในคลังเพียงพอสำหรับการผลิตทุกรายการ</div>`;
      } else {
        topShortagesEl.innerHTML = top5.map((m, i) => `
          <div class="p-2.5 rounded-xl bg-rose-50/50 border border-rose-100 flex items-center justify-between gap-2">
            <div>
              <div class="font-bold text-slate-900">${i + 1}. ${m.bomName}</div>
              <div class="text-[11px] text-slate-500">
                ต้องใช้ ${fmt(m.requiredInStockUnit, 1)} ${m.stockUnit} • มีสต็อก ${fmt(m.onHandStockUnit, 1)} • <b class="text-rose-600">ขาด ${fmt(m.orderPurchaseQty, 1)} ${m.stockUnit}</b> (${m.supplierName})
              </div>
            </div>
            <div class="text-right font-mono font-bold text-rose-700 shrink-0">
              ฿${fmt(m.netPurchaseCost, 0)}
            </div>
          </div>
        `).join('');
      }
    }
  }

  // =========================================================================
  // 3. RENDER TAB 2: ORDER BACKLOG & FG STOCK NETTING
  // =========================================================================
  function renderBacklogTab(calc) {
    const tbody = $('backlogTableBody');
    if (!tbody) return;

    const q = backlogSearchQuery.trim().toLowerCase();
    const filtered = calc.skuPlanResults.filter(r => !q || r.sku.toLowerCase().includes(q) || (r.note || '').toLowerCase().includes(q));

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="py-10 text-center text-slate-400">ยังไม่มีรายการออเดอร์ค้างผลิต กรุณาเพิ่มรุ่นโซฟาหรืออัปโหลดไฟล์ออเดอร์ด้านบน</td></tr>`;
    } else {
      tbody.innerHTML = filtered.map((item, i) => {
        return `
          <tr class="hover:bg-slate-50/90 transition">
            <td class="py-2.5 px-3 text-center font-mono text-slate-400">${i + 1}</td>
            <td class="py-2.5 px-4">
              <div class="font-bold text-slate-900">${item.sku}</div>
              <div class="flex items-center gap-2 mt-0.5">
                ${item.hasBom
                  ? `<span class="text-[10px] text-emerald-600 font-semibold">● ผูกสูตร BOM แล้ว</span>`
                  : `<span class="text-[10px] text-rose-600 font-semibold">⚠️ ไม่พบสูตร BOM</span>`
                }
                ${item.note ? `<span class="text-[11px] text-slate-400">• ${item.note}</span>` : ''}
              </div>
            </td>
            <td class="py-2.5 px-3 text-center bg-slate-50/60">
              <input type="number" min="0" value="${item.tiktokQty}" data-backlog-idx="${item.index}" data-backlog-field="tiktokQty"
                class="backlog-input w-20 px-2 py-1 text-center font-mono font-bold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
            </td>
            <td class="py-2.5 px-3 text-center bg-amber-50/30">
              <input type="number" min="0" value="${item.shopeeQty}" data-backlog-idx="${item.index}" data-backlog-field="shopeeQty"
                class="backlog-input w-20 px-2 py-1 text-center font-mono font-bold bg-white border border-amber-300 text-amber-900 rounded-lg focus:ring-2 focus:ring-amber-500" />
            </td>
            <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-900 text-sm">
              ${fmt(item.grossOrder)}
            </td>
            <td class="py-2.5 px-3 text-center bg-emerald-50/40">
              <input type="number" min="0" value="${item.fgStock}" data-backlog-idx="${item.index}" data-backlog-field="fgStock"
                class="backlog-input w-20 px-2 py-1 text-center font-mono font-bold bg-white border-2 border-emerald-400 text-emerald-800 rounded-lg focus:ring-2 focus:ring-emerald-600" />
            </td>
            <td class="py-2.5 px-3 text-center bg-indigo-50/50">
              <span class="px-2.5 py-1 rounded-lg font-mono font-black text-sm ${item.netToProduce > 0 ? 'bg-indigo-600 text-white' : 'bg-emerald-100 text-emerald-800'}">
                ${fmt(item.netToProduce)} ตัว
              </span>
            </td>
            <td class="py-2.5 px-3 text-right font-mono text-slate-700">
              ฿${fmt(item.unitBomCost, 0)}
            </td>
            <td class="py-2.5 px-4 text-right font-mono font-bold text-indigo-900">
              ฿${fmt(item.totalBomCost, 2)}
            </td>
            <td class="py-2.5 px-3 text-center">
              <button data-remove-backlog="${item.index}" class="text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded font-bold cursor-pointer" title="ลบรายการนี้">
                ✕
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    const s = calc.summary;
    $('footTiktokQty').textContent = fmt(s.totalTiktokOrders);
    $('footShopeeQty').textContent = fmt(s.totalShopeeOrders);
    $('footGrossOrderQty').textContent = fmt(s.totalGrossBacklog);
    $('footFgStockQty').textContent = `-${fmt(s.totalFgUsed)}`;
    $('footNetProduceQty').textContent = `${fmt(s.totalNetProduce)} ตัว`;
    $('footAvgBomUnit').textContent = `เฉลี่ย ฿${fmt(s.avgGrossMatPerSofa, 0)}/ตัว`;
    $('footTotalBomValue').textContent = `฿${fmt(s.totalGrossBomCost, 2)}`;
  }

  // =========================================================================
  // 3B. RENDER TAB 3 (NEW): FINISHED GOODS (FG / สินค้าสำเร็จรูป) STOCK WAREHOUSE
  // =========================================================================
  function renderFgWarehouseTab(calc) {
    const s = calc.summary;
    if ($('fgKpiActiveSkus')) $('fgKpiActiveSkus').textContent = `${fmt(s.activeFgSkusCount || 0)} รุ่นพร้อมส่ง`;
    if ($('fgKpiTotalOnHand')) $('fgKpiTotalOnHand').textContent = fmt(s.totalFgWarehouseUnits || 0);
    if ($('fgKpiAllocated')) $('fgKpiAllocated').textContent = `-${fmt(s.totalFgUsed || 0)}`;
    if ($('fgKpiFreeSub')) $('fgKpiFreeSub').textContent = `เหลือว่างพร้อมขายทันที ${fmt(s.totalFgFreeAvailable || 0)} ตัว`;
    if ($('fgKpiTotalIn')) $('fgKpiTotalIn').textContent = `+${fmt(s.totalFgWarehouseIn || 0)} รับเข้า`;
    if ($('fgKpiTotalOut')) $('fgKpiTotalOut').textContent = `-${fmt(s.totalFgWarehouseOut || 0)} ส่งออก`;
    if ($('fgKpiTotalValue')) $('fgKpiTotalValue').textContent = `฿${fmt(s.totalFgWarehouseValue || 0, 0)}`;

    // Default date input
    const dtInput = $('fgTxDateInput');
    if (dtInput && !dtInput.value) {
      dtInput.value = new Date().toISOString().slice(0, 10);
    }

    // Recent FG Transactions Log
    const txListEl = $('fgRecentTransactionsList');
    if (txListEl) {
      const fgRaw = store.fgInventoryRaw || { inbound: [], outbound: [], adjustments: [] };
      const combined = [];
      (fgRaw.inbound || []).forEach(tx => combined.push({ ...tx, txType: 'IN' }));
      (fgRaw.outbound || []).forEach(tx => combined.push({ ...tx, txType: 'OUT' }));
      (fgRaw.adjustments || []).forEach(tx => combined.push({ ...tx, txType: 'ADJ' }));

      combined.sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')));
      const topRecent = combined.slice(0, 15);

      if (topRecent.length === 0) {
        txListEl.innerHTML = `<div class="py-6 text-center text-slate-400">ยังไม่มีประวัติเคลื่อนไหวเพิ่มเติม</div>`;
      } else {
        txListEl.innerHTML = topRecent.map(tx => {
          let badge = '';
          let qtyHtml = '';
          if (tx.txType === 'IN') {
            badge = `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">📥 รับเข้า</span>`;
            qtyHtml = `<span class="font-mono font-bold text-emerald-700">+${fmt(tx.quantity)} ตัว</span>`;
          } else if (tx.txType === 'OUT') {
            badge = `<span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">📤 ส่งออก</span>`;
            qtyHtml = `<span class="font-mono font-bold text-rose-600">-${fmt(tx.quantity)} ตัว</span>`;
          } else {
            badge = `<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">⚖️ ปรับยอด</span>`;
            qtyHtml = `<span class="font-mono font-bold text-amber-700">${tx.quantity >= 0 ? '+' : ''}${fmt(tx.quantity)} ตัว</span>`;
          }
          const subInfo = tx.team || tx.channel || tx.reason || '';
          return `
            <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/70 transition">
              <div class="min-w-0 pr-2">
                <div class="flex items-center gap-1.5">
                  ${badge}
                  <span class="font-bold text-slate-800 truncate">${tx.sku}</span>
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5 truncate">${tx.date || ''} • ${subInfo} ${tx.note ? `(${tx.note})` : ''}</div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                ${qtyHtml}
                <button data-del-fg-tx="${tx.id}" data-del-fg-type="${tx.txType}" class="text-slate-400 hover:text-rose-600 font-bold px-1 cursor-pointer" title="ลบรายการนี้">✕</button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // FG Master Inventory Table
    const tbody = $('fgInventoryTableBody');
    if (!tbody) return;

    const activeOnly = $('filterFgActiveOnly') && $('filterFgActiveOnly').checked;
    const q = fgTableSearchQuery.trim().toLowerCase();

    const list = (calc.fgInventoryList || []).filter(item => {
      if (fgFamilyFilter !== 'ALL' && item.familyId !== fgFamilyFilter) return false;
      if (activeOnly && item.onHandQty <= 0 && item.orderQty <= 0 && item.totalIn <= 0 && item.totalOut <= 0) return false;
      if (q && !item.sku.toLowerCase().includes(q) && !item.familyLabel.toLowerCase().includes(q)) return false;
      return true;
    });

    let sumBeg = 0;
    let sumIn = 0;
    let sumOut = 0;
    let sumOnHand = 0;
    let sumOrder = 0;
    let sumAllocated = 0;
    let sumFree = 0;
    let sumVal = 0;

    list.forEach(it => {
      sumBeg += it.begStock;
      sumIn += it.totalIn;
      sumOut += it.totalOut;
      sumOnHand += it.onHandQty;
      sumOrder += it.orderQty;
      sumAllocated += it.allocatedQty;
      sumFree += it.freeQty;
      sumVal += it.fgStockValue;
    });

    const displayRows = list.slice(0, 150);

    if (displayRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="13" class="py-10 text-center text-slate-400">ไม่พบรุ่นโซฟาตามตัวกรอง (เอาติ๊ก "แสดงเฉพาะรุ่นที่มีสต็อก FG" ออกเพื่อดูครบทั้ง 439 รุ่น)</td></tr>`;
    } else {
      tbody.innerHTML = displayRows.map((item, idx) => {
        return `
          <tr class="hover:bg-slate-50 transition ${item.onHandQty > 0 ? 'bg-emerald-50/15' : ''}">
            <td class="py-2.5 px-3 text-center font-mono text-slate-400">${idx + 1}</td>
            <td class="py-2.5 px-4">
              <div class="font-bold text-slate-900">${item.sku}</div>
              ${item.inBacklog ? `<span class="inline-block mt-0.5 px-1.5 py-0.2 text-[10px] rounded bg-indigo-50 text-indigo-700 font-semibold">อยู่ในแผนผลิต</span>` : ''}
            </td>
            <td class="py-2.5 px-3 text-[11px] font-medium text-slate-600 whitespace-nowrap">
              ${item.familyIcon} ${item.familyLabel}
            </td>
            <td class="py-2.5 px-2.5 text-center font-mono text-slate-600">${fmt(item.begStock)}</td>
            <td class="py-2.5 px-2.5 text-center font-mono font-semibold ${item.totalIn > 0 ? 'text-teal-700' : 'text-slate-300'}">
              ${item.totalIn > 0 ? `+${fmt(item.totalIn)}` : '0'}
            </td>
            <td class="py-2.5 px-2.5 text-center font-mono font-semibold ${item.totalOut > 0 ? 'text-rose-600' : 'text-slate-300'}">
              ${item.totalOut > 0 ? `-${fmt(item.totalOut)}` : '0'}
            </td>
            <td class="py-2.5 px-3 text-center bg-emerald-50/50">
              <input type="number" min="0" value="${item.onHandQty}" data-fg-set-sku="${item.sku}"
                class="fg-quick-set-input w-20 px-2 py-1 text-center font-mono font-black bg-white border-2 ${item.onHandQty > 0 ? 'border-emerald-500 text-emerald-800' : 'border-slate-200 text-slate-500'} rounded-lg focus:ring-2 focus:ring-emerald-600" />
            </td>
            <td class="py-2.5 px-3 text-center font-mono font-bold ${item.orderQty > 0 ? 'text-slate-900 bg-slate-100/60' : 'text-slate-300'}">
              ${fmt(item.orderQty)}
            </td>
            <td class="py-2.5 px-3 text-center font-mono font-bold ${item.allocatedQty > 0 ? 'text-indigo-700 bg-indigo-50/50' : 'text-slate-300'}">
              ${item.allocatedQty > 0 ? `-${fmt(item.allocatedQty)}` : '0'}
            </td>
            <td class="py-2.5 px-3 text-center font-mono font-bold ${item.freeQty > 0 ? 'text-teal-700' : 'text-slate-400'}">
              ${fmt(item.freeQty)} ตัว
            </td>
            <td class="py-2.5 px-3 text-right font-mono text-slate-600">฿${fmt(item.unitBomCost, 0)}</td>
            <td class="py-2.5 px-3 text-right font-mono font-bold ${item.fgStockValue > 0 ? 'text-amber-800' : 'text-slate-300'}">
              ฿${fmt(item.fgStockValue, 0)}
            </td>
            <td class="py-2.5 px-3 text-center whitespace-nowrap">
              <button data-fg-quick-in="${item.sku}" class="px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-[11px] cursor-pointer mr-1" title="รับเข้าผลิตเสร็จ +1 ตัว">+1</button>
              <button data-fg-quick-out="${item.sku}" class="px-2 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-[11px] cursor-pointer" title="จ่ายออกส่งลูกค้า -1 ตัว">-1</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    if ($('fgFootBeg')) $('fgFootBeg').textContent = fmt(sumBeg);
    if ($('fgFootIn')) $('fgFootIn').textContent = `+${fmt(sumIn)}`;
    if ($('fgFootOut')) $('fgFootOut').textContent = `-${fmt(sumOut)}`;
    if ($('fgFootOnHand')) $('fgFootOnHand').textContent = `${fmt(sumOnHand)} ตัว`;
    if ($('fgFootOrder')) $('fgFootOrder').textContent = fmt(sumOrder);
    if ($('fgFootAllocated')) $('fgFootAllocated').textContent = `-${fmt(sumAllocated)}`;
    if ($('fgFootFree')) $('fgFootFree').textContent = `${fmt(sumFree)} ตัว`;
    if ($('fgFootValue')) $('fgFootValue').textContent = `฿${fmt(sumVal, 0)}`;
  }

  // =========================================================================
  // 4. RENDER TAB 3: BOM BUILDER & STOCK MOVEMENT ID MAPPING
  // =========================================================================
  function renderBomBuilderTab(calc) {
    const mapTbody = $('bomMappingTableBody');
    if (mapTbody) {
      const q = bomMapSearchQuery.trim().toLowerCase();
      const filteredMats = calc.materialRequirements.filter(m => {
        if (bomMapCategoryFilter !== 'ALL' && m.category !== bomMapCategoryFilter) return false;
        if (q) {
          const idMatch = (m.stockProductIds || []).some(id => id.toLowerCase().includes(q));
          const prodMatch = (m.matchedProducts || []).some(p => p.name.toLowerCase().includes(q));
          return m.bomName.toLowerCase().includes(q) || m.supplierName.toLowerCase().includes(q) || idMatch || prodMatch;
        }
        return true;
      });

      const supplierOpts = store.masterSuppliers.map(s => s.name);

      mapTbody.innerHTML = filteredMats.map(m => {
        const prodBadges = m.matchedProducts.length > 0
          ? m.matchedProducts.map(p =>
              `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 text-indigo-800 border border-indigo-200 mr-1 mb-1">
                <b class="font-mono">${p.id}</b>: ${p.name} <span class="text-emerald-700 font-mono">(${fmt(p.onHandQty, 0)} ${p.unit})</span>
              </span>`
            ).join('')
          : `<span class="px-2 py-0.5 rounded text-[11px] bg-amber-50 text-amber-700 border border-amber-200">ยังไม่ได้ผูก PROD (สต็อก = 0)</span>`;

        const supSelectOptions = supplierOpts.map(supName =>
          `<option value="${supName}" ${supName === m.supplierName ? 'selected' : ''}>${supName}</option>`
        ).join('');

        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-2.5 px-4">
              <div class="font-bold text-slate-900">${m.bomName}</div>
              <div class="text-[11px] text-slate-400">หน่วยใน BOM: ${m.bomUnit} ${m.bomPerStockUnit > 1 ? `(1 ${m.stockUnit} = ${fmt(m.bomPerStockUnit)} ${m.bomUnit})` : ''}</div>
            </td>
            <td class="py-2.5 px-3 font-semibold text-slate-600">${m.category}</td>
            <td class="py-2.5 px-4">${prodBadges}</td>
            <td class="py-2.5 px-3 text-right font-mono font-bold ${m.onHandStockUnit > 0 ? 'text-emerald-700' : 'text-slate-400'}">
              ${fmt(m.onHandStockUnit, 2)} ${m.stockUnit}
            </td>
            <td class="py-2.5 px-3 text-right font-mono text-slate-800">
              ฿${fmt(m.unitPrice, 2)}
            </td>
            <td class="py-2.5 px-4">
              <select data-map-bom-sup="${m.bomName}" class="bom-sup-select w-full px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white font-medium text-slate-800">
                ${supSelectOptions}
              </select>
            </td>
            <td class="py-2.5 px-3 text-center">
              <button data-edit-bom-link="${m.bomName}" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800 font-semibold text-[11px] cursor-pointer transition">
                🔗 เลือกรหัส PROD
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Render SKU Recipe Cards (limited to top 36 matching search for speed)
    const skuContainer = $('skuRecipeListContainer');
    if (skuContainer) {
      const q = skuRecipeSearchQuery.trim().toLowerCase();
      const allSkus = store.masterBom.skus || [];
      const matched = allSkus.filter(s => !q || s.sku.toLowerCase().includes(q)).slice(0, 36);

      skuContainer.innerHTML = matched.map(s => {
        const entries = Object.entries(s.materials || {});
        const matPills = entries.map(([k, v]) =>
          `<div class="flex justify-between text-[11px] py-0.5 border-b border-slate-100 last:border-none">
            <span class="text-slate-600 truncate pr-2">${k}</span>
            <span class="font-mono font-bold text-slate-900 shrink-0">${v}</span>
          </div>`
        ).join('');

        return `
          <div class="rounded-xl border border-slate-200 p-3.5 bg-slate-50/50 hover:bg-white hover:shadow-xs transition flex flex-col justify-between">
            <div>
              <div class="flex items-start justify-between gap-2 pb-2 border-b border-slate-200">
                <span class="font-bold text-xs text-slate-900 leading-snug">${s.sku}</span>
                <button data-quick-add-sku="${s.sku}" class="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold shrink-0 cursor-pointer">
                  + เพิ่มเข้าแผน
                </button>
              </div>
              <div class="mt-2 space-y-0.5">
                ${matPills}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // =========================================================================
  // 5. RENDER TAB 4: MATERIAL SHORTAGE & LIVE STOCK MOVEMENT CHECK
  // =========================================================================
  function renderShortageTab(calc) {
    const tbody = $('shortageTableBody');
    if (!tbody) return;

    const onlyShortage = $('filterShortageOnly') && $('filterShortageOnly').checked;
    const onlyActive = $('filterActiveBomOnly') && $('filterActiveBomOnly').checked;
    const q = shortageSearchQuery.trim().toLowerCase();

    const filtered = calc.materialRequirements.filter(m => {
      if (shortageCategoryFilter !== 'ALL' && m.category !== shortageCategoryFilter) return false;
      if (onlyShortage && m.status !== 'SHORTAGE') return false;
      if (onlyActive && m.requiredInStockUnit <= 0) return false;
      if (q) {
        const matchName = m.bomName.toLowerCase().includes(q) || m.supplierName.toLowerCase().includes(q);
        const matchId = (m.stockProductIds || []).some(id => id.toLowerCase().includes(q));
        return matchName || matchId;
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="py-10 text-center text-slate-400">ไม่พบรายการวัตถุดิบตามเงื่อนไขตัวกรอง</td></tr>`;
    } else {
      tbody.innerHTML = filtered.map(m => {
        let statusHtml = '';
        if (m.status === 'SHORTAGE') {
          statusHtml = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-300">🔴 ขาดสต็อก</span>`;
        } else if (m.status === 'ENOUGH') {
          statusHtml = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">🟢 พอผลิต (เหลือ ${fmt(m.remainingStockUnit, 1)})</span>`;
        } else {
          statusHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">⚪ ไม่ได้ใช้ในรอบนี้</span>`;
        }

        const linkedLabel = m.matchedProducts.length > 0
          ? m.matchedProducts.map(p => `${p.id} (${p.name})`).join(', ')
          : 'ไม่ได้ผูกรหัส';

        return `
          <tr class="hover:bg-slate-50 transition ${m.status === 'SHORTAGE' ? 'bg-rose-50/20' : ''}">
            <td class="py-3 px-4">
              <div class="font-bold text-slate-900">${m.bomName}</div>
              <div class="text-[11px] text-slate-400">ใช้ใน ${m.usedBySkus.length} รุ่นโซฟา ${m.bomPerStockUnit > 1 ? `(รวม ${fmt(m.grossBomQty, 0)} ${m.bomUnit})` : ''}</div>
            </td>
            <td class="py-3 px-3 text-[11px] text-slate-600 max-w-xs truncate" title="${linkedLabel}">
              ${linkedLabel}
            </td>
            <td class="py-3 px-3 text-right font-mono font-bold text-indigo-900 bg-indigo-50/30">
              ${fmt(m.requiredInStockUnit, 2)} ${m.stockUnit}
            </td>
            <td class="py-3 px-3 text-right font-mono font-bold ${m.onHandStockUnit > 0 ? 'text-teal-700' : 'text-slate-400'} bg-teal-50/30">
              ${fmt(m.onHandStockUnit, 2)} ${m.stockUnit}
            </td>
            <td class="py-3 px-3 text-center">
              ${statusHtml}
            </td>
            <td class="py-3 px-3 text-right font-mono font-black ${m.orderPurchaseQty > 0 ? 'text-rose-700 bg-rose-50/40 text-sm' : 'text-slate-300'}">
              ${m.orderPurchaseQty > 0 ? `${fmt(m.orderPurchaseQty, 2)} ${m.stockUnit}` : '-'}
            </td>
            <td class="py-3 px-3 text-right font-mono text-slate-700">
              ฿${fmt(m.unitPrice, 2)}
            </td>
            <td class="py-3 px-4 text-right font-mono font-black ${m.netPurchaseCost > 0 ? 'text-rose-700 bg-rose-50/50 text-sm' : 'text-emerald-600'}">
              ${m.netPurchaseCost > 0 ? `฿${fmt(m.netPurchaseCost, 2)}` : '฿0.00'}
            </td>
            <td class="py-3 px-3 font-semibold text-slate-800">
              ${m.supplierName}
            </td>
          </tr>
        `;
      }).join('');
    }

    const s = calc.summary;
    $('shortageFootSaved').textContent = `ประหยัดจากสต็อก ฿${fmt(s.totalStockDeductedValue, 2)}`;
    $('shortageFootStatus').textContent = `🟢 พอ ${s.enoughMaterialsCount} | 🔴 ขาด ${s.shortageMaterialsCount}`;
    $('shortageFootTotalPo').textContent = `฿${fmt(s.totalNetPurchaseBudget, 2)}`;
  }

  // =========================================================================
  // 6. RENDER TAB 5: SUPPLIER PURCHASE ORDERS (AUTO PO)
  // =========================================================================
  function renderSupplierPoTab(calc) {
    const container = $('supplierPoCardsContainer');
    if (!container) return;

    const s = calc.summary;
    $('poHeaderTotalBadge').textContent = `รวมงบสั่งซื้อสุทธิ ฿${fmt(s.totalNetPurchaseBudget, 2)}`;

    const plans = calc.supplierPurchasePlans.filter(sp => {
      if (sp.items.length === 0) return false;
      if (poTermFilter !== 'ALL' && sp.termType !== poTermFilter) return false;
      return true;
    });

    if (plans.length === 0) {
      container.innerHTML = `
        <div class="bg-white rounded-2xl p-10 text-center border border-slate-200 text-slate-500">
          ✅ สต็อกวัตถุดิบในคลังเพียงพอทุกรายการ ไม่มียอดที่ต้องออกใบสั่งซื้อเพิ่ม
        </div>
      `;
      return;
    }

    container.innerHTML = plans.map((sup, idx) => {
      const isCash = sup.termType === 'CASH_WEEKLY';
      const rowsHtml = sup.items.map((item, i) => {
        const prodCode = item.stockProductIds && item.stockProductIds.length > 0 ? item.stockProductIds.join(', ') : '-';
        return `
          <tr class="hover:bg-slate-50">
            <td class="py-2.5 px-4 text-center font-mono text-slate-400">${i + 1}</td>
            <td class="py-2.5 px-4 font-bold text-slate-900">${item.bomName}</td>
            <td class="py-2.5 px-3 font-mono text-xs text-indigo-700">${prodCode}</td>
            <td class="py-2.5 px-3 text-right font-mono text-slate-600">${fmt(item.requiredInStockUnit, 2)} ${item.stockUnit}</td>
            <td class="py-2.5 px-3 text-right font-mono text-teal-700">-${fmt(item.onHandStockUnit, 2)} ${item.stockUnit}</td>
            <td class="py-2.5 px-3 text-right font-mono font-black text-rose-700 bg-rose-50/40">${fmt(item.orderPurchaseQty, 2)} ${item.stockUnit}</td>
            <td class="py-2.5 px-3 text-right font-mono text-slate-700">฿${fmt(item.unitPrice, 2)}</td>
            <td class="py-2.5 px-4 text-right font-mono font-bold text-slate-900">฿${fmt(item.netPurchaseCost, 2)}</td>
          </tr>
        `;
      }).join('');

      return `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="p-4 sm:p-5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">
                ${sup.icon}
              </div>
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-base font-bold text-white">ใบสั่งซื้อที่ #${idx + 1}: ${sup.name}</h3>
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${isCash ? 'bg-amber-400 text-slate-950' : 'bg-indigo-500/30 text-indigo-200 border border-indigo-400/30'}">
                    ${sup.termLabel}
                  </span>
                </div>
                <p class="text-xs text-slate-300 mt-0.5">${sup.note || ''} • หมวด ${sup.category} (${sup.items.length} รายการที่ต้องสั่งเพิ่ม)</p>
              </div>
            </div>
            <div class="text-right">
              <div class="text-[11px] text-slate-300">ยอดรวมต้องสั่งซื้อร้านนี้</div>
              <div class="text-xl font-black font-mono text-amber-300">฿${fmt(sup.totalPurchaseCost, 2)}</div>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th class="py-2.5 px-4 w-12 text-center">#</th>
                  <th class="py-2.5 px-4">รายการวัตถุดิบที่ต้องสั่งซื้อ</th>
                  <th class="py-2.5 px-3">รหัสคลัง (PROD)</th>
                  <th class="py-2.5 px-3 text-right">ต้องใช้ตาม BOM</th>
                  <th class="py-2.5 px-3 text-right">หักสต็อกที่มี</th>
                  <th class="py-2.5 px-3 text-right text-rose-700 font-bold">จำนวนสั่งซื้อสุทธิ</th>
                  <th class="py-2.5 px-3 text-right">ราคา/หน่วย</th>
                  <th class="py-2.5 px-4 text-right">รวมเป็นเงิน (บาท)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${rowsHtml}
              </tbody>
              <tfoot class="bg-slate-50 border-t border-slate-200 font-bold text-slate-900">
                <tr>
                  <td colspan="5" class="py-2.5 px-4 text-right text-slate-500">รวมยอดสั่งซื้อ (${sup.name}):</td>
                  <td class="py-2.5 px-3 text-right font-mono text-rose-700">${sup.items.length} รายการ</td>
                  <td></td>
                  <td class="py-2.5 px-4 text-right font-mono text-base text-rose-700">฿${fmt(sup.totalPurchaseCost, 2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================================================
  // 7. MODAL FOR LINKING BOM MATERIAL TO STOCK MOVEMENT PROD-ID
  // =========================================================================
  function openBomLinkModal(bomMatName) {
    const calc = store.runMrpCalculation();
    const mat = calc.materialRequirements.find(m => m.bomName === bomMatName);
    if (!mat) return;

    const allStock = calc.computedStockList;
    const currentLinked = new Set(mat.stockProductIds || []);

    const stockCheckboxesHtml = allStock.map(p => {
      const checked = currentLinked.has(p.id) ? 'checked' : '';
      return `
        <label class="flex items-center justify-between p-2 rounded-lg border border-slate-200 hover:bg-indigo-50/40 cursor-pointer text-xs">
          <div class="flex items-center gap-2">
            <input type="checkbox" value="${p.id}" class="swal-prod-cb rounded text-indigo-600" ${checked} />
            <span class="font-mono font-bold text-indigo-700">${p.id}</span>
            <span class="font-medium text-slate-800">${p.name}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">${p.category}</span>
          </div>
          <div class="font-mono text-right shrink-0">
            <span class="${p.onHandQty > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}">${fmt(p.onHandQty, 0)} ${p.unit}</span>
            <span class="text-slate-400 ml-1">(@฿${fmt(p.avgCost, 1)})</span>
          </div>
        </label>
      `;
    }).join('');

    Swal.fire({
      title: `<div class="text-base font-bold text-slate-900">🔗 ผูกรหัสสินค้าใน Stock Movement สำหรับ "${bomMatName}"</div>`,
      width: 680,
      html: `
        <div class="text-left space-y-3 text-xs">
          <div class="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">หน่วยนับตอนสั่งซื้อ/สต็อก:</label>
              <input id="swalStockUnit" type="text" value="${mat.stockUnit}" class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">ตัวแปลงหน่วย (กี่ ${mat.bomUnit} = 1 หน่วยสต็อก):</label>
              <input id="swalBomPerStock" type="number" step="0.01" value="${mat.bomPerStockUnit}" class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold" />
            </div>
          </div>
          <div>
            <input id="swalFilterProdInput" type="text" placeholder="พิมพ์ค้นหาชื่อวัสดุ หรือ PROD-xxx..." class="w-full px-3 py-2 border border-slate-300 rounded-xl mb-2" />
            <div id="swalProdListWrapper" class="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              ${stockCheckboxesHtml}
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'บันทึกการผูกรหัส',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#4f46e5',
      didOpen: () => {
        const searchInp = document.getElementById('swalFilterProdInput');
        const wrapper = document.getElementById('swalProdListWrapper');
        if (searchInp && wrapper) {
          searchInp.addEventListener('input', e => {
            const term = e.target.value.trim().toLowerCase();
            wrapper.querySelectorAll('label').forEach(lbl => {
              const txt = lbl.textContent.toLowerCase();
              lbl.style.display = !term || txt.includes(term) ? '' : 'none';
            });
          });
        }
      },
      preConfirm: () => {
        const selectedIds = Array.from(document.querySelectorAll('.swal-prod-cb:checked')).map(cb => cb.value);
        const stockUnit = document.getElementById('swalStockUnit').value.trim() || mat.bomUnit;
        const bomPerStockUnit = Math.max(0.0001, parseFloat(document.getElementById('swalBomPerStock').value) || 1);
        return { stockProductIds: selectedIds, stockUnit, bomPerStockUnit };
      }
    }).then(res => {
      if (res.isConfirmed && res.value) {
        store.updateBomMapping(bomMatName, res.value);
        Swal.fire({ icon: 'success', title: 'บันทึกการผูกสต็อกสำเร็จ', timer: 1200, showConfirmButton: false });
      }
    });
  }

  // =========================================================================
  // 8. EXCEL IMPORT (E-COMMERCE ORDERS) & EXPORT (SUPPLIER PO WORKBOOK)
  // =========================================================================
  function handleOrderFileUpload(file) {
    if (!file || typeof XLSX === 'undefined') return;
    const channelMode = $('importOrderChannelSelect') ? $('importOrderChannelSelect').value : 'AUTO';
    const replaceMode = $('importReplaceMode') && $('importReplaceMode').checked;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rows || rows.length === 0) {
          Swal.fire('ไม่พบข้อมูล', 'ไฟล์ที่อัปโหลดไม่มีข้อมูลรายการ', 'warning');
          return;
        }

        // Detect channel from filename or columns
        const fname = file.name.toLowerCase();
        const firstRowKeys = Object.keys(rows[0] || {}).join(' ').toLowerCase();
        let targetChannel = channelMode;
        if (targetChannel === 'AUTO') {
          if (fname.includes('shopee') || firstRowKeys.includes('เลขออเดอร์') || firstRowKeys.includes('ชื่อตัวเลือก')) {
            targetChannel = 'SHOPEE';
          } else {
            targetChannel = 'TIKTOK';
          }
        }

        // Check if file is our MRP Order + FG Template (has 'ยอดออเดอร์ TikTok' or 'สต็อก FG พร้อมส่ง')
        if (firstRowKeys.includes('tiktok') || firstRowKeys.includes('สต็อก fg')) {
          if (replaceMode) store.clearBacklog();
          let importedCount = 0;
          let importedUnits = 0;
          rows.forEach(r => {
            const sku = String(r['รหัสสินค้า (SKU)'] || r['SKU'] || '').trim();
            if (!sku) return;
            const tt = parseInt(r['ยอดออเดอร์ TikTok'] || 0, 10) || 0;
            const sh = parseInt(r['ยอดออเดอร์ Shopee'] || 0, 10) || 0;
            const fg = parseInt(r['สต็อก FG พร้อมส่ง'] || 0, 10) || 0;
            const note = String(r['หมายเหตุ'] || '').trim();
            store.addBacklogItem(sku, tt, sh, fg, note);
            importedCount++;
            importedUnits += (tt + sh);
          });
          Swal.fire({
            icon: 'success',
            title: 'นำเข้าแผนผลิต & สต็อก FG สำเร็จ!',
            text: `นำเข้า ${importedCount} รุ่นโซฟา (รวม ${fmt(importedUnits)} ตัว)`,
            timer: 1800,
            showConfirmButton: false
          });
          return;
        }

        const parsedResult = window.SkuMapper.parseProductionOrOrderRows(rows);
        if (replaceMode) {
          store.clearBacklog();
        }

        let totalImportedUnits = 0;
        const itemsList = parsedResult.plannedItems || [];
        itemsList.forEach(item => {
          if (item.quantity <= 0) return;
          const tt = targetChannel === 'TIKTOK' ? item.quantity : 0;
          const sh = targetChannel === 'SHOPEE' ? item.quantity : 0;
          store.addBacklogItem(item.sku, tt, sh, 0, `นำเข้าจาก ${file.name}`);
          totalImportedUnits += item.quantity;
        });

        Swal.fire({
          icon: 'success',
          title: 'นำเข้าออเดอร์สำเร็จ!',
          html: `
            <div class="text-left text-xs space-y-1">
              <p><strong>ไฟล์:</strong> ${file.name}</p>
              <p><strong>ช่องทาง:</strong> ${targetChannel}</p>
              <p><strong>จับคู่รุ่นโซฟาสำเร็จ:</strong> ${itemsList.length} รุ่น (รวม ${fmt(totalImportedUnits)} ตัว)</p>
              ${parsedResult.unmatchedCount > 0 ? `<p class="text-amber-700">⚠️ จับคู่ไม่ได้ ${parsedResult.unmatchedCount} แถว</p>` : ''}
            </div>
          `,
          confirmButtonText: 'ดูแผนการผลิต'
        });
      } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถอ่านไฟล์ Excel ได้', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function exportSupplierPoWorkbook() {
    if (typeof XLSX === 'undefined') return;
    const calc = store.runMrpCalculation();
    const s = calc.summary;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Executive MRP Summary & Supplier Totals
    const summaryRows = [
      ['QueenCosy MRP & Order-to-BOM Purchase Plan (แผนการผลิตและสั่งซื้อวัสดุ)'],
      [`วันที่ออกรายงาน: ${new Date().toLocaleString('th-TH')}`],
      [''],
      ['1. สรุปยอดออเดอร์ค้างผลิต & การตัดสต็อก'],
      ['รายการ', 'จำนวน / มูลค่า', 'หน่วย'],
      ['ยอดออเดอร์ TikTok Shop ค้างส่ง', s.totalTiktokOrders, 'ตัว'],
      ['ยอดออเดอร์ Shopee ค้างส่ง', s.totalShopeeOrders, 'ตัว'],
      ['รวมออเดอร์ค้างส่งทั้งหมด (Gross Order Backlog)', s.totalGrossBacklog, 'ตัว'],
      ['หัก: สต็อกสินค้าสำเร็จรูปพร้อมส่ง (FG Stock Netting)', -s.totalFgUsed, 'ตัว'],
      ['จำนวนโซฟาที่ต้องสั่งผลิตจริง (Net Production Needed)', s.totalNetProduce, 'ตัว'],
      [''],
      ['2. สรุปงบประมาณวัตถุดิบตามสูตร BOM & การตัดสต็อก Stock Movement'],
      ['มูลค่าวัสดุที่ต้องใช้ตาม BOM ทั้งหมด (Gross BOM Material Cost)', s.totalGrossBomCost, 'บาท'],
      ['หัก: มูลค่าสต็อกวัตถุดิบที่มีอยู่จริงในคลัง (Stock Movement On-Hand)', -s.totalStockDeductedValue, 'บาท'],
      ['งบประมาณที่ต้องสั่งซื้อวัสดุเพิ่มสุทธิ (Net Purchase Budget)', s.totalNetPurchaseBudget, 'บาท'],
      ['  - กลุ่มซัพพลายเออร์จ่ายสด / รายสัปดาห์', s.cashWeeklyBudget, 'บาท'],
      ['  - กลุ่มซัพพลายเออร์เครดิตรอบสิ้นเดือน', s.creditEomBudget, 'บาท'],
      [''],
      ['3. สรุปยอดสั่งซื้อแยกตามซัพพลายเออร์จริงของโรงงาน'],
      ['ชื่อซัพพลายเออร์', 'หมวดวัสดุ', 'เงื่อนไขการชำระเงิน', 'จำนวนรายการที่ต้องสั่ง', 'ยอดเงินที่ต้องสั่งซื้อเพิ่ม (บาท)']
    ];

    calc.supplierPurchasePlans.forEach(sup => {
      summaryRows.push([sup.name, sup.category, sup.termLabel, sup.items.length, sup.totalPurchaseCost]);
    });
    summaryRows.push(['รวมทั้งสิ้น', '', '', s.shortageMaterialsCount, s.totalNetPurchaseBudget]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, '1_สรุปงบสั่งซื้อตามร้านค้า');

    // Sheet 2: Detailed Material Shortage & Stock Check
    const matRows = [
      ['ชื่อวัสดุ (BOM)', 'หมวด', 'รหัสใน Stock Movement', 'ต้องใช้ทั้งหมด', 'สต็อกคงเหลือจริง', 'ต้องสั่งซื้อเพิ่ม', 'หน่วย', 'ราคา/หน่วย (บาท)', 'งบที่ต้องสั่งซื้อ (บาท)', 'ซัพพลายเออร์', 'สถานะ']
    ];
    calc.materialRequirements.forEach(m => {
      if (m.requiredInStockUnit <= 0) return;
      matRows.push([
        m.bomName,
        m.category,
        (m.stockProductIds || []).join(', '),
        m.requiredInStockUnit,
        m.onHandStockUnit,
        m.orderPurchaseQty,
        m.stockUnit,
        m.unitPrice,
        m.netPurchaseCost,
        m.supplierName,
        m.status === 'SHORTAGE' ? 'ต้องสั่งซื้อเพิ่ม' : 'สต็อกพอผลิต'
      ]);
    });
    const wsMat = XLSX.utils.aoa_to_sheet(matRows);
    XLSX.utils.book_append_sheet(wb, wsMat, '2_เช็กสต็อกและรายการขาด');

    // Sheet 3: Order Backlog & FG Netting
    const orderRows = [
      ['รหัสสินค้า (Master SKU)', 'ยอด TikTok (ตัว)', 'ยอด Shopee (ตัว)', 'รวมออเดอร์ค้าง (ตัว)', 'หักสต็อก FG พร้อมส่ง (ตัว)', 'ต้องสั่งผลิตจริง (ตัว)', 'ต้นทุนวัสดุ BOM/ตัว (บาท)', 'รวมมูลค่าวัสดุตาม BOM (บาท)']
    ];
    calc.skuPlanResults.forEach(r => {
      orderRows.push([r.sku, r.tiktokQty, r.shopeeQty, r.grossOrder, r.fgStock, r.netToProduce, r.unitBomCost, r.totalBomCost]);
    });
    const wsOrder = XLSX.utils.aoa_to_sheet(orderRows);
    XLSX.utils.book_append_sheet(wb, wsOrder, '3_แผนผลิตและตัดสต็อกFG');

    const fname = `QueenCosy_MRP_PurchasePlan_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  function downloadOrderTemplateExcel() {
    if (typeof XLSX === 'undefined') return;
    const wb = XLSX.utils.book_new();
    const rows = [
      ['รหัสสินค้า (SKU)', 'ยอดออเดอร์ TikTok', 'ยอดออเดอร์ Shopee', 'สต็อก FG พร้อมส่ง', 'หมายเหตุ'],
      ['Qs-โซฟา3ที่นั่งปรับนอน-rc-ดำ-PQ002C-17', 50, 10, 5, 'ตัวอย่าง'],
      ['Qs-โซฟา3ที่นั่งหัวกระดก-rs-สีเทา-MJ337-29', 30, 5, 2, 'ตัวอย่าง']
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Template_แผนผลิต');
    XLSX.writeFile(wb, 'QueenCosy_Order_FG_Template.xlsx');
  }

  function downloadFgTemplateExcel() {
    if (typeof XLSX === 'undefined') return;
    const wb = XLSX.utils.book_new();
    const rows = [
      ['รหัสสินค้าสำเร็จรูป (SKU)', 'จำนวนสต็อก FG (ตัว)', 'ทีมผลิต/หมายเหตุ'],
      ['Qs-โซฟาเบดปรับนอน-rc-ดำ-PQ002C-17', 12, 'ตรวจนับคลัง FG'],
      ['Qs-โซฟาเบดปรับนอน-rc-น้ำตาล-PQ002C-12', 8, 'ตรวจนับคลัง FG'],
      ['Qs-โซฟาตัวแอลมินิมอล-Mncf(R)-ครีม-MJ356-1a', 5, 'ผลิตเสร็จพร้อมส่ง'],
      ['Qs-เก้าอี้สตูล-cu-ดำ-PQ002C-17', 15, 'สตูลพร้อมส่ง']
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'FG_Stock_Template');
    XLSX.writeFile(wb, 'QueenCosy_FG_Stock_Template.xlsx');
  }

  function exportFgStockWorkbook() {
    if (typeof XLSX === 'undefined') return;
    const calc = store.runMrpCalculation();
    const wb = XLSX.utils.book_new();
    const rows = [
      ['รหัสสินค้าสำเร็จรูป (Master SKU)', 'หมวดโซฟา', 'ยอดยกมา', 'รับเข้าผลิตเสร็จ (+In)', 'จ่ายออกส่งลูกค้า (-Out)', 'คงเหลือพร้อมส่งจริง (FG On-Hand)', 'ออเดอร์ค้างส่งรอบนี้', 'ตัดจ่ายให้ออเดอร์', 'เหลือว่างสุทธิ (Free FG)', 'ต้นทุนวัสดุ BOM/ตัว (บาท)', 'มูลค่าสต็อก FG รวม (บาท)']
    ];
    (calc.fgInventoryList || []).forEach(it => {
      if (it.onHandQty <= 0 && it.orderQty <= 0 && it.totalIn <= 0 && it.totalOut <= 0) return;
      rows.push([
        it.sku,
        it.familyLabel,
        it.begStock,
        it.totalIn,
        it.totalOut,
        it.onHandQty,
        it.orderQty,
        it.allocatedQty,
        it.freeQty,
        it.unitBomCost,
        it.fgStockValue
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'รายงานสต็อกสินค้าสำเร็จรูป_FG');
    XLSX.writeFile(wb, `QueenCosy_FG_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function handleFgFileUpload(file) {
    if (!file || typeof XLSX === 'undefined') return;
    const mode = $('fgImportModeSelect') ? $('fgImportModeSelect').value : 'SET_ONHAND';
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rows || rows.length === 0) {
          Swal.fire('ไม่พบข้อมูล', 'ไฟล์ที่อัปโหลดไม่มีข้อมูลรายการ', 'warning');
          return;
        }

        const parsed = window.SkuMapper ? window.SkuMapper.parseProductionOrOrderRows(rows) : { plannedItems: [] };
        let count = 0;
        let units = 0;

        if (parsed.plannedItems && parsed.plannedItems.length > 0) {
          parsed.plannedItems.forEach(it => {
            if (it.quantity < 0) return;
            if (mode === 'ADD_INBOUND') {
              store.recordFgInbound({ sku: it.sku, quantity: it.quantity, team: 'นำเข้าจากไฟล์ Excel', note: file.name });
            } else {
              store.setFgPhysicalStock(it.sku, it.quantity, `นำเข้ายอด FG จาก ${file.name}`);
            }
            count++;
            units += it.quantity;
          });
        } else {
          rows.forEach(r => {
            const sku = String(r['รหัสสินค้าสำเร็จรูป (SKU)'] || r['รหัสสินค้า (SKU)'] || r['SKU'] || r['รุ่น'] || '').trim();
            const qty = parseInt(r['จำนวนสต็อก FG (ตัว)'] || r['สต็อก FG พร้อมส่ง'] || r['จำนวน'] || r['คงเหลือ'] || 0, 10) || 0;
            if (!sku) return;
            if (mode === 'ADD_INBOUND') {
              store.recordFgInbound({ sku, quantity: qty, team: 'นำเข้าจากไฟล์ Excel', note: file.name });
            } else {
              store.setFgPhysicalStock(sku, qty, `นำเข้ายอด FG จาก ${file.name}`);
            }
            count++;
            units += qty;
          });
        }

        Swal.fire({
          icon: 'success',
          title: 'อัปเดตคลังสินค้าสำเร็จรูป (FG) สำเร็จ!',
          text: `อัปเดต ${count} รุ่นโซฟา (รวม ${fmt(units)} ตัว) และซิงค์ตัดออเดอร์ใน Tab 2 เรียบร้อยแล้ว`,
          timer: 2000,
          showConfirmButton: false
        });
      } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถอ่านไฟล์ Excel ได้', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // =========================================================================
  // 9. EVENT LISTENERS
  // =========================================================================
  function setupEventListeners() {
    // Tab switching
    const nav = $('mrpTabNav');
    if (nav) {
      nav.addEventListener('click', e => {
        const btn = e.target.closest('.mrp-tab-btn');
        if (!btn) return;
        switchMrpTab(btn.getAttribute('data-tab'));
      });
    }

    // Refresh Live Stock Movement
    const btnRefresh = $('btnRefreshStock');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', async () => {
        const ok = await store.pullLiveStockMovement();
        if (ok) {
          Swal.fire({
            icon: 'success',
            title: 'ดึงยอดสต็อกคงเหลือจริงสำเร็จ!',
            text: `อัปเดตข้อมูลวัตถุดิบ ${store.stockMovementRaw.products.length} รหัสจาก Supabase (QC_STOCK_MOVEMENT_DATA_V4) เรียบร้อยแล้ว`,
            timer: 1800,
            showConfirmButton: false
          });
        }
      });
    }

    // Sync to P&L
    const btnSyncPnl = $('btnSyncToPnl');
    if (btnSyncPnl) {
      btnSyncPnl.addEventListener('click', () => {
        const res = store.syncToPnlSystem();
        if (res.success) {
          Swal.fire({
            icon: 'success',
            title: 'ส่งตัวเลขเข้าสู่ระบบ P&L สำเร็จ!',
            html: `
              <div class="text-left text-xs space-y-1.5">
                <p>อัปเดตข้อมูลไปยังงวด <b>${res.monthKey}</b> ในระบบ <b>QueenCosy P&L</b> เรียบร้อยแล้ว:</p>
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono space-y-1">
                  <div>📱 ออเดอร์ค้าง TikTok: <b>${fmt(res.summary.totalTiktokOrders)} ตัว</b></div>
                  <div>🛍️ ออเดอร์ค้าง Shopee: <b>${fmt(res.summary.totalShopeeOrders)} ตัว</b></div>
                  <div>📦 หักสต็อก FG พร้อมส่ง: <b>${fmt(res.summary.totalFgUsed)} ตัว</b></div>
                  <div>🏭 ต้องสั่งผลิตจริง: <b>${fmt(res.summary.totalNetProduce)} ตัว</b></div>
                  <div>🪵 ต้นทุนวัสดุตาม BOM เฉลี่ย: <b>฿${fmt(res.summary.avgGrossMatPerSofa, 0)}/ตัว</b></div>
                  <div class="text-rose-700 font-bold">🛒 งบต้องสั่งซื้อวัสดุเพิ่มจริง: <b>฿${fmt(res.summary.totalNetPurchaseBudget, 2)}</b></div>
                </div>
              </div>
            `,
            confirmButtonText: 'ตกลง'
          });
        }
      });
    }

    // Backlog & FG Table Inputs Delegation
    document.addEventListener('change', e => {
      if (e.target.classList.contains('backlog-input')) {
        const idx = parseInt(e.target.getAttribute('data-backlog-idx'), 10);
        const field = e.target.getAttribute('data-backlog-field');
        store.updateBacklogItem(idx, field, e.target.value);
      } else if (e.target.classList.contains('bom-sup-select')) {
        const bomName = e.target.getAttribute('data-map-bom-sup');
        store.updateBomMapping(bomName, { supplierName: e.target.value });
      } else if (e.target.classList.contains('fg-quick-set-input')) {
        const sku = e.target.getAttribute('data-fg-set-sku');
        const val = parseInt(e.target.value, 10) || 0;
        store.setFgPhysicalStock(sku, val, 'แก้ไขยอดคงเหลือพร้อมส่งในตารางคลัง FG');
      }
    });

    // Click Delegation for Remove Backlog, Open BOM Link Modal, Quick Add SKU, FG Quick In/Out/Delete
    document.addEventListener('click', e => {
      const rmBtn = e.target.closest('[data-remove-backlog]');
      if (rmBtn) {
        const idx = parseInt(rmBtn.getAttribute('data-remove-backlog'), 10);
        store.removeBacklogItem(idx);
        return;
      }

      const linkBtn = e.target.closest('[data-edit-bom-link]');
      if (linkBtn) {
        openBomLinkModal(linkBtn.getAttribute('data-edit-bom-link'));
        return;
      }

      const quickSkuBtn = e.target.closest('[data-quick-add-sku]');
      if (quickSkuBtn) {
        const sku = quickSkuBtn.getAttribute('data-quick-add-sku');
        store.addBacklogItem(sku, 10, 0, null, 'เพิ่มจากหน้าสูตร BOM');
        Swal.fire({
          icon: 'success',
          title: 'เพิ่มเข้าแผนผลิตแล้ว',
          text: `${sku} (+10 ตัว)`,
          timer: 1200,
          showConfirmButton: false
        });
        return;
      }

      const fgQuickInBtn = e.target.closest('[data-fg-quick-in]');
      if (fgQuickInBtn) {
        const sku = fgQuickInBtn.getAttribute('data-fg-quick-in');
        store.recordFgInbound({ sku, quantity: 1, team: 'รับเข้าด่วน (+1)', note: 'กดปุ่ม +1 หน้าตารางคลัง FG' });
        return;
      }

      const fgQuickOutBtn = e.target.closest('[data-fg-quick-out]');
      if (fgQuickOutBtn) {
        const sku = fgQuickOutBtn.getAttribute('data-fg-quick-out');
        store.recordFgOutbound({ sku, quantity: 1, channel: 'จ่ายออกด่วน (-1)', note: 'กดปุ่ม -1 หน้าตารางคลัง FG' });
        return;
      }

      const delFgTxBtn = e.target.closest('[data-del-fg-tx]');
      if (delFgTxBtn) {
        const txId = delFgTxBtn.getAttribute('data-del-fg-tx');
        const txType = delFgTxBtn.getAttribute('data-del-fg-type');
        store.deleteFgTransaction(txType, txId);
        return;
      }
    });

    // Manual SKU Autocomplete in Tab 2
    const skuInput = $('manualSkuInput');
    const autoList = $('manualSkuAutocomplete');
    if (skuInput && autoList) {
      skuInput.addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        if (!q) {
          autoList.classList.add('hidden');
          return;
        }
        const allSkus = (store.masterBom && store.masterBom.skus) ? store.masterBom.skus.map(s => s.sku) : [];
        const matches = allSkus.filter(s => s.toLowerCase().includes(q)).slice(0, 20);
        if (matches.length === 0) {
          autoList.classList.add('hidden');
          return;
        }
        autoList.innerHTML = matches.map(sku => `
          <div data-pick-sku="${sku}" class="px-3 py-2 text-xs hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-none font-medium text-slate-800">
            ${sku}
          </div>
        `).join('');
        autoList.classList.remove('hidden');
      });

      autoList.addEventListener('click', e => {
        const item = e.target.closest('[data-pick-sku]');
        if (!item) return;
        skuInput.value = item.getAttribute('data-pick-sku');
        autoList.classList.add('hidden');
      });

      document.addEventListener('click', e => {
        if (!skuInput.contains(e.target) && !autoList.contains(e.target)) {
          autoList.classList.add('hidden');
        }
      });
    }

    // Add Manual Backlog SKU Button
    const btnAddSku = $('btnAddBacklogSku');
    if (btnAddSku) {
      btnAddSku.addEventListener('click', () => {
        const rawSku = ($('manualSkuInput').value || '').trim();
        if (!rawSku) {
          Swal.fire('กรุณาเลือกรุ่นโซฟา', 'พิมพ์ค้นหารุ่นโซฟาในช่องค้นหาก่อนกดเพิ่ม', 'info');
          return;
        }
        const tt = parseInt($('manualTiktokQty').value, 10) || 0;
        const sh = parseInt($('manualShopeeQty').value, 10) || 0;
        const fg = parseInt($('manualFgQty').value, 10) || 0;
        store.addBacklogItem(rawSku, tt, sh, fg, 'เพิ่มด้วยตนเอง');
        $('manualSkuInput').value = '';
      });
    }

    // Quick Action Buttons in Tab 2
    if ($('btnLoadDefaultBacklog')) {
      $('btnLoadDefaultBacklog').addEventListener('click', () => {
        store.resetDefaultBacklog();
      });
    }
    if ($('btnClearFgZero')) {
      $('btnClearFgZero').addEventListener('click', () => {
        store.clearAllFgZero();
      });
    }
    if ($('btnClearAllBacklog')) {
      $('btnClearAllBacklog').addEventListener('click', () => {
        store.clearBacklog();
      });
    }
    if ($('btnDownloadOrderTemplate')) {
      $('btnDownloadOrderTemplate').addEventListener('click', downloadOrderTemplateExcel);
    }

    // --- FG WAREHOUSE TAB EVENT LISTENERS ---
    $$('.fg-tx-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        fgTxMode = btn.getAttribute('data-fg-tx-mode');
        $$('.fg-tx-mode-btn').forEach(b => {
          if (b === btn) {
            if (fgTxMode === 'IN') b.className = 'fg-tx-mode-btn py-1.5 px-2 rounded-lg bg-emerald-600 text-white shadow-xs cursor-pointer transition';
            else if (fgTxMode === 'OUT') b.className = 'fg-tx-mode-btn py-1.5 px-2 rounded-lg bg-rose-600 text-white shadow-xs cursor-pointer transition';
            else b.className = 'fg-tx-mode-btn py-1.5 px-2 rounded-lg bg-indigo-600 text-white shadow-xs cursor-pointer transition';
          } else {
            b.className = 'fg-tx-mode-btn py-1.5 px-2 rounded-lg text-slate-600 hover:bg-white cursor-pointer transition';
          }
        });

        const qtyLbl = $('fgTxQtyLabel');
        const teamLbl = $('fgTxTeamLabel');
        const submitBtn = $('btnSubmitFgTransaction');
        if (fgTxMode === 'IN') {
          if (qtyLbl) qtyLbl.textContent = 'จำนวนรับเข้า (ตัว)';
          if (teamLbl) teamLbl.textContent = 'ทีมผลิต';
          if (submitBtn) {
            submitBtn.textContent = '📥 บันทึกรับเข้าคลังสินค้าสำเร็จรูป (FG Stock)';
            submitBtn.className = 'w-full mt-3 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-sm';
          }
        } else if (fgTxMode === 'OUT') {
          if (qtyLbl) qtyLbl.textContent = 'จำนวนจ่ายออก (ตัว)';
          if (teamLbl) teamLbl.textContent = 'ช่องทางจัดส่ง';
          if (submitBtn) {
            submitBtn.textContent = '📤 บันทึกเบิกจ่ายแพ็คส่งลูกค้า (FG Outbound)';
            submitBtn.className = 'w-full mt-3 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-sm';
          }
        } else {
          if (qtyLbl) qtyLbl.textContent = 'ยอดคงเหลือจริง (ตัว)';
          if (teamLbl) teamLbl.textContent = 'ผู้ตรวจนับ';
          if (submitBtn) {
            submitBtn.textContent = '⚖️ บันทึกปรับยอดตรวจนับจริง (Set Physical FG)';
            submitBtn.className = 'w-full mt-3 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-sm';
          }
        }
      });
    });

    // FG SKU Autocomplete
    const fgSkuInput = $('fgTxSkuInput');
    const fgAutoList = $('fgTxSkuAutocomplete');
    if (fgSkuInput && fgAutoList) {
      fgSkuInput.addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        if (!q) {
          fgAutoList.classList.add('hidden');
          return;
        }
        const allSkus = (store.masterBom && store.masterBom.skus) ? store.masterBom.skus.map(s => s.sku) : [];
        const matches = allSkus.filter(s => s.toLowerCase().includes(q)).slice(0, 20);
        if (matches.length === 0) {
          fgAutoList.classList.add('hidden');
          return;
        }
        fgAutoList.innerHTML = matches.map(sku => `
          <div data-pick-fg-sku="${sku}" class="px-3 py-2 text-xs hover:bg-emerald-50 cursor-pointer border-b border-slate-100 last:border-none font-medium text-slate-800">
            ${sku}
          </div>
        `).join('');
        fgAutoList.classList.remove('hidden');
      });

      fgAutoList.addEventListener('click', e => {
        const item = e.target.closest('[data-pick-fg-sku]');
        if (!item) return;
        fgSkuInput.value = item.getAttribute('data-pick-fg-sku');
        fgAutoList.classList.add('hidden');
      });

      document.addEventListener('click', e => {
        if (!fgSkuInput.contains(e.target) && !fgAutoList.contains(e.target)) {
          fgAutoList.classList.add('hidden');
        }
      });
    }

    if ($('btnSubmitFgTransaction')) {
      $('btnSubmitFgTransaction').addEventListener('click', () => {
        const sku = ($('fgTxSkuInput').value || '').trim();
        if (!sku) {
          Swal.fire('กรุณาเลือกรุ่นโซฟา', 'พิมพ์ค้นหารุ่นโซฟาในช่องเลือกรุ่นก่อนกดบันทึก', 'info');
          return;
        }
        const qty = parseInt($('fgTxQtyInput').value, 10) || 0;
        const date = $('fgTxDateInput').value || new Date().toISOString().slice(0, 10);
        const team = ($('fgTxTeamInput').value || '').trim();
        const note = ($('fgTxNoteInput').value || '').trim();

        if (fgTxMode === 'IN') {
          store.recordFgInbound({ sku, quantity: qty, date, team, note });
          Swal.fire({ icon: 'success', title: 'รับเข้าคลัง FG สำเร็จ!', text: `${sku} (+${qty} ตัว)`, timer: 1400, showConfirmButton: false });
        } else if (fgTxMode === 'OUT') {
          store.recordFgOutbound({ sku, quantity: qty, date, channel: team, note });
          Swal.fire({ icon: 'success', title: 'เบิกจ่าย FG สำเร็จ!', text: `${sku} (-${qty} ตัว)`, timer: 1400, showConfirmButton: false });
        } else {
          store.setFgPhysicalStock(sku, qty, note || `ตรวจนับโดย ${team || 'แอดมิน'}`);
          Swal.fire({ icon: 'success', title: 'อัปเดตยอด FG จริงสำเร็จ!', text: `${sku} = ${qty} ตัว`, timer: 1400, showConfirmButton: false });
        }
        $('fgTxSkuInput').value = '';
        $('fgTxNoteInput').value = '';
      });
    }

    const dzFg = $('dropzoneFgFile');
    const inpFg = $('inputFgFile');
    if (dzFg && inpFg) {
      dzFg.addEventListener('click', () => inpFg.click());
      dzFg.addEventListener('dragover', e => { e.preventDefault(); dzFg.classList.add('drag-over'); });
      dzFg.addEventListener('dragleave', () => dzFg.classList.remove('drag-over'));
      dzFg.addEventListener('drop', e => {
        e.preventDefault();
        dzFg.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleFgFileUpload(e.dataTransfer.files[0]);
        }
      });
      inpFg.addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) {
          handleFgFileUpload(e.target.files[0]);
        }
      });
    }

    if ($('btnDownloadFgTemplate')) {
      $('btnDownloadFgTemplate').addEventListener('click', downloadFgTemplateExcel);
    }
    if ($('btnExportFgStockExcel')) {
      $('btnExportFgStockExcel').addEventListener('click', exportFgStockWorkbook);
    }
    if ($('btnResetDefaultFg')) {
      $('btnResetDefaultFg').addEventListener('click', () => {
        store.resetDefaultFgInventory();
        Swal.fire({ icon: 'success', title: 'รีเซ็ตสต็อก FG มาตรฐาน 90 ตัวแล้ว', timer: 1300, showConfirmButton: false });
      });
    }
    if ($('fgFamilyFilterSelect')) {
      $('fgFamilyFilterSelect').addEventListener('change', e => {
        fgFamilyFilter = e.target.value;
        renderFgWarehouseTab(store.runMrpCalculation());
      });
    }
    if ($('filterFgActiveOnly')) {
      $('filterFgActiveOnly').addEventListener('change', () => {
        renderFgWarehouseTab(store.runMrpCalculation());
      });
    }
    if ($('fgTableSearchInput')) {
      $('fgTableSearchInput').addEventListener('input', e => {
        fgTableSearchQuery = e.target.value;
        renderFgWarehouseTab(store.runMrpCalculation());
      });
    }

    // Order File Upload Dropzone
    const dzOrder = $('dropzoneOrderFile');
    const inpOrder = $('inputOrderFile');
    if (dzOrder && inpOrder) {
      dzOrder.addEventListener('click', () => inpOrder.click());
      dzOrder.addEventListener('dragover', e => { e.preventDefault(); dzOrder.classList.add('drag-over'); });
      dzOrder.addEventListener('dragleave', () => dzOrder.classList.remove('drag-over'));
      dzOrder.addEventListener('drop', e => {
        e.preventDefault();
        dzOrder.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleOrderFileUpload(e.dataTransfer.files[0]);
        }
      });
      inpOrder.addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) {
          handleOrderFileUpload(e.target.files[0]);
        }
      });
    }

    // Search & Filter Inputs
    if ($('backlogSearchInput')) {
      $('backlogSearchInput').addEventListener('input', e => {
        backlogSearchQuery = e.target.value;
        renderBacklogTab(store.runMrpCalculation());
      });
    }
    if ($('bomMapCategoryFilter')) {
      $('bomMapCategoryFilter').addEventListener('change', e => {
        bomMapCategoryFilter = e.target.value;
        renderBomBuilderTab(store.runMrpCalculation());
      });
    }
    if ($('bomMapSearchInput')) {
      $('bomMapSearchInput').addEventListener('input', e => {
        bomMapSearchQuery = e.target.value;
        renderBomBuilderTab(store.runMrpCalculation());
      });
    }
    if ($('skuRecipeSearchInput')) {
      $('skuRecipeSearchInput').addEventListener('input', e => {
        skuRecipeSearchQuery = e.target.value;
        renderBomBuilderTab(store.runMrpCalculation());
      });
    }

    // Tab 4 Shortage Filters
    $$('.shortage-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        shortageCategoryFilter = btn.getAttribute('data-shortage-cat');
        $$('.shortage-cat-btn').forEach(b => {
          b.className = b === btn
            ? 'shortage-cat-btn px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white cursor-pointer'
            : 'shortage-cat-btn px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer';
        });
        renderShortageTab(store.runMrpCalculation());
      });
    });

    if ($('filterShortageOnly')) {
      $('filterShortageOnly').addEventListener('change', () => renderShortageTab(store.runMrpCalculation()));
    }
    if ($('filterActiveBomOnly')) {
      $('filterActiveBomOnly').addEventListener('change', () => renderShortageTab(store.runMrpCalculation()));
    }
    if ($('shortageSearchInput')) {
      $('shortageSearchInput').addEventListener('input', e => {
        shortageSearchQuery = e.target.value;
        renderShortageTab(store.runMrpCalculation());
      });
    }

    // Tab 5 PO Filters & Export
    if ($('poTermFilterSelect')) {
      $('poTermFilterSelect').addEventListener('change', e => {
        poTermFilter = e.target.value;
        renderSupplierPoTab(store.runMrpCalculation());
      });
    }
    if ($('btnExportSupplierPoExcel')) {
      $('btnExportSupplierPoExcel').addEventListener('click', exportSupplierPoWorkbook);
    }
    if ($('btnExportAllPoExcelDash')) {
      $('btnExportAllPoExcelDash').addEventListener('click', exportSupplierPoWorkbook);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
